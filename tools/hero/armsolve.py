"""Locked-wrist sword arm.  The wrist is (nearly) rigid; the blade angle comes from the shoulder, elbow, forearm
rotation and the body.  Per frame we solve for wrist position, elbow swivel, small wrist flex/deviation and
forearm roll so that the grip reaches its target and the blade points where the key asks, with the wrist held
near its locked angle.  Then a dynamic left arm that counter-balances the sword arm."""
import numpy as np
from scipy.optimize import least_squares
from solver import *
from secondary import wrist_angles

LOCK_FLEX, LOCK_DEV = 0.0, -25.0       # locked wrist: straight, slight ulnar deviation (blade extends the arm line)
TW_NEUTRAL = 55.0

def Q_from(flex, dev, tw):
    # inverse of wrist_angles(): swing that sends +y to (sin f, cos.., -sin d) then twist about y
    y = np.array([np.tan(np.radians(flex)), 1.0, -np.tan(np.radians(dev))]); y = nrm(y)
    return look_rot(np.array([0, 1, 0.]), y) @ rot((0, 1, 0), tw)

class SwordArm:
    def __init__(self, HR):
        self.HR = HR
        self.rel0 = HR.rest_rot['Forearm.R'].T @ HR.rest_rot['Hand.R']   # rest hand-in-forearm
        self.L1, self.L2 = HR.L['UpperArm.R'], HR.L['Forearm.R']
        self.b_h = R_SWORD_IN_HAND[:, 1]

    def fk(self, x, sh, ref_pole):
        W = x[:3]; phi, fl, dv, tw = x[3:]
        ax = nrm(W - sh)
        pole = rot(ax, phi) @ nrm(ref_pole - np.dot(ref_pole, ax) * ax)
        Ra, Rb, el, wr = self.HR.two_bone('UpperArm.R', 'Forearm.R', sh, W, pole, 'armR', [])
        Rh = Rb @ self.rel0 @ Q_from(fl, dv, tw)
        grip = wr + Rh @ GRIP_IN_HAND
        blade = Rh @ self.b_h
        return grip, blade, Rh, el, wr, pole

    def solve_frame(self, c, x0, xprev, w_blade=1.0, w_ref=1.0):
        HR = self.HR
        HR.solve(c)
        sh = HR.world_tail('Clavicle.R')
        G = W(c['grip']); B = nrm(Wd(c['blade']))
        refp = Wd(c['relbow'])
        chest_up = HR.world_rot('UpperChest') @ np.array([0, 1, 0.])
        reach = (self.L1 + self.L2) * 0.985
        caps = [(HR.world_head('Hips') + np.array([0, 0, -0.05]), HR.world_tail('UpperChest'), 0.20),
                (HR.world_head('Head'), HR.world_tail('Head'), 0.14)]
        for sd in 'LR':
            caps.append((HR.world_head(f'Thigh.{sd}'), HR.world_tail(f'Thigh.{sd}'), 0.11))
            caps.append((HR.world_head(f'Shin.{sd}'), HR.world_tail(f'Shin.{sd}'), 0.08))
        blade_len = SWORD_LEN - GRIP_FROM_POMMEL
        ts = np.linspace(0.18, blade_len, 9)
        def res(x):
            g, b, Rh, el, wr, pole = self.fk(x, sh, refp)
            r = [(g - G) / 0.06,
                 w_blade * (b - B) / np.radians(3.0),
                 [(x[4] - LOCK_FLEX) / 7.0, (x[5] - LOCK_DEV) / 7.0, (x[6] - TW_NEUTRAL) / 70.0, x[3] / 70.0]]
            if xprev is not None:
                r.append(w_ref * (x[:3] - xprev[:3]) / 0.08)
                r.append(w_ref * (x[3:] - xprev[3:]) / np.array([25.0, 6.0, 6.0, 20.0]))
            r.append([max(0.0, x[6] - 140.0) / 2.0, max(0.0, -30.0 - x[6]) / 2.0,
                      max(0.0, abs(x[4] - LOCK_FLEX) - 18) / 1.5, max(0.0, abs(x[5] - LOCK_DEV) - 14) / 1.5])
            pts = g + np.outer(ts, b)
            pen = []
            for a0, b0, rr in caps:
                ab = b0 - a0; t = np.clip(((pts - a0) @ ab) / (ab @ ab), 0, 1)
                dd = np.linalg.norm(pts - (a0 + t[:, None] * ab), axis=1)
                pen.append(np.maximum(0, rr + 0.03 - dd).max())
            r.append(np.array(pen) / 0.01)
            r.append([max(0.0, 0.06 - pts[:, 2].min()) / 0.01])     # tip above the ground
            d = np.linalg.norm(x[:3] - sh)
            r.append([max(0.0, d - reach) / 0.005])
            up = np.dot(el - sh, chest_up)
            r.append([max(0.0, up - 0.10) / 0.04])
            return np.concatenate([np.ravel(a) for a in r])
        sol = least_squares(res, x0, method='lm', max_nfev=400, xtol=1e-7)
        return sol.x, sh, refp

def init_x(HR, c):
    HR.solve(c)
    Rh = HR.world_rot('Hand.R'); wr = HR.world_head('Hand.R')
    fl, dv, tw = wrist_angles(HR, HR.world_rot('Forearm.R'), Rh)
    return np.r_[wr, 0.0, LOCK_FLEX, LOCK_DEV, np.clip(tw, -25, 135)]

def solve_sword_arm(HR, cs, smooth_sigma=1.4, x_init=None):
    """Adds per-frame 'arm_override' to each control dict (upper arm / forearm / hand world rotations)."""
    SA = SwordArm(HR)
    xs = []; meta = []
    x = None if x_init is None else np.array(x_init, float)
    for i, c in enumerate(cs):
        x0 = init_x(HR, c) if x is None else x
        if x is None:   # first frame: solve a few times from different swivels, keep best
            best = None
            for ph in (-60, -30, 0, 30, 60):
                xi = x0.copy(); xi[3] = ph
                xi, sh, refp = SA.solve_frame(c, xi, None)
                g, b, *_ = SA.fk(xi, sh, refp)
                e = np.linalg.norm(g - W(c['grip'])) + 0.1 * np.linalg.norm(b - nrm(Wd(c['blade'])))
                if best is None or e < best[0]: best = (e, xi)
            x = best[1]
        else:
            x, sh, refp = SA.solve_frame(c, x0, x)
        xs.append(x.copy())
    xs = np.array(xs)
    def gsmooth(X, sg):
        k = np.exp(-0.5 * (np.arange(-4, 5) / sg) ** 2); k /= k.sum()
        return np.stack([np.convolve(np.pad(X[:, j], 4, mode='edge'), k, 'valid') for j in range(X.shape[1])], 1)
    for _pass in range(1):
        ref = gsmooth(xs, 1.2)
        xs2 = []
        for i, c in enumerate(cs):
            xi, sh, refp = SA.solve_frame(c, ref[i], ref[i], w_ref=0.7)
            xs2.append(xi)
        xs = np.array(xs2)
    if smooth_sigma > 0:
        k = np.exp(-0.5 * (np.arange(-3, 4) / smooth_sigma) ** 2); k /= k.sum()
        xs = np.stack([np.convolve(np.pad(xs[:, j], 3, mode='edge'), k, 'valid') for j in range(xs.shape[1])], 1)
    for c, x in zip(cs, xs):
        c['arm_x'] = x
    return cs

def arm_override(HR, c):
    """called from the solver after the torso: pose the right arm from c['arm_x']."""
    SA = SwordArm(HR)
    sh = HR.world_tail('Clavicle.R')
    g, b, Rh, el, wr, pole = SA.fk(c['arm_x'], sh, Wd(c['relbow']))
    Ra, Rb, _, _ = HR.two_bone('UpperArm.R', 'Forearm.R', sh, c['arm_x'][:3], pole, 'armR', [])
    return Ra, Rb, Rh


def consistent_keys(start, keys, n, iters=2, blend=0.8, x_init=None):
    """Move each key's grip toward the position a locked-wrist arm actually reaches for that key's blade
    direction, so the interpolated sword path stays reachable (the body/arm drive the angle)."""
    import copy
    from timeline import Timeline, sample, merge
    from solver import C
    import run as _run
    HR = _run.HR
    keys = copy.deepcopy(keys)
    for it in range(iters):
        cs = solve_sword_arm(HR, sample(Timeline(start, keys, n), auto_edge=False), smooth_sigma=0, x_init=x_init)
        new = []
        for f, ov in keys:
            c = cs[int(round(f))]
            HR.solve(c)
            Rh = HR.world_rot('Hand.R'); g = C(HR.world_head('Hand.R') + Rh @ GRIP_IN_HAND)
            ov = dict(ov)
            if f > 0 or it > 0 or True:
                tgt = np.array(c['grip']); ov['grip'] = tuple(tgt * (1 - blend) + g * blend)
            new.append((f, ov))
        keys = new
    return keys

# ------------------------------------------------------------------ dynamic left arm (counter-balance + follow-through)
def left_arm_dynamics(HR, cs, k_fwd=0.38, k_out=0.28, k_up=0.25, freq=2.0, zeta=0.80, preroll=20):
    """The left hand is driven by (1) its keyed base position relative to the chest, (2) a counter-motion
    opposite to the sword hand (forward <-> back, crossing <-> opening), and (3) a damped spring so it lags
    and overshoots like a real arm."""
    def chest_frame(c):
        HR.solve(c)
        R = HR.world_rot('UpperChest') @ HR.rest_rot['UpperChest'].T
        o = HR.world_head('UpperChest')
        Rh = HR.world_rot('Hand.R'); g = HR.world_head('Hand.R') + Rh @ GRIP_IN_HAND
        return R, o, g
    frames = [chest_frame(c) for c in cs]
    # sword hand in chest space (r,f,u axes of the chest)
    def to_local(R, o, p):
        v = R.T @ (p - o); return np.array([-v[0], -v[1], v[2]])
    G = np.array([to_local(R, o, g) for R, o, g in frames])
    g0 = np.array([0.20, 0.40, -0.25])     # guard sword-hand position relative to the chest
    w = 2 * np.pi * freq; dt = 1 / 30.0
    x = None; v = np.zeros(3)
    seq = [0] * preroll + list(range(len(cs)))
    out = {}
    for step, i in enumerate(seq):
        R, o, g = frames[i]; c = cs[i]
        lp = np.array(c['lhand'], float)                 # keyed base (char space, torso relative)
        base = np.array([lp[0], lp[1], lp[2] - 1.42])    # relative to the chest centre (~1.42 m high)
        d = G[i] - g0
        off = np.array([k_out * min(0.0, d[0]) * 1.0 - 0.10 * max(0.0, d[0]),   # sword crosses left -> left hand opens out
                        -k_fwd * d[1],                                       # sword forward -> left hand back
                        -k_up * d[2] * 0.5])
        loc = base + np.clip(off, [-0.30, -0.40, -0.25], [0.20, 0.30, 0.25])
        tgt = o + R @ np.array([-loc[0], -loc[1], loc[2]])
        HR.solve(c); Rh = HR.world_rot('Hand.R'); gw = HR.world_head('Hand.R') + Rh @ GRIP_IN_HAND; bw = Rh @ R_SWORD_IN_HAND[:, 1]
        t = np.clip(np.dot(tgt - gw, bw), 0, SWORD_LEN - GRIP_FROM_POMMEL); q = gw + bw * t; dv = tgt - q; dd = np.linalg.norm(dv)
        if dd < 0.22: tgt = q + dv / (dd + 1e-9) * 0.22
        if x is None: x = tgt.copy()
        for _ in range(4):
            h = dt / 4
            a = w * w * (tgt - x) - 2 * zeta * w * v
            v = v + a * h; x = x + v * h
        if step >= preroll:
            pole = R @ np.array([0.85, 0.15, -0.5])     # elbow out to the left, slightly back and down
            out[i] = (x.copy(), pole)
    for i, c in enumerate(cs):
        c['lhand_w'] = tuple(out[i][0]); c['lelbow_w'] = tuple(out[i][1])
    return cs

# ================================================================== v3: exact blade angle, exactly locked wrist, global (Viterbi) search
def _twist_about_y(R):
    return np.degrees(np.arctan2(R[0, 2], R[0, 0]))

DEBUG = []
def solve_sword_arm_v3(HR, cs, n_th=72, devs=(-31.0, -25.0, -19.0), x_init=None, w_shift=0.035, smooth=1.0, x_final=None):
    SA = SwordArm(HR)
    L1, L2 = SA.L1, SA.L2
    hl_a, hl_b = HR.hinge['armR']
    N = len(cs); ths = np.arange(n_th) * (360.0 / n_th); nd = len(devs)
    U = np.zeros((N, n_th, nd)); store = []; refs = []; Bs = []
    pb = pref = None
    blade_len = SWORD_LEN - GRIP_FROM_POMMEL; ts = np.linspace(0.2, blade_len, 8)
    for i, c in enumerate(cs):
        HR.solve(c)
        S = HR.world_tail('Clavicle.R'); G = W(c['grip']); B = nrm(Wd(c['blade']))
        if pb is None:
            ref = nrm(np.cross(B, [0, 0, 1.0])) if abs(B[2]) < 0.95 else nrm(np.cross(B, [1, 0, 0.]))
        else:
            ref = nrm(look_rot(pb, B) @ pref)
        pb, pref = B, ref
        refs.append(ref); Bs.append(B)
        chest_up = HR.world_rot('UpperChest') @ np.array([0, 1, 0.])
        cc = HR.world_head('UpperChest')
        caps = [(HR.world_head('Hips') + np.array([0, 0, -0.05]), HR.world_tail('UpperChest'), 0.20),
                (HR.world_head('Head'), HR.world_tail('Head'), 0.14)]
        for sd in 'LR':
            caps.append((HR.world_head(f'Thigh.{sd}'), HR.world_tail(f'Thigh.{sd}'), 0.11))
            caps.append((HR.world_head(f'Shin.{sd}'), HR.world_tail(f'Shin.{sd}'), 0.08))
        ua_rest = HR.rest_follow('UpperArm.R')
        sol = {}
        for k, th in enumerate(ths):
            e = rot(B, th) @ ref
            Rh = sword_frame(B, e) @ R_SWORD_IN_HAND.T
            Wt = G - Rh @ GRIP_IN_HAND
            for j, dv in enumerate(devs):
                Rfh = Rh @ (SA.rel0 @ Q_from(LOCK_FLEX, dv, 0.0)).T
                yf = Rfh[:, 1]
                E0 = Wt - L2 * yf; v = E0 - S; nv = np.linalg.norm(v)
                delta = (L1 / nv - 1) * v
                E = E0 + delta; Wp = Wt + delta
                n = np.cross(E - S, Wp - E); nn = np.linalg.norm(n)
                if nn < 1e-6: n = nrm(np.cross(E - S, chest_up))
                else: n = n / nn
                Ra = frame_from(E - S, hl_a, n, None); Rb = frame_from(yf, hl_b, n, None)
                tw = _twist_about_y(Rb.T @ Rfh)
                # elbow bend direction (anatomical): forearm must bend toward the front of the upper arm
                bend = np.degrees(np.arccos(np.clip(np.dot(nrm(E - S), yf), -1, 1)))
                # humeral rotation relative to a minimal swing from rest
                Rsw = look_rot(ua_rest @ np.array([0, 1, 0.]), nrm(E - S)) @ ua_rest
                hum = _twist_about_y(Rsw.T @ Ra)
                cost = (np.linalg.norm(delta) / w_shift) ** 2
                twr = (tw - 85.0 + 180) % 360 - 180          # relative to thumb-up neutral (hinge-frame measure)
                cost += (twr / 85.0) ** 2 + (max(0, twr - 100) / 4) ** 2 + (max(0, -110 - twr) / 4) ** 2
                cost += (hum / 75.0) ** 2 + (max(0, abs(hum) - 110) / 5) ** 2
                cost += ((dv - LOCK_DEV) / 8.0) ** 2
                up = np.dot(E - S, chest_up)
                cost += (max(0, up - 0.10) / 0.05) ** 2
                inward = np.dot(E - cc, nrm(S - cc))
                cost += (max(0, 0.10 - inward) / 0.05) ** 2
                if bend < 4: cost += ((4 - bend) / 2) ** 2
                gp = Wp + Rh @ GRIP_IN_HAND
                pts = gp + np.outer(ts, B)
                for a0, b0, rr in caps:
                    ab = b0 - a0; t = np.clip(((pts - a0) @ ab) / (ab @ ab), 0, 1)
                    dd = np.linalg.norm(pts - (a0 + t[:, None] * ab), axis=1)
                    p = max(0, (rr + 0.03 - dd).max())
                    cost += (p / 0.02) ** 2
                cost += (max(0, 0.06 - pts[:, 2].min()) / 0.02) ** 2
                U[i, k, j] = cost
                sol[(k, j)] = (np.linalg.norm(delta), tw, hum, up, inward, bend)
        store.append(sol)
    DEBUG.append(store)
    def _to_state(xs_, frame_ref, Bv):
        e, dv = xs_
        e = np.array(e, float); e = nrm(e - np.dot(e, Bv) * Bv)
        ang = np.degrees(np.arctan2(np.dot(np.cross(frame_ref, e), Bv), np.dot(frame_ref, e))) % 360
        return int(round(ang / (360.0 / n_th))) % n_th, int(np.argmin(np.abs(np.array(devs) - dv)))
    if x_init is not None and len(x_init) == 2 and not isinstance(x_init[0], (int, np.integer)):
        x_init = _to_state(x_init, refs[0], Bs[0])
    if x_final is not None and len(x_final) == 2 and not isinstance(x_final[0], (int, np.integer)):
        x_final = _to_state(x_final, refs[-1], Bs[-1])
    if x_final is not None:
        kf, jf = x_final
        U[-1] = U[-1] + 12.0 * (((ths - ths[kf] + 180) % 360 - 180) / 10.0)[:, None] ** 2 + 3.0 * ((np.array(devs) - devs[jf]) / 4.0)[None, :] ** 2
    # Viterbi over (theta, dev)
    dth = (ths[:, None] - ths[None, :] + 180) % 360 - 180
    Tth = (dth / 9.0) ** 2
    dd_ = np.array(devs)[:, None] - np.array(devs)[None, :]; Td = (dd_ / 6.0) ** 2
    acc = U[0].copy()
    if x_init is not None:   # continuity with the previous clip
        k0, j0 = x_init
        acc = acc + 0.5 * (((ths - ths[k0] + 180) % 360 - 180) / 10.0)[:, None] ** 2 + 0.5 * ((np.array(devs) - devs[j0]) / 4.0)[None, :] ** 2
    back = []
    for i in range(1, N):
        tot = acc[:, None, :, None] + Tth[:, :, None, None] + Td[None, None, :, :]   # (k',k,j',j)
        tot = tot.transpose(1, 3, 0, 2).reshape(n_th, nd, -1)
        arg = np.argmin(tot, axis=2); m = np.min(tot, axis=2)
        back.append(arg); acc = m + U[i]
    k, j = np.unravel_index(np.argmin(acc), acc.shape)
    path = [(k, j)]
    for arg in reversed(back):
        a = arg[k, j]; k, j = np.unravel_index(a, (n_th, nd)); path.append((k, j))
    path = path[::-1]
    # continuous refinement: smooth theta/dev along the path and recompute the arm exactly
    th = np.unwrap(np.radians([ths[k] for k, j in path])); dvs = np.array([devs[j] for k, j in path], float)
    if smooth > 0:
        kern = np.exp(-0.5 * (np.arange(-3, 4) / smooth) ** 2); kern /= kern.sum()
        th = np.convolve(np.pad(th, 3, mode='edge'), kern, 'valid'); dvs = np.convolve(np.pad(dvs, 3, mode='edge'), kern, 'valid')
    deltas = []
    for i, c in enumerate(cs):
        HR.solve(c)
        S = HR.world_tail('Clavicle.R'); G = W(c['grip']); B = nrm(Wd(c['blade']))
        if i == 0:
            ref = nrm(np.cross(B, [0, 0, 1.0])) if abs(B[2]) < 0.95 else nrm(np.cross(B, [1, 0, 0.])); pb = B
        else:
            ref = nrm(look_rot(pb, B) @ ref); pb = B
        e = rot(B, np.degrees(th[i])) @ ref
        Rh = sword_frame(B, e) @ R_SWORD_IN_HAND.T
        Wt = G - Rh @ GRIP_IN_HAND
        Rfh = Rh @ (SA.rel0 @ Q_from(LOCK_FLEX, dvs[i], 0.0)).T
        yf = Rfh[:, 1]
        E0 = Wt - L2 * yf; v = E0 - S; delta = (L1 / np.linalg.norm(v) - 1) * v
        deltas.append(delta); c['_edge'] = e
    # smooth the grip shift too, then build final rotations
    D = np.array(deltas)
    if smooth > 0:
        kern = np.exp(-0.5 * (np.arange(-3, 4) / (smooth * 1.5)) ** 2); kern /= kern.sum()
        Ds = np.stack([np.convolve(np.pad(D[:, q], 3, mode='edge'), kern, 'valid') for q in range(3)], 1)
    else: Ds = D
    for i, c in enumerate(cs):
        c['arm3'] = dict(edge=tuple(c.pop('_edge')), dev=float(dvs[i]), shift=tuple(Ds[i]), path=tuple(int(p) for p in path[i]))
    return cs, path

def arm3_pose(HR, c):
    a = c['arm3']; SA = SwordArm(HR)
    S = HR.world_tail('Clavicle.R'); G = W(c['grip']); B = nrm(Wd(c['blade']))
    e = np.array(a['edge'])
    Rh = sword_frame(B, e) @ R_SWORD_IN_HAND.T
    Wp = G - Rh @ GRIP_IN_HAND + np.array(a['shift'])
    Rfh = Rh @ (SA.rel0 @ Q_from(LOCK_FLEX, a['dev'], 0.0)).T
    yf = Rfh[:, 1]
    E = Wp - SA.L2 * yf
    # the shift was smoothed, so re-project the elbow onto the upper-arm sphere (tiny correction)
    E = S + nrm(E - S) * SA.L1; Wp = E + SA.L2 * yf
    hl_a, hl_b = HR.hinge['armR']
    n = np.cross(E - S, Wp - E); n = nrm(n) if np.linalg.norm(n) > 1e-6 else nrm(np.cross(E - S, [0, 0, 1.]))
    Ra = frame_from(E - S, hl_a, n, None); Rb = frame_from(yf, hl_b, n, None)
    return Ra, Rb, Rh
