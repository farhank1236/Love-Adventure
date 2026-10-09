"""v7 rider motion: the rider visibly rides the horse instead of sitting still on it.
walk  : the pelvis follows the horse's back (sways side to side once a stride, rocks fore-aft twice), the upper body
        balances against it (stays upright, head steady), the hands follow the horse's head nod on the reins.
gallop: two-point seat; knees and ankles absorb each stride (the seat rises and sinks over the saddle), the torso
        pitches with the stride and the hands travel forward and back along the neck with the horse's head.
idle  : breathing, weight shifts, a look left and right, a small adjustment of the reins."""
import sys, copy, numpy as np
sys.path.insert(0, '/home/claude/tools')
from ride5 import ride_base, arm_to, stirrup_feet, POMMEL, horse_saddle_track

def ride_walk7(n=30):
    base = ride_base(); out = []
    for i in range(n):
        ph = 2 * np.pi * i / n; c = copy.deepcopy(base)
        c['hips_off'] = (base['hips_off'][0] + 0.022 * np.sin(ph), base['hips_off'][1] + 0.025 * np.sin(2 * ph), base['hips_off'][2] + 0.014 * np.sin(2 * ph + 1.0))
        c['hips_rot'] = (4.5 * np.sin(ph), base['hips_rot'][1] + 4.0 * np.sin(2 * ph + 0.6), 5.5 * np.sin(ph + 0.4))
        c['spine_rot'] = (-3.5 * np.sin(ph), base['spine_rot'][1] - 2.8 * np.sin(2 * ph + 0.6), -4.5 * np.sin(ph + 0.4))
        c['head_rot'] = (-1.2 * np.sin(ph), -2 - 1.6 * np.sin(2 * ph + 0.6), 1.0 * np.sin(ph + 0.4))
        for s, sg in (('L', -1), ('R', 1)):
            arm_to(c, s, POMMEL + np.array([sg * 0.11, 0.10 + 0.06 * np.sin(2 * ph - 0.5), 0.10 + 0.018 * np.sin(2 * ph)]), swiv=25, pro=-20, flex=8)
        out.append(c)
    return out

def ride_gallop7(n=25, strides=2):
    track = horse_saddle_track('gallop', n, strides)
    base = ride_base(lean=30, hips_u=0.07, hips_f=0.07)
    y0 = np.mean([M[1, 3] for M in track]); out = []
    for i in range(n):
        M = track[i]; dy = M[1, 3] - y0
        pitch = np.degrees(np.arctan2(M[2, 1], M[1, 1]))
        ph = 2 * np.pi * i * strides / n; c = copy.deepcopy(base)
        c['hips_off'] = (base['hips_off'][0], base['hips_off'][1] + 0.035 * np.sin(ph + 0.5), base['hips_off'][2] - 0.2 * dy + 0.05 * np.sin(ph))
        c['hips_rot'] = (0, 10 - 0.5 * pitch + 6 * np.sin(ph + 0.8), 0)
        c['spine_rot'] = (0, 16 - 0.3 * pitch + 5 * np.sin(ph + 1.4), 0)
        c['head_rot'] = (0, -12 - 0.2 * pitch - 4 * np.sin(ph + 1.4), 0)
        c.update(stirrup_feet(dy=0.0))
        for s, sg in (('L', -1), ('R', 1)):
            arm_to(c, s, POMMEL + np.array([sg * 0.12, 0.30 + 0.12 * np.sin(ph - 0.8), 0.0 + 0.05 * np.sin(ph)]), swiv=25, pro=-20, flex=8)
        out.append(c)
    return out

def ride_idle7(n=120):
    base = ride_base(); out = []
    for i in range(n):
        t = i / n; ph = 2 * np.pi * t; c = copy.deepcopy(base)
        look = 32 * np.sin(ph) * (0.5 + 0.5 * np.cos(2 * ph))          # a look to the left, then to the right
        br = np.sin(4 * ph)                                               # breathing (4 per cycle)
        c['hips_off'] = (base['hips_off'][0] + 0.012 * np.sin(ph + 0.5), base['hips_off'][1], base['hips_off'][2] + 0.004 * br)
        c['hips_rot'] = (2.0 * np.sin(ph), base['hips_rot'][1] + 1.0 * br, 2.5 * np.sin(ph + 0.5))
        c['spine_rot'] = (0.25 * look, base['spine_rot'][1] + 1.2 * br, -1.5 * np.sin(ph + 0.5))
        c['head_rot'] = (0.7 * look, -2 + 3 * np.sin(2 * ph + 1.0), 0)
        adj = np.exp(-((t - 0.62) / 0.06) ** 2)                           # gathers the reins a little
        for s, sg in (('L', -1), ('R', 1)):
            arm_to(c, s, POMMEL + np.array([sg * (0.11 - 0.03 * adj), 0.10 + 0.05 * adj + 0.01 * br, 0.10 + 0.04 * adj]), swiv=25, pro=-20, flex=8)
        out.append(c)
    return out
