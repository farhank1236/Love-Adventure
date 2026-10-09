import numpy as np, sys
sys.path.insert(0, '/home/claude/horse'); sys.path.insert(0, '/home/claude/tools')
from hskel import NAMES, HEAD, PARENT
def rx(a): a = np.radians(a); c, s = np.cos(a), np.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def ry(a): a = np.radians(a); c, s = np.cos(a), np.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def rz(a): a = np.radians(a); c, s = np.cos(a), np.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
def euler(e): x, y, z = e; return ry(y) @ rx(x) @ rz(z)
def fk(local, root_t=(0, 0, 0)):
    """local: {bone: 3x3 or (x,y,z) degrees}; returns {bone: 4x4 global}"""
    G = {}
    for b in NAMES:
        p = PARENT[b]; L = np.eye(4)
        r = local.get(b, np.eye(3)); r = euler(r) if np.shape(r) == (3,) else np.asarray(r)
        L[:3, :3] = r
        L[:3, 3] = HEAD[b] - (HEAD[p] if p else 0) + (np.array(root_t) if p is None else 0)
        G[b] = (G[p] @ L) if p else L
    return G
def skin_mats(G):
    S = np.zeros((len(NAMES), 4, 4))
    for i, b in enumerate(NAMES):
        Tm = np.eye(4); Tm[:3, 3] = -HEAD[b]; S[i] = G[b] @ Tm
    return S
def deform(P, J, W, G):
    S = skin_mats(G); out = np.zeros_like(P)
    Ph = np.c_[P, np.ones(len(P))]
    for k in range(J.shape[1]):
        M = S[J[:, k]]                       # n,4,4
        out += W[:, k:k + 1] * np.einsum('nij,nj->ni', M, Ph)[:, :3]
    return out
