"""v4 clip set = v3 clips unchanged + re-authored Run / Battle_Run (game-speed, natural) + AttackLow / AttackUp + Dodge rolls."""
import subprocess, pickle, sys
sys.path.insert(0, '/home/claude/tools')
W = '/home/claude/work/'
subprocess.run(['python3', 'try_run.py'], check=True, cwd='/home/claude/tools')
subprocess.run(['python3', 'try_atk.py', W + 'try_run.pkl'], check=True, cwd='/home/claude/tools')
subprocess.run(['python3', 'try_dodge.py', W + 'try_atk.pkl'], check=True, cwd='/home/claude/tools')
import locomotion4 as L4, attacks4 as A4
D = pickle.load(open(W + 'try_dodge.pkl', 'rb'))
m = D['meta']
m['speeds']['run'] = L4.RUN2['speed']; m['speeds']['battle_run'] = L4.RUN2['speed']
m['hits']['Hero_Attack_Low'] = A4.LOW_HITS; m['hits']['Hero_Attack_Up'] = A4.UP_HITS
old = pickle.load(open(W + 'clips_v3.pkl', 'rb'))
changed = {'Hero_Run', 'Hero_Battle_Run', 'Hero_Attack_Low', 'Hero_Attack_Up', 'Hero_Dodge', 'Hero_Dodge_Sword'}
import numpy as np
for k, v in old['clips'].items():
    if k not in changed: assert np.array_equal(v['arr'], D['clips'][k]['arr']), k     # every other clip is byte-identical
pickle.dump(D, open(W + 'clips_v4.pkl', 'wb'))
print('clips', {k: len(v['arr']) for k, v in D['clips'].items()}, '\nspeeds', m['speeds'], '\nhits', m['hits'])
