"""v7 run arms: natural sprint arms. Upper arm swings ~40 deg forward / ~25 deg back from vertical, elbow held near 90 deg
(a little more bent on the forward swing), relaxed closed hands with the thumbs up (palms facing in), hands crossing
toward the chest line in front and passing the hip behind. Legs, hips and spine are the v4 run unchanged."""
import numpy as np
import locomotion4 as L4
from locomotion3 import arm, UNARMED
PRO = -60.0
def pump7(ph, side, pro=None):
    sw = np.cos(2 * np.pi * (ph - 0.04)) * (1 if side == 'R' else -1)      # +1 = this arm fully back
    th = np.radians(7.5 - 32.5 * sw); s = 1 if side == 'R' else -1
    fr = max(0.0, -sw)
    d = (s * (0.16 - 0.10 * fr), np.sin(th), -np.cos(th))
    return arm(d, 90 + 18 * fr - 10 * max(0.0, sw), pro=PRO if pro is None else pro, dev=-6, flex=8, swiv=6 + 8 * fr)
def run_unarmed7(i, pro=None):
    c, ph = L4.run_legs(i); c.update(UNARMED); c['fistR'] = 0.92; c['fistL'] = 0.92
    c['fkR'] = pump7(ph, 'R', pro); c['fkL'] = pump7(ph, 'L', pro)
    return c
def battle_run7(i):
    c = L4.battle_run2(i); ph = (i % L4.RUN2['frames']) / L4.RUN2['frames']
    c['fkL'] = pump7(ph, 'L'); c['fistL'] = 0.92
    return c
