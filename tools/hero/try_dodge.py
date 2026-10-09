import sys, pickle, copy; sys.path.insert(0, '/home/claude/tools')
from lib4 import *
import dodge as DG, locomotion3 as L3
D = pickle.load(open(sys.argv[1], 'rb'))
idle0 = L3.idle_unarmed_ctrl(0)
for name, S, armed, lead in (('Hero_Dodge', idle0, False, [L3.idle_unarmed_ctrl(i) for i in range(30)]),
                              ('Hero_Dodge_Sword', guard, True, [sword_idle(i) for i in range(30)])):
    S = copy.deepcopy(S)
    if armed: S.update(sword_vis=1.0)
    kk = DG.keys(S, S, armed)
    cs = sample(Timeline(S, kk, DG.N), auto_edge=False)
    if not armed:
        for c in cs: c.update(L3.UNARMED) if False else c.update(sword_vis=0.0, portal=0.0, aura=0.0)
    import bake as BK
    old = dict(BK.SIGMA)
    for b in ('Thigh', 'Shin', 'Foot', 'Toe'):
        for sd in 'LR': BK.SIGMA[f'{b}.{sd}'] = 1.7          # roll tuck: even, unhurried leg motion
    R_ = finish(cs, preroll_cs=lead)
    BK.SIGMA.clear(); BK.SIGMA.update(old)
    D['clips'][name] = dict(bones=R_['bones'], arr=R_['arr'], fx=R_['fx'], aura=R_['aura'])
    D.setdefault('cs', {})[name] = R_['cs']; print(name, flush=True)
D['meta']['dodge_curve'] = DG.DODGE_CURVE.tolist()
pickle.dump(D, open('/home/claude/work/try_dodge.pkl', 'wb'))
