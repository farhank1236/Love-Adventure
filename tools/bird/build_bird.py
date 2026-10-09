"""Red Bird enemy: light game model from the 500k-triangle sculpt (red-bird-rigged.blend).

The sculpt's texture is an AI atlas cut into thousands of tiny UV islands, so a seam-preserving reduction cannot go
low. Instead:
  1. weld + reduce the shape with tools/lod/simplify (quadric error, closed surface, head/feet weighted)
  2. give the light mesh its own atlas (one cell per pair of triangles, sized by area, padded)
  3. bake the original 4K texture onto it: every texel of the light surface takes the colour of the closest point
     on the original surface (normal-facing candidates only), then the atlas is dilated
  4. skin weights come from the original vertices (top 4, normalized); the 88-bone skeleton is kept, with
     translation-only rests (bone heads), so the game can pose it in armature axes
  5. write a GLB (Y up, bird faces +Z, left wing +X, 1 unit = 1 m): mesh, skin, joints, JPEG texture

usage: python3 build_bird.py work_dir mesh.pkl rig.json tex.png simplified.bin out.glb [atlas_px]
"""
import sys, json, struct, pickle, io
import numpy as np
from scipy.spatial import cKDTree
from PIL import Image

work, mesh_pkl, rig_json, tex_png, simp_bin, out_glb = sys.argv[1:7]
ATLAS = int(sys.argv[7]) if len(sys.argv) > 7 else 1024

m = pickle.load(open(mesh_pkl, 'rb'))
Pw = np.load(f'{work}/Pw.npy'); rep = np.load(f'{work}/rep.npy')
P0 = m['pos'].astype(np.float64); T0 = m['tris'].astype(np.int64); W0 = m['W']; groups = m['groups']
cv = m['corner_vert']; po = m['poly_offsets']; uv_corner = m['uv'][1]
# per-triangle corner UVs of the original (triangulated as a fan, same order as read_mesh)
tri_uv = []
for i in range(len(po) - 1):
    a, b = po[i], po[i + 1]
    for j in range(1, b - a - 1): tri_uv.append((a, a + j, a + j + 1))
tri_uv = uv_corner[np.array(tri_uv)]                      # (m, 3, 2)
assert len(tri_uv) == len(T0)

d = open(simp_bin, 'rb').read(); n2 = struct.unpack('<I', d[:4])[0]
TL = np.frombuffer(d, dtype='<u4', count=n2 * 3, offset=4).reshape(-1, 3).astype(np.int64)
used, TLc = np.unique(TL, return_inverse=True); TLc = TLc.reshape(-1, 3)
PL = Pw[used].astype(np.float64); REP = rep[used]
print('light mesh', len(PL), 'verts', len(TLc), 'tris')

# smooth normals of the light surface
fn = np.cross(PL[TLc[:, 1]] - PL[TLc[:, 0]], PL[TLc[:, 2]] - PL[TLc[:, 0]])
VN = np.zeros_like(PL)
for k in range(3): np.add.at(VN, TLc[:, k], fn)
VN /= np.linalg.norm(VN, axis=1, keepdims=True) + 1e-12
# vertices whose face normals cancel out (thin folds) get the direction away from the body axis instead of a zero normal
bad = np.linalg.norm(VN, axis=1) < 0.5
if bad.any():
    out = PL[bad] - np.array([0.0, 0.33, 0.0]); VN[bad] = out / (np.linalg.norm(out, axis=1, keepdims=True) + 1e-9)
print('fixed zero normals', int(bad.sum()))

# ---------------------------------------------------------------- atlas: pairs of edge-sharing triangles in square cells
area = 0.5 * np.linalg.norm(fn, axis=1)
order = np.argsort(-area)
edge_tris = {}
for t, (a, b, c) in enumerate(TLc):
    for e in ((a, b), (b, c), (c, a)): edge_tris.setdefault((min(e), max(e)), []).append(t)
mate = -np.ones(len(TLc), int)
for t in order:                                   # greedy: biggest first, partner = edge neighbour of most similar area
    if mate[t] >= 0: continue
    a, b, c = TLc[t]; best = None
    for e in ((a, b), (b, c), (c, a)):
        for u in edge_tris[(min(e), max(e))]:
            if u != t and mate[u] < 0 and len(set(TLc[u]) & set(TLc[t])) == 2 and (best is None or abs(area[u] - area[t]) < abs(area[best] - area[t])): best = u
    if best is not None: mate[t] = best; mate[best] = t
    else: mate[t] = t
pairs = []
seen = np.zeros(len(TLc), bool)
for t in order:
    if seen[t]: continue
    u = mate[t]; seen[t] = seen[u] = True; pairs.append((t,) if u == t else (t, u))
side_w = np.array([np.sqrt(area[list(p)].max()) for p in pairs])
def pack(scale):
    sizes = np.maximum(7, np.round(side_w * scale)).astype(int); x = y = rowh = 0; pos = []
    for s_ in sizes:
        if x + s_ > ATLAS: x = 0; y += rowh; rowh = 0
        pos.append((x, y, s_)); x += s_; rowh = max(rowh, s_)
    return pos, y + rowh
lo, hi = 1.0, 20000.0
for _ in range(40):
    mid = (lo + hi) / 2; _, h = pack(mid)
    if h <= ATLAS: lo = mid
    else: hi = mid
cells, _ = pack(lo)
PAD = 2.0
UVL = np.zeros((len(TLc), 3, 2))
CELL_OF = []                                       # (x, y, s, tA, tB or -1)
for (x, y, s_), p in zip(cells, pairs):
    x0, y0, x1, y1 = x + PAD, y + PAD, x + s_ - PAD, y + s_ - PAD
    t = p[0]
    if len(p) == 1:
        UVL[t] = [(x0, y0), (x1, y0), (x0, y1)]; CELL_OF.append((x, y, s_, t, -1)); continue
    u = p[1]; sa = set(TLc[t]); shared = [v for v in TLc[u] if v in sa]
    a = [v for v in TLc[t] if v not in shared][0]; b = [v for v in TLc[u] if v not in shared][0]
    q, r = shared
    uvA = {a: (x0, y0), q: (x1, y0), r: (x0, y1)}; uvB = {b: (x1, y1), q: (x1, y0), r: (x0, y1)}   # the shared edge is the cell diagonal
    UVL[t] = [uvA[v] for v in TLc[t]]; UVL[u] = [uvB[v] for v in TLc[u]]; CELL_OF.append((x, y, s_, t, u))
print('atlas cells', len(cells), 'paired', sum(len(p) == 2 for p in pairs), 'mean cell', round(np.mean([c[2] for c in cells]), 1), 'px')

# ---------------------------------------------------------------- bake
tex = np.asarray(Image.open(tex_png).convert('RGB'), dtype=np.float32); TH, TW = tex.shape[:2]
A0, B0, C0 = P0[T0[:, 0]], P0[T0[:, 1]], P0[T0[:, 2]]
N0 = np.cross(B0 - A0, C0 - A0); N0 /= np.linalg.norm(N0, axis=1, keepdims=True) + 1e-15
cent = (A0 + B0 + C0) / 3
tree = cKDTree(cent)

def closest_on_tris(p, a, b, c):
    """Ericson's closest point on triangle, vectorized. returns barycentric (u,v,w) and point."""
    ab, ac, ap = b - a, c - a, p - a
    d1 = (ab * ap).sum(-1); d2 = (ac * ap).sum(-1)
    bp = p - b; d3 = (ab * bp).sum(-1); d4 = (ac * bp).sum(-1)
    cp = p - c; d5 = (ab * cp).sum(-1); d6 = (ac * cp).sum(-1)
    va = d3 * d6 - d5 * d4; vb = d5 * d2 - d1 * d6; vc = d1 * d4 - d3 * d2
    den = va + vb + vc; den = np.where(np.abs(den) < 1e-30, 1e-30, den)
    v = vb / den; w = vc / den; u = 1 - v - w
    # regions
    m1 = (d1 <= 0) & (d2 <= 0); m2 = (d3 >= 0) & (d4 <= d3); m3 = (d6 >= 0) & (d5 <= d6)
    t_ab = np.clip(d1 / np.where(np.abs(d1 - d3) < 1e-30, 1e-30, d1 - d3), 0, 1); m4 = (vc <= 0) & (d1 >= 0) & (d3 <= 0)
    t_ac = np.clip(d2 / np.where(np.abs(d2 - d6) < 1e-30, 1e-30, d2 - d6), 0, 1); m5 = (vb <= 0) & (d2 >= 0) & (d6 <= 0)
    t_bc = np.clip((d4 - d3) / np.where(np.abs((d4 - d3) + (d5 - d6)) < 1e-30, 1e-30, (d4 - d3) + (d5 - d6)), 0, 1); m6 = (va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0)
    U = np.stack([u, v, w], -1)
    U = np.where(m6[..., None], np.stack([np.zeros_like(u), 1 - t_bc, t_bc], -1), U)
    U = np.where(m5[..., None], np.stack([1 - t_ac, np.zeros_like(u), t_ac], -1), U)
    U = np.where(m4[..., None], np.stack([1 - t_ab, t_ab, np.zeros_like(u)], -1), U)
    U = np.where(m3[..., None], np.array([0., 0., 1.]), U)
    U = np.where(m2[..., None], np.array([0., 1., 0.]), U)
    U = np.where(m1[..., None], np.array([1., 0., 0.]), U)
    q = U[..., 0:1] * a + U[..., 1:2] * b + U[..., 2:3] * c
    return U, q

def sample(uv):
    x = uv[:, 0] * TW - 0.5; y = uv[:, 1] * TH - 0.5   # Blender UV: v up -> image row = (1 - v)
    y = (1 - uv[:, 1]) * TH - 0.5
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    def px(xx, yy): return tex[np.clip(yy, 0, TH - 1), np.mod(xx, TW)]
    return (px(x0, y0) * (1 - fx) * (1 - fy) + px(x0 + 1, y0) * fx * (1 - fy) + px(x0, y0 + 1) * (1 - fx) * fy + px(x0 + 1, y0 + 1) * fx * fy)

img = np.zeros((ATLAS, ATLAS, 3), np.float32); filled = np.zeros((ATLAS, ATLAS), bool)
qs_p, qs_n, qs_xy = [], [], []
for (x, y, s_, tA, tB) in CELL_OF:
    gx, gy = np.meshgrid(np.arange(x, x + s_), np.arange(y, y + s_)); gx = gx.ravel(); gy = gy.ravel(); cx, cy = gx + 0.5, gy + 0.5
    sideB = (cx - x) + (cy - y) > s_ if tB >= 0 else np.zeros(len(gx), bool)
    for t, sel in ((tA, ~sideB), (tB, sideB)):
        if t < 0 or not sel.any(): continue
        (x1, y1), (x2, y2), (x3, y3) = UVL[t]; px_, py_ = cx[sel], cy[sel]
        den = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
        l1 = ((y2 - y3) * (px_ - x3) + (x3 - x2) * (py_ - y3)) / den; l2 = ((y3 - y1) * (px_ - x3) + (x1 - x3) * (py_ - y3)) / den; l3 = 1 - l1 - l2
        L = np.stack([l1, l2, l3], 1); L = np.clip(L, -0.15, None); L /= L.sum(1, keepdims=True)
        tri = TLc[t]
        qs_p.append(L @ PL[tri]); qs_n.append(L @ VN[tri]); qs_xy.append(np.stack([gx[sel], gy[sel]], 1))
QP = np.concatenate(qs_p); QN = np.concatenate(qs_n); QXY = np.concatenate(qs_xy)
QN /= np.linalg.norm(QN, axis=1, keepdims=True) + 1e-12
print('texels to bake', len(QP))
K = 16; CH = 20000
for s in range(0, len(QP), CH):
    p = QP[s:s + CH]; n = QN[s:s + CH]
    _, cand = tree.query(p, k=K)
    a, b, c = A0[cand], B0[cand], C0[cand]
    U, q = closest_on_tris(p[:, None, :], a, b, c)
    dist = np.linalg.norm(q - p[:, None, :], axis=-1)
    facing = (N0[cand] * n[:, None, :]).sum(-1)
    dist = dist + np.where(facing < 0.0, 0.05, 0.0)               # prefer the side of the sheet we are on
    best = np.argmin(dist, axis=1); r = np.arange(len(p))
    tbest = cand[r, best]; Ub = U[r, best]
    Ub = Ub * 0.97 + 0.01                                          # stay inside the source UV island (its edges have dark gutters)
    uvs = (tri_uv[tbest] * Ub[:, :, None]).sum(1)
    col = sample(uvs)
    xy = QXY[s:s + CH]; img[xy[:, 1], xy[:, 0]] = col; filled[xy[:, 1], xy[:, 0]] = True
# dilate into empty texels (mip / filtering safety)
for _ in range(8):
    acc = np.zeros_like(img); cnt = np.zeros(filled.shape, np.float32)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        sh = np.roll(np.roll(filled, dy, 0), dx, 1); acc += np.roll(np.roll(img, dy, 0), dx, 1) * sh[..., None]; cnt += sh
    grow = (~filled) & (cnt > 0); img[grow] = acc[grow] / cnt[grow][:, None]; filled |= grow
img[~filled] = img[filled].mean(0)
# soften pure whites (the eyes): in the game's HDR lighting they would bloom into glowing blobs
img = np.where(img > 200, 200 + (img - 200) * 0.35, img)
atlas = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
atlas.save(f'{work}/atlas.png')
jb = io.BytesIO(); atlas.save(jb, 'JPEG', quality=90); jpeg = jb.getvalue()
print('atlas jpeg', len(jpeg) // 1024, 'KB')

# ---------------------------------------------------------------- skin
rig = json.load(open(rig_json)); bones = list(rig['armatures'].values())[0]
bnames = [b['name'] for b in bones]; bidx = {n: i for i, n in enumerate(bnames)}
gmap = np.array([bidx[g] for g in groups])
Wv = W0[REP]                                         # (nv, groups)
top = np.argsort(-Wv, axis=1)[:, :4]; tw = np.take_along_axis(Wv, top, 1); tw /= tw.sum(1, keepdims=True) + 1e-12
J = gmap[top]

# unwelded vertex stream: 3 per triangle (own UVs)
vi = TLc.reshape(-1)
POS = PL[vi].astype(np.float32); NOR = VN[vi].astype(np.float32)
UV = (UVL.reshape(-1, 2) / ATLAS).astype(np.float32)
JO = J[vi].astype(np.uint8); WE = tw[vi].astype(np.float32)
# merge identical (pos, uv) corners (pairs share edges inside a cell rarely; keeps it simple)
key = np.concatenate([POS, UV], 1); _, first, inv = np.unique(key.view([('', np.float32)] * 5).ravel(), return_index=True, return_inverse=True)
POS, NOR, UV, JO, WE = POS[first], NOR[first], UV[first], JO[first], WE[first]
IDX = inv.astype(np.uint16 if len(first) < 65536 else np.uint32)
print('game verts', len(POS), 'tris', len(IDX) // 3)

heads = np.array([b['head'] for b in bones], np.float64)
nodes = []
for i, b in enumerate(bones):
    t = heads[i] - (heads[bidx[b['parent']]] if b['parent'] else 0)
    nodes.append({'name': b['name'], 'translation': [float(x) for x in t]})
for i, b in enumerate(bones):
    ch = [j for j, c in enumerate(bones) if c['parent'] == b['name']]
    if ch: nodes[i]['children'] = ch
mesh_node = len(nodes); nodes.append({'name': 'RedBird', 'mesh': 0, 'skin': 0})
ibm = np.zeros((len(bones), 16), np.float32)
for i in range(len(bones)): M = np.eye(4); M[:3, 3] = -heads[i]; ibm[i] = M.T.reshape(-1)

bin_ = bytearray(); views = []; accs = []
def add(arr, target=None, comp=5126, typ='VEC3', norm=False, minmax=False):
    while len(bin_) % 4: bin_.append(0)
    off = len(bin_); raw = arr.tobytes(); bin_.extend(raw)
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(raw)}
    if target: v['target'] = target
    views.append(v); a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
    if norm: a['normalized'] = True
    if minmax: a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
    accs.append(a); return len(accs) - 1
aP = add(POS, 34962, minmax=True); aN = add(NOR, 34962); aT = add(UV, 34962, typ='VEC2')
aJ = add(JO, 34962, comp=5121, typ='VEC4'); aW = add(WE, 34962, typ='VEC4')
aI = add(IDX, 34963, comp=5123 if IDX.dtype == np.uint16 else 5125, typ='SCALAR')
aB = add(ibm, typ='MAT4')
while len(bin_) % 4: bin_.append(0)
img_off = len(bin_); bin_.extend(jpeg); views.append({'buffer': 0, 'byteOffset': img_off, 'byteLength': len(jpeg)})
while len(bin_) % 4: bin_.append(0)
g = {'asset': {'version': '2.0', 'generator': 'Love-Adventure red bird builder'},
     'scene': 0, 'scenes': [{'nodes': [0, mesh_node]}], 'nodes': nodes,
     'skins': [{'joints': list(range(len(bones))), 'inverseBindMatrices': aB, 'skeleton': 0}],
     'meshes': [{'name': 'RedBird', 'primitives': [{'attributes': {'POSITION': aP, 'NORMAL': aN, 'TEXCOORD_0': aT, 'JOINTS_0': aJ, 'WEIGHTS_0': aW}, 'indices': aI, 'material': 0}]}],
     'materials': [{'name': 'RedBird', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 0.85}}],
     'textures': [{'source': 0}], 'images': [{'bufferView': len(views) - 1, 'mimeType': 'image/jpeg'}],
     'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}],
     'extras': {'revision': 'REDBIRD_V1', 'triangles': int(len(IDX) // 3), 'height': float(PL[:, 1].max()), 'wingspan': float(PL[:, 0].max() - PL[:, 0].min())}}
js = json.dumps(g, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(bin_)) + b'BIN\0' + bytes(bin_)
open(out_glb, 'wb').write(out); print('glb', len(out) // 1024, 'KB')
