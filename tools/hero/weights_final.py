"""Full skin-weight cleanup pipeline (numpy only; embedded verbatim in the Blender script)."""
import numpy as np

def final_weights(P, T, W0, groups, head, tail, deform, arm_bleed_fix, weld_edges, smooth_weights):
    W1, _ = arm_bleed_fix(P, W0, groups, head, tail, deform)
    inv, e = weld_edges(P, T)
    nw = inv.max() + 1
    cnt = np.bincount(inv, minlength=nw)
    def per_w(x): return np.bincount(inv, weights=x, minlength=nw) / cnt
    hand = per_w(W1[:, groups.index('Hand.R')] + W1[:, groups.index('Hand.L')])
    headw = per_w(W1[:, groups.index('Head')])
    soft_g = [i for i, g in enumerate(groups) if g.startswith(('Cape', 'FrontRobe', 'SideRobe', 'Belt', 'Hips', 'Thigh', 'Clavicle'))]
    soft = per_w(W1[:, soft_g].sum(1))
    W2 = smooth_weights(W1, inv, e, np.where(hand > 0.3, 0.0, np.where(headw > 0.5, 0.15, 0.5)), 10)
    W2 = smooth_weights(W2, inv, e, np.where((soft > 0.15) & (hand < 0.3), 0.5, 0.0), 25)
    return W2
