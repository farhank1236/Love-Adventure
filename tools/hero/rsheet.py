"""Contact sheet of hero clip frames together with the horse (ride frame).  rsheet.render_clip(clipdict, frames, horse_fn, out)"""
import sys, numpy as np; sys.path.insert(0, '/home/claude/tools'); sys.path.insert(0, '/home/claude/horse')
from PIL import Image, ImageDraw
import video3 as V
from sheet import vcolors
from render import render
from pose import deform
import pickle
_H = {}
def horse_data():
    if not _H:
        Q = np.load('/home/claude/horse/Q.npy'); I = np.load('/home/claude/horse/I.npy'); UV = np.load('/home/claude/horse/UV.npy')
        Wz = np.load('/home/claude/horse/weights.npz')
        from glb_look import load
        J_, acc, img = load('/mnt/user-data/uploads/Armored_Horse.glb'); tex = img(0); h, w, _ = tex.shape
        C = tex[np.clip((UV[:, 1] % 1) * h, 0, h - 1).astype(int), np.clip((UV[:, 0] % 1) * w, 0, w - 1).astype(int)]
        C = np.clip(C * 2.0 + 0.1, 0, 1)
        sel = np.arange(0, len(I), 3)
        parts, STIR = pickle.load(open('/home/claude/horse/saddle.pkl', 'rb'))
        _H.update(Q=Q, I=I[sel], C=C, J=Wz['J'].astype(int), W=Wz['W'], parts=parts)
    return _H
COL = dict(cloth=(0.12, 0.17, 0.42), gold=(0.95, 0.72, 0.3), leather=(0.42, 0.24, 0.12), iron=(0.55, 0.56, 0.6))
def h2w(P): return np.c_[P[:, 0], -0.59 - P[:, 2], P[:, 1]]          # horse space -> hero Blender world (ride frame)
def horse_layers(pose=None):
    d = horse_data()
    P = d['Q'] if pose is None else deform(d['Q'], d['J'], d['W'], pose.fk())
    L = [(h2w(P), d['I'], d['C'])]
    for p in d['parts']:
        V_ = p['V']
        if pose is not None:
            G = pose.fk(); M = G['Spine']; from hskel import HEAD
            V_ = (M[:3, :3] @ (V_ - HEAD['Spine']).T).T + M[:3, 3]
        L.append((h2w(V_), p['F'], np.array(COL[p['mat']])))
    return L
CAM = {'left': ((4.6, -0.9, 1.7), (0, -0.7, 1.3), 34), 'q': ((3.2, -4.4, 2.3), (0, -0.6, 1.4), 34), 'back': ((1.0, 4.5, 2.4), (0, -0.6, 1.4), 34),
       'right': ((-4.6, -0.9, 1.7), (0, -0.7, 1.3), 34), 'front': ((0.4, -5.6, 2.0), (0, -0.6, 1.4), 34)}
def render_clip(clip, frames, out, views=('left', 'q'), horse_fn=None, W=360, H=420):
    V.CL = {'c': clip}; FS = V.FXSkin(); bc, sc = vcolors(); ims = []
    for i in frames:
        layers, glows, portal = FS.frame('c', i)
        layers = [(layers[0][0], layers[0][1], bc)] + ([(layers[1][0], layers[1][1], sc)] if len(layers) > 1 else [])
        hl = horse_layers(horse_fn(i) if horse_fn else None)
        row = [V.draw(FS, layers + hl, glows, portal, *CAM[v], W=W, H=H) for v in views]
        im = Image.fromarray((np.concatenate(row, 1) * 255).astype(np.uint8)); ImageDraw.Draw(im).text((6, 6), str(i), fill=(20, 20, 20)); ims.append(im)
    cols = max(1, min(len(ims), 1800 // ims[0].size[0])); rows = (len(ims) + cols - 1) // cols
    w, h = ims[0].size; M = Image.new('RGB', (w * cols, h * rows), 'white')
    for k, im in enumerate(ims): M.paste(im, ((k % cols) * w, (k // cols) * h))
    M.save(out); return out
