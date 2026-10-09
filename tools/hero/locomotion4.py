"""v4 run: authored for the game's real travel speed (~5 m/s) so it plays 1:1 — 180 steps/min, short ground contact,
flight phase, heel kick-up, high knee drive, forward lean and 90-degree arm pumping opposite to the legs."""
import numpy as np
from locomotion import run_ctrl, foot_cycle
from locomotion3 import arm, UNARMED
RUN2 = dict(frames=20, stance=0.234, f_contact=0.44, f_toeoff=-0.34, sw_warp=0.72,
            st_u=[0, 0.15, 0.5, 0.8, 1.0], st_a=[-4, 0, 2, 18, 44],
            sw_v=[0, 0.18, 0.40, 0.70, 0.90, 1.0], sw_a=[44, 72, 40, 4, -6, -4],
            lift_v=[0, 0.15, 0.32, 0.55, 0.80, 1.0], lift_h=[0.0, 0.30, 0.42, 0.36, 0.12, 0.0],
            width=0.085, out_toe=4)
RUN2['speed'] = (RUN2['f_contact'] - RUN2['f_toeoff']) / (RUN2['stance'] * RUN2['frames'] / 30.0)

def run_legs(i, P=RUN2):
    c = run_ctrl(i, P)
    n = P['frames']; ph = (i % n) / n; mid = P['stance'] / 2; c2 = np.cos(2 * np.pi * ph)
    hz = -0.095 - 0.040 * np.cos(4 * np.pi * (ph - mid))            # lowest at mid-stance, highest in flight
    c['hips_off'] = (0.014 * np.cos(2 * np.pi * (ph - mid)), 0.12, hz)
    c['hips_rot'] = (9 * c2, 11, -3 * np.cos(2 * np.pi * (ph - mid)))
    c['spine_rot'] = (-20 * c2, 7 + 1.5 * np.cos(4 * np.pi * (ph - mid)), 3 * np.cos(2 * np.pi * (ph - mid)))
    c['head_rot'] = (-2 * c2, -4, 0)
    return c, ph

def pump(ph, side, amp=36.0):
    """running arm (dir = shoulder->wrist in the chest frame): back swing = hand beside the hip, elbow ~100;
    front swing = hand at chest height toward the midline, elbow ~75. Opposite to the same-side leg."""
    sw = np.cos(2 * np.pi * (ph - 0.04)) * (1 if side == 'R' else -1)      # +1 = this arm fully back
    th = np.radians(36 - amp * sw); s = 1 if side == 'R' else -1
    fr = max(0.0, -sw)
    d = (s * (0.13 - 0.08 * fr), np.sin(th), -np.cos(th))
    return arm(d, 84 + 16 * sw, pro=-6, dev=0, flex=0, swiv=8 + 10 * fr)

def run_unarmed2(i):
    c, ph = run_legs(i); c.update(UNARMED); c['fistR'] = 0.65; c['fistL'] = 0.65
    c['fkR'] = pump(ph, 'R'); c['fkL'] = pump(ph, 'L')
    return c

def battle_run2(i):
    """sword out: blade carried low and trailing at the right side (edge down, tip behind, clear of legs and cape),
    right arm swings a little with the stride; left arm pumps fully."""
    c, ph = run_legs(i); sw = np.cos(2 * np.pi * (ph - 0.04))
    c.update(sword_vis=1.0, portal=0.0, fistR=1.0, fistL=0.65)
    c['fkR'] = arm((0.30, -0.25 * sw + 0.10, -0.85), 80 - 10 * sw, pro=-10, dev=-12, flex=0, swiv=20)   # v3 sword carry, unchanged
    c['fkL'] = pump(ph, 'L')
    return c
