import numpy as np, sys, pickle
sys.path.insert(0, '/home/claude/horse'); sys.path.insert(0, '/home/claude/tools')
from render import render
from PIL import Image
from glb_look import load
Q = np.load('Q.npy'); I = np.load('I.npy'); UV = np.load('UV.npy')
J_, acc, img = load('/mnt/user-data/uploads/Armored_Horse.glb'); tex = img(0); h, w, _ = tex.shape
C = tex[np.clip((UV[:, 1] % 1) * h, 0, h - 1).astype(int), np.clip((UV[:, 0] % 1) * w, 0, w - 1).astype(int)]; C = np.clip(C * 2.2 + 0.08, 0, 1)
parts, STIR = pickle.load(open('saddle.pkl', 'rb'))
COL = dict(cloth=(0.12, 0.17, 0.42), gold=(0.95, 0.72, 0.3), leather=(0.42, 0.24, 0.12), iron=(0.55, 0.56, 0.6))
Z = lambda P: np.c_[P[:, 0], -P[:, 2], P[:, 1]]
L = [(Z(Q), I, C)] + [(Z(p['V']), p['F'], np.array(COL[p['mat']])) for p in parts]
ims = []
for eye, tgt in [((5, 0, 1.6), (0, 0, 1.3)), ((-5, 0, 1.6), (0, 0, 1.3)), ((2.2, -2.2, 3.2), (0, 0.2, 1.4)), ((1.6, 0.9, 1.0), (0.3, 0.2, 1.1))]:
    im = render(L, eye, tgt, W=600, H=520, fov=30 if eye[0] != 1.6 else 40); ims.append((np.clip(im, 0, 1) * 255).astype(np.uint8))
Image.fromarray(np.concatenate([np.concatenate(ims[:2], 1), np.concatenate(ims[2:], 1)], 0)).save('saddle_look.png')
