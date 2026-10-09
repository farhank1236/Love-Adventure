import numpy as np
def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)

ARM_RADII = {'UpperArm': 0.12, 'Forearm': 0.10, 'Hand': 0.12}
FADE = 0.03

def arm_bleed_fix(P, Wt, groups, head, tail, deform_bones):
    """Vertices that are far from the arm (cape / chest panels) lose their arm weights, which are given to
    the nearest non-arm deform bones (inverse-distance). Returns (new weights, changed mask)."""
    Wn = Wt.astype(np.float64).copy(); changed = np.zeros(len(P), bool)
    arm_all = [g for s in 'LR' for g in (f'UpperArm.{s}', f'UpperArmTwist.{s}', f'Forearm.{s}', f'ForearmTwist.{s}', f'Hand.{s}')]
    cand = [b for b in deform_bones if b not in arm_all and b in groups]
    cd = np.stack([seg_dist(P, head[b], tail[b]) for b in cand], 1)   # (N, nc)
    for s in 'LR':
        rel = np.min([seg_dist(P, head[f'{k}.{s}'], tail[f'{k}.{s}']) - r for k, r in ARM_RADII.items()], axis=0)
        gi = [groups.index(g) for g in (f'UpperArm.{s}', f'UpperArmTwist.{s}', f'Forearm.{s}', f'ForearmTwist.{s}', f'Hand.{s}')]
        aw = Wn[:, gi].sum(1)
        keep = np.clip(1 - rel / FADE, 0, 1)
        m = (aw > 1e-4) & (keep < 1)
        removed = aw[m] * (1 - keep[m])
        Wn[np.ix_(m, gi)] *= keep[m][:, None]
        # give removed weight to nearest 3 candidate bones (inverse distance^4)
        d = cd[m]
        nn = np.argsort(d, 1)[:, :3]
        dn = np.take_along_axis(d, nn, 1) + 0.01
        wn = 1 / dn**4; wn /= wn.sum(1, keepdims=True)
        rows = np.where(m)[0]
        for k in range(3):
            cols = np.array([groups.index(cand[j]) for j in nn[:, k]])
            np.add.at(Wn, (rows, cols), removed * wn[:, k])
        changed |= m
    Wn /= Wn.sum(1, keepdims=True) + 1e-12
    return Wn.astype(np.float32), changed

LEG_RADII = {'Shin': 0.105, 'Foot': 0.10}
def leg_bleed_fix(P, Wt, groups, head, tail, deform_bones, fade=0.04):
    """Same idea as arm_bleed_fix for the lower legs: robe tails / cape hem that were weighted to the shins
    no longer get dragged by the knee."""
    Wn = Wt.astype(np.float64).copy(); changed = np.zeros(len(P), bool)
    leg_all = [f'{k}.{s}' for s in 'LR' for k in ('Shin', 'ShinTwist', 'Foot', 'Toe')]
    cand = [b for b in deform_bones if b not in leg_all and b in groups]
    cd = np.stack([seg_dist(P, head[b], tail[b]) for b in cand], 1)
    for s in 'LR':
        rel = np.min([seg_dist(P, head[f'{k}.{s}'], tail[f'{k}.{s}']) - r for k, r in LEG_RADII.items()] +
                     [seg_dist(P, head[f'Toe.{s}'], tail[f'Toe.{s}']) - 0.08], axis=0)
        gi = [groups.index(f'{k}.{s}') for k in ('Shin', 'ShinTwist', 'Foot', 'Toe') if f'{k}.{s}' in groups]
        aw = Wn[:, gi].sum(1)
        keep = np.clip(1 - rel / fade, 0, 1)
        m = (aw > 1e-4) & (keep < 1)
        removed = aw[m] * (1 - keep[m])
        Wn[np.ix_(m, gi)] *= keep[m][:, None]
        d = cd[m]; nn = np.argsort(d, 1)[:, :3]
        dn = np.take_along_axis(d, nn, 1) + 0.01
        wn = 1 / dn ** 4; wn /= wn.sum(1, keepdims=True)
        rows = np.where(m)[0]
        for k in range(3):
            cols = np.array([groups.index(cand[j]) for j in nn[:, k]], dtype=int)
            np.add.at(Wn, (rows, cols), removed * wn[:, k])
        changed |= m
    Wn /= Wn.sum(1, keepdims=True) + 1e-12
    return Wn.astype(np.float32), changed
