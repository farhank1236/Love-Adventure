"""v6 clip set = v5 clips + horse riding (Mount, Dismount, RideIdle, RideWalk, RideGallop), the left-portal sword draw
(Summon / Dismiss replaced) and the 30 s idle (IdleBall: ball, portals and speech cues as tracks)."""
import sys, copy, pickle; sys.path.insert(0, '/home/claude/tools')
from ride5 import *
import fun5 as F5
W_ = '/home/claude/work/'
D = pickle.load(open(W_ + 'clips_v5.pkl', 'rb'))
CL = D['clips']; meta = D['meta']; extra = meta.setdefault('extra', {})
def put(name, R_, **ex):
    CL[name] = dict(bones=R_['bones'], arr=R_['arr'], fx=R_['fx'], aura=R_['aura'])
    D.setdefault('cs', {})[name] = R_['cs']
    if ex: extra[name] = ex
    print(name, len(R_['arr']), flush=True)
guard = start_state()
# ---- sword from the left portal
keys, n, (pc, pn, opens) = F5.summon(guard)
cs = sample(Timeline(idle0, keys, n), auto_edge=False)
R_ = finish(cs, preroll_cs=[L3.idle_unarmed_ctrl(i) for i in range(30)]); R_['fx'][:, 6] = F5.portal_track(len(R_['fx']), pc, pn, opens)
put('Hero_Sword_Summon', R_, portal='left')
keys, n, (pc, pn, opens) = F5.dismiss(guard)
cs = sample(Timeline(guard, keys, n), auto_edge=False)
R_ = finish(cs, preroll_cs=[sword_idle(i) for i in range(30)]); R_['fx'][:, 6] = F5.portal_track(len(R_['fx']), pc, pn, opens)
put('Hero_Sword_Dismiss', R_, portal='left')
# ---- riding
keys, n = mount_keys(); start = keys[0][1]
cs = sample(Timeline(start, [(0, {})] + keys[1:], n), auto_edge=False)
put('Hero_Mount', with_horse(lambda: finish(cs, preroll_cs=[copy.deepcopy(start) for _ in range(20)])))
keys, n, rb = dismount_keys()
cs = sample(Timeline(rb, keys, n), auto_edge=False)
put('Hero_Dismount', with_horse(lambda: finish(cs, preroll_cs=[copy.deepcopy(rb) for _ in range(20)])))
ri = ride_idle(60); put('Hero_Ride_Idle', with_horse(lambda: cyc(lambda i: copy.deepcopy(ri[i % 60]), 60, cycles=2)))
rw = ride_walk(30); put('Hero_Ride_Walk', with_horse(lambda: with_wind(lambda: cyc(lambda i: copy.deepcopy(rw[i % 30]), 30, cycles=3), (0, 0.35, 0.05))))
rg = ride_gallop(25); put('Hero_Ride_Gallop', with_horse(lambda: with_wind(lambda: cyc(lambda i: copy.deepcopy(rg[i % 25]), 25, cycles=4), (0, 2.2, 0.5))))
# ---- idle fun
cs, n, ball, vis, portals, talk = F5.idle_ball()
R_ = finish(cs, preroll_cs=[L3.idle_unarmed_ctrl(i) for i in range(30)])
put('Hero_Idle_Ball', R_, ball=ball.tolist(), ballVis=vis.tolist(), portals=[dict(center=list(map(float, c)), normal=list(map(float, nn)), opens=o) for c, nn, o in portals], talk=talk)
meta['ride'] = dict(origin_horse=[0, 0, Z0], gltf_root_in_horse=[0, 0, Z0 - 0.27], mount_spot=[-R0, 0, F0 + Z0], mount_face=[-1, 0, 0])
pickle.dump(D, open(W_ + 'clips_v6.pkl', 'wb'))
print('saved clips_v6', len(CL))
