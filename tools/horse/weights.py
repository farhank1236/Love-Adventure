import numpy as np, scipy.sparse as sp, sys
sys.path.insert(0, '/home/claude/horse')
from hskel import NAMES, HEAD, TAIL, PARENT
Q = np.load('/home/claude/horse/Q.npy'); I = np.load('/home/claude/horse/I.npy')
key = np.round(Q / 2e-5).astype(np.int64)
_, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True); inv = inv.ravel()
P = Q[first]; T = inv[I]; n = len(P)
print('welded', n, 'of', len(Q))
WB = [b for b in NAMES if b != 'Root']
def segdist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(P - (a + t[:, None] * ab), axis=1), t
D = np.zeros((n, len(WB)))
for j, b in enumerate(WB): D[:, j], _ = segdist(P, HEAD[b], TAIL[b])
x, y, z = P[:, 0], P[:, 1], P[:, 2]
allow = np.ones_like(D, bool)
for j, b in enumerate(WB):
    if b.endswith('.L'): allow[:, j] = x > -0.01
    if b.endswith('.R'): allow[:, j] = x < 0.01
    if b.startswith('Tail'): allow[:, j] = (z < -0.93) & (np.abs(x) < 0.2)
    if b.startswith(('FCannon', 'FPastern', 'Forearm')): allow[:, j] &= (z > 0.15) & (y < 1.12)
    if b.startswith(('HCannon', 'HPastern', 'Gaskin')): allow[:, j] &= (z < -0.25) & (y < 1.12) & ~((z < -0.95) & (np.abs(x) < 0.12) & (y < 0.9))
# the tail hair (hangs free behind the hocks) belongs only to the tail
tail = (z < -0.97) & (np.abs(x) < 0.16) & (y < 1.40)
tail |= (z < -1.02) & (y < 1.48)
for j, b in enumerate(WB):
    if not b.startswith('Tail') and b != 'Hips': allow[tail, j] = False
Dm = np.where(allow, D, 9.0)
W = 1.0 / np.maximum(Dm, 0.015) ** 4
W[~allow] = 0
# bones' own region bias: a vertex clearly on a leg below the belly takes only that leg
W /= W.sum(1, keepdims=True)
# smooth across the surface (welded graph)
r = np.r_[T[:, 0], T[:, 1], T[:, 2], T[:, 1], T[:, 2], T[:, 0]]; c = np.r_[T[:, 1], T[:, 2], T[:, 0], T[:, 0], T[:, 1], T[:, 2]]
A = sp.csr_matrix((np.ones(len(r)), (r, c)), shape=(n, n)); A.data[:] = 1
deg = np.asarray(A.sum(1)).ravel(); Dinv = sp.diags(1 / np.maximum(deg, 1))
S = Dinv @ A
for it in range(10):
    W = 0.5 * W + 0.5 * (S @ W); W[~allow] = 0; W /= W.sum(1, keepdims=True) + 1e-12
# keep 4
top = np.argsort(-W, 1)[:, :4]; w = np.take_along_axis(W, top, 1); w /= w.sum(1, keepdims=True)
J = np.array([NAMES.index(WB[k]) for k in range(len(WB))])[top]
np.savez('/home/claude/horse/weights.npz', J=J[inv].astype(np.uint8), W=w[inv].astype(np.float32), inv=inv, first=first)
for b in ['Tail1', 'Head', 'Humerus.L', 'Thigh.L', 'FCannon.L', 'Saddle'] :
    if b in NAMES: print(b, int((J[:, 0] == NAMES.index(b)).sum()))
