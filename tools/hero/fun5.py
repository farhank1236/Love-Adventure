"""v5 clips: Summon (sword drawn with the RIGHT hand out of a portal opening at the LEFT hip), Dismiss (sword pushed back
into the left portal), IdleBall (bored after 30 s: a ball drops out of a tiny portal, keepy-uppies, a header, back
into the portal).  Character frame (r, f, u); portal and ball tracks are returned in Blender world coordinates."""
import sys, copy, numpy as np
sys.path.insert(0, '/home/claude/tools')
from lib4 import *
import locomotion3 as L3
from armfk import design_key, chest_rot
from ride5 import arm_to, foot, K, idle0

def unit(v): v = np.asarray(v, float); return v / np.linalg.norm(v)
PORTAL_C = np.array([-0.40, 0.24, 0.98])             # left hip, a little forward
PORTAL_N = unit((0.62, 0.58, 0.32))                   # faces the right hand (right-front, slightly up)

def sword_arm(c, wrist, blade, x0=None):
    """position the right wrist (char point) and solve the forearm/wrist so the blade points along `blade` (char dir)."""
    p = arm_to(c, 'R', np.asarray(wrist, float), swiv=20)
    spec = dict(dir=p['dir'], elb=p['elb'], blade=tuple(unit(blade)))
    q, err = design_key(HR, c, spec, x0=x0)
    q['roll'] = 0.0; c['fkR'] = q
    return q, err

def grip_world(c):
    HR.solve(c); Rh = HR.world_rot('Hand.R'); return HR.world_head('Hand.R') + Rh @ GRIP_IN_HAND, Rh @ R_SWORD_IN_HAND[:, 1]

def portal_track(n, center_w, normal_w, opens):
    """opens: list of (frame, value) for the open amount; returns (n,10) lqs rows (pos, quat wxyz, scale)."""
    fr = np.array([f for f, v in opens], float); vals = np.array([v for f, v in opens], float)
    a = np.interp(np.arange(n), fr, vals); a = a * a * (3 - 2 * a)
    y = unit(normal_w); x = unit(np.cross(y, [0, 0, 1.0]) if abs(y[2]) < 0.95 else np.cross(y, [1.0, 0, 0])); z = np.cross(x, y)
    R = np.stack([x, y, z], 1); q = mat_to_quat(R)
    out = np.zeros((n, 10), np.float32)
    for i in range(n): out[i] = np.r_[center_w, q, [max(a[i], 1e-3)] * 3]
    return out

def summon(guard):
    g = copy.deepcopy(guard)
    n = 40
    P = PORTAL_C; Nn = PORTAL_N
    keys = []
    # 0 idle; 5 look down-left, start reaching across; 10 hand at the portal (open palm)
    c5 = copy.deepcopy(idle0); c5.update(hips_rot=(10, 4, 0), spine_rot=(14, 8, 0), head_rot=(30, 22, 0))
    arm_to(c5, 'R', P + Nn * 0.30 + [0, 0, 0.05], swiv=25, pro=40); c5['fistR'] = 0.1
    c5['fkL'] = L3.arm((-0.35, 0.10, -0.9), 25, flex=10)
    c10 = copy.deepcopy(c5); c10.update(hips_rot=(14, 6, 0), spine_rot=(18, 10, 0), head_rot=(35, 28, 0))
    sword_arm(c10, P + Nn * 0.10, -Nn)
    c10['fistR'] = 0.15
    c13 = copy.deepcopy(c10); c13['fistR'] = 1.0
    # draw: grip comes out along the portal normal while the body turns right; the blade tips up as it clears
    c16 = copy.deepcopy(c13); c16.update(hips_rot=(4, 4, 0), spine_rot=(6, 6, 0), head_rot=(15, 18, 0))
    sword_arm(c16, P + Nn * 0.36, -Nn, x0=c13['fkR'])
    c19 = copy.deepcopy(c16); c19.update(hips_rot=(-8, 2, 0), spine_rot=(-8, 4, 0), head_rot=(0, 10, 0))
    sword_arm(c19, P + Nn * 0.58 + [0.05, 0.0, 0.08], unit(-Nn + [0.1, 0, 0.55]), x0=c16['fkR'])
    c22 = copy.deepcopy(c19); c22.update(hips_rot=(-16, 0, 0), spine_rot=(-14, 2, 0), head_rot=(-8, 4, 0))
    sword_arm(c22, (0.36, 0.40, 1.40), unit((-0.35, -0.25, 0.90)), x0=c19['fkR'])
    # flourish: the blade sweeps over and out to the right, then settles into the guard
    c26 = copy.deepcopy(c22); c26.update(hips_rot=(-20, 2, 0), spine_rot=(-14, 4, 0), head_rot=(-12, 2, 0))
    sword_arm(c26, (0.52, 0.42, 1.30), unit((0.85, 0.35, -0.25)), x0=c22['fkR'])
    c26['fkL'] = L3.arm((-0.55, 0.45, -0.55), 30, flex=10)
    c31 = copy.deepcopy(c26); c31.update({k: g[k] for k in ('hips_off', 'hips_rot', 'spine_rot', 'head_rot', 'fkL', 'footR', 'footL')})
    sword_arm(c31, (0.36, 0.42, 1.20), unit((0.05, 0.75, 0.66)), x0=g['fkR'])
    keys = [(0, {}),
            (5, dict(c5, sword_vis=0.0)), (10, dict(c10, sword_vis=0.0)), (12, dict(c13, sword_vis=0.0)), (13, dict(c13, sword_vis=1.0)),
            (16, dict(c16, sword_vis=1.0, fistR=1.0)), (19, dict(c19, sword_vis=1.0, fistR=1.0)), (22, dict(c22, sword_vis=1.0, fistR=1.0)), (27, dict(c26, sword_vis=1.0, fistR=1.0)),
            (32, dict(c31, sword_vis=1.0, fistR=1.0)),
            (40, dict(ease=True, **{k: g[k] for k in ('hips_off', 'hips_rot', 'spine_rot', 'head_rot', 'fkR', 'fkL', 'footR', 'footL')}, fistR=1.0, fistL=0.55, sword_vis=1.0))]
    # the portal sits exactly where the fist closes on the grip
    gw, bw = grip_world(dict(c13, sword_vis=1.0))
    nw = Wd(Nn); return keys, n, (gw, nw, [(0, 0), (4, 0), (9, 1), (19, 1), (26, 0), (40, 0)])

def dismiss(guard):
    g = copy.deepcopy(guard)
    n = 40; P = PORTAL_C; Nn = PORTAL_N
    c6 = copy.deepcopy(g); c6.update(hips_rot=(-10, 2, 0), spine_rot=(-8, 4, 0), head_rot=(10, 12, 0))
    sword_arm(c6, (0.30, 0.42, 1.36), unit((-0.30, -0.35, 0.88)), x0=g['fkR'])
    c10 = copy.deepcopy(c6); c10.update(hips_rot=(4, 4, 0), spine_rot=(6, 6, 0), head_rot=(22, 20, 0))
    sword_arm(c10, P + Nn * 0.62, unit(-Nn + [0.05, 0, 0.3]), x0=c6['fkR'])
    c14 = copy.deepcopy(c10); c14.update(hips_rot=(10, 6, 0), spine_rot=(14, 8, 0), head_rot=(30, 26, 0))
    sword_arm(c14, P + Nn * 0.34, -Nn, x0=c10['fkR'])
    c18 = copy.deepcopy(c14); sword_arm(c18, P + Nn * 0.10, -Nn, x0=c14['fkR'])
    gw, bw = grip_world(dict(c18, sword_vis=1.0))
    i0 = copy.deepcopy(idle0)
    keys = [(0, {}), (6, dict(c6, sword_vis=1.0, fistR=1.0)), (10, dict(c10, sword_vis=1.0, fistR=1.0)), (14, dict(c14, sword_vis=1.0, fistR=1.0)), (18, dict(c18, fistR=1.0, sword_vis=1.0)), (19, dict(c18, sword_vis=0.0)),
            (22, dict(c18, fistR=0.15, sword_vis=0.0)),
            (40, dict(ease=True, **{k: i0[k] for k in ('hips_off', 'hips_rot', 'spine_rot', 'head_rot', 'fkR', 'fkL', 'footR', 'footL')}, fistR=0.30, fistL=0.30, sword_vis=0.0))]
    return keys, n, (gw, Wd(Nn), [(0, 0), (4, 0), (9, 1), (20, 1), (27, 0), (40, 0)])

# ======================================================================== IdleBall
G_ACC = 9.81
BALL_R = 0.11
def idle_ball():
    n = 240
    i0 = copy.deepcopy(idle0)
    armsOut = dict(fkR=L3.arm((0.55, 0.25, -0.6), 28, flex=8), fkL=L3.arm((-0.55, 0.25, -0.6), 28, flex=8))
    base_feet = dict(footL=dict(i0['footL']), footR=dict(i0['footR']))
    stance = dict(hips_off=(0.0, 0.02, -0.10), hips_rot=(0, 4, 0), spine_rot=(0, 4, 0))
    def kick(side, f, lift=0.20, fwd=0.22):
        s = side; other = 'L' if s == 'R' else 'R'; x = 0.07 if s == 'R' else -0.07
        up = dict(ball=(x, fwd), lift=lift, yaw=0, heel=0, pitch=-14, knee_out=0)
        return [(f - 5, {'foot' + s: dict(ball=(x, fwd * 0.6), lift=lift * 0.5, pitch=-6, heel=10, yaw=0, knee_out=0), 'hips_off': (-0.03 * (1 if s == 'R' else -1), 0.02, -0.11)}),
                (f, {'foot' + s: up, 'hips_rot': (0, 2, 2 * (1 if s == 'R' else -1))}),
                (f + 5, {'foot' + s: dict(base_feet['foot' + s]), 'hips_off': stance['hips_off'], 'hips_rot': stance['hips_rot']})]
    keys = [(0, {})]
    # bored: look around, big stretch, sigh
    keys += [(10, dict(head_rot=(35, -6, 0), spine_rot=(6, -4, 0))), (20, dict(head_rot=(-30, -4, 0), spine_rot=(-6, -4, 0)))]
    keys += [(26, dict(head_rot=(0, -8, 0), spine_rot=(0, 0, 0), fkR=L3.arm((0.22, 0.55, -0.35), 95, pro=60, flex=-10), fistR=0.05,
                       fkL=L3.arm((-0.15, 0.1, -1.0), 14, flex=10)))]
    keys += [(36, dict(fkR=L3.arm((0.22, 0.55, -0.42), 92, pro=60, flex=-10), head_rot=(0, 12, 0))),          # ball lands in the palm
             (40, dict(fkR=L3.arm((0.22, 0.55, -0.30), 98, pro=60, flex=-10))),
             (44, dict(fkR=L3.arm((0.22, 0.60, -0.10), 80, pro=60, flex=-10), head_rot=(0, -20, 0))),        # toss
             (52, dict(fkR=L3.arm((0.22, 0.55, -0.35), 95, pro=60, flex=-10))),
             (56, dict(fkR=L3.arm((0.22, 0.55, -0.45), 92, pro=60, flex=-10), head_rot=(0, 15, 0))),         # catch
             (62, dict(fkR=L3.arm((0.24, 0.55, -0.30), 70, pro=60, flex=-10))),
             (64, dict(fkR=L3.arm((0.24, 0.50, -0.40), 60, pro=60, flex=-10), **stance)),                   # let it drop
             (68, dict(armsOut, fistR=0.3, fistL=0.3))]
    for f, s in ((74, 'R'), (90, 'L'), (106, 'R'), (136, 'R')): keys += kick(s, f)
    # knee bounce (left)
    keys += [(116, dict(footL=dict(ball=(-0.08, 0.10), lift=0.20, pitch=10, heel=20, yaw=0, knee_out=0))),
             (121, dict(footL=dict(ball=(-0.08, 0.06), lift=0.32, pitch=25, heel=20, yaw=0, knee_out=0), hips_rot=(0, -4, -2))),
             (127, dict(footL=dict(base_feet['footL']), hips_rot=stance['hips_rot']))]
    keys += kick('R', 152, lift=0.25, fwd=0.26)                                     # big kick up
    keys += [(166, dict(hips_off=(0.0, 0.03, -0.14), head_rot=(0, -40, 0), spine_rot=(0, -8, 0))),   # watch it, gather
             (176, dict(hips_off=(0.0, 0.06, -0.02), head_rot=(0, -30, 0), spine_rot=(0, -14, 0), footL=dict(base_feet['footL'], heel=25), footR=dict(base_feet['footR'], heel=25))),
             (180, dict(hips_off=(0.0, 0.08, 0.0), head_rot=(0, 8, 0), spine_rot=(0, 10, 0))),                                   # header!
             (186, dict(hips_off=stance['hips_off'], head_rot=(0, -20, 0), spine_rot=(0, 0, 0), footL=dict(base_feet['footL']), footR=dict(base_feet['footR'])))]
    keys += [(194, dict(fkR=L3.arm((0.12, 0.70, -0.30), 75, pro=40), fkL=L3.arm((-0.12, 0.70, -0.30), 75, pro=40), fistR=0.1, fistL=0.1, head_rot=(0, 5, 0))),
             (198, dict(fkR=L3.arm((0.10, 0.70, -0.42), 70, pro=40), fkL=L3.arm((-0.10, 0.70, -0.42), 70, pro=40), head_rot=(0, 18, 0))),  # catch with both hands
             (206, dict(fkR=L3.arm((0.20, 0.40, 0.40), 60, pro=20), fkL=L3.arm((-0.15, 0.1, -1.0), 14, flex=10), head_rot=(0, -25, 0))),     # ball up on the fingertip
             (214, dict(fkR=L3.arm((0.20, 0.45, 0.35), 65, pro=20))),
             (218, dict(fkR=L3.arm((0.18, 0.40, 0.75), 20, pro=20), head_rot=(0, -40, 0))),                     # toss it back up into the portal
             (226, dict(head_rot=(0, -25, 0))),
             (240, dict(ease=True, **{k: i0[k] for k in ('hips_off', 'hips_rot', 'spine_rot', 'head_rot', 'fkR', 'fkL', 'footR', 'footL')}, fistR=0.3, fistL=0.3))]
    keys.sort(key=lambda kv: kv[0])
    # merge duplicate frames
    mk = []
    for f, ov in keys:
        if mk and mk[-1][0] == f: mk[-1] = (f, dict(mk[-1][1], **ov))
        else: mk.append((f, ov))
    cs = sample(Timeline(i0, mk, n), auto_edge=False)
    for c in cs: c.update(L3.UNARMED) if False else None
    for c in cs: c['sword_vis'] = 0.0; c['portal'] = 0.0
    contacts = [(36, 'handR'), (44, 'handR'), (56, 'handR'), (64, 'handR'), (74, 'footR'), (90, 'footL'), (106, 'footR'), (121, 'kneeL'),
                (136, 'footR'), (152, 'footR'), (180, 'head'), (198, 'hands')]
    held = [(36, 44), (56, 64), (198, 218)]
    def point(c, kind):
        HR.solve(c)
        if kind.startswith('hand') and kind != 'hands':
            Rh = HR.world_rot('Hand.R'); p = HR.world_head('Hand.R') + Rh @ np.array([0.0, 0.09, 0.0]); return p + np.array([0, 0, BALL_R + 0.03])
        if kind == 'hands':
            return 0.5 * (HR.world_head('Hand.R') + HR.world_head('Hand.L')) + np.array([0, -0.05, BALL_R * 0.6])
        if kind.startswith('foot'):
            s = kind[-1]; return HR.world_head('Toe.' + s) + np.array([0, 0.03, BALL_R + 0.06])
        if kind.startswith('knee'):
            s = kind[-1]; return HR.world_tail('Thigh.' + s) + np.array([0, -0.04, BALL_R + 0.07])
        if kind == 'head':
            return HR.world_tail('Head') + np.array([0, -0.03, BALL_R + 0.02])
    def track():
        P = {f: point(cs[f], k) for f, k in contacts}
        ball = np.zeros((n + 1, 3)); vis = np.zeros(n + 1)
        top = np.array(W((0.18, 0.40, 1.95)))
        for f in range(n + 1):
            if f < 26: ball[f] = top; continue
            vis[f] = 1.0
            if 26 <= f < 36:                                   # falls from the portal into the palm
                t = (f - 26) / 10; ball[f] = top + (P[36] - top) * t * t; continue
            h = next(((a, b) for a, b in held if a <= f <= b), None)
            if h:
                kind = 'hands' if h[0] == 198 else 'handR'
                if h[0] == 198 and f >= 204:                  # balanced on the fingertip
                    HR.solve(cs[f]); Rh = HR.world_rot('Hand.R'); ball[f] = HR.world_head('Hand.R') + Rh @ np.array([0, 0.19, 0]) + np.array([0, 0, BALL_R])
                else: ball[f] = point(cs[f], kind)
                continue
            if f > 218:                                       # up into the portal
                p0 = ball[218]; t = (f - 218) / 30.0; vz = (2.62 - p0[2] + 0.5 * G_ACC * (8 / 30) ** 2) / (8 / 30)
                ball[f] = p0 + np.array([0, -0.05 * t, vz * t - 0.5 * G_ACC * t * t]); vis[f] = 1.0 if f < 226 else 0.0; continue
            a = max(k for k, _ in contacts if k <= f); b = min((k for k, _ in contacts if k > f), default=None)
            if b is None: ball[f] = P[a]; continue
            T = (b - a) / 30.0; t = (f - a) / 30.0
            v = (P[b] - P[a]) / T + np.array([0, 0, 0.5 * G_ACC * T])
            ball[f] = P[a] + v * t + np.array([0, 0, -0.5 * G_ACC * t * t])
        return ball, vis
    ball, vis = track()
    # head follows the ball while it is in play (keeps the authored header snap)
    for f in range(30, 226):
        if 172 <= f <= 186: continue
        HR.solve(cs[f]); hp = HR.world_head('Head') + np.array([0, 0, 0.1]); d = ball[f] - hp
        cd = C(hp + d) - C(hp)
        yaw = np.degrees(np.arctan2(-cd[0], cd[1])); pitch = np.degrees(np.arctan2(-cd[2], np.hypot(cd[0], cd[1])))
        w = min(1.0, (f - 30) / 8.0, (226 - f) / 8.0)
        hr = cs[f]['head_rot']; cs[f]['head_rot'] = (hr[0] * (1 - w) + np.clip(yaw, -50, 50) * w, hr[1] * (1 - w) + np.clip(pitch, -45, 55) * w, 0)
    ball, vis = track()
    portals = [(W((0.18, 0.40, 1.98)), Wd((0, 0, -1)), [(0, 0), (20, 0), (26, 1), (34, 1), (40, 0), (240, 0)]),
               (W((0.12, 0.30, 2.62)), Wd((0, 0, -1)), [(0, 0), (212, 0), (218, 1), (228, 1), (234, 0), (240, 0)])]
    talk = [(6, 'bored'), (70, 'watch'), (200, 'proud')]
    return cs, n, ball, vis, portals, talk
