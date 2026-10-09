"""Rewrite a GLB with simplified meshes, keeping everything else (skins, morph targets, animations, textures, extras).
Vertices are only removed, never moved, so UVs / normals / skin weights / morph deltas of what remains are exact.
Usage: python3 simplify_glb.py in.glb out.glb SIMPLIFY_BIN 'MeshName:target_tris[:lockmorph]' ...
  target_tris applies to the whole mesh (split across its primitives by size)."""
import sys, json, struct, subprocess, tempfile, os
import numpy as np

CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5122: np.int16, 5121: np.uint8, 5120: np.int8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}

def load(path):
    b = open(path, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]
    g = json.loads(b[20:20 + jl]); off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]; bin_ = b[off + 8:off + 8 + bl]
    return g, bytearray(bin_)

def view_bytes(g, bin_, vi):
    v = g['bufferViews'][vi]; o = v.get('byteOffset', 0); return bytes(bin_[o:o + v['byteLength']])

def read_acc(g, bin_, ai):
    """dense array (count, ncomp) of the raw component type (sparse applied)"""
    a = g['accessors'][ai]; T = CT[a['componentType']]; w = NC[a['type']]; cnt = a['count']
    if 'bufferView' in a:
        v = g['bufferViews'][a['bufferView']]; o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        st = v.get('byteStride', 0); isz = np.dtype(T).itemsize * w
        if st and st != isz:
            raw = np.frombuffer(bytes(bin_), np.uint8, (cnt - 1) * st + isz, o)
            out = np.stack([np.frombuffer(raw[i * st:i * st + isz].tobytes(), T) for i in range(cnt)])
        else:
            out = np.frombuffer(bytes(bin_), T, cnt * w, o).reshape(cnt, w).copy()
    else:
        out = np.zeros((cnt, w), T)
    if 'sparse' in a:
        sp = a['sparse']; iv = sp['indices']; vv = sp['values']
        idx = np.frombuffer(view_bytes(g, bin_, iv['bufferView']), CT[iv['componentType']], sp['count'], iv.get('byteOffset', 0))
        val = np.frombuffer(view_bytes(g, bin_, vv['bufferView']), T, sp['count'] * w, vv.get('byteOffset', 0)).reshape(-1, w)
        out[idx.astype(np.int64)] = val
    return out

def as_float(g, ai, arr):
    a = g['accessors'][ai]; f = arr.astype(np.float64)
    if a.get('normalized'):
        m = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}[a['componentType']]
        f = np.maximum(f / m, -1.0)
    return f

class Builder:
    def __init__(self, g, bin_):
        self.g = g; self.bin = bin_
    def add_view(self, data, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        o = len(self.bin); self.bin += data
        v = {'buffer': 0, 'byteOffset': o, 'byteLength': len(data)}
        if target: v['target'] = target
        self.g['bufferViews'].append(v); return len(self.g['bufferViews']) - 1
    def add_acc(self, arr, like, target=None):
        a = {k: v for k, v in like.items() if k in ('componentType', 'normalized', 'type')}
        arr = np.ascontiguousarray(arr.astype(CT[a['componentType']]))
        a['bufferView'] = self.add_view(arr.tobytes(), target); a['count'] = int(arr.shape[0])
        if 'min' in like:
            f = arr.astype(np.float64)
            if a.get('normalized'):
                f = np.maximum(f / {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}[a['componentType']], -1.0)
            a['min'] = f.min(0).tolist(); a['max'] = f.max(0).tolist()
        self.g['accessors'].append(a); return len(self.g['accessors']) - 1
    def add_sparse(self, dense, like):
        nz = np.nonzero(np.any(dense != 0, axis=1))[0]
        a = {k: v for k, v in like.items() if k in ('componentType', 'normalized', 'type')}; a['count'] = int(dense.shape[0])
        if len(nz):
            iv = self.add_view(nz.astype(np.uint32).tobytes()); vv = self.add_view(np.ascontiguousarray(dense[nz].astype(CT[a['componentType']])).tobytes())
            a['sparse'] = {'count': int(len(nz)), 'indices': {'bufferView': iv, 'componentType': 5125}, 'values': {'bufferView': vv}}
            f = dense.astype(np.float64); a['min'] = f.min(0).tolist(); a['max'] = f.max(0).tolist()
        else:
            a['bufferView'] = self.add_view(np.zeros(dense.shape, CT[a['componentType']]).tobytes())
        self.g['accessors'].append(a); return len(self.g['accessors']) - 1

RENORM = os.environ.get('RENORM', '1') == '1'
def recompute_normals(P, T, Norig, hard_deg=55.0):
    """normals of the simplified surface: smooth across UV seams (same position), but keep hard edges that the
    original normals had (wedges at one position whose original normals differ a lot keep their own side)"""
    P = P.astype(np.float64); fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])     # area-weighted
    key = np.unique(P, axis=0, return_inverse=True)[1].reshape(-1)
    acc_c = np.zeros((key.max() + 1, 3)); acc_w = np.zeros((len(P), 3))
    for j in range(3): np.add.at(acc_c, key[T[:, j]], fn); np.add.at(acc_w, T[:, j], fn)
    nc = acc_c[key]; nc /= np.maximum(np.linalg.norm(nc, axis=1, keepdims=True), 1e-12)
    nw = acc_w / np.maximum(np.linalg.norm(acc_w, axis=1, keepdims=True), 1e-12)
    no = Norig / np.maximum(np.linalg.norm(Norig, axis=1, keepdims=True), 1e-12)
    # hard edge: the wedge's original normal is far from the corner average -> use the wedge's own side
    hard = np.sum(no * nc, axis=1) < np.cos(np.radians(hard_deg))
    out = np.where(hard[:, None], nw, nc)
    bad = np.linalg.norm(out, axis=1) < 0.5; out[bad] = no[bad]
    return out
def encode_like(f, like):
    if like.get('normalized'):
        m = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}[like['componentType']]
        return np.clip(np.round(f * m), -m, m)
    return f
def run_simplify(exe, P, I, imp, uvs, target):
    n = len(P); m = len(I) // 3
    with tempfile.TemporaryDirectory() as td:
        fi = os.path.join(td, 'in.bin'); fo = os.path.join(td, 'out.bin')
        with open(fi, 'wb') as f:
            f.write(struct.pack('<II', n, m)); f.write(P.astype(np.float32).tobytes()); f.write(I.astype(np.uint32).tobytes()); f.write(imp.astype(np.uint8).tobytes())
            f.write((uvs if uvs is not None else np.zeros((n, 2), np.float32)).tobytes()); f.write(struct.pack('<f', UV_SCALE if uvs is not None else 0.0))
        r = subprocess.run([exe, fi, fo, str(int(target))], capture_output=True, text=True)
        d = open(fo, 'rb').read(); m2 = struct.unpack('<I', d[:4])[0]
        return np.frombuffer(d[4:4 + m2 * 12], np.uint32).copy()

def simplify_prim(g, bin_, B, prim, target, exe, lockmorph, importance=None, regions=None, shared=None):
    P = as_float(g, prim['attributes']['POSITION'], read_acc(g, bin_, prim['attributes']['POSITION'])).astype(np.float32)
    I = read_acc(g, bin_, prim['indices']).reshape(-1).astype(np.uint32)
    n = len(P); m = len(I) // 3
    lock = np.zeros(n, np.uint8)
    if importance is not None: lock[:] = importance(P)
    if shared is not None:           # positions shared with the mesh's other primitives: keep them so the pieces stay joined
        keys = P.round(5).view([('', P.dtype)] * 3).reshape(-1) if False else [tuple(r) for r in P.round(5)]
        lock[np.array([k in shared for k in keys], bool)] = 255
    if lockmorph:
        for t in prim.get('targets', []):
            for k, ai in t.items():
                d = read_acc(g, bin_, ai); lock[np.any(d != 0, axis=1)] = 255
    uvs = as_float(g, prim['attributes']['TEXCOORD_0'], read_acc(g, bin_, prim['attributes']['TEXCOORD_0'])).astype(np.float32) if 'TEXCOORD_0' in prim['attributes'] else None
    if regions is not None:
        # per-region budgets: simplify one region at a time with every other region locked
        labels, budget = regions(P); cur = I.copy()
        for L, tgtL in budget.items():
            tri_lab = labels[cur.reshape(-1, 3)]; inL = np.all(tri_lab == L, axis=1).sum(); total = len(cur) // 3
            want = total - max(0, inL - tgtL)
            if want >= total: continue
            imp = np.where(labels == L, lock, 255).astype(np.uint8)
            cur = run_simplify(exe, P, cur, imp, uvs, want)
            print('  region', L, inL, '->', np.all(labels[cur.reshape(-1, 3)] == L, axis=1).sum(), 'total', len(cur) // 3)
        I2 = cur if len(cur) // 3 <= target else run_simplify(exe, P, cur, lock, uvs, target)
        m2 = len(I2) // 3
    else:
        I2 = run_simplify(exe, P, I, lock, uvs, target); m2 = len(I2) // 3
    used = np.unique(I2); remap = np.full(n, -1, np.int64); remap[used] = np.arange(len(used))
    I3 = remap[I2]
    newN = recompute_normals(P[used], I3.reshape(-1, 3), as_float(g, prim['attributes']['NORMAL'], read_acc(g, bin_, prim['attributes']['NORMAL']))[used]) if (RENORM and 'NORMAL' in prim['attributes']) else None
    # attributes
    for k, ai in list(prim['attributes'].items()):
        like = g['accessors'][ai]; arr = read_acc(g, bin_, ai)[used]
        if k == 'NORMAL' and newN is not None:
            arr = encode_like(newN, like)
        prim['attributes'][k] = B.add_acc(arr, like, 34962)
    for t in prim.get('targets', []):
        for k, ai in list(t.items()):
            like = g['accessors'][ai]; dense = read_acc(g, bin_, ai)[used]
            t[k] = B.add_sparse(dense, like) if 'sparse' in like else B.add_acc(dense, like, 34962)
    ilike = {'componentType': 5123 if len(used) < 65536 else 5125, 'type': 'SCALAR'}
    prim['indices'] = B.add_acc(I3.reshape(-1, 1), ilike, 34963)
    return m, m2

def compact(g, bin_):
    """drop unreferenced accessors / bufferViews and repack the binary"""
    used_acc = set()
    def walk(o):
        pass
    for m in g['meshes']:
        for p in m['primitives']:
            used_acc.update(p['attributes'].values()); used_acc.add(p['indices']) if 'indices' in p else None
            for t in p.get('targets', []): used_acc.update(t.values())
    for s in g.get('skins', []):
        if 'inverseBindMatrices' in s: used_acc.add(s['inverseBindMatrices'])
    for an in g.get('animations', []):
        for sm in an['samplers']: used_acc.add(sm['input']); used_acc.add(sm['output'])
    acc_map = {}; new_acc = []
    for i, a in enumerate(g['accessors']):
        if i in used_acc: acc_map[i] = len(new_acc); new_acc.append(a)
    used_views = set()
    for a in new_acc:
        if 'bufferView' in a: used_views.add(a['bufferView'])
        if 'sparse' in a: used_views.add(a['sparse']['indices']['bufferView']); used_views.add(a['sparse']['values']['bufferView'])
    for im in g.get('images', []):
        if 'bufferView' in im: used_views.add(im['bufferView'])
    view_map = {}; new_views = []; out = bytearray()
    for i, v in enumerate(g['bufferViews']):
        if i not in used_views: continue
        while len(out) % 4: out.append(0)
        o = v.get('byteOffset', 0); data = bin_[o:o + v['byteLength']]
        nv = dict(v); nv['byteOffset'] = len(out); out += data
        view_map[i] = len(new_views); new_views.append(nv)
    for a in new_acc:
        if 'bufferView' in a: a['bufferView'] = view_map[a['bufferView']]
        if 'sparse' in a: a['sparse']['indices']['bufferView'] = view_map[a['sparse']['indices']['bufferView']]; a['sparse']['values']['bufferView'] = view_map[a['sparse']['values']['bufferView']]
    for im in g.get('images', []):
        if 'bufferView' in im: im['bufferView'] = view_map[im['bufferView']]
    for m in g['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = acc_map[p['indices']]
            if 'targets' in p: p['targets'] = [{k: acc_map[v] for k, v in t.items()} for t in p['targets']]
    for s in g.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    for an in g.get('animations', []):
        for sm in an['samplers']: sm['input'] = acc_map[sm['input']]; sm['output'] = acc_map[sm['output']]
    g['accessors'] = new_acc; g['bufferViews'] = new_views
    while len(out) % 4: out.append(0)
    g['buffers'] = [{'byteLength': len(out)}]
    return out

def save(path, g, bin_):
    js = json.dumps(g, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    total = 12 + 8 + len(js) + 8 + len(bin_)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total)); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(bin_), 0x004E4942)); f.write(bytes(bin_))

# per-vertex importance (0..254: error x (1 + v)) by model region, in glTF model space
def _hero_imp(P):
    y, z = P[:, 1], P[:, 2]; v = np.zeros(len(P), np.uint8)
    v[y > 1.50] = 8                                   # head and hair
    v[(y > 1.55) & (z > 0.28)] = 60                   # the face
    return v
def _horse_imp(P):
    return np.zeros(len(P), np.uint8)
IMPORTANCE = {'hero': _hero_imp, 'horse': _horse_imp}
def _hero_regions(P):
    y, z = P[:, 1], P[:, 2]; lab = np.zeros(len(P), np.int32)
    lab[(y > 0.95) & (y <= 1.50) & (z > 0.30)] = 3      # chest / belly armour front
    lab[y > 1.50] = 1; lab[(y > 1.55) & (z > 0.28)] = 2
    return lab, {0: 22500, 3: 7000, 1: 5500, 2: 9000}  # body, chest front, back/top of head and hair, face
def _female_regions(P):                              # V14 model faces +z, 1.05 units tall
    y, z = P[:, 1], P[:, 2]; lab = np.zeros(len(P), np.int32)
    lab[(y > 0.60) & (y <= 0.86) & (z > 0.05)] = 3
    lab[y > 0.86] = 1; lab[(y > 0.88) & (z > 0.0)] = 2
    return lab, {0: 20000, 3: 6500, 1: 5500, 2: 8000}
REGIONS = {'hero': _hero_regions, 'female': _female_regions}
UV_SCALE = float(os.environ.get('UV_SCALE', '0.5'))   # metres of error per unit of UV slide (2048 px texture: 1 px ~ 0.25 mm)

if __name__ == '__main__':
    src, dst, exe = sys.argv[1:4]
    specs = {}
    for s in sys.argv[4:]:
        parts = s.split(':'); specs[parts[0]] = (int(parts[1]), 'lockmorph' in parts[2:], next((x[4:] for x in parts[2:] if x.startswith('imp=')), None))
    g, bin_ = load(src); B = Builder(g, bin_)
    for mesh in g['meshes']:
        if mesh.get('name') not in specs: continue
        tgt, lockmorph, imp = specs[mesh['name']]
        importance = IMPORTANCE.get(imp) if imp else None; regions = REGIONS.get(imp) if imp else None
        sizes = [g['accessors'][p['indices']]['count'] // 3 for p in mesh['primitives']]; tot = sum(sizes)
        possets = [set(tuple(r) for r in as_float(g, p['attributes']['POSITION'], read_acc(g, B.bin, p['attributes']['POSITION'])).astype(np.float32).round(5)) for p in mesh['primitives']] if len(mesh['primitives']) > 1 else None
        for pi, (p, sz) in enumerate(zip(mesh['primitives'], sizes)):
            shared = set().union(*[s_ for j, s_ in enumerate(possets) if j != pi]) & possets[pi] if possets else None
            t = max(16, int(round(tgt * sz / tot)))
            if sz <= t: continue
            print(mesh['name'], simplify_prim(g, B.bin, B, p, t, exe, lockmorph, importance, regions, shared))
    out = compact(g, B.bin); save(dst, g, out)
    print('wrote', dst, len(out) / 1048576, 'MB')
