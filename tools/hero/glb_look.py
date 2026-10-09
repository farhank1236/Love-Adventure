# render rest pose of a GLB with texture sampled per vertex (checks UV mapping as the GLB actually stores it)
import sys, json, struct, io, numpy as np
from PIL import Image
sys.path.insert(0, '/home/claude/tools'); from render import render
def load(path):
    d = open(path, 'rb').read(); L = struct.unpack_from('<I', d, 12)[0]; J = json.loads(d[20:20 + L]); b0 = 20 + L + 8
    def acc(i):
        a = J['accessors'][i]; v = J['bufferViews'][a['bufferView']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        dt = {5126: '<f4', 5125: '<u4', 5123: '<u2'}[a['componentType']]
        o = b0 + v.get('byteOffset', 0) + a.get('byteOffset', 0)
        return np.frombuffer(d, dtype=dt, count=a['count'] * n, offset=o).reshape(-1, n) if n > 1 else np.frombuffer(d, dtype=dt, count=a['count'], offset=o)
    def img(i):
        v = J['bufferViews'][J['images'][i]['bufferView']]; o = b0 + v.get('byteOffset', 0)
        return np.asarray(Image.open(io.BytesIO(d[o:o + v['byteLength']])).convert('RGB')) / 255.0
    return J, acc, img
def world_mats(J):
    W = {}
    def T(n):
        M = np.eye(4); t = n.get('translation', [0, 0, 0]); M[:3, 3] = t
        if 'rotation' in n:
            x, y, z, w = n['rotation']; M[:3, :3] = [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]
        if 'scale' in n: M[:3, :3] = M[:3, :3] * np.array(n['scale'])
        return M
    def walk(i, P):
        M = P @ T(J['nodes'][i]); W[i] = M
        for c in J['nodes'][i].get('children', []): walk(c, M)
    for r in J['scenes'][0]['nodes']: walk(r, np.eye(4))
    return W
if __name__ == '__main__':
    path, out = sys.argv[1], sys.argv[2]
    J, acc, img = load(path); W = world_mats(J); layers = []
    for ni, n in enumerate(J['nodes']):
        if 'mesh' not in n: continue
        m = J['meshes'][n['mesh']]
        if m['name'] not in ('HeroBody', 'HeroSword'): continue
        pr = m['primitives'][0]; P = acc(pr['attributes']['POSITION']).astype(float)
        if m['name'] == 'HeroSword': P = (W[ni] @ np.c_[P, np.ones(len(P))].T).T[:, :3]
        UV = acc(pr['attributes']['TEXCOORD_0']); I = acc(pr['indices']).reshape(-1, 3)
        mat = J['materials'][pr['material']]; tex = img(J['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source'])
        h, w, _ = tex.shape; px = np.clip((UV[:, 0] % 1) * w, 0, w - 1).astype(int); py = np.clip((UV[:, 1] % 1) * h, 0, h - 1).astype(int)
        C = tex[py, px]
        Pz = np.c_[P[:, 0], -P[:, 2], P[:, 1]]   # back to z-up
        layers.append((Pz, I.astype(np.int64), C))
    allP = np.vstack([l[0] for l in layers]); c = allP.mean(0)
    views = {'front': ((0, -4.2, 1.1), (0, 0, 1.0), 720, 980), 'face': ((0, -1.3, 1.75), (0, 0, 1.72), 600, 600), 'side': ((-4.2, 0, 1.1), (0, 0, 1.0), 720, 980)}
    for k, (eye, tgt, Wd, Ht) in views.items():
        im = render(layers, eye, tgt, W=Wd, H=Ht, fov=32 if k != 'face' else 25)
        Image.fromarray((np.clip(im, 0, 1) * 255).astype(np.uint8)).save(f'{out}-{k}.png')
    print('ok', allP.min(0), allP.max(0))
