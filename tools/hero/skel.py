"""stick-figure side/front strips of a clip for gait analysis: python skel.py PKL CLIP step OUT [plane]"""
import sys, pickle; sys.path.insert(0, '/home/claude/tools')
import numpy as np
from PIL import Image, ImageDraw
from run import HR
from bake import pose_baked
CH = [('Hips', 'Spine'), ('Spine', 'Chest'), ('Chest', 'UpperChest'), ('UpperChest', 'Neck'), ('Neck', 'Head')]
LIMB = {'R': ['UpperArm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot', 'Toe'], 'L': ['UpperArm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot', 'Toe']}
def strip(pkl, clip, frames, out, plane='side', sc=170, travel=0.0):
    D = pickle.load(open(pkl, 'rb')); C = D['clips'][clip]
    W, H = 260, 420; img = Image.new('RGB', (W * len(frames), H), 'white'); dr = ImageDraw.Draw(img)
    for k, i in enumerate(frames):
        pose_baked(HR, C['bones'], C['arr'], i)
        def P(p):
            f = -(p[1] + 0.27); u = p[2]; r = -p[0]
            x = (f if plane == 'side' else r) * sc + W * k + W / 2; y = H - 20 - u * sc
            return (x, y)
        dr.line([(W * k, H - 20), (W * k + W, H - 20)], fill=(180, 180, 180))
        for a, b in CH: dr.line([P(HR.world_head(a)), P(HR.world_head(b))], fill=(60, 60, 60), width=4)
        for s, col in (('L', (60, 120, 230)), ('R', (220, 60, 40))):
            for chain in (['UpperArm', 'Forearm', 'Hand'], ['Thigh', 'Shin', 'Foot', 'Toe']):
                pts = [P(HR.world_head(f'{n}.{s}')) for n in chain] + [P(HR.world_tail(f'{chain[-1]}.{s}'))]
                dr.line(pts, fill=col, width=4 if s == 'R' else 3)
        hc = np.array(P(HR.world_head('Head'))) * 0.5 + np.array(P(HR.world_tail('Head'))) * 0.5
        dr.ellipse([hc[0] - 13, hc[1] - 13, hc[0] + 13, hc[1] + 13], outline=(60, 60, 60), width=3)
        dr.text((W * k + 6, 6), f'{clip} {i}', fill=(0, 0, 0))
    img.save(out)
if __name__ == '__main__':
    pkl, clip, fr, out = sys.argv[1:5]; plane = sys.argv[5] if len(sys.argv) > 5 else 'side'
    strip(pkl, clip, [int(x) for x in fr.split(',')], out, plane)
