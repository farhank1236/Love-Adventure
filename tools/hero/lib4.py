import sys, copy, pickle; sys.path.insert(0, '/home/claude/tools')
from run import *
from build3 import design_clip, left_spring, apply_roll, start_state
import attacks3 as A3, locomotion3 as L3, locomotion as LM
from timeline import Timeline, sample, merge
from secondary import simulate_secondary2
from bake import bake, pose_baked
from fx import fx_tracks
from armfk import grip_roll

BLADE_LEN = SWORD_LEN - GRIP_FROM_POMMEL
FX_BONES = ['Sword_Grip', 'Sword_Aura', 'Sword_Ghost1', 'Sword_Ghost2', 'Sword_Ghost3', 'Sword_Ghost4', 'Sword_Portal', 'Fist_Ctrl']

def m2lqs(M):
    s = np.linalg.norm(M[:3, :3], axis=0); R = M[:3, :3] / np.maximum(s, 1e-9)
    if np.linalg.det(R) < 0: R[:, 0] *= -1; s[0] *= -1
    return np.r_[M[:3, 3], mat_to_quat(R), s]

def bake_fx(bones, arr, cs):
    N = len(arr); frames = []; rolls = []
    for i in range(N):
        pose_baked(HR, bones, arr, i)
        roll = cs[i].get('fkR', {}).get('roll', 0.0) if 'fkR' in cs[i] else 0.0
        Rh = HR.world_rot('Hand.R'); g = HR.world_head('Hand.R') + Rh @ GRIP_IN_HAND
        frames.append((Rh @ R_SWORD_IN_HAND @ rot((0, 1, 0), roll), g)); rolls.append(roll)
    tr = fx_tracks(frames, cs, BLADE_LEN)
    out = np.zeros((N, len(FX_BONES), 10), np.float32)
    for i in range(N):
        v = max(cs[i].get('sword_vis', 1.0), 1e-3)
        Mg = np.eye(4); Mg[:3, :3] = rot((0, 1, 0), rolls[i]) @ np.diag([v ** 0.5, v, v ** 0.5])
        out[i, 0] = m2lqs(Mg)
        a = max(tr[i]['aura'], 1e-3)
        Ma = np.eye(4); Ma[:3, :3] = np.diag([a, 1.0 if a > 0.01 else 1e-3, a]); out[i, 1] = m2lqs(Ma)
        for k in range(4): out[i, 2 + k] = m2lqs(tr[i]['ghosts'][k])
        out[i, 6] = m2lqs(tr[i]['portal'])
        out[i, 7] = np.r_[cs[i].get('fistR', 1.0), 0, cs[i].get('fistL', 0.55), 1, 0, 0, 0, 1, 1, 1]
    for j in range(len(FX_BONES)):                       # quaternion continuity
        for i in range(1, N):
            if np.dot(out[i, j, 3:7], out[i - 1, j, 3:7]) < 0: out[i, j, 3:7] *= -1
    return out, tr

def finish(cs, cyclic=False, sim=True, preroll_cs=None):
    if sim:
        seq = (preroll_cs or []) + cs
        for c in seq: c.pop('extra_basis', None)
        seq = simulate_secondary2(HR, seq, preroll=10)
        cs = seq[len(preroll_cs or []):]
    b, a = bake(HR, cs, cyclic=cyclic)
    if cyclic: a[-1] = a[0]
    fx, tr = bake_fx(b, a, cs)
    if cyclic: fx[-1] = fx[0]
    return dict(bones=b, arr=a, fx=fx, cs=cs, aura=[t['aura'] for t in tr])

def cyc(gen, n, cycles=3, roll=False):
    cs = [gen(i) for i in range(n * cycles + 1)]
    cs = simulate_secondary2(HR, cs, preroll=10)
    last = [copy.deepcopy(c) for c in cs[n * (cycles - 1):]]
    return finish(last, cyclic=True, sim=False)


guard = start_state()
def sword_idle(i, n=60):
    ph = i / n; b = np.sin(2 * np.pi * ph)
    c = copy.deepcopy(guard)
    c['hips_off'] = (0, 0.05, -0.07 - 0.006 * (1 - np.cos(2 * np.pi * ph)) / 2)
    c['spine_rot'] = (8, 5 + 1.2 * b, 0); c['head_rot'] = (-3 + 1.0 * b, 3, 0)
    c['fkR'] = dict(guard['fkR'], elb=guard['fkR']['elb'] + 2.5 * b)
    c['fkL'] = dict(guard['fkL'], elb=guard['fkL']['elb'] - 2.0 * b)
    return c
