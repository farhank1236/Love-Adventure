"""Procedural (physically-grounded) walk / run cycles and a jump, holding the sword.
In place: the planted foot slides back at exactly the travel speed, so the game moves the character at
WALK_SPEED / RUN_SPEED m/s and the feet don't skate."""
import numpy as np
from poses import stance

FOOT_LEN = 0.17      # ball -> heel

def minjerk(v):
    v = np.clip(v, 0, 1); return v ** 3 * (10 - 15 * v + 6 * v * v)

def smooth(v):
    v = np.clip(v, 0, 1); return v * v * (3 - 2 * v)

def foot_cycle(ph, P):
    """phase ph in [0,1): 0 = heel strike. returns dict(ball=(r,f), lift, heel, pitch)."""
    s = P['stance']; Fc, Ft = P['f_contact'], P['f_toeoff']
    if ph < s:
        u = ph / s
        f = Fc + (Ft - Fc) * u                       # planted: moves back at travel speed (treadmill)
        a = np.interp(u, P['st_u'], P['st_a'])       # foot pitch: + heel up (pivot ball), - toe up (pivot heel)
        lift = FOOT_LEN * np.sin(np.radians(max(0.0, -a)))
        return dict(ball=f, lift=lift, heel=a, pitch=0.0)
    v = (ph - s) / (1 - s)
    f = Ft + (Fc - Ft) * minjerk(np.interp(v, [0, 1], [0, 1]) ** P.get('sw_warp', 1.0))
    a = np.interp(v, P['sw_v'], P['sw_a'])
    h = np.interp(v, P['lift_v'], P['lift_h'])
    lift = h + FOOT_LEN * np.sin(np.radians(max(0.0, -a)))
    return dict(ball=f, lift=lift, heel=0.0, pitch=a)

WALK = dict(frames=32, speed=None, stance=0.60, f_contact=0.36, f_toeoff=-0.27,
            st_u=[0, 0.14, 0.5, 0.75, 1.0], st_a=[-14, 0, 0, 10, 38],
            sw_v=[0, 0.3, 0.7, 1.0], sw_a=[38, 8, -8, -14],
            lift_v=[0, 0.25, 0.5, 0.8, 1.0], lift_h=[0.0, 0.10, 0.07, 0.02, 0.0],
            width=0.125, out_toe=7)
RUN = dict(frames=20, stance=0.38, f_contact=0.34, f_toeoff=-0.52, sw_warp=0.9,
           st_u=[0, 0.12, 0.45, 0.75, 1.0], st_a=[-6, 0, 0, 14, 42],
           sw_v=[0, 0.3, 0.6, 0.85, 1.0], sw_a=[42, 55, 10, -5, -6],
           lift_v=[0, 0.3, 0.55, 0.8, 1.0], lift_h=[0.0, 0.40, 0.34, 0.12, 0.0],
           width=0.10, out_toe=5)
WALK['speed'] = (WALK['f_contact'] - WALK['f_toeoff']) / (WALK['stance'] * WALK['frames'] / 30.0)
RUN['speed'] = (RUN['f_contact'] - RUN['f_toeoff']) / (RUN['stance'] * RUN['frames'] / 30.0)

def walk_ctrl(i, P=WALK):
    n = P['frames']; ph = (i % n) / n; c2 = np.cos(2 * np.pi * ph); s2 = np.sin(2 * np.pi * ph)
    fr = foot_cycle(ph, P); fl = foot_cycle((ph + 0.5) % 1, P)
    hz = -0.070 - 0.022 * np.cos(4 * np.pi * ph)                    # low at heel strikes, high at mid-stance
    hr = 0.028 * np.cos(2 * np.pi * (ph - 0.27))                    # weight over the stance foot
    yaw = 7 * c2                                                     # pelvis turns with the swinging leg
    roll = -4 * np.cos(2 * np.pi * (ph - 0.27))
    c = stance(
        hips_off=(hr, 0.02, hz), hips_rot=(yaw, 3, roll),
        spine_rot=(-17 * c2, -5 + 1.5 * np.cos(4 * np.pi * ph), -roll * 0.9 + 2.5 * np.cos(2 * np.pi * (ph - 0.27))),
        head_rot=(-2 * c2, -3, 0.8 * np.cos(2 * np.pi * (ph - 0.27))),
        # "attitude" carry: blade resting on the right shoulder, hand in front of the shoulder, bobbing with the steps
        grip=(0.25, 0.16 + 0.015 * c2, 1.50 + 0.012 * np.cos(4 * np.pi * ph)),
        blade=(0.10, -0.74, 0.66), edge=(0, -0.6, -0.8), relbow=(0.4, 0.5, -0.8),
        lhand=(-0.25, 0.04 + 0.20 * c2, 1.00 + 0.05 * c2), lelbow=(-0.8, 0.3, -0.5), lhand_bend=12,
        footR=dict(ball=(P['width'] + 0.02, fr['ball']), yaw=-P['out_toe'], heel=fr['heel'], lift=fr['lift'], pitch=fr['pitch']),
        footL=dict(ball=(-P['width'], fl['ball']), yaw=P['out_toe'], heel=fl['heel'], lift=fl['lift'], pitch=fl['pitch']))
    return c

def run_ctrl(i, P=RUN):
    n = P['frames']; ph = (i % n) / n; c2 = np.cos(2 * np.pi * ph)
    fr = foot_cycle(ph, P); fl = foot_cycle((ph + 0.5) % 1, P)
    mid = P['stance'] / 2
    hz = -0.115 - 0.035 * np.cos(4 * np.pi * (ph - mid))            # compress at mid-stance, rise in flight
    hr = 0.018 * np.cos(2 * np.pi * (ph - mid))
    yaw = 10 * c2; roll = -3 * np.cos(2 * np.pi * (ph - mid))
    c = stance(
        hips_off=(hr, 0.10, hz), hips_rot=(yaw, 13, roll),
        spine_rot=(-24 * c2, 5 + 2 * np.cos(4 * np.pi * (ph - mid)), -roll),
        head_rot=(-3 * c2, -6, 0),
        # sword held low and out to the right, tip trailing back clear of the cape and legs
        grip=(0.30, -0.02 - 0.16 * c2, 1.02 + 0.05 * np.cos(2 * np.pi * ph + 0.6)),
        blade=(0.55, -0.62, -0.52 + 0.04 * c2), edge=(0, -0.3, -1), relbow=(0.7, 0.6, -0.4),
        lhand=(-0.24, 0.08 + 0.28 * c2, 1.18 + 0.10 * c2), lelbow=(-0.6, 0.6, -0.5), lhand_bend=25,
        footR=dict(ball=(P['width'] + 0.02, fr['ball']), yaw=-P['out_toe'], heel=fr['heel'], lift=fr['lift'], pitch=fr['pitch']),
        footL=dict(ball=(-P['width'], fl['ball']), yaw=P['out_toe'], heel=fl['heel'], lift=fl['lift'], pitch=fl['pitch']))
    return c

# ------------------------------------------------------------------ jump (one shot) — root carries the height
JUMP_LEN = 46
JUMP_TAKEOFF, JUMP_LAND = 13, 33
JUMP_H = 0.62

def _relaxed(**kw):
    base = dict(hips_off=(0.0, 0.02, -0.06), hips_rot=(-4, 3, 0), spine_rot=(2, 1, 0), head_rot=(0, -1, 0),
                grip=(0.27, 0.0, 0.96), blade=(0.16, -0.78, -0.60), edge=(0, -0.3, -1), relbow=(0.8, 0.4, -0.5),
                lhand=(-0.26, 0.06, 1.00), lelbow=(-0.8, 0.3, -0.5), lhand_bend=12,
                footR=dict(ball=(0.17, 0.09), yaw=-6, heel=0, lift=0, pitch=0),
                footL=dict(ball=(-0.15, 0.11), yaw=6, heel=0, lift=0, pitch=0))
    for k, v in kw.items():
        if isinstance(v, dict) and k in base: d = dict(base[k]); d.update(v); base[k] = d
        else: base[k] = v
    return stance(**base)

def jump_keys():
    from timeline import merge
    J = [
        (0, {}),
        (8, dict(hips_off=(0.0, 0.08, -0.26), hips_rot=(-4, 22, 0), spine_rot=(2, 14, 0), head_rot=(0, 6, 0),
                 grip=(0.30, -0.18, 0.86), blade=(0.15, -0.90, -0.40), lhand=(-0.28, -0.22, 0.98),
                 footR=dict(heel=4), footL=dict(heel=4))),
        (11, dict(hips_off=(0.0, 0.07, -0.20), hips_rot=(-4, 16, 0), spine_rot=(2, 6, 0),
                  grip=(0.30, -0.10, 0.92), lhand=(-0.28, -0.10, 1.04), footR=dict(heel=18), footL=dict(heel=18))),
        (13, dict(hips_off=(0.0, 0.03, 0.02), hips_rot=(-4, 2, 0), spine_rot=(2, -6, 0), head_rot=(0, -6, 0),
                  grip=(0.30, 0.16, 1.18), blade=(0.15, -0.60, -0.50), lhand=(-0.26, 0.30, 1.42),
                  footR=dict(heel=48), footL=dict(heel=48))),
        (16, dict(hips_off=(0.0, 0.03, 0.0), hips_rot=(-4, 0, 0), spine_rot=(2, -4, 0),
                  lhand=(-0.30, 0.32, 1.50), footR=dict(heel=0, pitch=30, lift=0.03), footL=dict(heel=0, pitch=30, lift=0.03))),
        (23, dict(hips_off=(0.0, 0.05, 0.0), hips_rot=(-4, 6, 0), spine_rot=(2, 4, 0), head_rot=(0, 2, 0),
                  grip=(0.32, 0.10, 1.12), blade=(0.20, -0.70, -0.30), lhand=(-0.36, 0.20, 1.30),
                  footR=dict(pitch=10, lift=0.16, ball=(0.17, 0.16)), footL=dict(pitch=10, lift=0.10, ball=(-0.15, 0.06)))),
        (31, dict(hips_off=(0.0, 0.04, -0.02), hips_rot=(-4, 5, 0), spine_rot=(2, 3, 0),
                  grip=(0.30, 0.06, 1.04), lhand=(-0.32, 0.20, 1.18),
                  footR=dict(pitch=-6, lift=0.02, ball=(0.17, 0.10)), footL=dict(pitch=-6, lift=0.02, ball=(-0.15, 0.10)))),
        (33, dict(footR=dict(pitch=0, lift=0.0, ball=(0.17, 0.10)), footL=dict(pitch=0, lift=0.0, ball=(-0.15, 0.10)))),
        (37, dict(hips_off=(0.0, 0.10, -0.27), hips_rot=(-4, 20, 0), spine_rot=(2, 12, 0), head_rot=(0, 6, 0),
                  grip=(0.32, 0.18, 0.92), blade=(0.18, -0.70, -0.45), lhand=(-0.30, 0.34, 1.06))),
        (46, dict(**{k: v for k, v in _relaxed().items()}, ease=True)),
    ]
    return J

def root_height(f):
    """ballistic flight between take-off and landing (in metres)."""
    if f <= JUMP_TAKEOFF or f >= JUMP_LAND: return 0.0
    t = (f - JUMP_TAKEOFF) / (JUMP_LAND - JUMP_TAKEOFF)
    return JUMP_H * 4 * t * (1 - t)
