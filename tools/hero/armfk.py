"""Joint-space (FK) arms.  Each arm is driven by
   dir  : shoulder->wrist direction in the CHEST frame (r, f, u)  -> the torso turn carries the arm
   elb  : elbow bend in degrees (0 = straight)
   swiv : elbow swivel about the shoulder-wrist axis (deg)
   pro  : forearm pronation(-)/supination(+) relative to thumb-up neutral (deg)
   dev  : wrist radial(+)/ulnar(-) deviation, flex: wrist flexion (deg)
The sword additionally has 'roll': rotation of the grip inside the fist about the blade axis (deg)."""
import numpy as np
from solver import *

TW_NEUTRAL = {'R': 85.0, 'L': -85.0}

def q_wrist(flex, dev):
    y = nrm(np.array([np.tan(np.radians(flex)), 1.0, -np.tan(np.radians(dev))]))
    return look_rot(np.array([0, 1, 0.]), y)

def chest_rot(HR):
    return HR.world_rot('UpperChest') @ HR.rest_rot['UpperChest'].T

def arm_fk(HR, s, p, sh):
    """returns (Ra, Rb, Rh, elbow, wrist). sh = shoulder joint (world)."""
    Rc = chest_rot(HR)
    L1, L2 = HR.L[f'UpperArm.{s}'], HR.L[f'Forearm.{s}']
    e = np.radians(p.get('elb', 10.0))
    D = np.sqrt(L1 ** 2 + L2 ** 2 + 2 * L1 * L2 * np.cos(e))
    a = nrm(Rc @ Wd(p['dir']))
    out = Rc @ Wd((1, 0, 0) if s == 'R' else (-1, 0, 0))
    down = Rc @ np.array([0, 0, -1.0])
    # continuous elbow reference: the 'arm straight forward, elbow down/out' pole carried to the current arm
    # direction by the minimal rotation (singular only for an arm pointing straight backwards)
    fwd = Rc @ Wd((0, 1, 0))
    ref = look_rot(fwd, a) @ nrm(out * 0.6 + down)
    ref = nrm(ref - np.dot(ref, a) * a)
    sg = 1 if s == 'R' else -1
    pole = rot(a, sg * p.get('swiv', 0.0)) @ ref
    wr = sh + a * D
    Ra, Rb, el, wr2 = HR.two_bone(f'UpperArm.{s}', f'Forearm.{s}', sh, wr, pole, 'arm' + s, [])
    rel0 = HR.rest_rot[f'Forearm.{s}'].T @ HR.rest_rot[f'Hand.{s}']
    tw = TW_NEUTRAL[s] + sg * p.get('pro', 0.0)
    dev = p.get('dev', 0.0)
    Rh = Rb @ rot((0, 1, 0), tw) @ rel0 @ q_wrist(p.get('flex', 0.0), dev if s == 'R' else -dev)
    return Ra, Rb, Rh, el, wr2

def sword_from_hand(Rh, wrist, roll=0.0):
    Rs = Rh @ R_SWORD_IN_HAND @ rot((0, 1, 0), roll)
    g = wrist + Rh @ GRIP_IN_HAND
    return Rs, g

LIM = dict(pro=(-85, 85), dev=(-33, 20), swiv=(-60, 90), flex=(-20, 20))

def blade_of(HR, c):
    HR.solve(c)
    return HR.world_rot('Hand.R') @ R_SWORD_IN_HAND[:, 1]

def design_key(HR, c, spec, x0=None, edge=None, w_edge=0.0):
    """spec: dict(dir, elb, blade=(r,f,u) world-char, optional swiv/pro/dev fixed). Solves remaining joint params
    so the blade points along `blade`.  Returns fkR dict."""
    from scipy.optimize import least_squares
    B = nrm(Wd(spec['blade']))
    free = [k for k in ('pro', 'dev', 'swiv', 'flex') if k not in spec]
    base = {k: spec[k] for k in ('dir', 'elb', 'swiv', 'pro', 'dev', 'flex') if k in spec}
    lo = [LIM[k][0] for k in free]; hi = [LIM[k][1] for k in free]
    x0 = np.array([np.clip((x0 or {}).get(k, {'pro': 0, 'dev': -10, 'swiv': 10, 'flex': 0}[k]), LIM[k][0] + 1e-3, LIM[k][1] - 1e-3) for k in free], float)
    reg = dict(pro=90.0, dev=40.0, swiv=60.0, flex=15.0)
    def res(x):
        p = dict(base); p.update(dict(zip(free, x)))
        cc = dict(c); cc['fkR'] = p
        b = blade_of(HR, cc)
        r = [(b - B) / np.radians(4.0), [x[i] / reg[k] for i, k in enumerate(free)]]
        if edge is not None and w_edge > 0:
            e0 = HR.world_rot('Hand.R') @ R_SWORD_IN_HAND[:, 0]
            r.append([w_edge * (1 - abs(np.dot(e0, edge))) / 0.05])
        return np.concatenate([np.ravel(q) for q in r])
    best = None
    seeds = [dict(pro=60, dev=-20, swiv=20, flex=0), dict(pro=-60, dev=-20, swiv=20, flex=0), dict(pro=0, dev=10, swiv=40, flex=0), dict(pro=0, dev=-30, swiv=-20, flex=0)]
    for start in [x0] + [np.array([np.clip(sd[k], LIM[k][0] + 1e-3, LIM[k][1] - 1e-3) for k in free]) for sd in seeds]:
        sol = least_squares(res, start, bounds=(lo, hi), max_nfev=200)
        if best is None or sol.cost < best.cost: best = sol
    p = dict(base); p.update(dict(zip(free, best.x)))
    cc = dict(c); cc['fkR'] = p
    err = np.degrees(np.arccos(np.clip(np.dot(blade_of(HR, cc), B), -1, 1)))
    return p, err


def grip_roll(HR, cs, v_full=0.12, sigma=1.2, lim=95.0):
    """sword roll inside the fist so an edge leads the cut. Returns list of roll angles (deg) and desired edges."""
    N = len(cs); tips = []; frames = []
    for c in cs:
        cc = dict(c); cc['fkR'] = dict(c['fkR']); cc['fkR']['roll'] = 0.0
        HR.solve(cc)
        Rh = HR.world_rot('Hand.R'); Rs0 = Rh @ R_SWORD_IN_HAND
        g = HR.world_head('Hand.R') + Rh @ GRIP_IN_HAND
        tips.append(g + Rs0[:, 1] * (SWORD_LEN - GRIP_FROM_POMMEL) * 0.7); frames.append(Rs0)
    tips = np.array(tips)
    th = np.zeros(N); w = np.zeros(N); prev = 0.0; edges = []
    for i in range(N):
        Rs0 = frames[i]; b = Rs0[:, 1]; e0 = Rs0[:, 0]
        i0, i1 = max(0, i - 1), min(N - 1, i + 1)
        v = (tips[i1] - tips[i0]) / max(1, i1 - i0)
        vp = v - np.dot(v, b) * b; s = np.linalg.norm(vp)
        if s < 1e-6: th[i] = prev * 0.9; edges.append(None); continue
        u = vp / s
        a = np.degrees(np.arctan2(np.dot(np.cross(e0, u), b), np.dot(e0, u)))
        cands = [a, a - 180, a + 180, a - 360, a + 360]
        cands = [x for x in cands if abs(x) <= lim] or [min(cands, key=abs)]
        a = min(cands, key=lambda x: abs(x - prev) + 0.15 * abs(x))
        wi = np.clip(s / v_full, 0, 1) ** 2
        th[i] = wi * a + (1 - wi) * prev * 0.85
        prev = th[i]; w[i] = wi; edges.append(u)
    if sigma > 0:
        r = int(3 * sigma); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
        th = np.convolve(np.pad(th, r, mode='edge'), k, 'valid')
    return th, edges, w


def _old_ref(Rc, s, a):
    out = Rc @ Wd((1, 0, 0) if s == 'R' else (-1, 0, 0)); down = Rc @ np.array([0, 0, -1.0])
    r = out * 0.6 + down
    if abs(np.dot(nrm(r), a)) > 0.97: r = Rc @ Wd((0, -1, 0))
    return nrm(r - np.dot(r, a) * a)

def _new_ref(Rc, s, a):
    out = Rc @ Wd((1, 0, 0) if s == 'R' else (-1, 0, 0)); down = Rc @ np.array([0, 0, -1.0])
    r = look_rot(Rc @ Wd((0, 1, 0)), a) @ nrm(out * 0.6 + down)
    return nrm(r - np.dot(r, a) * a)

def swiv_convert(HR, c, s, d, swiv):
    """authored swivel (old elbow reference) -> same elbow direction under the new continuous reference."""
    HR.solve(c); Rc = chest_rot(HR); a = nrm(Rc @ Wd(d)); sg = 1 if s == 'R' else -1
    o = _old_ref(Rc, s, a); n = _new_ref(Rc, s, a)
    delta = np.degrees(np.arctan2(np.dot(np.cross(n, o), a), np.dot(n, o)))
    return float(((swiv + sg * delta * sg) + 180) % 360 - 180)

def design_prior(HR, c, spec, sig=dict(pro=40.0, dev=5.0, swiv=40.0, flex=4.0), blade_deg=6.0):
    """keep pro/dev/swiv near the authored (natural) values, nudge them so the blade matches the intended direction."""
    from scipy.optimize import least_squares
    B = nrm(Wd(spec['blade'])); keys = ('pro', 'dev', 'swiv', 'flex')
    spec = dict(spec); spec['swiv'] = swiv_convert(HR, c, 'R', spec['dir'], spec.get('swiv', 0.0))
    x0 = np.array([spec.get(k, 0.0) or 0.0 for k in keys], float)
    span = dict(pro=90.0, dev=8.0, swiv=70.0, flex=6.0)
    lo = [max(LIM[k][0], x0[i] - span[k]) for i, k in enumerate(keys)]; hi = [min(LIM[k][1], x0[i] + span[k]) for i, k in enumerate(keys)]
    x0 = np.clip(x0, np.array(lo) + 1e-3, np.array(hi) - 1e-3)
    def res(x):
        p = dict(dir=spec['dir'], elb=spec['elb']); p.update(dict(zip(keys, x)))
        cc = dict(c); cc['fkR'] = p
        b = blade_of(HR, cc)
        return np.r_[(b - B) / np.radians(blade_deg), (x - x0) / np.array([sig[k] for k in keys])]
    sol = least_squares(res, x0, bounds=(lo, hi), max_nfev=200)
    p = dict(dir=spec['dir'], elb=spec['elb']); p.update(dict(zip(keys, sol.x)))
    cc = dict(c); cc['fkR'] = p
    err = np.degrees(np.arccos(np.clip(np.dot(blade_of(HR, cc), B), -1, 1)))
    return p, err
