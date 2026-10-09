"""Bake controls -> per-frame local bone transforms, with joint-space temporal smoothing (removes snaps, keeps
the wrist lock because smoothing happens in each joint's local space)."""
import numpy as np
from fk import quat_to_mat, mat_to_quat

TWIST_TGT = {'ForearmTwist.R': 'Hand.R', 'ForearmTwist.L': 'Hand.L', 'UpperArmTwist.R': 'Forearm.R', 'UpperArmTwist.L': 'Forearm.L',
             'ShinTwist.R': 'Foot.R', 'ShinTwist.L': 'Foot.L', 'ThighTwist.R': 'Shin.R', 'ThighTwist.L': 'Shin.L'}
LOC_BONES = ('Root', 'Hips')
SIGMA = {'UpperArm.R': 1.3, 'Forearm.R': 1.3, 'Hand.R': 1.3, 'Clavicle.R': 1.0,
         'UpperArm.L': 1.1, 'Forearm.L': 1.1, 'Hand.L': 1.1}
DEFAULT_SIGMA = 0.8

def keyed_bones(HR):
    return [b for b in HR.bones if b not in TWIST_TGT]

def _gauss(X, sg, cyclic=False):
    if sg <= 0: return X
    r = int(np.ceil(3 * sg)); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sg) ** 2); k /= k.sum()
    if cyclic:
        P = np.concatenate([X[-r - 1:-1], X, X[1:r + 1]])   # last frame == first frame for loops
    else:
        P = np.concatenate([np.repeat(X[:1], r, 0), X, np.repeat(X[-1:], r, 0)])
    return np.stack([np.convolve(P[:, j], k, 'valid') for j in range(X.shape[1])], 1)

def bake(HR, cs, smooth=True, cyclic=False, pin_ends=True):
    bones = keyed_bones(HR)
    N = len(cs)
    arr = np.zeros((N, len(bones), 7))
    for i, c in enumerate(cs):
        HR.solve(c)
        for j, b in enumerate(bones):
            B = HR.basis[b]
            q = mat_to_quat(B[:3, :3] / np.linalg.norm(B[:3, :3], axis=0))
            arr[i, j, :3] = B[:3, 3] if b in LOC_BONES else 0
            arr[i, j, 3:] = q
    for j in range(len(bones)):          # quaternion hemisphere continuity
        for i in range(1, N):
            if np.dot(arr[i, j, 3:], arr[i - 1, j, 3:]) < 0: arr[i, j, 3:] *= -1
    if smooth:
        out = arr.copy()
        for j, b in enumerate(bones):
            sg = SIGMA.get(b, DEFAULT_SIGMA)
            out[:, j, :] = _gauss(arr[:, j, :], sg, cyclic)
            out[:, j, 3:] /= np.linalg.norm(out[:, j, 3:], axis=1, keepdims=True)
        if pin_ends and not cyclic:
            # keep the exact first/last pose (clips chain exactly), blend the smoothing in over 3 frames
            for e, rng in ((0, range(0, 4)), (N - 1, range(N - 1, N - 5, -1))):
                for t, i in enumerate(rng):
                    if 0 <= i < N:
                        w = 1 - t / 4.0
                        out[i] = out[i] * (1 - w) + arr[i] * w
                        out[i, :, 3:] /= np.linalg.norm(out[i, :, 3:], axis=1, keepdims=True)
        arr = out
    return bones, arr.astype(np.float32)

def pose_baked(HR, bones, arr, i):
    """set HR pose from baked frame i (plus twist-bone constraint emulation)."""
    idx = {b: j for j, b in enumerate(bones)}
    HR.begin()
    for b in HR.bones:
        if b in idx:
            v = arr[i, idx[b]]; M = np.eye(4); M[:3, :3] = quat_to_mat(v[3:]); M[:3, 3] = v[:3]
            HR.set_local(b, M)
        else:
            HR.set_local(b, HR._roty4(0.5 * HR._local_y_euler(TWIST_TGT[b])))
