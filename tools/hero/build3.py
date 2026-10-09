import sys, copy, pickle; sys.path.insert(0, '/home/claude/tools')
from run import *
from armfk import design_key, grip_roll, design_prior
import attacks3 as A3
from timeline import Timeline, sample, merge

def design_clip(start, keys, n, edges=None, x_prev=None):
    """resolve 'R' specs into fkR joint params (sequentially, warm-started)."""
    cur = copy.deepcopy(start); out = []
    xp = x_prev
    for f, ov in keys:
        ov = dict(ov)
        tmp = merge(cur, {k: v for k, v in ov.items() if k != 'R'})
        if 'R' in ov:
            spec = ov.pop('R')
            e = edges.get(f) if edges else None
            if spec.get('pro') is not None:
                p, err = design_prior(HR, tmp, spec)
                if err > 20: print(f'   key {f}: blade off by {err:.0f} deg', flush=True)
            else:
                p, err = design_key(HR, tmp, spec, x0=xp, edge=e, w_edge=0.6 if e is not None else 0)
            p['roll'] = 0.0; ov['fkR'] = p; xp = p
            if err > 12: print(f'   key {f}: blade error {err:.0f} deg', flush=True)
        cur = merge(cur, ov); out.append((f, ov))
    return out, cur, xp

def left_spring(cs, freq=2.4, zeta=0.7, preroll=10):
    w = 2 * np.pi * freq; dt = 1 / 30
    X = np.array([list(c['fkL']['dir']) + [c['fkL']['elb'] / 100.0] for c in cs])
    x = X[0].copy(); v = np.zeros(4); out = []
    for i in [0] * preroll + list(range(len(cs))):
        for _ in range(4):
            a = w * w * (X[i] - x) - 2 * zeta * w * v; v = v + a * dt / 4; x = x + v * dt / 4
        out.append(x.copy())
    out = out[preroll:]
    for c, x in zip(cs, out):
        c['fkL'] = dict(c['fkL']); c['fkL']['dir'] = tuple(x[:3]); c['fkL']['elb'] = float(x[3] * 100)
    return cs

def apply_roll(cs):
    th, edges, w = grip_roll(HR, cs)
    for c, t in zip(cs, th):
        c['fkR'] = dict(c['fkR']); c['fkR']['roll'] = float(t)
    return cs, th, edges

def start_state():
    g = copy.deepcopy(A3.GUARD); spec = g.pop('R')
    p = {k: spec[k] for k in ('dir', 'elb', 'pro', 'dev', 'swiv', 'flex')}; p['roll'] = 0.0; g['fkR'] = p
    return g
