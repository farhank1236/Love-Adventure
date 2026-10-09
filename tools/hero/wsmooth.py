"""numpy-only skin-weight smoothing on the welded mesh graph (same code is embedded in the Blender script)."""
import numpy as np

def weld_edges(P, T, tol=2e-5):
    q = np.round(P / tol).astype(np.int64)
    _, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.ravel()
    TT = inv[T]
    e = np.concatenate([TT[:, [0, 1]], TT[:, [1, 2]], TT[:, [2, 0]]])
    e = np.sort(e, 1); e = e[e[:, 0] != e[:, 1]]
    e = np.unique(e, axis=0)
    return inv, e

def smooth_weights(W, inv, edges, alpha, iters, lock=None, max_infl=4):
    """W: (N, G) per original vertex. alpha: (Nw,) per welded vertex smoothing strength (0..1)."""
    nw = inv.max() + 1; G = W.shape[1]
    cnt = np.bincount(inv, minlength=nw).astype(np.float64)
    Ww = np.zeros((nw, G))
    for g in range(G): Ww[:, g] = np.bincount(inv, weights=W[:, g], minlength=nw) / cnt
    a, b = edges[:, 0], edges[:, 1]
    deg = np.bincount(a, minlength=nw) + np.bincount(b, minlength=nw); deg = np.maximum(deg, 1).astype(np.float64)
    al = alpha[:, None]
    for _ in range(iters):
        nb = np.zeros_like(Ww)
        for g in range(G):
            nb[:, g] = (np.bincount(a, weights=Ww[b, g], minlength=nw) + np.bincount(b, weights=Ww[a, g], minlength=nw)) / deg
        Ww = Ww * (1 - al) + nb * al
    # keep max_infl largest, renormalise
    if max_infl:
        idx = np.argsort(-Ww, 1)[:, max_infl:]
        np.put_along_axis(Ww, idx, 0.0, 1)
    Ww[Ww < 0.01] = 0
    Ww /= Ww.sum(1, keepdims=True) + 1e-12
    return Ww[inv].astype(np.float32)

def voxel_equalize(P, W, mask, cell=0.015):
    """Box-filter weights in 3D over neighbouring voxels, among masked vertices only (merges the two
    surfaces of thin cloth so they move together and never cross). numpy only."""
    idx = np.where(mask)[0]
    if len(idx) == 0: return W
    Q = np.floor(P[idx] / cell).astype(np.int64)
    Q -= Q.min(0)
    dims = Q.max(0) + 3
    key = (Q[:, 0] * dims[1] + Q[:, 1]) * dims[2] + Q[:, 2]
    uk, inv = np.unique(key, return_inverse=True); inv = inv.ravel()
    G = W.shape[1]
    S = np.zeros((len(uk), G)); np.add.at(S, inv, W[idx])
    cnt = np.bincount(inv, minlength=len(uk)).astype(np.float64)
    acc = np.zeros((len(idx), G)); acn = np.zeros(len(idx))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                k2 = key + (dx * dims[1] + dy) * dims[2] + dz
                pos = np.searchsorted(uk, k2); pos = np.clip(pos, 0, len(uk) - 1)
                hit = uk[pos] == k2
                acc[hit] += S[pos[hit]]; acn[hit] += cnt[pos[hit]]
    out = W.copy()
    out[idx] = (acc / acn[:, None]).astype(W.dtype)
    out /= out.sum(1, keepdims=True) + 1e-12
    return out
