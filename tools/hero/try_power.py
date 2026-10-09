import sys, pickle; sys.path.insert(0, '/home/claude/tools')
from lib4 import *
import power4 as P4
D = pickle.load(open(sys.argv[1], 'rb'))
k2, end, xp = design_clip(guard, P4.keys(P4.POWER), P4.POWER_LEN, x_prev=guard['fkR'])
cs = sample(Timeline(guard, k2, P4.POWER_LEN), auto_edge=False)
lead = [sword_idle(i) for i in range(60)]
full = left_spring(lead + cs); full, th, _ = apply_roll(full)
full = simulate_secondary2(HR, full, preroll=10)
R_ = finish(full[len(lead):], sim=False)
D['clips']['Hero_Power_Up'] = dict(bones=R_['bones'], arr=R_['arr'], fx=R_['fx'], aura=R_['aura'])
D.setdefault('cs', {})['Hero_Power_Up'] = R_['cs']; D['meta']['power_burst'] = P4.POWER_BURST
pickle.dump(D, open(sys.argv[2], 'wb')); print('power-up frames', len(R_['arr']))
