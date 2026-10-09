"""Export the hero (mesh, skin, fist morphs, sword + FX meshes, all clips) as a GLB for the web game.
Conventions (matches the game's loader): joints are nodes 0..J-1, rest = translation only (identity rotation),
inverse bind = translate(-head). Coordinates converted Blender Z-up -> glTF Y-up: (x, y, z) -> (x, z, -y)."""
import sys, json, struct, io, pickle, numpy as np
sys.path.insert(0, '/home/claude/tools')
from run import HR, skinner
from solver import *
from bake import pose_baked
from fist import curl, region
from fx import blade_shell, portal_mesh
from blend import Blend
from mesh import read_mesh
from PIL import Image

Cm = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float)
def cv(p): return np.asarray(p, float) @ Cm.T
def cm(M3): return Cm @ M3 @ Cm.T

def lqs2m(v):
    M = np.eye(4); M[:3, :3] = quat_to_mat(v[3:7]) @ np.diag(v[7:10]); M[:3, 3] = v[:3]; return M

def safe(n): return n.replace('.', '_')

D = pickle.load(open('/home/claude/work/clips_v3.pkl', 'rb'))
CL = D['clips']; META = D['meta']
RENAME = {'Hero_Idle': 'Idle', 'Hero_Walk': 'Walk', 'Hero_Run': 'Run', 'Hero_Sword_Idle': 'SwordIdle',
          'Hero_Combat_Walk': 'CombatWalk', 'Hero_Battle_Run': 'BattleRun', 'Hero_Sword_Summon': 'Summon',
          'Hero_Sword_Dismiss': 'Dismiss', 'Hero_Attack1': 'Attack1', 'Hero_Attack2': 'Attack2', 'Hero_Attack3': 'Attack3',
          'Hero_Attack4': 'Attack4', 'Hero_Attack5': 'Attack5', 'Hero_Attack_Combo': 'Combo', 'Hero_Jump': 'Jump',
          'Hero_Jump_Start': 'JumpStart', 'Hero_Jump_Air': 'JumpAir', 'Hero_Jump_Land': 'JumpLand'}
LOOPS = {'Idle', 'Walk', 'Run', 'SwordIdle', 'CombatWalk', 'BattleRun', 'JumpAir'}

# ------------------------------------------------------------------ joints
BODY = list(HR.bones)
FXJ = [('Sword_Grip', 'Hand.R'), ('Sword_Aura', 'Root'), ('Sword_Ghost1', 'Root'), ('Sword_Ghost2', 'Root'),
       ('Sword_Ghost3', 'Root'), ('Sword_Ghost4', 'Root'), ('Sword_Portal', 'Root')]
JOINTS = BODY + [n for n, _ in FXJ]
PARENT = {b: HR.rig.parent[b] for b in BODY}; PARENT.update({n: p for n, p in FXJ})
Gm = np.eye(4); Gm[:3, :3] = R_SWORD_IN_HAND; Gm[:3, 3] = GRIP_IN_HAND
REST = {b: HR.rig.arm[b] for b in BODY}
REST['Sword_Grip'] = HR.rig.arm['Hand.R'] @ Gm
for n in ('Sword_Aura', 'Sword_Ghost1', 'Sword_Ghost2', 'Sword_Ghost3', 'Sword_Ghost4', 'Sword_Portal'): REST[n] = np.eye(4)
HEAD = {b: REST[b][:3, 3].copy() for b in JOINTS}

def world_mats(clip, i):
    arr = CL[clip]['arr']; fx = CL[clip]['fx']
    pose_baked(HR, CL[clip]['bones'], arr, i)
    M = {b: HR.pose_m[b].copy() for b in BODY}
    v = float(fx[i, 0, 8])                                   # visibility (uniform)
    Lg = lqs2m(fx[i, 0]); Lg[:3, :3] = quat_to_mat(fx[i, 0, 3:7]) * max(v, 1e-3)
    M['Sword_Grip'] = M['Hand.R'] @ Gm @ Lg
    M['Sword_Aura'] = M['Sword_Grip'] @ lqs2m(fx[i, 1])
    for k in range(4): M[f'Sword_Ghost{k + 1}'] = lqs2m(fx[i, 2 + k])
    M['Sword_Portal'] = lqs2m(fx[i, 6])
    return M, (float(fx[i, 7, 0]), float(fx[i, 7, 2]))

def local_trs(M):
    """world (Blender) -> per-joint local T, R(quat xyzw), S in glTF space, using the translation-only rest convention."""
    J = {}
    for b in JOINTS:
        Dl = M[b] @ np.linalg.inv(REST[b])
        Jw = Dl.copy(); Jw[:3, 3] = Dl[:3, :3] @ HEAD[b] + Dl[:3, 3]
        J[b] = Jw
    out = {}
    for b in JOINTS:
        p = PARENT[b]
        L = J[b] if p is None else np.linalg.inv(J[p]) @ J[b]
        R3 = cm(L[:3, :3]); t = cv(L[:3, 3])
        s = np.linalg.norm(R3, axis=0); Rn = R3 / np.maximum(s, 1e-9)
        if np.linalg.det(Rn) < 0: Rn[:, 0] *= -1; s[0] *= -1
        q = mat_to_quat(Rn)                     # w,x,y,z
        out[b] = (t, np.array([q[1], q[2], q[3], q[0]]), s)
    return out

# ------------------------------------------------------------------ binary builder
class GLB:
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.acc = []
    def view(self, data, target=None):
        while len(self.bin) % 4: self.bin += b'\0'
        off = len(self.bin); self.bin += data
        v = dict(buffer=0, byteOffset=off, byteLength=len(data))
        if target: v['target'] = target
        self.views.append(v); return len(self.views) - 1
    def accessor(self, arr, comp, typ, target=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[comp]
        a = arr.astype(dt)
        w = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[typ]
        v = self.view(a.tobytes(), target)
        d = dict(bufferView=v, componentType=comp, count=int(a.size // w), type=typ)
        if minmax:
            r = a.reshape(-1, w); d['min'] = r.min(0).tolist(); d['max'] = r.max(0).tolist()
        self.acc.append(d); return len(self.acc) - 1

def vertex_normals(P, T, inv=None):
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    key = T if inv is None else inv[T]
    n = int(key.max()) + 1
    vn = np.zeros((n, 3))
    for k in range(3): np.add.at(vn, key[:, k], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
    return vn if inv is None else vn[inv]

BODY_CELL = 0.0050
SWORD_CELL = 0.003
def build(out_path, jpeg_q=86, tex_size=4096, sword_tex=2048):
    g = GLB(); J = len(JOINTS); jidx = {b: i for i, b in enumerate(JOINTS)}
    # ---------------- hero mesh (split by UV)
    B = Blend('/home/claude/work/hero-rigged-2.raw.blend'); Mh = read_mesh(B, 'MEnode_0')
    P = Mh['pos'].astype(float); T = Mh['tris']; uvc = Mh['uv'][1]
    corner_v = T.reshape(-1)                                           # tris are polys (all triangles) in order
    uvq = np.round(uvc * 65536).astype(np.int64)
    key = corner_v.astype(np.int64) * (1 << 40) + uvq[:, 0] * (1 << 20) + uvq[:, 1]
    uk, first, cidx = np.unique(key, return_index=True, return_inverse=True); cidx = cidx.ravel()
    src = corner_v[first]                                              # original vertex per split vertex
    UV = uvc[first]
    Tn = cidx.reshape(-1, 3)
    from wsmooth import weld_edges
    inv, _ = weld_edges(P, T)
    N = vertex_normals(P, T, inv)[src]
    Wn = np.load('/home/claude/work/W_final.npy'); groups = list(np.load('/home/claude/work/hero-rigged-2_mesh.npz')['groups'])
    top = np.argsort(-Wn, axis=1)[:, :4]; w = np.take_along_axis(Wn, top, 1); w /= w.sum(1, keepdims=True)
    gj = np.array([jidx[gname] for gname in groups])
    JOI = gj[top][src]; WEI = w[src]
    # fist morph deltas
    Mz = np.load('/home/claude/work/hero-rigged-2_mesh.npz')
    morphs = []
    for s in 'RL':
        A = HR.rig.arm['Hand.' + s]
        Lall = (np.linalg.inv(A) @ np.c_[P, np.ones(len(P))].T).T[:, :3]
        m = region(Lall) & (Mz['W'][:, groups.index('Hand.' + s)] > 0.02)
        Lc = curl(Lall[m], 1.0, mirror=(s == 'L')); d = np.zeros_like(P)
        d[m] = (A @ np.c_[Lc, np.ones(len(Lc))].T).T[:, :3] - P[m]
        morphs.append(cv(d[src]))
    Pb = P[src]
    if BODY_CELL:
        from decimate import cluster_decimate
        q = np.floor(Pb / BODY_CELL).astype(np.int64); u = np.floor(UV / (1 / 48)).astype(np.int64)
        _, ci = np.unique(np.c_[q, u], axis=0, return_inverse=True); ci = ci.ravel(); nc = ci.max() + 1
        cnt = np.bincount(ci, minlength=nc)[:, None].astype(float)
        def avg(X): Y = np.zeros((nc, X.shape[1])); np.add.at(Y, ci, X); return Y / cnt
        # weights: average the dense rows, keep top 4
        Wd = np.zeros((nc, len(JOINTS))); 
        for k in range(4): np.add.at(Wd, (ci, JOI[:, k].astype(np.int64)), WEI[:, k])
        Wd /= cnt
        JOI = np.argsort(-Wd, 1)[:, :4]; WEI = np.take_along_axis(Wd, JOI, 1); WEI /= WEI.sum(1, keepdims=True)
        Pb = avg(Pb); UV = avg(UV); morphs = [avg(m) for m in morphs]
        Tn = ci[Tn]; ok = (Tn[:, 0] != Tn[:, 1]) & (Tn[:, 1] != Tn[:, 2]) & (Tn[:, 0] != Tn[:, 2]); Tn = Tn[ok]
        sT = np.sort(Tn, 1); _, keep = np.unique(sT, axis=0, return_index=True); Tn = Tn[np.sort(keep)]
        from wsmooth import weld_edges
        inv2, _ = weld_edges(Pb, Tn); N = vertex_normals(Pb, Tn, inv2)
    Pg = cv(Pb); Ng = cv(N)
    print('hero after decimation verts', len(Pb), 'tris', len(Tn))
    print('hero split verts', len(src), 'tris', len(Tn))
    attrs = dict(POSITION=g.accessor(Pg, 5126, 'VEC3', 34962, True), NORMAL=g.accessor(Ng, 5126, 'VEC3', 34962),
                 TEXCOORD_0=g.accessor(UV, 5126, 'VEC2', 34962), JOINTS_0=g.accessor(JOI, 5123, 'VEC4', 34962),
                 WEIGHTS_0=g.accessor(WEI, 5126, 'VEC4', 34962))
    targets = [dict(POSITION=g.accessor(d, 5126, 'VEC3', 34962, True)) for d in morphs]
    ind = g.accessor(Tn.reshape(-1), 5125, 'SCALAR', 34963)
    # textures
    def jpg(img, size):
        if img.size[0] > size: img = img.resize((size, size), Image.LANCZOS)
        bio = io.BytesIO(); img.convert('RGB').save(bio, 'JPEG', quality=jpeg_q, optimize=True); return bio.getvalue()
    images = []; textures = []
    hero_img = Image.open('/home/claude/work/hero_texture.bin')
    images.append(dict(bufferView=g.view(jpg(hero_img, tex_size)), mimeType='image/jpeg', name='hero')); textures.append(dict(source=0))
    # ---------------- sword
    d = open('/mnt/user-data/uploads/GeminiGeneratedImagez0vn5oz0vn5o.glb', 'rb').read()
    L = struct.unpack_from('<I', d, 12)[0]; Jg = json.loads(d[20:20 + L]); b0 = 20 + L + 8
    def sacc(i):
        a = Jg['accessors'][i]; v = Jg['bufferViews'][a['bufferView']]
        w_ = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
        dt = {5126: '<f4', 5125: '<u4', 5123: '<u2'}[a['componentType']]
        return np.frombuffer(d[b0 + v['byteOffset']: b0 + v['byteOffset'] + v['byteLength']], dtype=dt).reshape(-1, w_) if w_ > 1 else \
               np.frombuffer(d[b0 + v['byteOffset']: b0 + v['byteOffset'] + v['byteLength']], dtype=dt)
    S = sacc(0).astype(float); SN = sacc(1).astype(float); SUV = sacc(2).astype(float); SI = sacc(3).astype(np.int64).reshape(-1, 3)
    if SWORD_CELL:
        from decimate import cluster_decimate
        S, SUV, SI = cluster_decimate(S, SUV, SI, SWORD_CELL)
    Sc = reshape_blade(np.stack([S[:, 0], -S[:, 2] - GRIP_FROM_POMMEL / SWORD_SCALE, S[:, 1]], 1) * SWORD_SCALE)
    SNc = vertex_normals(Sc, SI)
    Rg = REST['Sword_Grip'][:3, :3]
    sw_attrs = dict(POSITION=g.accessor(cv(Sc @ Rg.T), 5126, 'VEC3', 34962, True), NORMAL=g.accessor(cv(SNc @ Rg.T), 5126, 'VEC3', 34962),
                    TEXCOORD_0=g.accessor(SUV, 5126, 'VEC2', 34962))
    sw_ind = g.accessor(SI.reshape(-1), 5125, 'SCALAR', 34963)
    simg = Jg['images'][0]; sv = Jg['bufferViews'][simg['bufferView']]
    sword_img = Image.open(io.BytesIO(d[b0 + sv['byteOffset']: b0 + sv['byteOffset'] + sv['byteLength']]))
    images.append(dict(bufferView=g.view(jpg(sword_img, sword_tex)), mimeType='image/jpeg', name='sword')); textures.append(dict(source=1))
    print('sword verts', len(S), 'tris', len(SI))
    # ---------------- FX meshes (canonical sword frame / portal frame)
    SV, SF = blade_shell(Sc, BLADE_START)
    shell = dict(POSITION=g.accessor(cv(SV), 5126, 'VEC3', 34962, True), NORMAL=g.accessor(cv(vertex_normals(SV, SF)), 5126, 'VEC3', 34962))
    shell_ind = g.accessor(SF.reshape(-1), 5125, 'SCALAR', 34963)
    portal_prims = []
    for name, V, F, col, alpha in portal_mesh():
        portal_prims.append((name, dict(POSITION=g.accessor(cv(V), 5126, 'VEC3', 34962, True)), g.accessor(np.asarray(F).reshape(-1), 5125, 'SCALAR', 34963), col, alpha))
    # ---------------- materials & meshes
    materials = [dict(name='Hero', pbrMetallicRoughness=dict(baseColorTexture=dict(index=0), metallicFactor=0.0, roughnessFactor=0.85), doubleSided=True),
                 dict(name='Sword', pbrMetallicRoughness=dict(baseColorTexture=dict(index=1), metallicFactor=0.55, roughnessFactor=0.4), doubleSided=True),
                 dict(name='FX_Aura', pbrMetallicRoughness=dict(baseColorFactor=[0.3, 0.68, 1.0, 0.5]), emissiveFactor=[0.3, 0.68, 1.0], alphaMode='BLEND', doubleSided=True,
                      extras=dict(fx='aura'))]
    meshes = [dict(name='HeroBody', primitives=[dict(attributes=attrs, indices=ind, material=0, targets=targets)], weights=[1.0, 0.55],
                   extras=dict(targetNames=['Fist_R', 'Fist_L'])),
              dict(name='HeroSword', primitives=[dict(attributes=sw_attrs, indices=sw_ind, material=1)]),
              dict(name='SwordShell', primitives=[dict(attributes=shell, indices=shell_ind, material=2)])]
    for name, at, ix, col, alpha in portal_prims:
        materials.append(dict(name='FX_' + name, pbrMetallicRoughness=dict(baseColorFactor=[*col, alpha]), emissiveFactor=list(col),
                              alphaMode='BLEND', doubleSided=True, extras=dict(fx=name)))
        meshes.append(dict(name=name, primitives=[dict(attributes=at, indices=ix, material=len(materials) - 1)]))
    # ---------------- nodes
    nodes = []
    for b in JOINTS:
        p = PARENT[b]
        t = HEAD[b] - (HEAD[p] if p else 0)
        nodes.append(dict(name=safe(b), translation=cv(t).tolist()))
    for i, b in enumerate(JOINTS):
        ch = [jidx[c] for c in JOINTS if PARENT[c] == b]
        if ch: nodes[i]['children'] = ch
    def add_node(n, parent=None):
        nodes.append(n); k = len(nodes) - 1
        if parent is not None: nodes[parent].setdefault('children', []).append(k)
        return k
    body_node = add_node(dict(name='HeroBody', mesh=0, skin=0))
    add_node(dict(name='HeroSword', mesh=1), jidx['Sword_Grip'])
    add_node(dict(name='SwordAura', mesh=2, extras=dict(fx='aura', opacity=0.55)), jidx['Sword_Aura'])
    for k in range(4):
        add_node(dict(name=f'SwordGhost{k + 1}', mesh=2, extras=dict(fx='ghost', opacity=[0.42, 0.30, 0.20, 0.12][k])), jidx[f'Sword_Ghost{k + 1}'])
    for m, (name, *_r) in enumerate(portal_prims):
        add_node(dict(name=name, mesh=3 + m, extras=dict(fx=name)), jidx['Sword_Portal'])
    ibm = np.stack([np.eye(4) for _ in JOINTS])
    for i, b in enumerate(JOINTS):
        M = np.eye(4); M[:3, 3] = -cv(HEAD[b]); ibm[i] = M
    skin = dict(joints=list(range(J)), skeleton=0, inverseBindMatrices=g.accessor(np.transpose(ibm, (0, 2, 1)).reshape(-1), 5126, 'MAT4'))
    # ---------------- animations
    anims = []; clipinfo = {}
    rest_t = {b: cv(HEAD[b] - (HEAD[PARENT[b]] if PARENT[b] else 0)) for b in JOINTS}
    samples = {}
    for src_name, name in RENAME.items():
        n = len(CL[src_name]['arr'])
        Ts = {b: [] for b in JOINTS}; Rs = {b: [] for b in JOINTS}; Ss = {b: [] for b in JOINTS}; Wt = []
        for i in range(n):
            Mw, fw = world_mats(src_name, i); tr = local_trs(Mw)
            for b in JOINTS:
                t, q, s = tr[b]; Ts[b].append(t); Rs[b].append(q); Ss[b].append(s)
            Wt.append(fw)
        samples[name] = (n, Ts, Rs, Ss, Wt)
        print('sampled', name, n, flush=True)
    moving_t = set(); moving_s = set()
    for name, (n, Ts, Rs, Ss, Wt) in samples.items():
        for b in JOINTS:
            if np.abs(np.array(Ts[b]) - rest_t[b]).max() > 1e-5: moving_t.add(b)
            if np.abs(np.array(Ss[b]) - 1).max() > 1e-4: moving_s.add(b)
    for name, (n, Ts, Rs, Ss, Wt) in samples.items():
        times = g.accessor(np.arange(n) / 30.0, 5126, 'SCALAR', minmax=True)
        samplers = []; channels = []
        def ch(node, path, vals, typ):
            samplers.append(dict(input=times, output=g.accessor(np.asarray(vals), 5126, typ), interpolation='LINEAR'))
            channels.append(dict(sampler=len(samplers) - 1, target=dict(node=node, path=path)))
        for b in JOINTS:
            Q = np.array(Rs[b])
            for i in range(1, n):
                if np.dot(Q[i], Q[i - 1]) < 0: Q[i] *= -1
            ch(jidx[b], 'rotation', Q, 'VEC4')
            if b in moving_t: ch(jidx[b], 'translation', Ts[b], 'VEC3')
            if b in moving_s: ch(jidx[b], 'scale', np.maximum(np.abs(np.array(Ss[b])), 1e-4), 'VEC3')
        ch(body_node, 'weights', np.array(Wt).reshape(-1), 'SCALAR')
        anims.append(dict(name=name, samplers=samplers, channels=channels))
        clipinfo[name] = dict(frames=n, loop=name in LOOPS)
    gltf = dict(asset=dict(version='2.0', generator='Love-Adventure hero exporter'), scene=0,
                scenes=[dict(nodes=[0, body_node])], nodes=nodes, meshes=meshes, materials=materials, textures=textures,
                images=images, samplers=[dict(magFilter=9729, minFilter=9987)], skins=[skin], animations=anims,
                accessors=g.acc, bufferViews=g.views, buffers=[dict(byteLength=len(g.bin))],
                extras=dict(revision='HERO_V3_SWORD', fps=30, clips=clipinfo,
                            hits={RENAME[k]: [h / 30.0 for h in v] for k, v in META['hits'].items()},
                            comboBounds=[b / 30.0 for b in META['bounds']],
                            speeds=dict(Walk=META['speeds']['walk'], Run=META['speeds']['run'], CombatWalk=META['speeds']['combat_walk'],
                                        BattleRun=META['speeds']['battle_run']),
                            joints=JOINTS, upperFrom='Spine', height=2.0))
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(g.bin) % 4: g.bin += b'\0'
    total = 12 + 8 + len(js) + 8 + len(g.bin)
    with open(out_path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(g.bin), 0x004E4942)); f.write(bytes(g.bin))
    print('wrote', out_path, total / 1e6, 'MB')

if __name__ == '__main__':
    build(sys.argv[1])
