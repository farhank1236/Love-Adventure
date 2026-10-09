import numpy as np
def stance(**kw):
    c = dict(hips_off=(0, 0, 0), hips_rot=(0, 0, 0), spine_rot=(0, 0, 0), head_rot=(0, 0, 0),
             grip=(0.25, 0.30, 1.10), blade=(-0.2, 0.8, 0.55), edge=(0, 0.4, -1), relbow=(0.6, -0.3, -0.7),
             lhand=(-0.30, 0.18, 1.12), lelbow=(-0.8, -0.3, -0.5), lhand_bend=15,
             footL=dict(ball=(-0.20, 0.30), yaw=8, heel=0), footR=dict(ball=(0.24, -0.12), yaw=-30, heel=0))
    for k, v in kw.items():
        if isinstance(v, dict) and k in c and isinstance(c[k], dict):
            d = dict(c[k]); d.update(v); c[k] = d
        else: c[k] = v
    return c
REST = stance(footL=dict(ball=(-0.26, 0.095), yaw=0), footR=dict(ball=(0.26, 0.095), yaw=0))
GUARD = stance(hips_off=(0.0, 0.02, -0.08), hips_rot=(-18, 4, 0), spine_rot=(8, 6, 0), head_rot=(-4, 4, 0))
