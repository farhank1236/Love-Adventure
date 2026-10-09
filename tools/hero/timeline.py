"""Keyframed control timeline -> per-frame controls (monotone cubic interpolation), auto edge alignment."""
import copy, numpy as np
from solver import nrm

VEC = ['hips_off', 'hips_rot', 'spine_rot', 'head_rot', 'grip', 'blade', 'edge', 'relbow', 'lhand', 'lelbow']
SCAL = ['lhand_bend']
OPT_SCAL = dict(sword_vis=1.0, portal=0.0, fistR=1.0, fistL=0.55, aura=0.0)
FK_FIELDS = dict(dir=(0, 1, 0), elb=10.0, swiv=0.0, pro=0.0, dev=0.0, flex=0.0, roll=0.0)
FOOT = ['ball', 'yaw', 'heel', 'lift', 'pitch', 'knee_out']
FOOT_DEF = dict(ball=(0, 0), yaw=0, heel=0, lift=0, pitch=0, knee_out=8)

def flatten(c):
    out = {}
    for k in VEC: out[k] = np.array(c[k], float)
    for k in SCAL: out[k] = np.array([c.get(k, 10)], float)
    for k, dv in OPT_SCAL.items(): out['opt.' + k] = np.array([c.get(k, dv)], float)
    for s in 'LR':
        if 'fk' + s in c:
            for k, dv in FK_FIELDS.items():
                out[f'fk{s}.{k}'] = np.atleast_1d(np.array(c['fk' + s].get(k, dv), float))
    for s in 'LR':
        f = dict(FOOT_DEF); f.update(c['foot' + s])
        for k in FOOT: out[f'foot{s}.{k}'] = np.atleast_1d(np.array(f[k], float))
    return out

def unflatten(d):
    c = {k: tuple(d[k]) for k in VEC}
    for k in SCAL: c[k] = float(d[k][0])
    for k in OPT_SCAL: c[k] = float(d['opt.' + k][0])
    for s in 'LR':
        if f'fk{s}.dir' in d:
            c['fk' + s] = {k: (tuple(d[f'fk{s}.{k}']) if k == 'dir' else float(d[f'fk{s}.{k}'][0])) for k in FK_FIELDS}
    for s in 'LR':
        f = {}
        for k in FOOT:
            v = d[f'foot{s}.{k}']; f[k] = tuple(v) if len(v) > 1 else float(v[0])
        c['foot' + s] = f
    return c

def merge(base, over):
    c = copy.deepcopy(base)
    for k, v in over.items():
        if k in ('footL', 'footR', 'fkR', 'fkL') and k in c:
            f = dict(c[k]); f.update(v); c[k] = f
        elif k in ('ease', 'lin'):
            continue
        else:
            c[k] = v
    return c

def pchip_tangents(t, y, ease):
    n = len(t); m = np.zeros_like(y)
    h = np.diff(t); d = np.diff(y, axis=0) / h[:, None]
    for i in range(n):
        if ease[i] or i == 0 or i == n - 1:
            m[i] = 0 if (ease[i] or n < 3) else (d[0] if i == 0 else d[-1]) * 0.0
            continue
        a, b = d[i - 1], d[i]
        w1 = 2 * h[i] + h[i - 1]; w2 = h[i] + 2 * h[i - 1]
        with np.errstate(divide='ignore', invalid='ignore'):
            hm = (w1 + w2) / (w1 / a + w2 / b)
        m[i] = np.where(a * b > 0, hm, 0.0)
    return m

def catmull_tangents(t, y, ease):
    n = len(t); m = np.zeros_like(y)
    for i in range(1, n - 1):
        if ease[i]: continue
        m[i] = (y[i + 1] - y[i - 1]) / (t[i + 1] - t[i - 1])
    return m

def hermite(t, y, m, x):
    i = np.clip(np.searchsorted(t, x, side='right') - 1, 0, len(t) - 2)
    h = t[i + 1] - t[i]; s = np.clip((x - t[i]) / h, 0, 1)
    h00 = 2*s**3 - 3*s**2 + 1; h10 = s**3 - 2*s**2 + s; h01 = -2*s**3 + 3*s**2; h11 = s**3 - s**2
    return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1]

ARC_CHANNELS = {'grip', 'blade', 'lhand', 'fkR.dir', 'fkL.dir'}   # use Catmull-Rom (keeps arcs round); others monotone

class Timeline:
    def __init__(self, start_ctrl, keys, length):
        """keys: list of (frame, overrides dict). overrides may contain 'ease': True for a held (zero-velocity) key."""
        self.length = length
        cur = copy.deepcopy(start_ctrl)
        self.times = []; self.flat = []; self.ease = []
        for f, ov in keys:
            cur = merge(cur, ov)
            self.times.append(float(f)); self.flat.append(flatten(cur)); self.ease.append(bool(ov.get('ease', False)))
        self.times = np.array(self.times); self.ease = np.array(self.ease)
        self.chan = {}
        for k in self.flat[0]:
            y = np.stack([fl[k] for fl in self.flat])
            tf = catmull_tangents if k in ARC_CHANNELS else pchip_tangents
            self.chan[k] = (y, tf(self.times, y, self.ease))

    def at(self, x):
        d = {k: hermite(self.times, y, m, x) for k, (y, m) in self.chan.items()}
        return unflatten(d)

def sample(tl, fps_frames=None, auto_edge=True, edge_speed=0.25):
    """returns list of controls for frames 0..length (inclusive). Edge auto-aligned to tip motion."""
    from solver import Wd
    N = tl.length
    cs = [tl.at(f) for f in range(N + 1)]
    if not auto_edge: return cs
    L = 0.75   # tip distance from grip (approx)
    tips = np.array([np.array(c['grip']) + L * nrm(c['blade']) for c in cs])
    prev = None
    for i, c in enumerate(cs):
        b = nrm(c['blade'])
        i0, i1 = max(0, i - 1), min(N, i + 1)
        v = (tips[i1] - tips[i0]) / max(1, i1 - i0)          # metres / frame
        vp = v - np.dot(v, b) * b
        sp = np.linalg.norm(vp)
        hint = nrm(np.array(c['edge']) - np.dot(c['edge'], b) * b)
        if sp > 1e-6:
            lead = vp / sp
            if np.dot(lead, hint) < 0: lead = -lead   # double-edged: pick edge nearest the keyed hint
            al = abs(np.dot(vp / sp, hint))
            w = np.clip(sp / edge_speed, 0, 1) ** 1.5 * np.clip((al - 0.25) / 0.4, 0, 1)
            e = nrm(hint * (1 - w) + lead * w)
        else:
            e = hint
        c['edge'] = tuple(e); prev = e
    return cs
