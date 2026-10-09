"""C = dodge: a forward roll.  Crouch -> dive (hands reach for the floor) -> tuck -> roll over the shoulders and back
(full 360-degree pitch of the pelvis, legs tucked in joint space) -> feet plant -> rise.
In place; the game moves the player along DODGE_CURVE (metres, per frame) so the planted feet never slide."""
import copy, numpy as np
from locomotion3 import arm
N = 30
ZA, ZB, ZC, ZD = 0.08, 0.02, -0.45, -0.36   # pelvis height offsets in the roll (tuned by ground contact)
# travel: ramp up 0-5, full speed to 17, ramp down to 23, stopped after
def _v(f):
    if f < 5: return f / 5
    if f < 17: return 1.0
    if f < 23: return 1 - (f - 17) / 6
    return 0.0
_w = np.array([_v(f + 0.5) for f in range(N)]); DIST = 3.2
DODGE_CURVE = np.r_[0, np.cumsum(_w)] * DIST / _w.sum()          # N+1 values (metres at each frame)
D = DODGE_CURVE

def keys(S, E, armed):
    """S/E: start and end control states (idle for unarmed, guard for armed)."""
    fS = {s: S['foot' + s]['ball'] for s in 'LR'}; fE = {s: E['foot' + s]['ball'] for s in 'LR'}
    def planted(s, f, start=True):
        b = fS[s] if start else fE[s]
        return (b[0], b[1] - D[f]) if start else (b[0], b[1] + (D[N] - D[f]))
    P0 = S['hips_rot'][1]; PE = E['hips_rot'][1] + 360
    def body(P, Sp, ho, w=None, tk=18):
        d = dict(hips_rot=(0, P, 0), spine_rot=(0, Sp, 0), head_rot=(0, P + Sp + tk, 0), hips_off=ho)
        if w is not None: d['lfk_w'] = w
        return d
    tuck = dict(lfkR_hip=118, lfkR_knee=138, lfkL_hip=118, lfkL_knee=138, lfkR_abd=10, lfkL_abd=10, lfkR_ank=35, lfkL_ank=35)
    if armed:   # sword points straight out to the right along the roll axis (hand at the right hip, palm up):
                # that axis stays horizontal through the whole roll, so the blade never touches the floor or the body
        LAT = dict(dir=(0.37, 0.93, 0.0), elb=60.0, pro=40.0, dev=-12.0, swiv=60.0, flex=0.0, roll=0.0)
        def R(*a, **kw): return dict(LAT)
    k = []
    k.append((0, {}))
    k.append((3, dict(body(P0 + 22, 18, (0, 0.06, -0.28)), lfk_w=0.0,
                      footR=dict(ball=planted('R', 3), heel=8), footL=dict(ball=planted('L', 3), heel=8),
                      fkL=arm((-0.15, 0.85, -0.50), 18),
                      **({'fkR': R(P0 + 22, 18, d=(0.40, 0.45, -0.80))} if armed else dict(fkR=arm((0.15, 0.85, -0.50), 18))), fistR=1.0 if armed else 0.2, fistL=0.2)))
    k.append((4, dict(footR=dict(ball=planted('R', 4), heel=30), footL=dict(ball=planted('L', 4), heel=30))))
    k.append((5, dict(lfk_w=0.0, footR=dict(ball=planted('R', 4), heel=48, lift=0.06), footL=dict(ball=planted('L', 4), heel=48, lift=0.06))))
    k.append((6, dict(body(P0 + 72, 34, (0, 0.30, -0.24), 0.25, tk=30),
                      lfkR_hip=-10, lfkR_knee=35, lfkL_hip=-10, lfkL_knee=35, lfkR_ank=30, lfkL_ank=30,
                      footR=dict(ball=planted('R', 5), heel=50, lift=0.16), footL=dict(ball=planted('L', 5), heel=50, lift=0.16),
                      fkL=arm((-0.25, 0.90, 0.30), 22),
                      **({'fkR': R(P0 + 72, 34)} if armed else dict(fkR=arm((0.25, 0.90, 0.30), 22))))))
    k.append((8, dict(body(P0 + 120, 50, (0, 0.36, ZA), 0.85, tk=62),
                      lfkR_hip=62, lfkR_knee=95, lfkL_hip=62, lfkL_knee=95, lfkR_abd=8, lfkL_abd=8, lfkR_ank=32, lfkL_ank=32,
                      fkL=arm((-0.18, 0.75, -0.60), 85),
                      **({'fkR': R(P0 + 120, 50)} if armed else dict(fkR=arm((0.18, 0.75, -0.60), 85))))))
    k.append((10, dict(body(P0 + 172, 52, (0, 0.30, ZB), 1.0, tk=55), **tuck, **({'fkR': R(P0 + 172, 52)} if armed else {}))))
    k.append((12, dict(body(P0 + 228, 48, (0, 0.20, ZC), tk=50), **({'fkR': R(P0 + 228, 48)} if armed else {}))))
    k.append((14, dict(body(P0 + 285, 38, (0, 0.18, ZD), tk=35),
                       footR=dict(ball=planted('R', 17, False), heel=0, lift=0.18, pitch=0), footL=dict(ball=planted('L', 17, False), heel=0, lift=0.18, pitch=0))))
    k.append((16, dict(body(P0 + 335, 28, (0, 0.34, -0.41), 0.55),
                       lfkR_hip=110, lfkR_knee=135, lfkL_hip=110, lfkL_knee=135,
                       footR=dict(ball=planted('R', 16, False), lift=0.05), footL=dict(ball=planted('L', 16, False), lift=0.05),
                       fkL=arm((-0.25, 0.92, 0.05), 25),
                       **({'fkR': R(P0 + 335, 28)} if armed else dict(fkR=arm((0.25, 0.92, 0.05), 25))))))
    k.append((18, dict(body(P0 + 372, 22, (0, 0.40, -0.46), 0.0),
                       footR=dict(ball=planted('R', 18, False), lift=0.0, heel=6), footL=dict(ball=planted('L', 18, False), lift=0.0, heel=6),
                       fkL=arm((-0.25, 0.90, -0.15), 25),
                       **({'fkR': R(P0 + 372, 22, d=(0.40, 0.45, -0.80))} if armed else dict(fkR=arm((0.25, 0.90, -0.15), 25))))))
    k.append((23, dict(body(PE + 6, 10, (0, 0.14, -0.26)),
                       footR=dict(ball=planted('R', 23, False), heel=0), footL=dict(ball=planted('L', 23, False), heel=0),
                       fkL=arm((-0.18, 0.55, -0.80), 30),
                       **({'fkR': R(PE + 6, 10, d=(0.30, 0.65, -0.60), e=50, b=(-0.1, 0.6, 0.5))} if armed else dict(fkR=arm((0.18, 0.55, -0.80), 30))))))
    end = {kk: copy.deepcopy(E[kk]) for kk in ('hips_off', 'spine_rot', 'head_rot', 'fkR', 'fkL', 'footR', 'footL')}
    end['hips_rot'] = (E['hips_rot'][0], PE, E['hips_rot'][2])
    end['head_rot'] = (E['head_rot'][0], E['head_rot'][1] + 360, E['head_rot'][2])
    end.update(fistR=E.get('fistR', 1.0), fistL=E.get('fistL', 0.55), ease=True, lfk_w=0.0)
    k.append((N, end))
    return k
