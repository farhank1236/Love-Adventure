"""Textured contact sheet of clip frames:  python sheet.py PKL CLIP f0,f1,.. VIEWS OUT   (VIEWS: side,front,back,q)"""
import sys, os, pickle, struct, json, io; sys.path.insert(0, '/home/claude/tools')
import numpy as np
from PIL import Image, ImageDraw
import video3 as V
from blend import Blend
from mesh import read_mesh
def vcolors():
    cache = '/home/claude/work/vcol.npz'
    if os.path.exists(cache): z = np.load(cache); return z['body'], z['sword']
    B = Blend('/home/claude/work/hero-rigged-2.raw.blend'); Mh = read_mesh(B, 'MEnode_0')
    uv = Mh['uv'][1]; T = Mh['tris'].reshape(-1); n = len(Mh['pos'])
    tex = np.asarray(Image.open('/home/claude/work/hero_texture.bin').convert('RGB')) / 255.0; h, w, _ = tex.shape
    u = np.zeros((n, 2)); u[T] = uv
    body = tex[np.clip(((1 - u[:, 1]) * h).astype(int), 0, h - 1), np.clip((u[:, 0] * w).astype(int), 0, w - 1)]
    d = open('/mnt/user-data/uploads/GeminiGeneratedImagez0vn5oz0vn5o.glb', 'rb').read()
    L = struct.unpack_from('<I', d, 12)[0]; J = json.loads(d[20:20 + L]); b0 = 20 + L + 8
    a = J['accessors'][2]; bv = J['bufferViews'][a['bufferView']]
    suv = np.frombuffer(d[b0 + bv['byteOffset']: b0 + bv['byteOffset'] + bv['byteLength']], '<f4').reshape(-1, 2)
    iv = J['bufferViews'][J['images'][0]['bufferView']]
    st = np.asarray(Image.open(io.BytesIO(d[b0 + iv['byteOffset']: b0 + iv['byteOffset'] + iv['byteLength']])).convert('RGB')) / 255.0; h, w, _ = st.shape
    sword = st[np.clip(((suv[:, 1] % 1) * h).astype(int), 0, h - 1), np.clip(((suv[:, 0] % 1) * w).astype(int), 0, w - 1)]
    np.savez(cache, body=body, sword=sword); return body, sword
CAMS = {'side': ((-5.6, -0.6, 1.3), (0, -0.4, 1.0), 30), 'front': ((0.6, -6.0, 1.4), (0, -0.4, 1.0), 30),
        'q': ((-3.4, -5.2, 1.6), (0, -0.55, 1.05), 30), 'q2': ((3.8, -4.8, 1.5), (0, -0.55, 1.05), 30), 'back': ((-0.6, 5.5, 1.6), (0, -0.4, 1.0), 30),
        'top': ((-2.0, -3.0, 5.5), (0, -0.5, 0.8), 34)}
def sheet(pkl, clip, frames, views, out, W=300, H=400, cols=None):
    D = pickle.load(open(pkl, 'rb')); V.CL = D['clips']
    FS = V.FXSkin(); bc, sc = vcolors(); ims = []
    for i in frames:
        layers, glows, portal = FS.frame(clip, i)
        layers = [(layers[0][0], layers[0][1], bc)] + ([(layers[1][0], layers[1][1], sc)] if len(layers) > 1 else [])
        row = [V.draw(FS, layers, glows, portal, *CAMS[v], W=W, H=H) for v in views]
        im = Image.fromarray((np.concatenate(row, 1) * 255).astype(np.uint8)); ImageDraw.Draw(im).text((6, 6), f'{clip} {i}', fill=(20, 20, 20)); ims.append(im)
    cols = cols or min(len(ims), max(1, 1800 // ims[0].size[0])); rows = (len(ims) + cols - 1) // cols
    w, h = ims[0].size; M = Image.new('RGB', (w * cols, h * rows), 'white')
    for k, im in enumerate(ims): M.paste(im, ((k % cols) * w, (k // cols) * h))
    M.save(out); return out
if __name__ == '__main__':
    pkl, clip, fr, views, out = sys.argv[1:6]
    D = pickle.load(open(pkl, 'rb')); n = len(D['clips'][clip]['arr'])
    frames = list(range(0, n, max(1, n // int(fr[1:])))) if fr.startswith('n') else [int(x) for x in fr.split(',')]
    sheet(pkl, clip, frames, views.split(','), out)
