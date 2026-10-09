"""Horse clips: per-frame local bone rotations + root offset (horse space, +z forward).
Legs: hoof trajectories (planted in stance, arc in swing) -> pastern / cannon angles -> 2-bone IK for the upper pair.
Clips: Idle (breathing, head and tail), Walk (4-beat), Gallop (transverse, suspension), Rear (summon flourish)."""
import numpy as np, sys
sys.path.insert(0, '/home/claude/horse')
from hskel import NAMES, HEAD, TAIL, PARENT
from pose import rx, ry, rz, euler

def nrm(v): v = np.asarray(v, float); return v / (np.linalg.norm(v) + 1e-12)
def arc(a, b):
    """shortest-arc rotation taking unit a to unit b"""
    a = nrm(a); b = nrm(b); v = np.cross(a, b); c = np.dot(a, b)
    if np.linalg.norm(v) < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * (1 / (1 + c))
LEG = {}
for s in 'LR':
    LEG['F' + s] = ['Humerus.' + s, 'Forearm.' + s, 'FCannon.' + s, 'FPastern.' + s]
    LEG['H' + s] = ['Thigh.' + s, 'Gaskin.' + s, 'HCannon.' + s, 'HPastern.' + s]
REST_DIR = {b: nrm(TAIL[b] - HEAD[b]) for b in NAMES}
LEN = {b: np.linalg.norm(TAIL[b] - HEAD[b]) for b in NAMES}

class Pose:
    def __init__(self):
        self.R = {b: np.eye(3) for b in NAMES}; self.root = np.zeros(3)
    def fk(self):
        G = {}
        for b in NAMES:
            p = PARENT[b]; L = np.eye(4); L[:3, :3] = self.R[b]
            L[:3, 3] = HEAD[b] - (HEAD[p] if p else 0) + (self.root if p is None else 0)
            G[b] = G[p] @ L if p else L
        return G

def solve_leg(pose, key, hoof, pastern_pitch, cannon_pitch, bend):
    """hoof: target point of the hoof bottom (horse space). pitches: degrees added to the rest angles (about +x).
    bend: +1 knee joint goes forward (hind stifle), -1 backward (front elbow)."""
    A, B, Cn, D = LEG[key]
    G = pose.fk()
    # world rotations so far for the parent of A
    PA = G[PARENT[A]][:3, :3]
    j0 = G[A][:3, 3]
    # pastern and cannon directions (pointing down the leg: head->tail)
    dD = rx(pastern_pitch) @ REST_DIR[D]; dC = rx(cannon_pitch) @ REST_DIR[Cn]
    fet = hoof - dD * LEN[D]; knee = fet - dC * LEN[Cn]
    # 2-bone IK j0 -> mid -> knee (sagittal plane, lateral axis = x)
    l1, l2 = LEN[A], LEN[B]; d = knee - j0; dist = np.linalg.norm(d)
    dist_c = min(dist, (l1 + l2) * 0.999); dhat = d / dist
    a = (l1 ** 2 - l2 ** 2 + dist_c ** 2) / (2 * dist_c); h = np.sqrt(max(l1 ** 2 - a ** 2, 0))
    side = np.cross([1, 0, 0], dhat)          # in the sagittal plane, perpendicular to dhat (points +z when dhat is down)
    side = nrm(side) * (-1 if np.dot(side, [0, 0, 1]) < 0 else 1)
    mid = j0 + dhat * a + side * h * bend
    dirs = {A: nrm(mid - j0), B: nrm(knee - mid), Cn: dC, D: dD}
    Rp = PA
    for b in (A, B, Cn, D):
        Rg = arc(REST_DIR[b], dirs[b]) if b in (A, B) else arc(REST_DIR[b], dirs[b])
        pose.R[b] = Rp.T @ Rg; Rp = Rg
    return dist > (l1 + l2)

def smooth(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)

def gait_frame(t, P):
    """t in [0,1) cycle phase. P: gait params."""
    pose = Pose()
    ph = 2 * np.pi * t
    # ---- body
    bob = sum(a * np.cos(k * ph + o) for k, a, o in P['bob'])
    pitch = sum(a * np.cos(k * ph + o) for k, a, o in P['pitch'])
    roll = sum(a * np.cos(k * ph + o) for k, a, o in P.get('roll', []))
    pose.root = np.array([0, bob + P.get('y0', 0), 0.0])
    pose.R['Spine'] = rx(pitch + P.get('spine0', 0)) @ rz(roll)
    pose.R['Hips'] = rx(pitch + P.get('hips0', 0) + sum(a * np.cos(k * ph + o) for k, a, o in P.get('hips', []))) @ rz(roll)
    pose.R['Chest'] = rx(sum(a * np.cos(k * ph + o) for k, a, o in P.get('chest', [])))
    neck = P['neck0'] + sum(a * np.cos(k * ph + o) for k, a, o in P['neck'])
    pose.R['Neck1'] = rx(neck); pose.R['Neck2'] = rx(neck * 0.6 + P.get('neck2', 0))
    pose.R['Head'] = rx(P['head0'] + sum(a * np.cos(k * ph + o) for k, a, o in P.get('head', [])))
    # ---- tail: trails the body, lifts with speed
    tl = P['tail0']
    for i, b in enumerate(['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5']):
        lag = ph - 0.7 * (i + 1)
        pose.R[b] = rx((tl if i == 0 else tl * 0.25) + P['tailw'] * np.sin(lag)) @ rz(P['tails'] * np.sin(lag * 0.5 + 0.3 * i))
    # ---- legs
    for key in ('HL', 'HR', 'FL', 'FR'):
        off = P['phase'][key]; p = (t - off) % 1.0; beta = P['duty']
        front = key[0] == 'F'; side = 1 if key[1] == 'L' else -1
        base = HEAD[LEG[key][3]].copy(); base[1] = 0; hoof0 = TAIL[LEG[key][3]].copy(); hoof0[1] = 0.0
        S = P['stride'] * (P['reachF'] if front else P['reachH'])
        zc = hoof0[2] + (P['fwdF'] if front else P['fwdH'])
        if p < beta:                                     # stance: planted, slides back relative to the body
            s = p / beta; z = zc + S * (0.5 - s); y = 0.0
            load = np.sin(np.pi * s)
            pp = (P['pastF'] if front else P['pastH']) * load          # fetlock sinks under load
            cp = (P['canS_F'] if front else P['canS_H']) * (s - 0.5)    # cannon follows the leg sweep a little
        else:                                            # swing: lift, fold, reach
            s = (p - beta) / (1 - beta); e = smooth(s)
            z = zc - S * 0.5 + S * e + (P['flick'] * np.sin(np.pi * s) * (1 - s) if front else 0)
            y = P['lift'] * np.sin(np.pi * s) ** (0.9 if front else 1.2)
            fold = np.sin(np.pi * min(1, s * 1.15)) ** 1.2
            if front:   # knee folds: cannon swings back-up, pastern curls
                cp = P['foldF'] * fold; pp = P['curlF'] * fold
            else:       # hock flexes: cannon swings forward-up under the belly
                cp = -P['foldH'] * fold; pp = P['curlH'] * fold
        if front:   # the shoulder blade swings with the leg (moves the shoulder joint fore/aft)
            sweep = (z - zc) / max(S * 0.5, 1e-3)
            pose.R['Scap.' + key[1]] = rx(-P.get('scap', 0) * np.clip(sweep, -1.2, 1.2))
        hoof = np.array([hoof0[0], y + 0.03 * 0, z])
        hoof[1] = y - bob * 0                                      # ground is fixed; the root bob is in pose.root
        solve_leg(pose, key, hoof - pose.root * 0 + np.array([0, 0, 0]), pp, cp, +1 if not front else -1)
    return pose

WALK = dict(speed=1.8, period=1.0, duty=0.60, stride=0, reachF=1.0, reachH=1.0, fwdF=0.02, fwdH=0.0, scap=16, y0=-0.03,
            phase=dict(HL=0.0, FL=0.25, HR=0.5, FR=0.75), lift=0.13, flick=0.05, foldF=-62, curlF=-48, foldH=38, curlH=-40,
            pastF=-14, pastH=-12, canS_F=6, canS_H=-6,
            bob=[(2, 0.018, 0.4)], pitch=[(2, 0.8, 0.9)], roll=[(1, 1.6, 0.6)], neck0=6, neck=[(2, 4.0, 1.4)], head0=-4, head=[(2, 3, 1.9)],
            tail0=12, tailw=4, tails=7)
GALLOP = dict(speed=15.0, period=0.42, duty=0.21, stride=0, reachF=1.0, reachH=1.0, fwdF=0.04, fwdH=-0.04, scap=26, y0=-0.04,
              phase=dict(HL=0.0, HR=0.10, FL=0.33, FR=0.43), lift=0.36, flick=0.20, foldF=-110, curlF=-70, foldH=55, curlH=-60,
              pastF=-28, pastH=-24, canS_F=18, canS_H=-14,
              bob=[(2, -0.06, -1.51), (1, 0.035, -5.34)], pitch=[(1, 6.0, -3.1416)], hips=[(1, 4.0, -1.2)], chest=[(1, 3.0, -2.6)], spine0=0, hips0=0,
              neck0=14, neck=[(1, 9.0, 3.3)], neck2=-6, head0=-6, head=[(1, 6, 3.9)],
              tail0=40, tailw=10, tails=5)
for P in (WALK, GALLOP): P['stride'] = P['speed'] * P['period'] * P['duty']

def idle_frame(t, T=6.0):
    """t seconds in a 6 s loop: breathing, a slow head dip and lift, ear-flick-like head tilt, tail swish, weight shift."""
    pose = Pose(); w = 2 * np.pi * t / T
    br = np.sin(2 * np.pi * t / 2.0)             # 3 breaths per loop
    pose.root = np.array([0.012 * np.sin(w), 0.006 * br, 0])
    pose.R['Spine'] = rx(0.6 * br) @ rz(0.8 * np.sin(w))
    pose.R['Chest'] = rx(-0.5 * br)
    dip = np.sin(w) ** 2
    pose.R['Neck1'] = rx(5 + 9 * dip) @ ry(4 * np.sin(w + 0.7))
    pose.R['Neck2'] = rx(3 * dip) @ ry(3 * np.sin(w + 1.2))
    pose.R['Head'] = rx(-3 + 6 * dip) @ rz(4 * np.sin(2 * w + 0.4)) @ ry(5 * np.sin(w + 1.6))
    for i, b in enumerate(['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5']):
        sw = np.sin(3 * w - 0.6 * i)
        pose.R[b] = rx(6 if i == 0 else 2) @ rz((10 + 6 * i) * sw * (0.6 + 0.4 * np.sin(w)))
    # planted legs (re-solved because the body sways)
    for key in ('HL', 'HR', 'FL', 'FR'):
        hoof = TAIL[LEG[key][3]].copy(); hoof[1] = 0.0
        solve_leg(pose, key, hoof, 0, 0, +1 if key[0] == 'H' else -1)
    return pose

def rear_frame(t, T=2.4):
    """summon flourish: gather, rear up on the hind legs pawing the air, come down. t in seconds."""
    pose = Pose()
    def env(a, b, c, d, x): return smooth((x - a) / (b - a)) * (1 - smooth((x - c) / (d - c)))
    up = env(0.25, 0.85, 1.55, 2.15, t)
    pitch = -52 * up                                        # nose up (negative x-rot lifts the front)
    # pivot about the hind hooves: lift the root so the hind feet stay planted
    hind_z = TAIL['HPastern.L'][2]
    piv = np.array([0, 0.03, hind_z])
    Rb = rx(pitch)
    pose.R['Spine'] = Rb; pose.R['Hips'] = rx(pitch * 0.85)
    body0 = np.array([0, 1.42, -0.30])                      # spine head
    rotated = piv + Rb @ (body0 - piv)
    pose.root = rotated - body0 + np.array([0, -0.10 * up, 0])
    pose.R['Neck1'] = rx(25 * up + 5) ; pose.R['Neck2'] = rx(10 * up); pose.R['Head'] = rx(18 * up + 6 * np.sin(t * 9) * up)
    for i, b in enumerate(['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5']):
        pose.R[b] = rx((-30 if i == 0 else 6) * up + 4 * np.sin(4 * t - i)) @ rz(10 * np.sin(5 * t - 0.6 * i) * up)
    for key in ('HL', 'HR'):
        hoof = TAIL[LEG[key][3]].copy(); hoof[1] = 0.0; hoof[2] += 0.12 * up
        solve_leg(pose, key, hoof, -10 * up, 0, +1)
    for key, ph in (('FL', 0.0), ('FR', 1.6)):
        G = pose.fk(); sh = G[LEG[key][0]][:3, 3]
        paw = np.sin(t * 7.5 + ph)
        if up > 0.02:
            tgt = sh + np.array([0, -0.75 + 0.12 * paw, 0.35 + 0.22 * paw])
            hoof0 = TAIL[LEG[key][3]].copy(); hoof0[1] = 0
            tgt = hoof0 * (1 - up) + tgt * up
            solve_leg(pose, key, tgt, -60 * up, -95 * up, -1)
        else:
            hoof = TAIL[LEG[key][3]].copy(); hoof[1] = 0
            solve_leg(pose, key, hoof, 0, 0, -1)
    return pose
