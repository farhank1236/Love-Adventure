"""v5 hero clips for the horse: Mount, RideIdle, RideWalk, RideGallop, Dismount.
All authored in the RIDE frame: character origin = horse point (0, 0, -0.32) (under the seat), facing the horse's
forward (+z). Horse point (x, y, z) -> char (r, f, u) = (-x, z + 0.32, y)."""
import sys, copy, numpy as np
sys.path.insert(0, '/home/claude/tools'); sys.path.insert(0, '/home/claude/horse')
from lib4 import *
import locomotion3 as L3
from armfk import chest_rot
import secondary as SEC

Z0 = -0.32
def H2C(p): x, y, z = p; return np.array([-x, z - Z0, y])
SEAT_HIPS = H2C((0, 1.78, -0.31))                  # hips joint when seated deep in the saddle
STIR = {'L': H2C((0.388, 0.99, -0.22)), 'R': H2C((-0.388, 0.99, -0.22))}
POMMEL = H2C((0, 1.86, -0.04)); CANTLE = H2C((0, 1.86, -0.53))
BALL_U = HR.head['Toe.L'][2]

def arm_to(c, s, T, swiv=10.0, pro=0.0, flex=0.0, dev=0.0, it=4):
    """joint-space arm reaching the wrist to char point T (shoulder & chest from the current pose)."""
    L1, L2 = HR.L[f'UpperArm.{s}'], HR.L[f'Forearm.{s}']
    c['fk' + s] = L3.arm((0.1 if s == 'R' else -0.1, 0.3, -0.9), 40, pro=pro, dev=dev, flex=flex, swiv=swiv)
    for _ in range(it):
        HR.solve(c); sh = HR.world_tail(f'Clavicle.{s}'); Rc = chest_rot(HR)
        d = W(T) - sh; D = min(np.linalg.norm(d), (L1 + L2) * 0.985)
        dc = Rc.T @ (d / np.linalg.norm(d)); dir_c = (-dc[0], -dc[1], dc[2])
        e = np.degrees(np.arccos(np.clip((D ** 2 - L1 ** 2 - L2 ** 2) / (2 * L1 * L2), -1, 1)))
        c['fk' + s] = L3.arm(dir_c, e, pro=pro, dev=dev, flex=flex, swiv=swiv)
    return c['fk' + s]

def foot(ball, lift, yaw=0, heel=0, pitch=0, knee_out=8):
    return dict(ball=(float(ball[0]), float(ball[1])), lift=float(lift), yaw=float(yaw), heel=float(heel), pitch=float(pitch), knee_out=float(knee_out))

def stirrup_feet(dy=0.0):
    return dict(footL=foot(STIR['L'][:2] + [0, 0.02], STIR['L'][2] - BALL_U + 0.02 + dy, yaw=10, heel=-14, knee_out=34),
                footR=foot(STIR['R'][:2] + [0, 0.02], STIR['R'][2] - BALL_U + 0.02 + dy, yaw=-10, heel=-14, knee_out=34))

idle0 = L3.idle_unarmed_ctrl(0)
def ride_base(lean=4.0, hips_u=0.0, hips_f=0.0, hands_f=0.0, hands_u=0.0):
    c = copy.deepcopy(idle0)
    c.update(L3.UNARMED); c['fistR'] = 0.85; c['fistL'] = 0.85
    c['hips_off'] = (0.0, SEAT_HIPS[1] - (L3.idle_unarmed_ctrl(0)['hips_off'][1] * 0) + hips_f + 0.015, SEAT_HIPS[2] - HR.head['Hips'][2] + hips_u)
    c['hips_rot'] = (0, -6 + lean * 0.4, 0); c['spine_rot'] = (0, 8 + lean, 0); c['head_rot'] = (0, -2, 0)
    c.update(stirrup_feet())
    for s, sg in (('L', -1), ('R', 1)):
        arm_to(c, s, POMMEL + np.array([sg * 0.11, 0.10 + hands_f, 0.10 + hands_u]), swiv=25, pro=-35 * sg * 0 - 20, flex=8)
    return c

# horse body motion at the saddle (to let the rider ride the motion rather than be glued to it)
def horse_saddle_track(kind, n, strides=1):
    import gait
    from gait import gait_frame, idle_frame, WALK, GALLOP
    out = []
    for i in range(n):
        if kind == 'gallop':
            GALLOP['period'] = 25 / 60.0; GALLOP['stride'] = GALLOP['speed'] * GALLOP['period'] * GALLOP['duty']
            p = gait_frame((i * strides / n) % 1.0, GALLOP)
        else:
            WALK['stride'] = WALK['speed'] * WALK['period'] * WALK['duty']; p = gait_frame(i / n, WALK)
        G = p.fk(); out.append(G['Spine'])
    return out

# ---------------------------------------------------------------- horse collider for the cloth (cape drapes over the croup)
def horse_colliders(spine_M=None):
    caps = [((0, 1.24, -0.80), (0, 1.24, 0.30), 0.37), ((0, 1.30, -1.00), (0, 1.32, -0.62), 0.30),
            ((0, 1.55, 0.45), (0, 1.95, 0.85), 0.22), ((-0.16, 1.84, -0.53), (0.16, 1.84, -0.53), 0.07)]
    out = []
    for a, b, r in caps:
        A = np.array(a, float); B = np.array(b, float)
        out.append((W(H2C(A)), W(H2C(B)), r))
    return out

def with_horse(fn):
    SEC_EXTRA = horse_colliders()
    old = SEC.colliders
    def cl(HR_):
        return old(HR_) + SEC_EXTRA
    SEC.colliders = cl
    try: return fn()
    finally: SEC.colliders = old

# ---------------------------------------------------------------- key builder
def local_to_char(r0, f0, yaw_deg, a):
    """a point (a_r, a_f) in a frame standing at (r0, f0) turned yaw_deg (+ = left) -> char (r, f)"""
    t = np.radians(yaw_deg); c, s = np.cos(t), np.sin(t)
    # turning left by t rotates the local forward (0,1) to (-sin t, cos t) and right (1,0) to (cos t, sin t)
    return np.array([r0 + a[0] * c - a[1] * s, f0 + a[0] * s + a[1] * c])

def stand_feet(r0, f0, yaw):
    fl = local_to_char(r0, f0, yaw, (-0.15, 0.11)); fr = local_to_char(r0, f0, yaw, (0.17, 0.09))
    return foot(fl, 0, yaw=6 + yaw), foot(fr, 0, yaw=-6 + yaw)

def K(hips, hips_rot, spine_rot, head_rot, footL, footR, handL=None, handR=None, fistL=None, fistR=None, armL=None, armR=None, base=None, **kw):
    c = copy.deepcopy(base or idle0); c.update(L3.UNARMED)
    c['hips_off'] = (float(hips[0]), float(hips[1]) + 0.015, float(hips[2]) - HR.head['Hips'][2])   # hips given as a char point
    c['hips_rot'] = tuple(hips_rot); c['spine_rot'] = tuple(spine_rot); c['head_rot'] = tuple(head_rot)
    c['footL'] = footL; c['footR'] = footR
    if armL is not None: c['fkL'] = armL
    if armR is not None: c['fkR'] = armR
    if handL is not None: arm_to(c, 'L', np.asarray(handL, float), swiv=20, pro=-20, flex=6)
    if handR is not None: arm_to(c, 'R', np.asarray(handR, float), swiv=20, pro=-20, flex=6)
    if fistL is not None: c['fistL'] = fistL
    if fistR is not None: c['fistR'] = fistR
    c.update(kw)
    return c

R0, F0 = -0.70, 0.20        # mounting spot (horse x = +0.70, z = -0.12): left side, facing the horse
def mount_keys():
    Y = -90
    fl, fr = stand_feet(R0, F0, Y)
    relaxL = L3.arm((-0.12, 0.08, -1.0), 14, pro=-5, flex=10); relaxR = L3.arm((0.12, 0.08, -1.0), 14, pro=-5, flex=10)
    pomL = POMMEL + np.array([-0.10, 0.02, 0.04]); canR = CANTLE + np.array([-0.12, 0.04, 0.03])
    stirL = foot(STIR['L'][:2] + [-0.02, 0.0], STIR['L'][2] - BALL_U + 0.03, yaw=-75, heel=-6, knee_out=4)
    k = []
    k.append((0, K((R0, F0, 0.845), (Y - 3, 2, 0), (2, -2, 0), (Y, 1, 0), fl, fr, armL=relaxL, armR=relaxR, fistL=0.3, fistR=0.3)))
    k.append((8, K((R0 + 0.06, F0, 0.82), (Y, 8, 0), (0, 6, 0), (Y + 10, -12, 0), fl, fr, handL=pomL, handR=canR, fistL=0.9, fistR=0.9)))
    k.append((15, K((R0 + 0.02, F0 + 0.02, 0.76), (Y + 8, -4, 3), (0, 10, 0), (Y + 15, -18, 0), stirL, foot(fr['ball'], 0, yaw=fr['yaw'], heel=10), handL=pomL, handR=canR)))
    k.append((21, K((R0 + 0.16, F0 - 0.02, 1.20), (Y + 6, 14, 0), (0, 14, 0), (Y + 10, -10, 0), stirL,
                    foot(np.array(fr['ball']) + [0.06, 0.0], 0.10, yaw=fr['yaw'], heel=45, pitch=20), handL=pomL + [0, 0, 0.0], handR=canR)))
    k.append((27, K((-0.42, F0 - 0.06, 1.74), (Y + 4, 26, 0), (0, 16, 0), (Y + 15, -5, 0), stirL,
                    foot((-0.55, 0.18), 0.86, yaw=-90, pitch=25, knee_out=0), handL=pomL, handR=canR)))
    k.append((33, K((-0.34, F0 - 0.10, 1.80), (Y + 30, 30, -4), (8, 14, 0), (Y + 45, -5, 0), stirL,
                    foot((-0.36, -0.58), 1.60, yaw=-150, pitch=30, knee_out=0), handL=pomL, handR=canR + [0.05, 0.0, 0.02])))
    k.append((39, K((-0.22, F0 - 0.14, 1.86), (Y + 60, 22, -6), (8, 10, 0), (Y + 70, -4, 0), stirL,
                    foot((0.06, -0.64), 1.88, yaw=-170, pitch=20, knee_out=0), handL=pomL, handR=POMMEL + [0.08, 0.0, 0.05])))
    k.append((45, K((-0.08, 0.04, 1.84), (Y + 82, 8, -3), (2, 8, 0), (-4, -4, 0),
                    foot(STIR['L'][:2] + [0, 0.02], STIR['L'][2] - BALL_U + 0.03, yaw=6, heel=-6, knee_out=20),
                    foot((0.42, -0.18), 1.20, yaw=-30, pitch=10, knee_out=10), handL=pomL + [0.0, 0.05, 0.04], handR=POMMEL + [0.10, 0.06, 0.08])))
    rb = ride_base()
    k.append((52, dict(rb, hips_off=(rb['hips_off'][0], rb['hips_off'][1], rb['hips_off'][2] - 0.025), spine_rot=(0, 16, 0))))
    k.append((62, dict(rb, ease=True)))
    return k, 62

def dismount_keys():
    """reverse-ish of the mount: lean on the pommel, swing the right leg back over the croup, step down on the left."""
    Y = -90
    rb = ride_base()
    fl, fr = stand_feet(R0, F0, Y)
    relaxL = L3.arm((-0.12, 0.08, -1.0), 14, pro=-5, flex=10); relaxR = L3.arm((0.12, 0.08, -1.0), 14, pro=-5, flex=10)
    pomL = POMMEL + np.array([-0.10, 0.02, 0.04]); canR = CANTLE + np.array([-0.12, 0.04, 0.03])
    stirL = foot(STIR['L'][:2] + [-0.02, 0.0], STIR['L'][2] - BALL_U + 0.03, yaw=-75, heel=-6, knee_out=4)
    k = [(0, {})]
    k.append((6, K((-0.04, 0.03, 1.86), (-20, 12, -2), (0, 10, 0), (-30, -4, 0),
                   foot(STIR['L'][:2] + [0, 0.02], STIR['L'][2] - BALL_U + 0.03, yaw=0, heel=-6, knee_out=20),
                   foot((0.42, -0.10), 1.25, yaw=-30, pitch=10, knee_out=10), handL=pomL + [0.04, 0.02, 0.02], handR=POMMEL + [0.10, 0.04, 0.06])))
    k.append((13, K((-0.24, F0 - 0.14, 1.88), (Y + 55, 22, -6), (8, 10, 0), (Y + 60, -4, 0), stirL,
                    foot((0.04, -0.66), 1.90, yaw=-170, pitch=20, knee_out=0), handL=pomL, handR=POMMEL + [0.06, 0.0, 0.05])))
    k.append((19, K((-0.36, F0 - 0.10, 1.80), (Y + 25, 28, -4), (8, 14, 0), (Y + 35, -5, 0), stirL,
                    foot((-0.40, -0.52), 1.40, yaw=-140, pitch=30, knee_out=0), handL=pomL, handR=canR + [0.05, 0.0, 0.02])))
    k.append((25, K((-0.44, F0 - 0.06, 1.72), (Y + 4, 24, 0), (0, 14, 0), (Y + 10, -6, 0), stirL,
                    foot((-0.60, 0.16), 0.80, yaw=-92, pitch=10, knee_out=0), handL=pomL, handR=canR)))
    k.append((31, K((R0 + 0.10, F0 - 0.02, 1.05), (Y + 6, 12, 0), (0, 12, 0), (Y + 8, -8, 0), stirL,
                    foot(fr['ball'], 0.0, yaw=fr['yaw'], heel=8), handL=pomL, handR=canR)))
    k.append((37, K((R0 + 0.03, F0, 0.80), (Y + 2, 6, 0), (0, 6, 0), (Y + 4, -6, 0),
                    foot(fl['ball'], 0.04, yaw=fl['yaw'], heel=5), fr, handL=pomL + [-0.15, 0, -0.1], handR=canR + [-0.15, 0, -0.12], fistL=0.4, fistR=0.4)))
    k.append((46, K((R0, F0, 0.845), (Y - 3, 2, 0), (2, -2, 0), (Y, 1, 0), fl, fr, armL=relaxL, armR=relaxR, fistL=0.3, fistR=0.3, ease=True)))
    return k, 46, rb

# ---------------------------------------------------------------- wind on the cape (gallop)
def with_wind(fn, wind):
    import numpy as _np
    old = SEC.ChainSim2.targets
    def targets(self, colliders):
        HR_ = self.HR
        root = HR_._parent_frame(self.chain[0])[:3, 3]
        par = HR_.rig.parent[self.chain[0]]
        Rp = HR_.world_rot(par) @ HR_.rest_rot[par].T
        yaw = SEC._yaw_of(HR_.world_rot('Hips') @ HR_.rest_rot['Hips'].T)
        Rhang = SEC.rot((0, 0, 1), yaw)
        pts = [root]
        for i, b in enumerate(self.chain):
            dh = nrm(Rhang @ self.rest_dirs[i] + _np.asarray(wind) * (0.4 + 0.6 * i / 3))
            d = nrm(Rp @ self.rest_dirs[i] * (1 - self.hp[i]) + dh * self.hp[i])
            if self.follow is not None: d = self.follow(i, d)
            pts.append(pts[-1] + d * self.len[i])
        return _np.array(pts)
    SEC.ChainSim2.targets = targets
    try: return fn()
    finally: SEC.ChainSim2.targets = old

def ride_idle(n=60):
    base = ride_base(); out = []
    for i in range(n):
        ph = 2 * np.pi * i / n; c = copy.deepcopy(base)
        c['spine_rot'] = (2 * np.sin(ph), base['spine_rot'][1] + 1.0 * np.sin(2 * ph), 0)
        c['head_rot'] = (10 * np.sin(ph) ** 3, -2 + 2 * np.sin(2 * ph + 1), 0)
        c['hips_off'] = (base['hips_off'][0], base['hips_off'][1], base['hips_off'][2] + 0.004 * np.sin(2 * ph))
        out.append(c)
    return out

def ride_walk(n=30):
    base = ride_base(); out = []
    for i in range(n):
        ph = 2 * np.pi * i / n; c = copy.deepcopy(base)
        c['hips_rot'] = (2.5 * np.sin(ph), base['hips_rot'][1] + 2.0 * np.sin(2 * ph + 0.6), 3.0 * np.sin(ph + 0.4))
        c['spine_rot'] = (-2.0 * np.sin(ph), base['spine_rot'][1] - 1.5 * np.sin(2 * ph + 0.6), -2.4 * np.sin(ph + 0.4))
        c['head_rot'] = (0, -2 + 1.0 * np.sin(2 * ph), 0)
        c['hips_off'] = (base['hips_off'][0] + 0.01 * np.sin(ph), base['hips_off'][1] + 0.012 * np.sin(2 * ph), base['hips_off'][2] + 0.006 * np.sin(2 * ph + 1.0))
        for s, sg in (('L', -1), ('R', 1)):
            arm_to(c, s, POMMEL + np.array([sg * 0.11, 0.10 + 0.025 * np.sin(2 * ph - 0.5), 0.10]), swiv=25, pro=-20, flex=8)
        out.append(c)
    return out

def ride_gallop(n=25, strides=2):
    """half-seat: weight in the stirrups, seat just off the saddle, body forward, hands low along the neck.
    The rider rides the motion: hips counter part of the saddle bob and pitch (the hero is parented to the saddle)."""
    from pose import rx
    track = horse_saddle_track('gallop', n, strides)
    base = ride_base(lean=30, hips_u=0.07, hips_f=0.07)
    y0 = np.mean([M[1, 3] for M in track]); out = []
    for i in range(n):
        M = track[i]; dy = M[1, 3] - y0
        pitch = np.degrees(np.arctan2(M[2, 1], M[1, 1]))          # spine x-rotation (nose-down +)
        ph = 2 * np.pi * i * strides / n; c = copy.deepcopy(base)
        c['hips_off'] = (base['hips_off'][0], base['hips_off'][1] + 0.02 * np.sin(ph), base['hips_off'][2] - 0.55 * dy)
        c['hips_rot'] = (0, 10 - 0.5 * pitch, 0)
        c['spine_rot'] = (0, 16 - 0.3 * pitch + 2 * np.sin(ph + 1), 0)
        c['head_rot'] = (0, -12 - 0.2 * pitch, 0)
        c.update(stirrup_feet(dy=0.0))
        for s, sg in (('L', -1), ('R', 1)):
            arm_to(c, s, POMMEL + np.array([sg * 0.12, 0.30 + 0.06 * np.sin(ph - 0.8), 0.0 + 0.03 * np.sin(ph)]), swiv=25, pro=-20, flex=8)
        out.append(c)
    return out
