"""v4 extra attacks (start and end in the combat guard, so they chain with the combo):
  AttackLow  (Down + attack): drop into a deep lunge and cut one flat, straight horizontal slash at shin/knee height
             right -> left, blade level the whole way, left arm thrown back for balance.
  AttackUp   (Up + attack):   gather low, then drive up through the legs onto the toes and thrust the point straight up
             (vertical anti-air stab), body extended, left arm pulled down for counter-balance.
Arms use the v3 joint-space format: R(dir, elb, blade, pro, dev, swiv) / L(dir, elb); dir is shoulder->wrist in the chest frame."""
import copy
from attacks3 import R, L, GUARD_R, GUARD_L, WRIST_LOCK
G_FL = dict(ball=(-0.19, 0.27), yaw=10, heel=0, lift=0, pitch=0)
G_FR = dict(ball=(0.25, -0.13), yaw=-32, heel=0, lift=0, pitch=0)
G_BODY = dict(hips_off=(0.0, 0.05, -0.07), hips_rot=(-16, 4, 0), spine_rot=(8, 5, 0), head_rot=(-3, 3, 0))

LOW_LEN = 37
LOW = [
  (0, {}),
  (6, dict(hips_off=(0.04, 0.06, -0.31), hips_rot=(-38, 14, -3), spine_rot=(-22, 10, 0), head_rot=(-8, 6, 0),
           footL=dict(heel=8), footR=dict(heel=6),
           R=R((0.75, -0.30, -0.58), 40, (0.92, -0.38, 0.0), pro=-80, dev=-8, swiv=30),
           fkL=L((0.10, 0.85, -0.20), 45))),
  (10, dict(hips_off=(0.03, 0.16, -0.40), hips_rot=(-32, 17, -2), spine_rot=(-14, 14, 0), head_rot=(-10, 12, 0),
            footL=dict(ball=(-0.34, 0.50), lift=0.07, pitch=-6, heel=0), footR=dict(heel=14),
            R=R((0.78, 0.25, -0.58), 12, (0.85, 0.52, 0.0), pro=-78, dev=-8, swiv=20),
            fkL=L((-0.20, 0.80, -0.30), 30))),
  (13, dict(hips_off=(0.01, 0.24, -0.42), hips_rot=(4, 22, 0), spine_rot=(8, 16, 0), head_rot=(0, 18, 0),
            footL=dict(ball=(-0.36, 0.62), lift=0.0, pitch=0), footR=dict(heel=26),
            R=R((0.22, 0.88, -0.42), 8, (0.08, 1.0, 0.0), pro=-80, dev=-12, swiv=12),
            fkL=L((-0.85, -0.35, -0.10), 12))),
  (16, dict(hips_off=(-0.01, 0.25, -0.43), hips_rot=(26, 22, 1), spine_rot=(22, 16, 0), head_rot=(10, 18, 0),
            R=R((-0.45, 0.75, -0.45), 10, (-0.80, 0.60, 0.0), pro=-82, dev=-14, swiv=10),
            fkL=L((-0.90, -0.40, -0.05), 10))),
  (19, dict(hips_off=(-0.02, 0.24, -0.42), hips_rot=(34, 21, 2), spine_rot=(28, 15, 0), head_rot=(16, 16, 0),
            R=R((-0.72, 0.40, -0.50), 14, (-0.98, 0.05, -0.05), pro=-80, dev=-16, swiv=10),
            fkL=L((-0.85, -0.45, -0.15), 14))),
  (23, dict(hips_off=(-0.01, 0.18, -0.34), hips_rot=(24, 16, 1), spine_rot=(20, 12, 0), head_rot=(8, 12, 0),
            R=R((-0.55, 0.55, -0.50), 25, (-0.80, 0.35, -0.40), pro=-55, dev=-14, swiv=12),
            fkL=L((-0.65, 0.10, -0.45), 25))),
  (28, dict(hips_off=(0.0, 0.10, -0.18), hips_rot=(0, 8, 0), spine_rot=(8, 7, 0), head_rot=(0, 5, 0),
            footL=dict(ball=(-0.27, 0.40), lift=0.05, pitch=-4), footR=dict(heel=6),
            R=R((-0.05, 0.80, -0.45), 40, (-0.40, 0.80, 0.30), pro=-25, dev=-8, swiv=15),
            fkL=L((-0.40, 0.55, -0.45), 45))),
  (36, dict(ease=True, footL=dict(G_FL), footR=dict(G_FR), R=dict(GUARD_R), fkL=dict(GUARD_L), **G_BODY)),
]
LOW_HITS = [13, 15]

UP_LEN = 36
UP = [
  (0, {}),
  (5, dict(hips_off=(0.0, 0.03, -0.20), hips_rot=(-22, 10, 0), spine_rot=(-6, 8, 0), head_rot=(-4, -6, 0),
           footL=dict(heel=4), footR=dict(heel=6),
           R=R((0.0, 0.87, -0.50), 100, (0.05, 0.50, 0.86), pro=-40, dev=-12, swiv=20),
           fkL=L((-0.15, 0.80, 0.30), 45))),
  (8, dict(hips_off=(0.0, 0.04, -0.27), hips_rot=(-18, 13, 0), spine_rot=(-4, 10, 0), head_rot=(-2, -14, 0),
           R=R((-0.05, 0.85, -0.53), 104, (0.05, 0.45, 0.89), pro=-40, dev=-12, swiv=20),
           fkL=L((-0.15, 0.85, 0.30), 40))),
  (11, dict(hips_off=(0.0, 0.07, 0.03), hips_rot=(-6, -3, 0), spine_rot=(0, -8, 0), head_rot=(0, -28, 0),
            footL=dict(heel=30), footR=dict(heel=34),
            R=R((0.32, 0.91, 0.20), 12, (0.0, 0.14, 0.99), pro=-60, dev=-12, swiv=40),
            fkL=L((-0.55, -0.25, -0.80), 12))),
  (13, dict(hips_off=(0.0, 0.07, 0.05), hips_rot=(-5, -4, 0), spine_rot=(0, -10, 0), head_rot=(0, -30, 0),
            R=R((0.30, 0.91, 0.27), 5, (0.0, 0.10, 1.0), pro=-62, dev=-12, swiv=42),
            fkL=L((-0.58, -0.28, -0.78), 10))),
  (17, dict(hips_off=(0.0, 0.06, -0.02), hips_rot=(-6, -2, 0), spine_rot=(0, -7, 0), head_rot=(0, -24, 0),
            footL=dict(heel=18), footR=dict(heel=22),
            R=R((0.32, 0.91, 0.22), 12, (0.0, 0.16, 0.99), pro=-60, dev=-12, swiv=40),
            fkL=L((-0.50, -0.15, -0.80), 15))),
  (23, dict(hips_off=(0.0, 0.05, -0.12), hips_rot=(-12, 4, 0), spine_rot=(4, 3, 0), head_rot=(-2, -6, 0),
            footL=dict(heel=0), footR=dict(heel=0),
            R=R((0.30, 0.55, 0.30), 70, (-0.10, 0.55, 0.83), pro=-8, dev=-6, swiv=20),
            fkL=L((-0.35, 0.50, -0.45), 45))),
  (35, dict(ease=True, footL=dict(G_FL), footR=dict(G_FR), R=dict(GUARD_R), fkL=dict(GUARD_L), **G_BODY)),
]
UP_HITS = [12]

def keys(seq):
    out = []
    for f, ov in seq:
        ov = copy.deepcopy(ov)
        if 'R' in ov:
            r = ov['R']
            if r.get('dev') is not None: r['dev'] = WRIST_LOCK + 0.35 * (r['dev'] - WRIST_LOCK)
        if 'fkL' in ov: ov['fkL'] = dict(dict(dev=0, flex=10), **ov['fkL'])
        out.append((f, ov))
    return out
