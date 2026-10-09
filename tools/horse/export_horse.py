"""Export the rigged horse + saddle + clips as a GLB for the game (and chunk it into assets/models/horse-NN.js).
Horse space = glTF space (y up, +z forward). Joints are nodes 0..J-1, rest = translation only, inverse bind = translate(-head).
Body positions are int16-normalized; the dequantization (scale + offset) is folded into the body skin's inverse binds.
Body indices use uint16 by splitting the mesh into primitives of <= 65535 vertices."""
import sys, json, struct, io, pickle, base64, numpy as np
sys.path.insert(0, '/home/claude/horse'); sys.path.insert(0, '/home/claude/tools')
from PIL import Image
from hskel import NAMES as BN, HEAD as BH, PARENT as BP
import gait
from gait import gait_frame, idle_frame, rear_frame, WALK, GALLOP, Pose
from pose import rx, rz
from glb_look import load
from glbutil import GLB, q_normals, q_weights
from fk import mat_to_quat

parts, STIR = pickle.load(open('/home/claude/horse/saddle.pkl', 'rb'))
JOINTS = list(BN) + ['Saddle', 'Stirrup.L', 'Stirrup.R']
PARENT = dict(BP); PARENT.update({'Saddle': 'Spine', 'Stirrup.L': 'Saddle', 'Stirrup.R': 'Saddle'})
HEAD = dict(BH); HEAD['Saddle'] = np.array([0, 1.62, -0.25]); HEAD['Stirrup.L'] = STIR['L']['pivot']; HEAD['Stirrup.R'] = STIR['R']['pivot']
jidx = {b: i for i, b in enumerate(JOINTS)}

# ------------------------------------------------------------------ source mesh
Jg, acc, img = load('/mnt/user-data/uploads/Armored_Horse.glb')
pr = Jg['meshes'][0]['primitives'][0]
Q = np.load('/home/claude/horse/Q.npy'); I = np.load('/home/claude/horse/I.npy').astype(np.int64); UV = np.load('/home/claude/horse/UV.npy')
N0 = acc(pr['attributes']['NORMAL']).astype(float)
Rn = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float)      # the node's +90 deg X rotation (y-up conversion), normals only
N = N0 @ Rn.T
Wz = np.load('/home/claude/horse/weights.npz'); JW = Wz['J'].astype(int); WW = Wz['W']

def split(Tr, maxv=65535):
    """partition triangles into chunks that each reference <= maxv distinct vertices"""
    out = []; i = 0; n = len(Tr)
    while i < n:
        lo, hi = i + 1, n
        # grow greedily in blocks
        used = {}; tris = []
        j = i
        while j < n:
            t = Tr[j]; new = [v for v in t if v not in used]
            if len(used) + len(new) > maxv: break
            for v in new: used[v] = len(used)
            j += 1
        out.append((i, j, used)); i = j
    return out

def build(out_path, tex_size=4096, jpeg_q=80):
    g = GLB()
    # ---------------- body
    lo, hi = Q.min(0), Q.max(0); ctr = (lo + hi) / 2; half = (hi - lo) / 2 * 1.0001
    qpos = np.round((Q - ctr) / half * 32767).astype(np.int16)
    chunks = split(I)
    print('body chunks', [len(u) for _, _, u in chunks])
    prims = []
    for (a, b, used) in chunks:
        verts = np.fromiter(used.keys(), dtype=np.int64, count=len(used))
        remap = np.full(len(Q), -1, np.int64); remap[verts] = np.arange(len(verts))
        T = remap[I[a:b]]
        at = dict(POSITION=g.qaccessor(qpos[verts], 5122, 'VEC3', True, stride=8), NORMAL=g.qaccessor(q_normals(N[verts]), 5120, 'VEC3', True, stride=4),
                  TEXCOORD_0=g.qaccessor(np.round(np.clip(UV[verts], 0, 1) * 65535), 5123, 'VEC2', True),
                  JOINTS_0=g.qaccessor(np.array([[jidx[BN[k]] for k in r] for r in JW[verts]]) if False else JW[verts], 5121, 'VEC4'),
                  WEIGHTS_0=g.qaccessor(q_weights(WW[verts]), 5121, 'VEC4', True))
        # min/max for POSITION (required): quantized space
        acc_p = g.acc[at['POSITION']]; qp = qpos[verts]; acc_p['min'] = qp.min(0).tolist(); acc_p['max'] = qp.max(0).tolist()
        prims.append(dict(attributes=at, indices=g.accessor(T.reshape(-1), 5123, 'SCALAR', 34963), material=0))
    # texture (from the source PNG)
    src = Jg['images'][0]
    im = img(0); im = Image.fromarray((im * 255).astype(np.uint8))
    if im.size[0] > tex_size: im = im.resize((tex_size, tex_size), Image.LANCZOS)
    bio = io.BytesIO(); im.save(bio, 'JPEG', quality=jpeg_q, optimize=True)
    images = [dict(bufferView=g.view(bio.getvalue()), mimeType='image/jpeg', name='horse')]
    print('horse texture KB', len(bio.getvalue()) // 1024)
    # ---------------- saddle textures (procedural)
    def tex_png(arr):
        b = io.BytesIO(); Image.fromarray(arr).save(b, 'JPEG', quality=86); return b.getvalue()
    rng = np.random.default_rng(3); S = 512
    yy, xx = np.mgrid[0:S, 0:S] / S
    def fbm(scale, oct=5):
        out = np.zeros((S, S)); amp = 1; tot = 0
        for o in range(oct):
            n = rng.random((scale * 2 ** o, scale * 2 ** o)); n = np.array(Image.fromarray((n * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)) / 255
            out += amp * n; tot += amp; amp *= 0.5
        return out / tot
    grain = fbm(16); crease = fbm(4)
    leather = np.stack([0.30, 0.17, 0.085], -1)[None, None] * (0.75 + 0.45 * grain[..., None]) * (0.85 + 0.3 * crease[..., None])
    weave = (0.5 + 0.5 * np.sin(xx * S * 0.8) * np.sin(yy * S * 0.8)) * 0.15 + 0.85
    cloth = np.stack([0.06, 0.09, 0.26], -1)[None, None] * weave[..., None] * (0.85 + 0.25 * fbm(8)[..., None])
    images.append(dict(bufferView=g.view(tex_png((np.clip(leather, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8))), mimeType='image/jpeg', name='leather'))
    images.append(dict(bufferView=g.view(tex_png((np.clip(cloth, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8))), mimeType='image/jpeg', name='cloth'))
    textures = [dict(source=0, sampler=0), dict(source=1, sampler=1), dict(source=2, sampler=1)]
    materials = [dict(name='Horse', pbrMetallicRoughness=dict(baseColorTexture=dict(index=0), metallicFactor=0.0, roughnessFactor=0.75), doubleSided=True),
                 dict(name='Leather', pbrMetallicRoughness=dict(baseColorTexture=dict(index=1), metallicFactor=0.0, roughnessFactor=0.62), doubleSided=True),
                 dict(name='Cloth', pbrMetallicRoughness=dict(baseColorTexture=dict(index=2), metallicFactor=0.0, roughnessFactor=0.9), doubleSided=True),
                 dict(name='Gold', pbrMetallicRoughness=dict(baseColorFactor=[0.92, 0.66, 0.26, 1], metallicFactor=1.0, roughnessFactor=0.32), doubleSided=True),
                 dict(name='Iron', pbrMetallicRoughness=dict(baseColorFactor=[0.42, 0.43, 0.46, 1], metallicFactor=0.9, roughnessFactor=0.45), doubleSided=True)]
    MI = dict(leather=1, cloth=2, gold=3, iron=4)
    # ---------------- saddle (plain float positions, own skin)
    sprims = {}
    for p in parts:
        V = p['V']; F = p['F']; U = p['UV']; Nn = p['N']
        bone = np.full(len(V), jidx[p['bone']])
        if 'split' in p: bone[p['split'][1]] = jidx[p['split'][0]]
        lst = sprims.setdefault(p['mat'], [])
        lst.append((V, F, U, Nn, bone))
    saddle_prims = []
    for mat, lst in sprims.items():
        V = np.concatenate([l[0] for l in lst]); U = np.concatenate([l[2] for l in lst]); Nn = np.concatenate([l[3] for l in lst]); Bj = np.concatenate([l[4] for l in lst])
        F = []; o = 0
        for l in lst: F.append(l[1] + o); o += len(l[0])
        F = np.concatenate(F)
        Jm = np.zeros((len(V), 4)); Jm[:, 0] = Bj; Wm = np.zeros((len(V), 4)); Wm[:, 0] = 1
        at = dict(POSITION=g.accessor(V, 5126, 'VEC3', 34962, True), NORMAL=g.accessor(Nn, 5126, 'VEC3', 34962), TEXCOORD_0=g.accessor(U, 5126, 'VEC2', 34962),
                  JOINTS_0=g.qaccessor(Jm, 5121, 'VEC4'), WEIGHTS_0=g.qaccessor(Wm * 255, 5121, 'VEC4', True))
        saddle_prims.append(dict(attributes=at, indices=g.accessor(F.reshape(-1), 5125 if len(V) > 65535 else 5123, 'SCALAR', 34963), material=MI[mat]))
    meshes = [dict(name='HorseBody', primitives=prims), dict(name='Saddle', primitives=saddle_prims)]
    # ---------------- nodes + skins
    nodes = []
    for b in JOINTS:
        p = PARENT[b]; nodes.append(dict(name=b.replace('.', '_'), translation=(HEAD[b] - (HEAD[p] if p else 0)).tolist()))
    for i, b in enumerate(JOINTS):
        ch = [jidx[c] for c in JOINTS if PARENT[c] == b]
        if ch: nodes[i]['children'] = ch
    nodes.append(dict(name='HorseBody', mesh=0, skin=0)); body_node = len(nodes) - 1
    nodes.append(dict(name='Saddle', mesh=1, skin=1)); saddle_node = len(nodes) - 1
    Dq = np.eye(4); Dq[:3, :3] = np.diag(half); Dq[:3, 3] = ctr
    ibm0 = []; ibm1 = []
    for b in JOINTS:
        M = np.eye(4); M[:3, 3] = -HEAD[b]; ibm1.append(M); ibm0.append(M @ Dq)
    skins = [dict(joints=list(range(len(JOINTS))), skeleton=0, inverseBindMatrices=g.accessor(np.transpose(np.array(ibm0), (0, 2, 1)).reshape(-1), 5126, 'MAT4')),
             dict(joints=list(range(len(JOINTS))), skeleton=0, inverseBindMatrices=g.accessor(np.transpose(np.array(ibm1), (0, 2, 1)).reshape(-1), 5126, 'MAT4'))]
    # ---------------- clips
    def stir_swing(pose, a):                       # stirrups swing a little with the motion
        pose.R['Stirrup.L'] = rx(a); pose.R['Stirrup.R'] = rx(a)
    clips = {}
    def sample(name, fn, n, fps, loop):
        frames = []
        for i in range(n + (1 if loop else 0)):
            frames.append(fn(i % n if loop else i))
        clips[name] = (frames, fps, loop)
    def with_stir(pose, a): pose.R.setdefault('Saddle', np.eye(3)); stir_swing(pose, a); return pose
    for P in (WALK, GALLOP): P['stride'] = P['speed'] * P['period'] * P['duty']
    sample('Idle', lambda i: with_stir(idle_frame(i / 30.0), 0), 180, 30, True)
    nW = 30; sample('Walk', lambda i: with_stir(gait_frame(i / nW, WALK), 4 * np.sin(2 * np.pi * i / nW * 2)), nW, nW / WALK['period'], True)
    nG = 25; GALLOP['period'] = nG / 60.0; GALLOP['stride'] = GALLOP['speed'] * GALLOP['period'] * GALLOP['duty']
    sample('Gallop', lambda i: with_stir(gait_frame(i / nG, GALLOP), 14 * np.sin(2 * np.pi * i / nG - 1.2)), nG, 60, True)
    sample('Rear', lambda i: with_stir(rear_frame(i / 30.0), -20 * smooth01(i / 30.0)), 72, 30, False)
    anims = []; info = {}
    rest_t = {b: HEAD[b] - (HEAD[PARENT[b]] if PARENT[b] else 0) for b in JOINTS}
    for name, (frames, fps, loop) in clips.items():
        n = len(frames); times = g.accessor(np.arange(n) / fps, 5126, 'SCALAR', minmax=True); samplers = []; channels = []
        for b in JOINTS:
            Qs = []
            for f in frames:
                R = f.R.get(b, np.eye(3)); q = mat_to_quat(R); Qs.append([q[1], q[2], q[3], q[0]])
            Qs = np.array(Qs)
            for i in range(1, n):
                if np.dot(Qs[i], Qs[i - 1]) < 0: Qs[i] *= -1
            if np.abs(Qs - [0, 0, 0, 1]).max() < 1e-6 and b != 'Root': continue
            samplers.append(dict(input=times, output=g.accessor(Qs, 5126, 'VEC4'), interpolation='LINEAR'))
            channels.append(dict(sampler=len(samplers) - 1, target=dict(node=jidx[b], path='rotation')))
        Ts = np.array([rest_t['Root'] + f.root for f in frames])
        samplers.append(dict(input=times, output=g.accessor(Ts, 5126, 'VEC3'), interpolation='LINEAR'))
        channels.append(dict(sampler=len(samplers) - 1, target=dict(node=jidx['Root'], path='translation')))
        anims.append(dict(name=name, samplers=samplers, channels=channels)); info[name] = dict(frames=n, fps=fps, loop=loop, duration=(n - 1) / fps)
    gltf = dict(asset=dict(version='2.0', generator='Love-Adventure horse exporter v1'), scene=0,
                extensionsUsed=['KHR_mesh_quantization'], extensionsRequired=['KHR_mesh_quantization'],
                scenes=[dict(nodes=[0, body_node, saddle_node])], nodes=nodes, meshes=meshes, materials=materials, textures=textures, images=images,
                samplers=[dict(magFilter=9729, minFilter=9987), dict(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)], skins=skins, animations=anims,
                accessors=g.acc, bufferViews=g.views, buffers=[dict(byteLength=len(g.bin))],
                extras=dict(revision='HORSE_V1', clips=info, speeds=dict(Walk=WALK['speed'], Gallop=GALLOP['speed']),
                            seat=dict(bone='Saddle', point=[0, 1.67, -0.30]), stirrups={k: dict(tread=v['tread'].tolist(), pivot=v['pivot'].tolist()) for k, v in STIR.items()},
                            rearBurst=0.9, joints=JOINTS))
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(g.bin) % 4: g.bin += b'\0'
    total = 12 + 8 + len(js) + 8 + len(g.bin)
    with open(out_path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total)); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(g.bin), 0x004E4942)); f.write(bytes(g.bin))
    print('wrote', out_path, round(total / 1e6, 2), 'MB', {k: v['frames'] for k, v in info.items()})

def smooth01(x): x = min(max(x, 0), 1); return x * x * (3 - 2 * x)

def chunk(glb, outdir, name='horse', parts=4):
    b = base64.b64encode(open(glb, 'rb').read()).decode(); n = len(b); step = -(-n // parts)
    for i in range(parts):
        open(f'{outdir}/{name}-{i + 1:02d}.js', 'w').write(f'window.AethelosModelParts.{name}.push("{b[i * step:(i + 1) * step]}");\n')
    print('chunks', parts, 'each ~', step // 1e6, 'MB')

if __name__ == '__main__':
    build(sys.argv[1])
    if len(sys.argv) > 2: chunk(sys.argv[1], sys.argv[2])
