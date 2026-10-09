import sys, json, struct, numpy as np, pickle
sys.path.insert(0, '/home/claude/tools')
from run import HR, skinner
from bake import pose_baked
import video3 as V
def load(path):
    d = open(path, 'rb').read(); L = struct.unpack_from('<I', d, 12)[0]; g = json.loads(d[20:20 + L]); b0 = 20 + L + 8
    def acc(i):
        a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]
        w = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        dt = {5126: '<f4', 5125: '<u4', 5123: '<u2'}[a['componentType']]
        x = np.frombuffer(d, dtype=dt, count=a['count'] * w, offset=b0 + v['byteOffset'])
        return x.reshape(-1, w) if w > 1 else x
    return g, acc
def q2m(q):
    x, y, z, w = q; return np.array([[1-2*(y*y+z*z), 2*(x*y-w*z), 2*(x*z+w*y)], [2*(x*y+w*z), 1-2*(x*x+z*z), 2*(y*z-w*x)], [2*(x*z-w*y), 2*(y*z+w*x), 1-2*(x*x+y*y)]])
def pose(g, acc, anim, frame):
    J = len(g['skins'][0]['joints']); n = len(g['nodes'])
    T = [np.array(nd.get('translation', [0, 0, 0]), float) for nd in g['nodes']]
    R = [np.eye(3) for _ in range(n)]; S = [np.ones(3) for _ in range(n)]
    W = None
    a = [x for x in g['animations'] if x['name'] == anim][0]
    for c in a['channels']:
        s = a['samplers'][c['sampler']]; out = acc(s['output']); node = c['target']['node']; p = c['target']['path']
        if p == 'rotation': R[node] = q2m(out[frame])
        elif p == 'translation': T[node] = out[frame].astype(float)
        elif p == 'scale': S[node] = out[frame].astype(float)
        elif p == 'weights': W = out.reshape(-1, 2)[frame]
    par = {}
    for i, nd in enumerate(g['nodes']):
        for c in nd.get('children', []): par[c] = i
    world = {}
    def wm(i):
        if i in world: return world[i]
        M = np.eye(4); M[:3, :3] = R[i] @ np.diag(S[i]); M[:3, 3] = T[i]
        world[i] = (wm(par[i]) @ M) if i in par else M; return world[i]
    for i in range(n): wm(i)
    return world, W
if __name__ == '__main__':
    g, acc = load(sys.argv[1])
    ibm = acc(g['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
    prim = g['meshes'][0]['primitives'][0]
    P = acc(prim['attributes']['POSITION']).astype(float); Jn = acc(prim['attributes']['JOINTS_0']); Wt = acc(prim['attributes']['WEIGHTS_0'])
    MT = [acc(t['POSITION']).astype(float) for t in prim['targets']]
    names = {nd['name']: i for i, nd in enumerate(g['nodes'])}
    swp = g['meshes'][1]['primitives'][0]; SP = acc(swp['attributes']['POSITION']).astype(float)
    FS = V.FXSkin(); Cm = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float)
    for anim, src, fr in [('Combo', 'Hero_Attack_Combo', 40), ('Summon', 'Hero_Sword_Summon', 26), ('Walk', 'Hero_Walk', 8), ('Jump', 'Hero_Jump', 22)]:
        world, Wm = pose(g, acc, anim, fr)
        Pm = P + Wm[0] * MT[0] + Wm[1] * MT[1]
        skinm = np.stack([world[j] @ ibm[j] for j in range(len(ibm))])
        Ph = np.c_[Pm, np.ones(len(Pm))]
        out = np.zeros((len(P), 3))
        for k in range(4): out += Wt[:, k:k+1] * np.einsum('nij,nj->ni', skinm[Jn[:, k]][:, :3], Ph)
        layers, glows, portal = FS.frame(src, fr)
        ref = layers[0][0] @ Cm.T
        e_body = np.abs(out - ref).max()
        sw_world = (world[names['HeroSword']] @ np.c_[SP, np.ones(len(SP))].T).T[:, :3]
        e_sw = np.abs(sw_world - layers[1][0] @ Cm.T).max() if len(layers) > 1 else float('nan')
        print(anim, fr, 'body max err %.5f' % e_body, 'sword max err %.5f' % e_sw)
