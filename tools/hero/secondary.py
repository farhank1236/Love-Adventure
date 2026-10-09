"""Secondary motion: cape + robe panels as damped spring chains with simple body collisions,
and wrist-roll optimisation for the sword hand."""
import numpy as np
from solver import *

CAPE = [[f'Cape.{s}.0{i}' for i in range(1, 5)] for s in ('OuterR', 'InnerR', 'Center', 'InnerL', 'OuterL')]
ROBE = [[f'FrontRobe.{s}.0{i}' for i in range(1, 4)] for s in ('R', 'Center', 'L')] + \
       [[f'SideRobe.{s}.0{i}' for i in range(1, 3)] for s in ('L', 'R')]

def _yaw_of(R):
    f = R @ np.array([0, -1, 0.]); return np.degrees(np.arctan2(f[0], -f[1]))  # + = turned left

class ChainSim:
    def __init__(self, HR, chain, hang, stiff, damp, follow=None, radius=0.03):
        self.HR = HR; self.chain = chain; self.hang = hang; self.k = stiff; self.c = damp
        self.follow = follow; self.radius = radius
        self.len = [HR.L[b] for b in chain]
        self.rest_dirs = [nrm(HR.tail[b] - HR.head[b]) for b in chain]
        self.x = None; self.v = None

    def targets(self, colliders):
        HR = self.HR
        root = HR._parent_frame(self.chain[0])[:3, 3]  # head of first bone (rigid follow)
        par = HR.rig.parent[self.chain[0]]
        Rp = HR.world_rot(par) @ HR.rest_rot[par].T   # parent's rotation relative to rest
        yaw = _yaw_of(HR.world_rot('Hips') @ HR.rest_rot['Hips'].T)
        Rhang = rot((0, 0, 1), yaw)
        pts = [root]
        for i, b in enumerate(self.chain):
            d_rigid = Rp @ self.rest_dirs[i]
            d_hang = Rhang @ self.rest_dirs[i]
            d = nrm(d_rigid * (1 - self.hang) + d_hang * self.hang)
            if self.follow is not None:
                d = self.follow(i, d)
            pts.append(pts[-1] + d * self.len[i])
        return np.array(pts)

    def step(self, colliders, dt=1 / 30, sub=4):
        tgt = self.targets(colliders)
        if self.x is None:
            self.x = tgt.copy(); self.v = np.zeros_like(tgt)
        h = dt / sub
        for _ in range(sub):
            a = self.k * (tgt - self.x) - self.c * self.v
            self.v += a * h; self.x += self.v * h
            self.x[0] = tgt[0]; self.v[0] = 0
            # length constraints (root -> tip)
            for i in range(1, len(self.x)):
                d = self.x[i] - self.x[i - 1]; n = np.linalg.norm(d)
                self.x[i] = self.x[i - 1] + d / n * self.len[i - 1]
            # collisions with capsules
            for (a0, b0, r) in colliders:
                ab = b0 - a0
                for i in range(1, len(self.x)):
                    p = self.x[i]; t = np.clip(np.dot(p - a0, ab) / np.dot(ab, ab), 0, 1)
                    q = a0 + t * ab; dv = p - q; dist = np.linalg.norm(dv); rr = r + self.radius
                    if dist < rr:
                        self.x[i] = q + dv / (dist + 1e-9) * rr
                        vn = np.dot(self.v[i], dv / (dist + 1e-9))
                        if vn < 0: self.v[i] -= vn * dv / (dist + 1e-9)
        return self.x

    def apply(self):
        HR = self.HR
        for i, b in enumerate(self.chain):
            Rf = HR.rest_follow(b)   # world rotation with identity basis
            cur = Rf @ np.array([0, 1, 0.])
            want = nrm(self.x[i + 1] - self.x[i])
            HR.set_world(b, look_rot(cur, want) @ Rf)

def colliders(HR):
    cl = [(HR.world_head('Hips') + np.array([0, 0, -0.05]), HR.world_tail('UpperChest'), 0.19)]
    for s in 'LR':
        cl.append((HR.world_head(f'Thigh.{s}'), HR.world_tail(f'Thigh.{s}'), 0.10))
        cl.append((HR.world_head(f'Shin.{s}'), HR.world_tail(f'Shin.{s}'), 0.075))
    return cl

def robe_follow_factory(HR, chain_name):
    side = 'L' if '.L.' in chain_name else ('R' if '.R.' in chain_name else None)
    amt = 0.75 if chain_name.startswith('Front') else 0.45
    def f(i, d):
        sides = [side] if side else ['L', 'R']
        Rs = []
        for s in sides:
            Rt = HR.world_rot(f'Thigh.{s}') @ HR.rest_rot[f'Thigh.{s}'].T
            Rh = HR.world_rot('Hips') @ HR.rest_rot['Hips'].T
            Rs.append(Rt @ Rh.T)   # thigh rotation relative to hips (world)
        q = [mat_to_quat(R) for R in Rs]
        if len(q) == 2:
            if np.dot(q[0], q[1]) < 0: q[1] = -q[1]
            qa = nrm(q[0] + q[1]); a = amt * 0.6
        else:
            qa = q[0]; a = amt
        qi = np.array([1, 0, 0, 0.]);
        if np.dot(qa, qi) < 0: qa = -qa
        R = quat_to_mat(nrm(qi * (1 - a) + qa * a))
        # only let the leg push the panel forward / outward, never pull it into the leg
        return nrm(R @ d)
    return f

def simulate_secondary(HR, cs, preroll=30):
    sims = [ChainSim(HR, ch, hang=0.55, stiff=60.0, damp=7.0, radius=0.035) for ch in CAPE]
    for ch in ROBE:
        sims.append(ChainSim(HR, ch, hang=0.35, stiff=110.0, damp=10.0, follow=robe_follow_factory(HR, ch[0]), radius=0.03))
    seq = [cs[0]] * preroll + list(cs)
    out = []
    for i, c in enumerate(seq):
        HR.solve(c)
        cl = colliders(HR)
        for s in sims:
            s.step(cl); s.apply()
        if i >= preroll:
            out.append({b: HR.basis[b].copy() for s in sims for b in s.chain})
    for c, e in zip(cs, out):
        c['extra_basis'] = e
    return cs

# ------------------------------------------------------------------ wrist roll optimisation
def wrist_angles(HR, Rf, Rh, side='R'):
    Q = (HR.rest_rot[f'Forearm.{side}'].T @ HR.rest_rot[f'Hand.{side}']).T @ (Rf.T @ Rh)   # hand-local deviation from rest relation
    y = Q[:, 1]
    flex = np.degrees(np.arctan2(y[0], y[1]))       # toward palm (+x)
    dev = np.degrees(np.arctan2(-y[2], y[1]))       # toward thumb (-z) = radial
    # twist: rotation about y after removing swing
    sw = look_rot(np.array([0, 1, 0.]), y)
    T = sw.T @ Q
    twist = np.degrees(np.arctan2(T[0, 2], T[0, 0]))
    return flex, dev, twist

TWIST_NEUTRAL = 55.0   # rest hand is ~pronated; thumb-up/palm-in neutral is ~+55 in this measure
def roll_cost(fl, dv, tw):
    return (fl / 60) ** 2 + (dv / 25) ** 2 + ((tw - TWIST_NEUTRAL) / 70) ** 2

def optimise_roll(HR, cs, lead_weight=1.5, smooth_sigma=1.3):
    """Choose the sword roll about its blade axis per frame for the most natural wrist, keeping an edge leading
    the cut when the blade moves fast. Then smooth the roll over time."""
    N = len(cs)
    L = 0.75
    tips = np.array([np.array(c['grip']) + L * nrm(c['blade']) for c in cs])
    rolls = []
    prev = None
    for i, c in enumerate(cs):
        HR.solve(c)
        b = nrm(Wd(c['blade']))
        if prev is None:
            ref = nrm(np.cross(b, [0, 0, 1.0])) if abs(b[2]) < 0.95 else nrm(np.cross(b, [1, 0, 0.]))
        else:
            ref = nrm(look_rot(pb, b) @ pref)
        pb, pref = b, ref
        i0, i1 = max(0, i - 1), min(N - 1, i + 1)
        v = Wd(tips[i1] - tips[i0]) / max(1, i1 - i0)
        vp = v - np.dot(v, b) * b; sp = np.linalg.norm(vp)
        lead = vp / sp if sp > 1e-6 else None
        wl = lead_weight * np.clip(sp / 0.12, 0, 1) ** 2
        sh = HR.world_tail('Clavicle.R'); G = W(c['grip'])
        best = None
        cands = np.arange(-180, 180, 5.0)
        costs = []
        for th in cands:
            e = rot(b, th) @ ref
            Rs = sword_frame(b, e); Rh = Rs @ R_SWORD_IN_HAND.T
            wr = G - Rh @ GRIP_IN_HAND
            Ra, Rb, el, w_ = HR.two_bone('UpperArm.R', 'Forearm.R', sh, wr, Wd(c['relbow']), 'armR', [])
            fl, dv, tw = wrist_angles(HR, Rb, Rh)
            cost = roll_cost(fl, dv, tw)
            if lead is not None:
                cost += wl * (1 - abs(np.dot(e, lead))) ** 1 * 2
            if prev is not None:
                d = (th - prev + 180) % 360 - 180
                cost += 0.6 * (d / 60) ** 2
            costs.append(cost)
        th = cands[int(np.argmin(costs))]
        rolls.append(th); prev = th
        cs[i]['_ref'] = ref
    r = np.unwrap(np.radians(rolls))
    if smooth_sigma > 0:
        k = np.exp(-0.5 * (np.arange(-4, 5) / smooth_sigma) ** 2); k /= k.sum()
        rp = np.pad(r, 4, mode='edge'); r = np.convolve(rp, k, mode='valid')
    for i, c in enumerate(cs):
        b = nrm(Wd(c['blade']))
        e = rot(b, np.degrees(r[i])) @ c.pop('_ref')
        c['edge'] = tuple(np.array([-e[0], -e[1], e[2]]))   # back to char space
    return cs

# ------------------------------------------------------------------ joint elbow-swivel + sword-roll optimisation (Viterbi)
def optimise_arm(HR, cs, n_phi=24, n_th=36, w_pole=0.35, w_lead=1.2, w_dphi=0.8, w_dth=0.8):
    N = len(cs)
    phis = np.arange(n_phi) * (360.0 / n_phi) - 180
    ths = np.arange(n_th) * (360.0 / n_th) - 180
    L = 0.75
    tips = np.array([np.array(c['grip']) + L * nrm(c['blade']) for c in cs])
    unary = np.zeros((N, n_phi, n_th)); store = []
    pb = pref = None
    for i, c in enumerate(cs):
        HR.solve(c)
        b = nrm(Wd(c['blade']))
        if pb is None:
            ref = nrm(np.cross(b, [0, 0, 1.0])) if abs(b[2]) < 0.95 else nrm(np.cross(b, [1, 0, 0.]))
        else:
            ref = nrm(look_rot(pb, b) @ pref)
        pb, pref = b, ref
        sh = HR.world_tail('Clavicle.R'); G = W(c['grip'])
        reach = (HR.L['UpperArm.R'] + HR.L['Forearm.R']) * 0.97 + 0.03
        if np.linalg.norm(G - sh) > reach:      # safety net: pull an unreachable grip back toward the shoulder
            G = sh + nrm(G - sh) * reach; c['grip'] = tuple(C(G))
        axis = nrm(G - sh)
        kp = Wd(c['relbow']); kp = nrm(kp - np.dot(kp, axis) * axis)
        i0, i1 = max(0, i - 1), min(N - 1, i + 1)
        v = Wd(tips[i1] - tips[i0]) / max(1, i1 - i0)
        vp = v - np.dot(v, b) * b; sp = np.linalg.norm(vp)
        lead = vp / sp if sp > 1e-6 else None
        wl = w_lead * np.clip(sp / 0.12, 0, 1) ** 2
        chest_up = HR.world_rot('UpperChest') @ np.array([0, 1, 0.])
        chest_c = HR.world_head('UpperChest')
        for k, th in enumerate(ths):
            e = rot(b, th) @ ref
            Rh = sword_frame(b, e) @ R_SWORD_IN_HAND.T
            wr = G - Rh @ GRIP_IN_HAND
            ax = nrm(wr - sh)
            for j, ph in enumerate(phis):
                pole = rot(ax, ph) @ kp
                Ra, Rb, el, _ = HR.two_bone('UpperArm.R', 'Forearm.R', sh, wr, pole, 'armR', [])
                fl, dv, tw = wrist_angles(HR, Rb, Rh)
                cost = roll_cost(fl, dv, tw)
                cost += w_pole * (ph / 90.0) ** 2
                # anatomy: elbow well above shoulder, or elbow pushed into the chest
                up = np.dot(el - sh, chest_up)
                if up > 0.08: cost += ((up - 0.08) / 0.08) ** 2
                inward = np.dot(el - chest_c, nrm(sh - chest_c))
                if inward < 0.12: cost += ((0.12 - inward) / 0.08) ** 2
                if lead is not None: cost += wl * (1 - abs(np.dot(e, lead))) * 2
                unary[i, j, k] = cost
        store.append((ref, kp, sh))
    # Viterbi
    dphi = (phis[:, None] - phis[None, :] + 180) % 360 - 180
    dth = (ths[:, None] - ths[None, :] + 180) % 360 - 180
    Tphi = w_dphi * (dphi / 40.0) ** 2; Tth = w_dth * (dth / 40.0) ** 2
    acc = unary[0].copy(); back = []
    for i in range(1, N):
        # separable min: first over th', then over phi'
        m1 = np.min(acc[:, None, :] + Tth[None, :, :], axis=2)      # (phi', th)
        a1 = np.argmin(acc[:, None, :] + Tth[None, :, :], axis=2)
        m2 = np.min(m1[:, None, :] + Tphi[:, :, None].transpose(0, 1, 2), axis=0)  # (phi, th)
        a2 = np.argmin(m1[:, None, :] + Tphi[:, :, None], axis=0)
        back.append((a1, a2))
        acc = m2 + unary[i]
    j, k = np.unravel_index(np.argmin(acc), acc.shape)
    path = [(j, k)]
    for a1, a2 in reversed(back):
        jp = a2[j, k]; kp_ = a1[jp, k]
        j, k = jp, kp_; path.append((j, k))
    path = path[::-1]
    ph = np.unwrap(np.radians([phis[j] for j, k in path])); th = np.unwrap(np.radians([ths[k] for j, k in path]))
    kern = np.exp(-0.5 * (np.arange(-3, 4) / 1.1) ** 2); kern /= kern.sum()
    ph = np.convolve(np.pad(ph, 3, mode='edge'), kern, 'valid'); th = np.convolve(np.pad(th, 3, mode='edge'), kern, 'valid')
    for i, c in enumerate(cs):
        ref, kp, sh = store[i]
        b = nrm(Wd(c['blade'])); e = rot(b, np.degrees(th[i])) @ ref
        Rh = sword_frame(b, e) @ R_SWORD_IN_HAND.T
        wr = W(c['grip']) - Rh @ GRIP_IN_HAND; ax = nrm(wr - sh)
        pole = rot(ax, np.degrees(ph[i])) @ kp
        c['edge'] = tuple(np.array([-e[0], -e[1], e[2]]))
        c['relbow'] = tuple(np.array([-pole[0], -pole[1], pole[2]]))
    return cs

# ================================================================== v2: coupled cloth chains (no crumpling / layer crossing)
class ChainSim2(ChainSim):
    def __init__(self, HR, chain, hang_profile, stiff, damp, follow=None, radius=0.03):
        super().__init__(HR, chain, 0.0, stiff, damp, follow, radius)
        self.hp = hang_profile
    def targets(self, colliders):
        HR = self.HR
        root = HR._parent_frame(self.chain[0])[:3, 3]
        par = HR.rig.parent[self.chain[0]]
        Rp = HR.world_rot(par) @ HR.rest_rot[par].T
        yaw = _yaw_of(HR.world_rot('Hips') @ HR.rest_rot['Hips'].T)
        Rhang = rot((0, 0, 1), yaw)
        pts = [root]
        for i, b in enumerate(self.chain):
            d = nrm(Rp @ self.rest_dirs[i] * (1 - self.hp[i]) + Rhang @ self.rest_dirs[i] * self.hp[i])
            if self.follow is not None: d = self.follow(i, d)
            pts.append(pts[-1] + d * self.len[i])
        return np.array(pts)

def _collide(x, v, cl, rad):
    for (a0, b0, r) in cl:
        ab = b0 - a0; abn = np.dot(ab, ab)
        t = np.clip(((x - a0) @ ab) / abn, 0, 1)
        q = a0 + t[:, None] * ab; dv = x - q; dist = np.linalg.norm(dv, axis=1); rr = r + rad
        hit = dist < rr; hit[0] = False
        if hit.any():
            n = dv[hit] / (dist[hit, None] + 1e-9)
            x[hit] = q[hit] + n * rr
            vn = np.sum(v[hit] * n, 1); vn = np.minimum(vn, 0)
            v[hit] -= vn[:, None] * n

class Group:
    """chains integrated together; deviation from target is smoothed across neighbouring chains."""
    def __init__(self, sims, couple=0.5):
        self.sims = sims; self.couple = couple
    def step(self, cl, dt=1 / 30, sub=4):
        tg = [s.targets(cl) for s in self.sims]
        for s, t in zip(self.sims, tg):
            if s.x is None: s.x = t.copy(); s.v = np.zeros_like(t)
        h = dt / sub
        for _ in range(sub):
            for s, t in zip(self.sims, tg):
                a = s.k * (t - s.x) - s.c * s.v
                s.v += a * h; s.x += s.v * h
                s.x[0] = t[0]; s.v[0] = 0
            if len(self.sims) > 1 and self.couple > 0:
                D = np.stack([s.x - t for s, t in zip(self.sims, tg)])   # (nc, np, 3)
                Ds = D.copy()
                for i in range(len(D)):
                    nb = [j for j in (i - 1, i + 1) if 0 <= j < len(D)]
                    Ds[i] = D[i] * (1 - self.couple) + np.mean(D[nb], 0) * self.couple
                for s, t, d in zip(self.sims, tg, Ds): s.x = t + d
            for s in self.sims:
                for i in range(1, len(s.x)):
                    d = s.x[i] - s.x[i - 1]; s.x[i] = s.x[i - 1] + d / np.linalg.norm(d) * s.len[i - 1]
                _collide(s.x, s.v, cl, s.radius)
    def apply(self):
        for s in self.sims: s.apply()

CAPE_HANG = (0.12, 0.28, 0.42, 0.50)
def simulate_secondary2(HR, cs, preroll=30, cape_hang=CAPE_HANG, stiff=70.0, damp=9.0, couple=0.6):
    cape = Group([ChainSim2(HR, ch, cape_hang, stiff, damp, radius=0.04) for ch in CAPE], couple)
    front = Group([ChainSim2(HR, ch, (0.1, 0.25, 0.35), 120.0, 12.0, follow=robe_follow_factory(HR, ch[0]), radius=0.03) for ch in ROBE[:3]], 0.35)
    side = [Group([ChainSim2(HR, ch, (0.15, 0.3), 120.0, 12.0, follow=robe_follow_factory(HR, ch[0]), radius=0.03)], 0) for ch in ROBE[3:]]
    groups = [cape, front] + side
    seq = [cs[0]] * preroll + list(cs)
    out = []
    for i, c in enumerate(seq):
        c = dict(c); c.pop('extra_basis', None)
        HR.solve(c)
        cl = colliders(HR)
        for g in groups: g.step(cl); g.apply()
        if i >= preroll:
            out.append({b: HR.basis[b].copy() for g in groups for s in g.sims for b in s.chain})
    for c, e in zip(cs, out): c['extra_basis'] = e
    return cs
