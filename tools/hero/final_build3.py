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

out = {}
guard = start_state()
# ---------------- sword idle (guard breathing)
def sword_idle(i, n=60):
    ph = i / n; b = np.sin(2 * np.pi * ph)
    c = copy.deepcopy(guard)
    c['hips_off'] = (0, 0.05, -0.07 - 0.006 * (1 - np.cos(2 * np.pi * ph)) / 2)
    c['spine_rot'] = (8, 5 + 1.2 * b, 0); c['head_rot'] = (-3 + 1.0 * b, 3, 0)
    c['fkR'] = dict(guard['fkR'], elb=guard['fkR']['elb'] + 2.5 * b)
    c['fkL'] = dict(guard['fkL'], elb=guard['fkL']['elb'] - 2.0 * b)
    return c
out['Hero_Sword_Idle'] = cyc(sword_idle, 60)
print('sword idle', flush=True)
# ---------------- attacks (whole combo designed, sampled, sprung, rolled, simulated, then sliced)
allk = A3.build_keys(); st = guard; xp = guard['fkR']; combo = []; bounds = [0]
for name, keys, n in allk:
    k2, end, xp = design_clip(st, keys, n, x_prev=xp)
    cs = sample(Timeline(st, k2, n), auto_edge=False)
    combo += [copy.deepcopy(c) for c in (cs if not combo else cs[1:])]; bounds.append(len(combo) - 1)
    st = end
lead = [sword_idle(i) for i in range(60)]
full = left_spring(lead + combo)
full, th, _ = apply_roll(full)
full = simulate_secondary2(HR, full, preroll=10)
combo = full[len(lead):]
R = finish(combo, sim=False)
out['Hero_Attack_Combo'] = R
for i, (name, keys, n) in enumerate(allk):
    a, b_ = bounds[i], bounds[i + 1] + 1
    out['Hero_' + name] = dict(bones=R['bones'], arr=R['arr'][a:b_].copy(), fx=R['fx'][a:b_].copy(), cs=R['cs'][a:b_], aura=R['aura'][a:b_])
print('attacks', flush=True)
# ---------------- locomotion loops
out['Hero_Idle'] = cyc(L3.idle_unarmed_ctrl, L3.IDLE_U_LEN)
out['Hero_Walk'] = cyc(L3.walk_unarmed_ctrl, LM.WALK['frames'])
out['Hero_Run'] = cyc(L3.run_unarmed_ctrl, LM.RUN['frames'], cycles=4)
out['Hero_Combat_Walk'] = cyc(lambda i: L3.combat_walk_ctrl(i, guard), L3.CWALK['frames'])
out['Hero_Battle_Run'] = cyc(L3.battle_run_ctrl, LM.RUN['frames'], cycles=4)
print('loops', flush=True)
# ---------------- jump (unarmed)
def jump(with_h):
    cs = sample(Timeline(L3.jump_start_state(), L3.jump_unarmed_keys(), L3.JUMP_LEN), auto_edge=False)
    if with_h:
        for f, c in enumerate(cs):
            h = L3.root_height(f)
            c['hips_off'] = (c['hips_off'][0], c['hips_off'][1], c['hips_off'][2] + h)
            for s in 'LR':
                d = dict(c['foot' + s]); d['lift'] = d.get('lift', 0) + h; c['foot' + s] = d
    return finish(cs, preroll_cs=[copy.deepcopy(cs[0]) for _ in range(20)])
J = jump(True); out['Hero_Jump'] = J
Ji = jump(False)
def sl(D, a, b): return dict(bones=D['bones'], arr=D['arr'][a:b].copy(), fx=D['fx'][a:b].copy(), cs=D['cs'][a:b], aura=D['aura'][a:b])
out['Hero_Jump_Start'] = sl(Ji, 0, L3.JUMP_TAKEOFF + 4)
out['Hero_Jump_Land'] = sl(Ji, L3.JUMP_LAND - 2, len(Ji['arr']))
seg = sl(Ji, 18, 27); idx = list(range(9)) + list(range(7, 0, -1)) + [0]
out['Hero_Jump_Air'] = dict(bones=seg['bones'], arr=seg['arr'][idx], fx=seg['fx'][idx], cs=[seg['cs'][i] for i in idx], aura=[0] * len(idx))
print('jump', flush=True)
# ---------------- summon / dismiss
idle0 = L3.idle_unarmed_ctrl(0)
cs = sample(Timeline(idle0, L3.summon_keys(guard), L3.SUMMON_LEN), auto_edge=False)
out['Hero_Sword_Summon'] = finish(cs, preroll_cs=[L3.idle_unarmed_ctrl(i) for i in range(30)])
cs = sample(Timeline(guard, L3.dismiss_keys(guard, idle0), L3.DISMISS_LEN), auto_edge=False)
out['Hero_Sword_Dismiss'] = finish(cs, preroll_cs=[sword_idle(i) for i in range(30)])
print('summon/dismiss', flush=True)
meta = dict(hits={'Hero_' + k: v for k, v in A3.HIT_FRAMES.items()}, bounds=bounds,
            speeds=dict(walk=LM.WALK['speed'], run=LM.RUN['speed'], combat_walk=L3.CWALK['speed'], battle_run=LM.RUN['speed']),
            fx_bones=FX_BONES)
pickle.dump(dict(clips={k: dict(bones=v['bones'], arr=v['arr'], fx=v['fx'], aura=v['aura']) for k, v in out.items()}, meta=meta,
                 cs={k: v['cs'] for k, v in out.items()}), open('/home/claude/work/clips_v3.pkl', 'wb'))
print({k: len(v['arr']) for k, v in out.items()})
