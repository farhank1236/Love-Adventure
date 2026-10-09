"""v7 clip set = v6 + natural run arms (Run / BattleRun left arm) + real rider motion (RideIdle / RideWalk / RideGallop)."""
import sys, copy, pickle; sys.path.insert(0, '/home/claude/tools')
from lib4 import cyc
import locomotion4 as L4, run7
from ride5 import with_horse, with_wind
import ride7 as R7
W_ = '/home/claude/work/'
D = pickle.load(open(W_ + 'clips_v6.pkl', 'rb')); CL = D['clips']
def put(name, R_): CL[name] = dict(bones=R_['bones'], arr=R_['arr'], fx=R_['fx'], aura=R_['aura']); print(name, len(R_['arr']), flush=True)
run7.PRO = -50.0
n = L4.RUN2['frames']
put('Hero_Run', cyc(run7.run_unarmed7, n, cycles=4))
put('Hero_Battle_Run', cyc(run7.battle_run7, n, cycles=4))
ri = R7.ride_idle7(120); put('Hero_Ride_Idle', with_horse(lambda: cyc(lambda i: copy.deepcopy(ri[i % 120]), 120, cycles=2)))
rw = R7.ride_walk7(30); put('Hero_Ride_Walk', with_horse(lambda: with_wind(lambda: cyc(lambda i: copy.deepcopy(rw[i % 30]), 30, cycles=3), (0, 0.35, 0.05))))
rg = R7.ride_gallop7(25); put('Hero_Ride_Gallop', with_horse(lambda: with_wind(lambda: cyc(lambda i: copy.deepcopy(rg[i % 25]), 25, cycles=4), (0, 2.2, 0.5))))
pickle.dump(D, open(W_ + 'clips_v7.pkl', 'wb')); print('saved clips_v7')
