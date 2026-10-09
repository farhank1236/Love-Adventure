"""contact sheet of a clip: side view, several frames"""
import numpy as np, sys
sys.path.insert(0, '/home/claude/horse'); sys.path.insert(0, '/home/claude/tools')
from gait import *
from pose import deform
from render import render
from PIL import Image
Q = np.load('Q.npy'); I = np.load('I.npy'); UV = np.load('UV.npy'); Wz = np.load('weights.npz'); Jw = Wz['J'].astype(int); Ww = Wz['W']
from glb_look import load
J_, acc, img = load('/mnt/user-data/uploads/Armored_Horse.glb'); tex = img(0); h, w, _ = tex.shape
C = tex[np.clip((UV[:, 1] % 1) * h, 0, h - 1).astype(int), np.clip((UV[:, 0] % 1) * w, 0, w - 1).astype(int)]; C = np.clip(C * 2.2 + 0.08, 0, 1)
# decimated preview for speed: subsample triangles
sel = np.arange(0, len(I), 2)
def frame_img(pose, eye=(6, 0, 1.2), W=360, H=320):
    P = deform(Q, Jw, Ww, pose.fk()); Pz = np.c_[P[:, 0], -P[:, 2], P[:, 1]]
    floor = None
    im = render([(Pz, I[sel], C)], eye, (0, 0, 1.15), W=W, H=H, ortho=3.2)
    im = (np.clip(im, 0, 1) * 255).astype(np.uint8); im[int(H / 2 + (1.15 - 0) * H / 3.2):int(H / 2 + (1.15) * H / 3.2) + 1] = (200, 60, 60)
    return im
which = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
ims = []
for k in range(n):
    if which == 'walk': p = gait_frame(k / n, WALK)
    elif which == 'gallop': p = gait_frame(k / n, GALLOP)
    elif which == 'idle': p = idle_frame(k / n * 6.0)
    elif which == 'rear': p = rear_frame(k / n * 2.4)
    ims.append(frame_img(p))
rows = [np.concatenate(ims[i:i + 4], 1) for i in range(0, n, 4)]
Image.fromarray(np.concatenate(rows, 0)).save(f'sheet_{which}.png')
