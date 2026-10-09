import sys, pickle; sys.path.insert(0, '/home/claude/tools')
from lib4 import *
import locomotion4 as L4, importlib
D = pickle.load(open('/home/claude/work/clips_v3.pkl', 'rb'))
n = L4.RUN2['frames']
D['clips']['Hero_Run'] = cyc(L4.run_unarmed2, n, cycles=4)
D['clips']['Hero_Battle_Run'] = cyc(L4.battle_run2, n, cycles=4)
for k in ('Hero_Run', 'Hero_Battle_Run'):
    v = D['clips'][k]; D['clips'][k] = dict(bones=v['bones'], arr=v['arr'], fx=v['fx'], aura=v['aura'])
pickle.dump(D, open('/home/claude/work/try_run.pkl', 'wb')); print('speed', L4.RUN2['speed'])
