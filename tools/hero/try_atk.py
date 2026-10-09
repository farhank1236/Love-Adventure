import sys, pickle; sys.path.insert(0, '/home/claude/tools')
from lib4 import *
import attacks4 as A4
D = pickle.load(open(sys.argv[1] if len(sys.argv) > 1 else '/home/claude/work/try_run.pkl', 'rb'))
for name, seq, n in (('Hero_Attack_Low', A4.LOW, A4.LOW_LEN), ('Hero_Attack_Up', A4.UP, A4.UP_LEN)):
    print(name, flush=True)
    k2, end, xp = design_clip(guard, A4.keys(seq), n, x_prev=guard['fkR'])
    cs = sample(Timeline(guard, k2, n), auto_edge=False)
    lead = [sword_idle(i) for i in range(60)]
    full = left_spring(lead + cs); full, th, _ = apply_roll(full)
    full = simulate_secondary2(HR, full, preroll=10)
    R_ = finish(full[len(lead):], sim=False)
    D['clips'][name] = dict(bones=R_['bones'], arr=R_['arr'], fx=R_['fx'], aura=R_['aura'])
    D.setdefault('cs', {})[name] = R_['cs']
pickle.dump(D, open('/home/claude/work/try_atk.pkl', 'wb'))
