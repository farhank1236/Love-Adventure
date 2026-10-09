import sys, json, numpy as np
sys.path.insert(0, '/home/claude/tools')
from solver import *
from timeline import Timeline, sample
from skin import Skinner, CAMS
from render import render
from fist import curl, region
from secondary import optimise_roll, optimise_arm, simulate_secondary, simulate_secondary2, wrist_angles
from armsolve import solve_sword_arm, left_arm_dynamics, consistent_keys
from PIL import Image, ImageDraw

HR = HeroRig()
_SK = None
def skinner():
    global _SK
    if _SK is None:
        sk = Skinner(HR)
        Wn = np.load('/home/claude/work/W_final.npy')
        top = np.argsort(-Wn, axis=1)[:, :4]; w = np.take_along_axis(Wn, top, 1); w /= w.sum(1, keepdims=True)
        sk.top, sk.w = top, w
        sk.P = np.load('/home/claude/work/P_fist.npy')
        _SK = sk
    return _SK

def build(start, keys, length, secondary=True):
    cs = sample(Timeline(start, keys, length), auto_edge=False)
    cs = solve_sword_arm(HR, cs)
    cs = left_arm_dynamics(HR, cs)
    if secondary: cs = simulate_secondary2(HR, cs)
    return cs

def diagnose(cs, name=''):
    rows = []
    for i, c in enumerate(cs):
        warn = HR.solve(c)
        Rf = HR.world_rot('Forearm.R'); Rh = HR.world_rot('Hand.R')
        flex, dev, twist = wrist_angles(HR, Rf, Rh)
        el = np.degrees(np.arccos(np.clip(np.dot(HR.world_rot('UpperArm.R')[:, 1], Rf[:, 1]), -1, 1)))
        # sword vs body: min distance of blade segment to torso axis
        g = HR.world_head('Hand.R') + Rh @ GRIP_IN_HAND; b = (Rh @ R_SWORD_IN_HAND)[:, 1]
        pts = g + np.outer(np.linspace(0.12, SWORD_LEN - GRIP_FROM_POMMEL, 12), b)
        torso_a = HR.world_head('Hips'); torso_b = HR.world_tail('UpperChest')
        def sd(p, a, bb):
            ab = bb - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
        dmin = sd(pts, torso_a, torso_b).min()
        dhead = sd(pts, HR.world_head('Head'), HR.world_tail('Head')).min()
        dlegs = min(sd(pts, HR.world_head(f'Thigh.{s}'), HR.world_tail(f'Shin.{s}')).min() for s in 'LR')
        tip = C(g + b * (SWORD_LEN - GRIP_FROM_POMMEL))
        rows.append(dict(f=i, warn=[(a, round(d, 3)) for a, d in warn], flex=round(flex), dev=round(dev), twist=round(twist), elbow=round(el),
                         torso=round(dmin, 2), head=round(dhead, 2), legs=round(dlegs, 2), tip=np.round(tip, 2).tolist()))
    return rows

def print_diag(rows):
    for r in rows:
        flag = ''
        if r['warn']: flag += ' REACH' + str(r['warn'])
        if abs(r['flex']) > 70: flag += ' FLEX'
        if abs(r['dev']) > 30: flag += ' DEV'
        if abs(r['twist'] - 55) > 90: flag += ' TWIST'
        if r['torso'] < 0.22: flag += ' SWORD-TORSO'
        if r['head'] < 0.15: flag += ' SWORD-HEAD'
        if r['legs'] < 0.12: flag += ' SWORD-LEG'
        print(f"f{r['f']:2d} flex{r['flex']:4d} dev{r['dev']:4d} tw{r['twist']:5d} elb{r['elbow']:4d} torso{r['torso']:.2f} head{r['head']:.2f} legs{r['legs']:.2f} tip{r['tip']}{flag}")

def mesh_strip(cs, frames, path, cams=None, W=300, H=400, trail=True):
    sk = skinner()
    cams = cams or [CAMS[0], CAMS[1]]
    cols = []
    for f in frames:
        HR.solve(cs[f])
        body = sk.skin(); sw = sk.sword()
        col = []
        for eye, tgt, fov in cams:
            im = render([(body, sk.T, (0.78, 0.74, 0.70)), (sw, sk.ST, (0.85, 0.62, 0.22))], eye, tgt, W=W, H=H, fov=fov,
                        light=(0.3, -0.7, 0.8))
            pil = Image.fromarray((im * 255).astype(np.uint8)); d = ImageDraw.Draw(pil); d.text((6, 4), f'f{f}', fill=(0, 0, 0))
            col.append(np.array(pil))
        cols.append(np.concatenate(col, 0))
    Image.fromarray(np.concatenate(cols, 1)).save(path)

def sheet(cs, path, cam=((-3.0, -4.6, 1.5), (0, -0.45, 1.05), 26), W=240, H=320, per_row=9, step=1, frames=None):
    sk = skinner(); ims = []
    frames = frames or list(range(0, len(cs), step))
    for f in frames:
        HR.solve(cs[f])
        im = render([(sk.skin(), sk.T, (0.78, 0.74, 0.70)), (sk.sword(), sk.ST, (0.85, 0.62, 0.22))], cam[0], cam[1], W=W, H=H, fov=cam[2], light=(0.3, -0.7, 0.8))
        pil = Image.fromarray((im * 255).astype(np.uint8)); ImageDraw.Draw(pil).text((5, 3), f'f{f}', fill=(200, 0, 0)); ims.append(np.array(pil))
    while len(ims) % per_row: ims.append(np.full_like(ims[0], 255))
    rows = [np.concatenate(ims[i:i + per_row], 1) for i in range(0, len(ims), per_row)]
    Image.fromarray(np.concatenate(rows, 0)).save(path)

from bake import bake, pose_baked
def sheet_baked(bones, arr, path, cam=((-3.0, -4.6, 1.5), (0, -0.45, 1.05), 26), W=200, H=270, per_row=12, frames=None):
    sk = skinner(); ims = []
    frames = frames if frames is not None else list(range(0, len(arr), 2))
    for f in frames:
        pose_baked(HR, bones, arr, f)
        im = render([(sk.skin(), sk.T, (0.78, 0.74, 0.70)), (sk.sword(), sk.ST, (0.85, 0.62, 0.22))], cam[0], cam[1], W=W, H=H, fov=cam[2], light=(0.3, -0.7, 0.8))
        pil = Image.fromarray((im * 255).astype(np.uint8)); ImageDraw.Draw(pil).text((5, 3), f'f{f}', fill=(200, 0, 0)); ims.append(np.array(pil))
    while len(ims) % per_row: ims.append(np.full_like(ims[0], 255))
    rows = [np.concatenate(ims[i:i + per_row], 1) for i in range(0, len(ims), per_row)]
    Image.fromarray(np.concatenate(rows, 0)).save(path)

def angvel_baked(bones, arr, names=('UpperArm.R', 'Forearm.R', 'Hand.R', 'UpperArm.L', 'Forearm.L', 'UpperChest', 'Thigh.L', 'Shin.R')):
    Rs = {b: [] for b in names}
    for i in range(len(arr)):
        pose_baked(HR, bones, arr, i)
        for b in names: Rs[b].append(HR.world_rot(b).copy())
    return {b: [round(float(np.degrees(np.arccos(np.clip((np.trace(R[i].T @ R[i + 1]) - 1) / 2, -1, 1))))) for i in range(len(R) - 1)] for b, R in Rs.items()}
