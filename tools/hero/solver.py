"""Pose solver for the Hero_65_Skeleton: high-level controls -> per-bone local basis matrices.

Character space: (r, f, u) = (right, forward, up), origin at body centre on the ground.
World (Blender armature space): x = -r, y = -0.27 - f, z = u.  Hero faces -Y.
"""
import json, numpy as np
from fk import Rig, quat_to_mat, mat_to_quat

CY = -0.27

def W(p):  # char point -> world
    r, f, u = p; return np.array([-r, CY - f, u], float)

def Wd(d):  # char direction -> world
    r, f, u = d; return np.array([-r, -f, u], float)

def C(p):  # world point -> char
    x, y, z = p; return np.array([-x, CY - y, z])

def nrm(v):
    v = np.asarray(v, float); n = np.linalg.norm(v); return v / n if n > 1e-12 else v

def rot(axis, deg):
    a = nrm(axis); t = np.radians(deg); c, s = np.cos(t), np.sin(t); x, y, z = a
    return np.array([[c + x*x*(1-c), x*y*(1-c) - z*s, x*z*(1-c) + y*s],
                     [y*x*(1-c) + z*s, c + y*y*(1-c), y*z*(1-c) - x*s],
                     [z*x*(1-c) - y*s, z*y*(1-c) + x*s, c + z*z*(1-c)]])

def ypr(yaw=0, pitch=0, roll=0):
    """yaw + = turn to character's left (about +Z); pitch + = lean forward; roll + = lean to character's right."""
    return rot((0, 0, 1), yaw) @ rot((1, 0, 0), pitch) @ rot((0, 1, 0), -roll)

def frame_from(y_axis, ref_local, ref_world, rest_rot):
    """Rotation R (world) with R@[0,1,0] = y_axis and R@ref_local ~ ref_world (ref orthogonalised)."""
    y = nrm(y_axis)
    rw = nrm(ref_world - np.dot(ref_world, y) * y)
    rl = nrm(ref_local - np.dot(ref_local, [0, 1, 0]) * np.array([0, 1, 0]))
    # local frame (Y, rl, Y x rl) -> world frame (y, rw, y x rw)
    Lm = np.stack([np.array([0, 1, 0.]), rl, np.cross([0, 1, 0.], rl)], 1)
    Wm = np.stack([y, rw, np.cross(y, rw)], 1)
    return Wm @ Lm.T

def look_rot(src_dir, dst_dir):
    a = nrm(src_dir); b = nrm(dst_dir); v = np.cross(a, b); c = np.dot(a, b)
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3) if c > 0 else rot(np.cross(a, [1, 0, 0]) if abs(a[0]) < .9 else np.cross(a, [0, 1, 0]), 180)
    return rot(v, np.degrees(np.arctan2(np.linalg.norm(v), c)))

# ---------------------------------------------------------------- sword / grip
# Hand.R local: +y along fingers, +x = palm normal, -z = thumb side.
SWORD_SCALE = 0.85            # 1.2 m model -> 1.02 m
BLADE_START = (0.445 - 0.245) * SWORD_SCALE   # canonical y where the blade leaves the guard (grip at 0)
BLADE_LEN_SCALE = 1.5
BLADE_WIDTH_SCALE = 1.25
BLADE_THICK_SCALE = 1.10
SWORD_LEN = 0.245 * SWORD_SCALE + BLADE_START + ((1.199 - 0.245) * SWORD_SCALE - BLADE_START) * BLADE_LEN_SCALE
GRIP_FROM_POMMEL = 0.245 * SWORD_SCALE   # where the fist sits along the sword (pommel -> tip)
_b_h = nrm([0, 0.33, -1.0])            # blade axis in hand space (thumb side, tilted to index finger)
_e_h = nrm(np.array([0, 1.0, 0]) - np.dot([0, 1.0, 0], _b_h) * _b_h)   # edge -> knuckles
_f_h = np.cross(_e_h, _b_h)
R_SWORD_IN_HAND = np.stack([_e_h, _b_h, _f_h], 1)   # columns: edge, blade, flat  (sword canonical frame in hand space)
GRIP_IN_HAND = np.array([0.028, 0.082, -0.004])      # grip axis point inside the fist, hand-local

def sword_frame(blade_dir_w, edge_hint_w):
    b = nrm(blade_dir_w); e = nrm(edge_hint_w - np.dot(edge_hint_w, b) * b); f = np.cross(e, b)
    return np.stack([e, b, f], 1)

# ---------------------------------------------------------------- rig
class HeroRig:
    def __init__(self, path='/home/claude/work/hero.json'):
        H = json.load(open(path))
        self.rig = Rig(H['armatures']['Hero_65_Skeleton'])
        self.bones = [b['name'] for b in self.rig.bones]
        A = self.rig.arm
        self.rest_rot = {n: A[n][:3, :3] for n in self.bones}
        self.head = {n: A[n][:3, 3] for n in self.bones}
        self.tail = {b['name']: np.array(b['tail']) for b in self.rig.bones}
        self.L = self.rig.length
        def hinge(a, b):
            h = nrm(np.cross(A[a][:3, 1], A[b][:3, 1]))
            return A[a][:3, :3].T @ h, A[b][:3, :3].T @ h
        self.hinge = {}
        for s in 'LR':
            self.hinge['arm' + s] = hinge(f'UpperArm.{s}', f'Forearm.{s}')
            self.hinge['leg' + s] = hinge(f'Thigh.{s}', f'Shin.{s}')

    # --------------------------------------------------- core FK bookkeeping
    def begin(self):
        self.pose_m = {}   # name -> 4x4 armature-space pose matrix
        self.basis = {}
    def _parent_frame(self, n):
        p = self.rig.parent[n]
        rel = np.linalg.inv(self.rig.arm[p]) @ self.rig.arm[n] if p else self.rig.arm[n]
        return (self.pose_m[p] @ rel) if p else rel
    def set_world(self, n, R_world, head_world=None):
        PF = self._parent_frame(n)
        M = np.eye(4); M[:3, :3] = R_world
        M[:3, 3] = PF[:3, 3] if head_world is None else head_world
        B = np.linalg.inv(PF) @ M
        self.basis[n] = B; self.pose_m[n] = M
    def set_local(self, n, B=None):
        PF = self._parent_frame(n)
        B = np.eye(4) if B is None else B
        self.basis[n] = B; self.pose_m[n] = PF @ B
    def world_rot(self, n): return self.pose_m[n][:3, :3]
    def world_head(self, n): return self.pose_m[n][:3, 3]
    def world_tail(self, n): return (self.pose_m[n] @ np.array([0, self.L[n], 0, 1]))[:3]
    def rest_follow(self, n):
        """world rotation the bone would have with identity basis."""
        return self._parent_frame(n)[:3, :3]

    # --------------------------------------------------- IK
    def two_bone(self, a, b, root, target, pole_dir, hinge_key, stretch_warn):
        L1, L2 = self.L[a], self.L[b]
        d = target - root; D = np.linalg.norm(d)
        Lmax = L1 + L2; soft = 0.035 * Lmax; s0 = Lmax - soft
        if D > Lmax: stretch_warn.append((a, D - Lmax))
        if D > s0:   # soft IK: approach full extension asymptotically -> no knee/elbow snapping
            De = s0 + soft * (1 - np.exp(-(D - s0) / soft))
            d = d / D * De; D = De
        D = max(D, abs(L1 - L2) + 1e-3)
        ca = (L1**2 + D**2 - L2**2) / (2 * L1 * D); ca = np.clip(ca, -1, 1)
        dn = d / D
        pole = nrm(pole_dir - np.dot(pole_dir, dn) * dn)
        elbow = root + dn * L1 * ca + pole * L1 * np.sqrt(1 - ca**2)
        wrist = root + d
        n = nrm(np.cross(elbow - root, wrist - elbow))
        if np.linalg.norm(np.cross(elbow - root, wrist - elbow)) < 1e-6:
            n = nrm(np.cross(dn, pole))
        hl_a, hl_b = self.hinge[hinge_key]
        Ra = frame_from(elbow - root, hl_a, n, None)
        Rb = frame_from(wrist - elbow, hl_b, n, None)
        return Ra, Rb, elbow, wrist

    # --------------------------------------------------- full pose
    def solve(self, c, warn=None):
        """c: dict of controls (see attacks.py). Returns basis dict and pose matrices."""
        warn = [] if warn is None else warn
        self.begin()
        self.sword_roll = 0.0; self.sword_vis = float(c.get('sword_vis', 1.0))
        self.set_local('Root')
        # hips
        hp = self.head['Hips'] + Wd(c['hips_off'])
        Rh = ypr(*c['hips_rot'])
        self.set_world('Hips', Rh @ self.rest_rot['Hips'], hp)
        # spine distribution
        sy, sp, sr = c['spine_rot']
        shares = {'Spine': 0.3, 'Chest': 0.35, 'UpperChest': 0.35}
        for n in shares:
            k = self._cum(n, shares)
            acc = Rh @ ypr(sy * k, sp * k, sr * k)
            self.set_world(n, acc @ self.rest_rot[n])
        Rchest = acc
        # neck / head : aim at look target (char yaw/pitch), split 40/60
        hy, hpch, hr = c.get('head_rot', (0, 0, 0))
        tot_y = sy + c['hips_rot'][0]; tot_p = sp + c['hips_rot'][1]; tot_r = sr + c['hips_rot'][2]
        # desired head orientation in world = ypr(hy, hpch, hr); neck takes 40% of the correction
        Rhead_des = ypr(hy, hpch, hr)
        Rn = self._slerp_rot(Rchest, Rhead_des, 0.45)
        self.set_world('Neck', Rn @ self.rest_rot['Neck'])
        self.set_world('Head', Rhead_des @ self.rest_rot['Head'])
        # clavicles (auto shrug/protract) + arms
        for s, sign in (('R', 1), ('L', -1)):
            key = 'sword' if s == 'R' else 'lhand'
            self.set_world(f'Clavicle.{s}', Rchest @ self.rest_rot[f'Clavicle.{s}'])
            fkp = c.get('fk' + s)
            if fkp is not None:
                from armfk import arm_fk
                _, _, _, _, wrist_t = arm_fk(self, s, fkp, self.world_tail(f'Clavicle.{s}'))
                Rhand = None
            elif s == 'R':
                G = W(c['grip']); bdir = Wd(c['blade']); ehint = Wd(c['edge'])
                Rs = sword_frame(bdir, ehint)
                Rhand = Rs @ R_SWORD_IN_HAND.T
                wrist_t = G - Rhand @ GRIP_IN_HAND
            elif 'lhand_w' in c:
                wrist_t = np.array(c['lhand_w'], float); Rhand = None
            else:
                # left hand is authored relative to the torso: rotate about the body centre by the torso yaw
                yaw_t = c['hips_rot'][0] + c['spine_rot'][0]
                lp = np.array(c['lhand'], float)
                hipsc = np.array(c['hips_off'], float)
                wrist_t = W(np.r_[hipsc[:2], 0] + (ypr(yaw_t, 0, 0) @ np.array([lp[0], lp[1], 0])) * np.array([1, 1, 0]) + np.array([0, 0, lp[2] + hipsc[2] * 0.6]))
                Rhand = None
            # clavicle: rotate toward target a bit (elevation & protraction)
            clav = f'Clavicle.{s}'
            ch = self.world_head(clav); tip0 = self.world_tail(clav)
            to_t = wrist_t - tip0
            elev = np.degrees(np.arctan2(to_t[2], np.linalg.norm(to_t[:2])))
            fwd = np.dot(nrm(to_t), Rchest @ np.array([0, -1, 0]))
            up_ang = np.clip((elev + 10) * 0.28, -6, 22)
            pro_ang = np.clip(fwd * 12, -8, 12)
            # axis: chest forward (for elevation) and chest up (for protraction)
            cf = Rchest @ np.array([0, -1, 0]); cu = Rchest @ np.array([0, 0, 1])
            Rc = rot(cf, -up_ang * sign) @ rot(cu, -pro_ang * sign)
            self.set_world(clav, Rc @ Rchest @ self.rest_rot[clav])
            sh = self.world_tail(clav)
            reach = (self.L[f'UpperArm.{s}'] + self.L[f'Forearm.{s}']) * 0.985
            if np.linalg.norm(wrist_t - sh) > reach:
                wrist_t = sh + nrm(wrist_t - sh) * reach
            if fkp is not None:
                Ra, Rb, Rhand, el, wr = arm_fk(self, s, fkp, sh)
                if s == 'R': self.sword_roll = float(fkp.get('roll', 0.0))
                self.set_world(f'UpperArm.{s}', Ra); self.set_world(f'Forearm.{s}', Rb); self.set_world(f'Hand.{s}', Rhand)
                for tw, tgt in ((f'ForearmTwist.{s}', f'Hand.{s}'), (f'UpperArmTwist.{s}', f'Forearm.{s}')):
                    self.set_local(tw, self._roty4(0.5 * self._local_y_euler(tgt)))
                continue
            pole = Wd(c['relbow' if s == 'R' else 'lelbow'])
            if s == 'L':
                pole = ypr(c['hips_rot'][0] + c['spine_rot'][0], 0, 0) @ pole
            Ra, Rb, el, wr = self.two_bone(f'UpperArm.{s}', f'Forearm.{s}', sh, wrist_t, pole, 'arm' + s, warn)
            if s == 'R' and 'arm3' in c:
                from armsolve import arm3_pose
                Ra, Rb, Rhand = arm3_pose(self, c)
            elif s == 'R' and 'arm_x' in c:
                from armsolve import arm_override
                Ra, Rb, Rhand = arm_override(self, c)
            if s == 'L' and 'lelbow_w' in c:
                Ra, Rb, el, wr = self.two_bone('UpperArm.L', 'Forearm.L', sh, wrist_t, np.array(c['lelbow_w']), 'armL', warn)
            self.set_world(f'UpperArm.{s}', Ra)
            self.set_world(f'Forearm.{s}', Rb)
            if Rhand is None:
                # relaxed hand: follow forearm with slight extension; optional fist curl via lhand_rot (pitch about hinge)
                Rhand = Rb @ np.linalg.inv(self.rest_rot[f'Forearm.{s}']) @ self.rest_rot[f'Hand.{s}']
                Rhand = rot(Rb @ self.hinge['arm' + s][1], c.get('lhand_bend', 10) * -1) @ Rhand
            self.set_world(f'Hand.{s}', Rhand)
            # twist bones: emulate copy-rotation Y 0.5 (local) — leave basis identity for Blender, constraint does it
            for tw, tgt in ((f'ForearmTwist.{s}', f'Hand.{s}'), (f'UpperArmTwist.{s}', f'Forearm.{s}')):
                yrot = self._local_y_euler(tgt)
                self.set_local(tw, self._roty4(0.5 * yrot))
        # legs
        for s in 'LR':
            fc = c['foot' + s]
            Rf, ankle, Rtoe = self._foot(s, fc)
            hipj = self._parent_frame(f'Thigh.{s}')[:3, 3]
            # knee pole: forward along foot yaw + slight outward
            yaw = fc['yaw']; side = -1 if s == 'R' else 1
            kp = ypr(yaw + fc.get('knee_out', 8) * side, 0, 0) @ np.array([0, -1, 0])
            Ra, Rb, kn, an = self.two_bone(f'Thigh.{s}', f'Shin.{s}', hipj, ankle, kp, 'leg' + s, warn)
            self.set_world(f'Thigh.{s}', Ra)
            self.set_world(f'Shin.{s}', Rb)
            self.set_world(f'Foot.{s}', Rf)
            self.set_world(f'Toe.{s}', Rtoe)
            for tw, tgt in ((f'ShinTwist.{s}', f'Foot.{s}'), (f'ThighTwist.{s}', f'Shin.{s}')):
                self.set_local(tw, self._roty4(0.5 * self._local_y_euler(tgt)))
        # belt / robes / cape: placeholder identity (secondary pass sets later)
        for n in self.bones:
            if n not in self.pose_m:
                self.set_local(n, c.get('extra_basis', {}).get(n))
        return warn

    def _cum(self, n, shares):
        s = 0
        for k, v in shares.items():
            s += v
            if k == n: return s
    def _slerp_rot(self, A, B, t):
        qa = mat_to_quat(A); qb = mat_to_quat(B)
        if np.dot(qa, qb) < 0: qb = -qb
        q = nrm(qa * (1 - t) + qb * t)
        return quat_to_mat(q)
    def _uparm_head(self, s):
        return self.world_tail(f'Clavicle.{s}')
    def _local_y_euler(self, n):
        R = self.basis[n][:3, :3]
        # XYZ euler (Blender): R = Rz Ry Rx ; y = asin(-R[2,0])
        return np.degrees(np.arcsin(np.clip(-R[2, 0], -1, 1)))
    def _roty4(self, deg):
        M = np.eye(4); M[:3, :3] = rot((0, 1, 0), deg); return M

    def _foot(self, s, fc):
        """fc: ball (r,f) on ground, yaw, heel (deg heel lift about ball), lift (m), pitch (deg toe-down in air)."""
        ball_rest = self.head[f'Toe.{s}']; ankle_rest = self.head[f'Foot.{s}']
        Rf0 = self.rest_rot[f'Foot.{s}']; Rt0 = self.rest_rot[f'Toe.{s}']
        r, f = fc['ball']
        ball = W((r, f, ball_rest[2] + fc.get('lift', 0.0)))
        Y = ypr(fc['yaw'], 0, 0)
        fwd = Y @ np.array([0, -1, 0]); side = np.cross(fwd, [0, 0, 1])
        heel = fc.get('heel', 0.0); pitch = fc.get('pitch', 0.0)
        Rpitch = rot(side, -(heel + pitch))   # positive heel -> heel up (toe down relative)
        Rf = Rpitch @ Y @ Rf0
        ankle = ball + Rpitch @ Y @ (ankle_rest - ball_rest)
        # toe stays flat when heel lifts on ground (counter-rotate), follows foot when pitching in air
        Rt = rot(side, -pitch * 0.6) @ Y @ Rt0
        return Rf, ankle, Rt


def reshape_blade(Sc):
    """Sc: canonical sword verts (x edge, y from grip, z flat). Lengthen/widen only the blade."""
    Sc = np.array(Sc, float); y = Sc[:, 1]
    s = np.clip((y - BLADE_START) / 0.05, 0, 1); s = s * s * (3 - 2 * s)
    out = Sc.copy()
    out[:, 1] = np.where(y > BLADE_START, BLADE_START + (y - BLADE_START) * BLADE_LEN_SCALE, y)
    out[:, 0] = Sc[:, 0] * (1 + (BLADE_WIDTH_SCALE - 1) * s)
    out[:, 2] = Sc[:, 2] * (1 + (BLADE_THICK_SCALE - 1) * s)
    return out
