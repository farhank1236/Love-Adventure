"""Attacks v2 — long sword (1.34 m), locked wrist, body-driven angles.  Character space (r, f, u), 30 fps, in place.
Blade directions are the design intent; the grip keys are refined automatically (consistent_keys) to positions a
locked-wrist arm can actually reach."""
from poses import stance

STANCE_L = dict(ball=(-0.19, 0.27), yaw=10, heel=0, lift=0, pitch=0)
STANCE_R = dict(ball=(0.25, -0.13), yaw=-32, heel=0, lift=0, pitch=0)
LH_GUARD = (-0.26, 0.28, 1.20)
GUARD = stance(hips_off=(0.0, 0.05, -0.07), hips_rot=(-16, 4, 0), spine_rot=(8, 5, 0), head_rot=(-3, 3, 0),
               grip=(0.20, 0.38, 1.10), blade=(-0.22, 0.80, 0.56), edge=(0.0, 0.45, -1.0), relbow=(0.7, -0.4, -0.6),
               lhand=LH_GUARD, lelbow=(-0.9, -0.1, -0.5), lhand_bend=15,
               footL=STANCE_L, footR=STANCE_R)

def E(**kw):
    kw['ease'] = True; return kw

# 1 — forehand diagonal cut, right-high -> left-low, left-foot lunge
A1_LEN = 28
A1 = [
    (0, {}),
    (4, dict(grip=(0.36, 0.22, 1.45), blade=(0.35, 0.10, 0.93), hips_rot=(-24, 1, 1), spine_rot=(-10, 0, 2),
             hips_off=(0.02, 0.0, -0.08), head_rot=(-8, 3, 0), lhand=(-0.22, 0.36, 1.28))),
    (8, dict(hips_off=(0.04, -0.04, -0.09), hips_rot=(-34, -2, 3), spine_rot=(-24, -5, 4), head_rot=(-14, 2, 0),
             grip=(0.36, 0.02, 1.72), blade=(0.30, -0.55, 0.78), relbow=(1.0, -0.3, 0.0),
             lhand=(-0.18, 0.44, 1.36), footL=dict(heel=14))),
    (10, dict(hips_off=(0.02, 0.06, -0.12), hips_rot=(-22, 4, 1), spine_rot=(-14, 4, 2), head_rot=(-8, 4, 0),
              grip=(0.42, 0.25, 1.80), blade=(0.15, 0.15, 0.98),
              footL=dict(ball=(-0.20, 0.40), lift=0.07, heel=0, pitch=-8))),
    (12, dict(hips_off=(-0.01, 0.17, -0.17), hips_rot=(-2, 10, -2), spine_rot=(6, 10, -4), head_rot=(-2, 6, 0),
              grip=(0.22, 0.58, 1.55), blade=(-0.40, 0.80, 0.45), relbow=(0.8, -0.2, -0.6),
              footL=dict(ball=(-0.21, 0.52), lift=0.0, pitch=0))),
    (13, dict(grip=(0.02, 0.65, 1.25), blade=(-0.70, 0.55, -0.10), hips_rot=(8, 13, -3), spine_rot=(12, 13, -6),
              hips_off=(-0.03, 0.20, -0.20))),
    (15, dict(hips_off=(-0.05, 0.22, -0.22), hips_rot=(16, 15, -4), spine_rot=(16, 15, -7), head_rot=(2, 10, 0),
              grip=(-0.22, 0.55, 1.02), blade=(-0.75, 0.30, -0.48), relbow=(0.5, -0.3, -0.8), footR=dict(heel=18))),
    (18, dict(hips_off=(-0.05, 0.22, -0.22), hips_rot=(20, 14, -4), spine_rot=(18, 14, -8), head_rot=(3, 9, 0),
              grip=(-0.30, 0.46, 0.99), blade=(-0.78, 0.18, -0.52), footR=dict(heel=20))),
    (22, dict(hips_off=(-0.03, 0.12, -0.13), hips_rot=(10, 8, -2), spine_rot=(16, 8, -4), head_rot=(0, 6, 0),
              grip=(-0.25, 0.45, 1.04), blade=(-0.75, 0.30, -0.46), lhand=(-0.30, 0.20, 1.16),
              footL=dict(ball=(-0.20, 0.36), lift=0.03), footR=dict(heel=6))),
    (28, E(hips_off=(-0.01, 0.05, -0.08), hips_rot=(4, 5, 0), spine_rot=(16, 6, -2), head_rot=(-2, 4, 0),
           grip=(-0.22, 0.45, 1.08), blade=(-0.72, 0.45, -0.40), lhand=(-0.30, 0.22, 1.18),
           footL=dict(ball=STANCE_L['ball'], lift=0.0), footR=dict(heel=0))),
]

# 2 — backhand horizontal sweep, left -> right, right-foot step
A2_LEN = 26
A2 = [
    (0, {}),
    (5, dict(hips_off=(-0.02, 0.03, -0.09), hips_rot=(22, 2, 0), spine_rot=(28, 0, 2), head_rot=(6, 3, 0),
             grip=(-0.30, 0.25, 1.30), blade=(-0.65, -0.25, 0.70), relbow=(0.3, 0.6, -0.7),
             lhand=(-0.36, 0.10, 1.20), footR=dict(heel=12))),
    (9, dict(hips_off=(-0.03, 0.02, -0.10), hips_rot=(26, 0, 0), spine_rot=(32, -2, 3), head_rot=(8, 3, 0),
             grip=(-0.30, 0.15, 1.38), blade=(-0.55, -0.65, 0.50), lhand=(-0.38, 0.05, 1.22), footR=dict(heel=16))),
    (11, dict(hips_off=(0.0, 0.08, -0.12), hips_rot=(10, 6, 0), spine_rot=(12, 4, 0), head_rot=(2, 4, 0),
              grip=(-0.22, 0.48, 1.38), blade=(-0.65, 0.75, 0.05),
              footR=dict(ball=(0.20, 0.06), lift=0.07, yaw=-12, heel=0, pitch=-8))),
    (13, dict(hips_off=(0.04, 0.15, -0.15), hips_rot=(-12, 10, 0), spine_rot=(-12, 8, 2), head_rot=(-4, 6, 0),
              grip=(0.10, 0.62, 1.36), blade=(0.20, 0.98, 0.0),
              footR=dict(ball=(0.20, 0.28), lift=0.0, yaw=-12, pitch=0))),
    (15, dict(hips_off=(0.06, 0.17, -0.17), hips_rot=(-28, 12, 0), spine_rot=(-25, 10, 4), head_rot=(-8, 6, 0),
              grip=(0.42, 0.42, 1.32), blade=(0.92, 0.35, -0.05), footL=dict(heel=15))),
    (18, dict(hips_off=(0.06, 0.17, -0.17), hips_rot=(-32, 12, 0), spine_rot=(-30, 9, 5), head_rot=(-10, 6, 0),
              grip=(0.50, 0.18, 1.30), blade=(0.70, -0.65, -0.05), footL=dict(heel=16))),
    (22, dict(hips_off=(0.04, 0.10, -0.12), hips_rot=(-27, 7, 0), spine_rot=(-20, 6, 3), head_rot=(-6, 4, 0),
              grip=(0.46, 0.22, 1.34), blade=(0.70, -0.30, 0.55), lhand=(-0.30, 0.22, 1.18),
              footR=dict(ball=(0.23, 0.02), lift=0.04), footL=dict(heel=4))),
    (26, E(hips_off=(0.02, 0.05, -0.08), hips_rot=(-26, 4, 0), spine_rot=(-12, 5, 2), head_rot=(-4, 3, 0),
           grip=(0.40, 0.20, 1.40), blade=(0.45, -0.35, 0.82), lhand=(-0.28, 0.26, 1.20),
           footR=dict(STANCE_R), footL=dict(heel=0))),
]

# 3 — overhead power chop, hop-lunge
A3_LEN = 30
A3 = [
    (0, {}),
    (6, dict(hips_off=(0.02, 0.0, -0.04), hips_rot=(-12, -4, 0), spine_rot=(-5, -10, 0), head_rot=(-4, -2, 0),
             grip=(0.26, 0.08, 1.80), blade=(0.25, -0.40, 0.88), lhand=(-0.22, 0.40, 1.42), footL=dict(heel=10))),
    (10, dict(hips_off=(0.0, -0.02, -0.03), hips_rot=(-6, -6, 0), spine_rot=(0, -12, 0), head_rot=(0, -4, 0),
              grip=(0.12, -0.02, 1.98), blade=(0.15, -0.85, -0.20), lhand=(-0.20, 0.42, 1.46), footL=dict(heel=15))),
    (12, dict(hips_off=(0.0, 0.08, -0.08), hips_rot=(-3, 2, 0), spine_rot=(0, 0, 0), head_rot=(0, 2, 0),
              grip=(0.08, 0.25, 2.02), blade=(0.0, 0.15, 1.0),
              footL=dict(ball=(-0.19, 0.42), lift=0.08, heel=0, pitch=-8))),
    (14, dict(hips_off=(0.0, 0.20, -0.18), hips_rot=(0, 12, 0), spine_rot=(2, 15, 0), head_rot=(0, 8, 0),
              grip=(0.03, 0.58, 1.70), blade=(0.0, 0.92, 0.38), footL=dict(ball=(-0.19, 0.55), lift=0.0, pitch=0))),
    (16, dict(hips_off=(-0.01, 0.25, -0.26), hips_rot=(4, 18, 0), spine_rot=(4, 22, 0), head_rot=(2, 12, 0),
              grip=(-0.02, 0.66, 1.18), blade=(-0.10, 0.85, -0.50), footR=dict(heel=22))),
    (19, dict(hips_off=(-0.01, 0.25, -0.27), hips_rot=(5, 19, 0), spine_rot=(5, 23, 0), head_rot=(2, 12, 0),
              grip=(-0.06, 0.60, 1.05), blade=(-0.18, 0.72, -0.66), footR=dict(heel=22))),
    (24, dict(hips_off=(-0.01, 0.15, -0.16), hips_rot=(5, 11, 0), spine_rot=(8, 12, 0), head_rot=(0, 7, 0),
              grip=(-0.10, 0.52, 1.06), blade=(-0.40, 0.65, -0.62), lhand=(-0.30, 0.20, 1.15),
              footL=dict(ball=(-0.19, 0.40), lift=0.03), footR=dict(heel=6))),
    (30, E(hips_off=(0.0, 0.05, -0.08), hips_rot=(6, 5, 0), spine_rot=(12, 5, 0), head_rot=(-2, 3, 0),
           grip=(-0.20, 0.45, 1.08), blade=(-0.65, 0.50, -0.45), lhand=(-0.28, 0.24, 1.18),
           footL=dict(ball=STANCE_L['ball'], lift=0.0), footR=dict(heel=0))),
]

# 4 — backhand descending diagonal, left-high -> right-low, right-foot step
A4_LEN = 28
A4 = [
    (0, {}),
    (6, dict(hips_off=(-0.02, 0.02, -0.09), hips_rot=(22, -2, 0), spine_rot=(26, -4, -3), head_rot=(8, 2, 0),
             grip=(-0.20, 0.18, 1.55), blade=(-0.50, -0.25, 0.83), lhand=(-0.34, 0.16, 1.26), footR=dict(heel=12))),
    (9, dict(hips_off=(-0.03, 0.0, -0.10), hips_rot=(26, -3, 0), spine_rot=(30, -5, -4), head_rot=(10, 2, 0),
             grip=(-0.22, 0.12, 1.62), blade=(-0.50, -0.45, 0.74), footR=dict(heel=16))),
    (11, dict(hips_off=(0.0, 0.07, -0.12), hips_rot=(12, 3, 0), spine_rot=(14, 2, -2), head_rot=(4, 4, 0),
              grip=(-0.18, 0.38, 1.75), blade=(-0.25, 0.30, 0.92),
              footR=dict(ball=(0.26, 0.08), lift=0.07, yaw=-20, heel=0, pitch=-8))),
    (13, dict(hips_off=(0.04, 0.15, -0.16), hips_rot=(-6, 10, 2), spine_rot=(-8, 10, 3), head_rot=(-2, 7, 0),
              grip=(0.08, 0.64, 1.45), blade=(0.45, 0.80, 0.40),
              footR=dict(ball=(0.30, 0.30), lift=0.0, yaw=-18, pitch=0))),
    (15, dict(hips_off=(0.06, 0.22, -0.22), hips_rot=(-24, 14, 3), spine_rot=(-22, 14, 6), head_rot=(-6, 10, 0),
              grip=(0.30, 0.56, 1.10), blade=(0.72, 0.45, -0.45), footL=dict(heel=18))),
    (18, dict(hips_off=(0.06, 0.22, -0.23), hips_rot=(-28, 15, 3), spine_rot=(-24, 15, 6), head_rot=(-7, 10, 0),
              grip=(0.40, 0.42, 1.00), blade=(0.70, 0.10, -0.60), footL=dict(heel=18))),
    (22, dict(hips_off=(0.04, 0.12, -0.14), hips_rot=(-25, 9, 1), spine_rot=(-16, 9, 3), head_rot=(-5, 6, 0),
              grip=(0.38, 0.38, 1.04), blade=(0.68, 0.30, -0.55), lhand=(-0.30, 0.20, 1.16),
              footR=dict(ball=(0.25, 0.06), lift=0.03, yaw=-25), footL=dict(heel=5))),
    (28, E(hips_off=(0.02, 0.05, -0.08), hips_rot=(-22, 5, 0), spine_rot=(-10, 5, 0), head_rot=(-4, 3, 0),
           grip=(0.34, 0.36, 1.08), blade=(0.65, 0.40, -0.50), lhand=(-0.28, 0.24, 1.18),
           footR=dict(STANCE_R), footL=dict(heel=0))),
]

# 5 — X finisher: forehand diagonal + wrist-locked arm whip + backhand diagonal crossing it
A5_LEN = 47
A5 = [
    (0, {}),
    (6, dict(hips_off=(0.04, -0.04, -0.12), hips_rot=(-34, -2, 3), spine_rot=(-24, -5, 4), head_rot=(-12, 2, 0),
             grip=(0.40, 0.08, 1.74), blade=(0.30, -0.45, 0.84), lhand=(-0.18, 0.44, 1.36), footL=dict(heel=14))),
    (8, dict(hips_off=(0.04, -0.05, -0.13), hips_rot=(-36, -3, 3), spine_rot=(-26, -6, 4), head_rot=(-13, 2, 0),
             grip=(0.41, 0.04, 1.78), blade=(0.30, -0.55, 0.78), footL=dict(heel=16))),
    (10, dict(hips_off=(0.02, 0.06, -0.13), hips_rot=(-22, 4, 1), spine_rot=(-14, 4, 2), head_rot=(-8, 4, 0),
              grip=(0.46, 0.30, 1.84), blade=(0.20, 0.20, 0.96),
              footL=dict(ball=(-0.20, 0.40), lift=0.08, heel=0, pitch=-8))),
    (12, dict(hips_off=(-0.01, 0.17, -0.18), hips_rot=(-2, 10, -2), spine_rot=(6, 10, -4), head_rot=(-2, 6, 0),
              grip=(0.22, 0.60, 1.55), blade=(-0.42, 0.80, 0.43), footL=dict(ball=(-0.20, 0.50), lift=0.0, pitch=0))),
    (13, dict(grip=(0.02, 0.65, 1.28), blade=(-0.70, 0.55, -0.10), hips_rot=(6, 12, -3), spine_rot=(10, 12, -5))),
    (15, dict(hips_off=(-0.03, 0.20, -0.20), hips_rot=(12, 13, -3), spine_rot=(14, 13, -6), head_rot=(2, 9, 0),
              grip=(-0.20, 0.56, 1.10), blade=(-0.75, 0.30, -0.45))),
    (18, dict(hips_off=(-0.03, 0.19, -0.19), hips_rot=(20, 9, -2), spine_rot=(24, 6, -4), head_rot=(6, 7, 0),
              grip=(-0.30, 0.38, 1.36), blade=(-0.70, 0.05, 0.71))),
    (20, dict(hips_off=(-0.02, 0.17, -0.18), hips_rot=(24, 5, 0), spine_rot=(28, 2, -3), head_rot=(8, 5, 0),
              grip=(-0.22, 0.18, 1.62), blade=(-0.50, -0.40, 0.77), lhand=(-0.24, 0.36, 1.30), footR=dict(heel=16))),
    (22, dict(hips_off=(0.0, 0.20, -0.20), hips_rot=(12, 8, 0), spine_rot=(14, 6, -2), head_rot=(4, 6, 0),
              grip=(-0.16, 0.40, 1.78), blade=(-0.25, 0.30, 0.92))),
    (24, dict(hips_off=(0.03, 0.25, -0.24), hips_rot=(-6, 12, 2), spine_rot=(-8, 12, 3), head_rot=(-2, 9, 0),
              grip=(0.08, 0.64, 1.48), blade=(0.45, 0.80, 0.40), footR=dict(heel=20))),
    (26, dict(hips_off=(0.05, 0.27, -0.28), hips_rot=(-22, 15, 3), spine_rot=(-22, 16, 6), head_rot=(-6, 11, 0),
              grip=(0.30, 0.56, 1.10), blade=(0.72, 0.45, -0.45), footR=dict(heel=24))),
    (29, dict(hips_off=(0.05, 0.27, -0.29), hips_rot=(-26, 16, 3), spine_rot=(-24, 16, 6), head_rot=(-7, 11, 0),
              grip=(0.40, 0.44, 1.00), blade=(0.70, 0.16, -0.60))),
    (34, dict(hips_off=(0.05, 0.26, -0.28), hips_rot=(-26, 15, 3), spine_rot=(-23, 15, 6), head_rot=(-6, 10, 0),
              grip=(0.41, 0.42, 1.02), blade=(0.70, 0.18, -0.59))),
    (38, dict(hips_off=(0.03, 0.14, -0.15), hips_rot=(-20, 9, 1), spine_rot=(-6, 8, 3), head_rot=(-4, 6, 0),
              grip=(0.34, 0.42, 1.08), blade=(0.30, 0.70, -0.15), lhand=(-0.30, 0.22, 1.18),
              footL=dict(ball=(-0.20, 0.38), lift=0.03), footR=dict(heel=6))),
    (44, E(**{k: v for k, v in GUARD.items()})),
    (47, E(**{k: v for k, v in GUARD.items()})),
]

IDLE_LEN = 60
IDLE = [
    (0, {}),
    (30, dict(hips_off=(0.0, 0.05, -0.085), hips_rot=(-16, 5, 0), spine_rot=(8, 6.5, 0), head_rot=(-3, 4, 0),
              grip=(0.20, 0.38, 1.088), blade=(-0.21, 0.81, 0.54), lhand=(-0.26, 0.28, 1.19))),
    (60, E(**{k: v for k, v in GUARD.items()})),
]

ATTACKS = [('Attack1', A1, A1_LEN), ('Attack2', A2, A2_LEN), ('Attack3', A3, A3_LEN), ('Attack4', A4, A4_LEN), ('Attack5', A5, A5_LEN)]
HIT_FRAMES = {'Attack1': [13], 'Attack2': [13], 'Attack3': [16], 'Attack4': [13], 'Attack5': [13, 24]}

def chain_starts():
    from timeline import merge
    starts = []; cur = GUARD
    for name, keys, n in ATTACKS:
        starts.append(cur)
        for f, ov in keys: cur = merge(cur, ov)
    return starts
