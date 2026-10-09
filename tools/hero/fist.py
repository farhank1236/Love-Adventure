"""Procedural finger-curl (no finger bones in the rig). Works in Hand bone rest space.
Right hand local: +y fingers, +x palm normal, -z thumb.  Left hand: x is mirrored (pass mirror=True).
The deformation is a smooth displacement field, so it never tears the mesh."""
import numpy as np

def smooth(t):
    t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)

P_DEFAULT = dict(x_axis=-0.040, mcp=((-0.045, 0.100), (0.06, 0.086)), seg=(0.040, 0.027), width=0.012,
                 ang_mcp=((-0.04, 58), (0.0, 66), (0.03, 72), (0.06, 78)), ang_pip=((-0.04, 88), (0.06, 96)),
                 ang_dip=((-0.04, 42), (0.06, 50)), thumb_deg=-34, thumb_base=(-0.03, 0.0, -0.035), thumb_axis=(0, 1, 0.35))

def _interp(z, pts):
    xs, ys = zip(*pts); return np.interp(z, xs, ys)

def curl(L, amount=1.0, mirror=False, prm=P_DEFAULT):
    L = np.array(L, float)
    if mirror: L[:, 0] *= -1
    x, y, z = L[:, 0], L[:, 1], L[:, 2]
    ym = _interp(z, prm['mcp'])
    # --- finger curl (rotate about joint axes parallel to z), distal joint first
    P = L.copy()
    joints = [(ym, _interp(z, prm['ang_mcp'])), (ym + prm['seg'][0], _interp(z, prm['ang_pip'])),
              (ym + prm['seg'][0] + prm['seg'][1], _interp(z, prm['ang_dip']))]
    for jy, ang in reversed(joints):
        s = smooth((P[:, 1] - jy) / prm['width'] + 0.5)
        t = np.radians(-ang * s * amount); cs, sn = np.cos(t), np.sin(t)
        dx = P[:, 0] - prm['x_axis']; dy = P[:, 1] - jy
        P = np.stack([prm['x_axis'] + dx * cs - dy * sn, jy + dx * sn + dy * cs, P[:, 2]], 1)
    # --- thumb swing
    base = np.array(prm['thumb_base']); a = np.array(prm['thumb_axis'], float); a /= np.linalg.norm(a)
    dist = np.linalg.norm(L[:, :2] - base[:2], axis=1)
    s = smooth((dist - 0.005) / 0.03)
    ang = np.radians(prm['thumb_deg'] * s * amount)[:, None]
    d = L - base
    Tm = base + d * np.cos(ang) + np.cross(a, d) * np.sin(ang) + np.outer(d @ a, a) * (1 - np.cos(ang))
    # thumb weight: outside the index finger edge and below the knuckle line
    tw = smooth((-z - 0.050) / 0.014) * smooth((0.112 - y) / 0.02)
    # whole effect fades out toward the wrist (y<0)
    fw = smooth((y + 0.005) / 0.02)
    out = L + fw[:, None] * ((1 - tw)[:, None] * (P - L) + tw[:, None] * (Tm - L))
    if mirror: out[:, 0] *= -1
    return out

def region(L):
    """vertices to consider (hand neighbourhood in bone space)."""
    return (L[:, 1] > -0.03) & (L[:, 1] < 0.26) & (np.abs(L[:, 0]) < 0.14) & (np.abs(L[:, 2]) < 0.14)
