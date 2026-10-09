"""v3 locomotion: unarmed idle/walk/run/jump (sword stored in the pocket dimension), combat walk (guard held),
battle run (sword out), and the summon / dismiss clips.  Arms are joint-space (fkR / fkL)."""
import copy, numpy as np
from locomotion import WALK, RUN, foot_cycle, walk_ctrl, run_ctrl, _relaxed, jump_keys, JUMP_LEN, JUMP_TAKEOFF, JUMP_LAND, JUMP_H, root_height

def arm(d, e, pro=0.0, dev=0.0, flex=8.0, swiv=10.0, roll=0.0):
    return dict(dir=tuple(d), elb=float(e), pro=float(pro), dev=float(dev), flex=float(flex), swiv=float(swiv), roll=float(roll))

UNARMED = dict(sword_vis=0.0, portal=0.0, fistR=0.30, fistL=0.30, aura=0.0)

# ---------------------------------------------------------------- unarmed idle (relaxed, breathing)
IDLE_U_LEN = 72
def idle_unarmed_ctrl(i):
    ph = (i % IDLE_U_LEN) / IDLE_U_LEN; b = np.sin(2 * np.pi * ph); b2 = np.sin(4 * np.pi * ph)
    c = _relaxed(hips_off=(0.004 * b, 0.02, -0.055 + 0.004 * b2), hips_rot=(-3, 2, 0.8 * b),
                 spine_rot=(2 + 0.8 * b, -1.0 - 1.2 * np.cos(2 * np.pi * ph), -0.6 * b), head_rot=(1.5 * b, 1, 0))
    c.update(UNARMED)
    c['fkR'] = arm((0.12, 0.08 + 0.01 * b, -1.0), 14 + 2 * b, pro=-5, flex=10)
    c['fkL'] = arm((-0.12, 0.08 - 0.01 * b, -1.0), 14 - 2 * b, pro=-5, flex=10)
    return c

# ---------------------------------------------------------------- unarmed walk (natural arm swing)
def walk_unarmed_ctrl(i, P=WALK):
    c = walk_ctrl(i, P)
    n = P['frames']; ph = (i % n) / n
    sw = np.cos(2 * np.pi * (ph - 0.04))         # right foot forward at ph=0 -> right arm back
    c.update(UNARMED)
    c['spine_rot'] = (-9 * np.cos(2 * np.pi * ph), -2, c['spine_rot'][2])
    c['fkR'] = arm((0.13, -0.30 * sw, -1.0), 16 + 10 * max(0, -sw), pro=-5, flex=10)
    c['fkL'] = arm((-0.13, 0.30 * sw, -1.0), 16 + 10 * max(0, sw), pro=-5, flex=10)
    return c

# ---------------------------------------------------------------- unarmed run (arms pumping at ~90 deg)
def run_unarmed_ctrl(i, P=RUN):
    c = run_ctrl(i, P)
    n = P['frames']; ph = (i % n) / n
    sw = np.cos(2 * np.pi * (ph - 0.05))
    c.update(UNARMED); c['fistR'] = 0.6; c['fistL'] = 0.6
    c['fkR'] = arm((0.16, -0.55 * sw - 0.05, -0.85), 92 - 18 * sw, pro=0, flex=0, swiv=5)
    c['fkL'] = arm((-0.16, 0.55 * sw - 0.05, -0.85), 92 + 18 * sw, pro=0, flex=0, swiv=5)
    return c

# ---------------------------------------------------------------- combat walk: guard held, knees bent, shorter steps
CWALK = dict(WALK, frames=34, stance=0.62, f_contact=0.30, f_toeoff=-0.20, width=0.15,
             lift_h=[0.0, 0.08, 0.06, 0.02, 0.0])
CWALK['speed'] = (CWALK['f_contact'] - CWALK['f_toeoff']) / (CWALK['stance'] * CWALK['frames'] / 30.0)
def combat_walk_ctrl(i, guard, P=CWALK):
    c = walk_ctrl(i, P)
    n = P['frames']; ph = (i % n) / n; c2 = np.cos(2 * np.pi * ph)
    g = copy.deepcopy(guard)
    c['hips_off'] = (c['hips_off'][0] * 0.8, 0.05, c['hips_off'][2] - 0.035)
    c['hips_rot'] = (-14 + 3 * c2, 6, c['hips_rot'][2] * 0.7)
    c['spine_rot'] = (6 - 3 * c2, 4, c['spine_rot'][2] * 0.5)
    c['head_rot'] = (-3 - 1.5 * c2, 3, 0)
    c['footR'] = dict(c['footR'], yaw=-14); c['footL'] = dict(c['footL'], yaw=8)
    bob = 0.03 * np.cos(4 * np.pi * ph)
    c['fkR'] = dict(g['fkR']); c['fkR']['elb'] = g['fkR']['elb'] + 4 * np.cos(4 * np.pi * ph)
    c['fkL'] = dict(g['fkL']); c['fkL']['dir'] = tuple(np.array(g['fkL']['dir']) + np.array([0, 0.05 * c2, bob]))
    c.update(sword_vis=1.0, portal=0.0, fistR=1.0, fistL=0.55)
    return c

# ---------------------------------------------------------------- battle run: sword held upright at the side, arm pumping lightly
def battle_run_ctrl(i, P=RUN):
    c = run_ctrl(i, P)
    n = P['frames']; ph = (i % n) / n
    sw = np.cos(2 * np.pi * (ph - 0.05))
    c.update(sword_vis=1.0, portal=0.0, fistR=1.0, fistL=0.6)
    c['fkR'] = arm((0.30, -0.25 * sw + 0.10, -0.85), 80 - 10 * sw, pro=-10, dev=-12, flex=0, swiv=20)
    c['fkL'] = arm((-0.16, 0.55 * sw - 0.05, -0.85), 92 + 18 * sw, pro=0, flex=0, swiv=5)
    return c

# ---------------------------------------------------------------- jump (unarmed): arms swing back, drive up, spread, land
def jump_unarmed_keys():
    J = jump_keys()
    A = {0: (arm((0.12, 0.08, -1), 14, flex=10), arm((-0.12, 0.08, -1), 14, flex=10)),
         8: (arm((0.15, -0.65, -0.75), 20, flex=10), arm((-0.15, -0.65, -0.75), 20, flex=10)),
         11: (arm((0.15, -0.45, -0.88), 25), arm((-0.15, -0.45, -0.88), 25)),
         13: (arm((0.18, 0.60, -0.55), 32), arm((-0.18, 0.60, -0.55), 32)),
         16: (arm((0.28, 0.80, 0.30), 28), arm((-0.28, 0.80, 0.30), 28)),
         19: (arm((0.38, 0.55, 0.70), 25), arm((-0.38, 0.55, 0.70), 25)),
         23: (arm((0.70, 0.35, 0.20), 20), arm((-0.70, 0.35, 0.20), 20)),
         31: (arm((0.45, 0.45, -0.45), 25), arm((-0.45, 0.45, -0.45), 25)),
         37: (arm((0.25, 0.70, -0.55), 35), arm((-0.25, 0.70, -0.55), 35)),
         46: (arm((0.12, 0.08, -1), 14, flex=10), arm((-0.12, 0.08, -1), 14, flex=10))}
    out = []
    for f, ov in J:
        ov = {k: v for k, v in ov.items() if k not in ('grip', 'blade', 'lhand', 'edge', 'relbow', 'lelbow')}
        if f == 0: ov.update(UNARMED)
        if f in A: ov['fkR'], ov['fkL'] = A[f]
        out.append((f, ov))
    return out

def jump_start_state():
    c = _relaxed(); c.update(UNARMED)
    c['fkR'] = arm((0.12, 0.08, -1), 14, flex=10); c['fkL'] = arm((-0.12, 0.08, -1), 14, flex=10)
    return c

# ---------------------------------------------------------------- summon / dismiss
SUMMON_LEN = 40
def summon_keys(guard):
    g = copy.deepcopy(guard)
    reach = arm((0.75, 0.55, 0.05), 12, pro=40, dev=0, flex=-15, swiv=15)       # open palm out to the right-front
    grab = arm((0.75, 0.55, 0.05), 14, pro=20, dev=-10, flex=0, swiv=15)
    return [
        (0, {}),
        (5, dict(hips_rot=(-10, 3, 1), spine_rot=(-8, 1, 2), head_rot=(-22, 2, 0), fkR=arm((0.55, 0.35, -0.45), 30, pro=20, flex=-5),
                 fkL=arm((-0.18, 0.15, -0.95), 18, flex=10))),
        (10, dict(hips_rot=(-14, 3, 2), spine_rot=(-14, 2, 3), head_rot=(-30, 3, 0), fkR=reach, fistR=0.05, portal=0.0)),
        (15, dict(portal=1.0, sword_vis=0.0)),
        (24, dict(sword_vis=1.0, fkR=grab, fistR=0.25)),
        (27, dict(fistR=1.0, portal=0.9)),
        (32, dict(portal=0.0, hips_rot=(-15, 4, 1), spine_rot=(0, 3, 1), head_rot=(-8, 3, 0),
                  fkR=arm((0.45, 0.65, -0.20), 35, pro=-5, dev=-5, swiv=20), fkL=g['fkL'], fistL=0.55,
                  hips_off=g['hips_off'], footR=g['footR'], footL=g['footL'])),
        (40, dict(ease=True, **{k: g[k] for k in ('hips_off', 'hips_rot', 'spine_rot', 'head_rot', 'fkR', 'fkL', 'footR', 'footL')},
                  fistR=1.0, fistL=0.55, portal=0.0, sword_vis=1.0)),
    ]

DISMISS_LEN = 40
def dismiss_keys(guard, idle0):
    flick = arm((0.80, 0.35, -0.30), 10, pro=-20, dev=-25, swiv=10)
    hold = arm((0.78, 0.40, -0.25), 12, pro=-15, dev=-20, swiv=10)
    i0 = idle0
    return [
        (0, {}),
        (6, dict(hips_rot=(-12, 3, 1), spine_rot=(-10, 2, 2), head_rot=(-18, 2, 0), fkR=flick)),
        (10, dict(fkR=hold, portal=1.0)),
        (21, dict(sword_vis=0.0)),
        (24, dict(fistR=0.15, portal=0.9)),
        (29, dict(portal=0.0)),
        (40, dict(ease=True, **{k: i0[k] for k in ('hips_off', 'hips_rot', 'spine_rot', 'head_rot', 'fkR', 'fkL', 'footR', 'footL')},
                  fistR=0.30, fistL=0.30, sword_vis=0.0, portal=0.0)),
    ]
