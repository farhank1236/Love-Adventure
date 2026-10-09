"""V skill power-up pose (starts and ends in the combat guard).
   0-7   gather: sink into a wide crouch, chin down, sword angled out and planted point-first in the ground at the right side, left fist clenched at the chest
   7-15  hold and tense (slight deeper sink)
   15-20 burst: drive up, chest open, head back, sword arm swung out front-right with the blade up, left arm flung wide
   20-27 hold the burst (aura ignites at frame 20)
   27-38 settle back into the guard"""
import copy
from attacks3 import R, L, GUARD_R, GUARD_L, WRIST_LOCK
from attacks4 import G_FL, G_FR, G_BODY, keys
POWER_LEN = 38
POWER_BURST = 20
POWER = [
  (0, {}),
  (7, dict(hips_off=(0.0, 0.0, -0.24), hips_rot=(-10, 14, 0), spine_rot=(0, 16, 0), head_rot=(0, 24, 0),
           footL=dict(ball=(-0.30, 0.24), yaw=14, heel=0), footR=dict(ball=(0.32, -0.08), yaw=-22, heel=0),
           R=R((0.66, 0.22, -0.72), 10, (0.36, 0.34, -0.87), pro=-80, dev=-12, swiv=20),
           fkL=L((-0.12, 0.55, -0.25), 115), fistL=1.0)),
  (15, dict(hips_off=(0.0, -0.01, -0.28), hips_rot=(-10, 17, 0), spine_rot=(0, 19, 0), head_rot=(0, 26, 0),
            R=R((0.65, 0.20, -0.73), 12, (0.36, 0.32, -0.88), pro=-80, dev=-12, swiv=20),
            fkL=L((-0.10, 0.55, -0.28), 118))),
  (20, dict(hips_off=(0.0, 0.03, -0.05), hips_rot=(-10, -6, 0), spine_rot=(0, -14, 0), head_rot=(0, -18, 0),
            R=R((0.51, 0.84, -0.15), 10, (0.55, 0.15, 0.82), pro=20, dev=-12, swiv=0),
            fkL=L((-0.90, 0.10, 0.35), 12), fistL=0.15)),
  (27, dict(hips_off=(0.0, 0.03, -0.07), hips_rot=(-10, -4, 0), spine_rot=(0, -10, 0), head_rot=(0, -12, 0),
            R=R((0.53, 0.82, -0.18), 12, (0.55, 0.18, 0.81), pro=20, dev=-12, swiv=0),
            fkL=L((-0.88, 0.12, 0.30), 15))),
  (37, dict(ease=True, footL=dict(G_FL), footR=dict(G_FR), R=dict(GUARD_R), fkL=dict(GUARD_L), fistL=0.55, **G_BODY)),
]
