import numpy as np
def cluster_decimate(P, UV, T, cell, uv_cell=1/48):
    """vertex clustering that never merges across UV islands (key includes coarse UV)."""
    q = np.floor(P / cell).astype(np.int64); u = np.floor(UV / uv_cell).astype(np.int64)
    key = np.c_[q, u]
    _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
    n = inv.max() + 1; cnt = np.bincount(inv, minlength=n)[:, None]
    Pn = np.zeros((n, 3)); np.add.at(Pn, inv, P); Pn /= cnt
    Un = np.zeros((n, 2)); np.add.at(Un, inv, UV); Un /= cnt
    Tn = inv[T]
    ok = (Tn[:, 0] != Tn[:, 1]) & (Tn[:, 1] != Tn[:, 2]) & (Tn[:, 0] != Tn[:, 2])
    Tn = Tn[ok]
    s = np.sort(Tn, 1); _, keep = np.unique(s, axis=0, return_index=True)
    return Pn, Un, Tn[np.sort(keep)]
