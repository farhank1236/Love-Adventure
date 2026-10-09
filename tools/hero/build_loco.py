import sys, pickle, copy; sys.path.insert(0, '/home/claude/tools')
from run import *
import locomotion as LM
from timeline import Timeline, sample
from armsolve import solve_sword_arm_v3, left_arm_dynamics
from secondary import simulate_secondary2
from bake import bake

def cycle_clip(gen, n, cycles=3):
    cs = [gen(i) for i in range(n * cycles + 1)]
    cs, _ = solve_sword_arm_v3(HR, cs)
    cs = left_arm_dynamics(HR, cs, k_fwd=0, k_out=0, k_up=0, freq=2.6, zeta=0.6)
    cs = simulate_secondary2(HR, cs, preroll=10)
    last = cs[n * (cycles - 1): n * cycles + 1]
    bones, arr = bake(HR, last, cyclic=True)
    arr[-1] = arr[0]
    return last, bones, arr

def jump_clip(with_height=True):
    J = LM.jump_keys()
    cs = sample(Timeline(LM._relaxed(), J, LM.JUMP_LEN), auto_edge=False)
    if with_height:
        for f, c in enumerate(cs):
            h = LM.root_height(f)
            c['hips_off'] = (c['hips_off'][0], c['hips_off'][1], c['hips_off'][2] + h)
            c['grip'] = (c['grip'][0], c['grip'][1], c['grip'][2] + h)
            for s in 'LR':
                d = dict(c['foot' + s]); d['lift'] = d.get('lift', 0) + h; c['foot' + s] = d
    cs, _ = solve_sword_arm_v3(HR, cs)
    cs = left_arm_dynamics(HR, cs, k_fwd=0, k_out=0, k_up=0, freq=2.4, zeta=0.65)
    cs = simulate_secondary2(HR, cs, preroll=20)
    bones, arr = bake(HR, cs)
    return cs, bones, arr

if __name__ == '__main__':
    what = sys.argv[1]
    if what == 'walk': cs, b, a = cycle_clip(LM.walk_ctrl, LM.WALK['frames'])
    elif what == 'run': cs, b, a = cycle_clip(LM.run_ctrl, LM.RUN['frames'], cycles=4)
    elif what == 'jump': cs, b, a = jump_clip(True)
    elif what == 'jump_inplace': cs, b, a = jump_clip(False)
    pickle.dump((cs, b, a), open(f'/home/claude/work/loco_{what}.pkl', 'wb'))
    print(what, a.shape, 'speed walk %.2f run %.2f' % (LM.WALK['speed'], LM.RUN['speed']))
