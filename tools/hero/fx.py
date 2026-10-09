"""Sword FX: low-poly blade shell (blue aura + ghost trail), pocket-dimension portal, and the per-frame
transforms of the FX bones.  Pure numpy (embedded in the Blender script too)."""
import numpy as np

AURA_COLOR = (0.25, 0.65, 1.0)
GHOST_ALPHA = (0.42, 0.30, 0.20, 0.12)
GHOST_LAG = 0.4          # frames between ghosts (dense, reads as a streak)
N_GHOST = 4

def blade_shell(Sc, blade_start, inflate=0.012, n_sec=36):
    """loft a low-poly shell around the blade part of canonical sword verts Sc (x edge, y blade, z flat)."""
    y = Sc[:, 1]; m = y > blade_start
    y0, y1 = blade_start, y[m].max()
    ys = np.linspace(y0, y1, n_sec)
    secs = []
    for k in range(n_sec - 1):
        s = m & (y >= ys[k]) & (y < ys[k + 1] + 1e-6)
        if s.sum() < 3:
            secs.append(secs[-1] if secs else (0.03, 0.006, 0.0)); continue
        xc = 0.5 * (Sc[s, 0].max() + Sc[s, 0].min())
        secs.append((0.5 * (Sc[s, 0].max() - Sc[s, 0].min()), 0.5 * (Sc[s, 2].max() - Sc[s, 2].min()), xc))
    secs.append((0.0, 0.0, secs[-1][2]))
    V = []; F = []
    ring = 6
    ang = np.linspace(0, 2 * np.pi, ring, endpoint=False)
    shape = np.stack([np.cos(ang), np.sin(ang) * 1.0], 1)          # hexagonal section: edges at +-x
    for k, (w, t, xc) in enumerate(secs):
        w2 = w + inflate if k < n_sec - 1 else 0.0; t2 = t + inflate * 0.8 if k < n_sec - 1 else 0.0
        for a in shape:
            V.append((xc + a[0] * w2, ys[k], a[1] * t2))
    for k in range(n_sec - 1):
        for j in range(ring):
            a = k * ring + j; b = k * ring + (j + 1) % ring; c = a + ring; d = b + ring
            F += [(a, b, d), (a, d, c)]
    # cap at the guard
    base = len(V); V.append((secs[0][2], ys[0], 0.0))
    for j in range(ring): F.append((base, (j + 1) % ring, j))
    return np.array(V, float), np.array(F, int)

def portal_mesh(R=0.20):
    """disc in the local XZ plane (normal +Y). parts: (name, V, F, color, alpha)."""
    parts = []
    # outer ring (torus)
    nu, nv, r = 48, 8, 0.016
    u = np.linspace(0, 2 * np.pi, nu, endpoint=False); v = np.linspace(0, 2 * np.pi, nv, endpoint=False)
    V = []; F = []
    for a in u:
        for b in v:
            V.append(((R + r * np.cos(b)) * np.cos(a), r * np.sin(b), (R + r * np.cos(b)) * np.sin(a)))
    for i in range(nu):
        for j in range(nv):
            a = i * nv + j; b = ((i + 1) % nu) * nv + j; c = i * nv + (j + 1) % nv; d = ((i + 1) % nu) * nv + (j + 1) % nv
            F += [(a, b, d), (a, d, c)]
    parts.append(('Portal_Ring', np.array(V), np.array(F), (0.35, 0.80, 1.0), 1.0))
    # swirl: 5 spiral arms (thin ribbons)
    V = []; F = []
    for arm in range(5):
        base = len(V); n = 40
        for i in range(n):
            t = i / (n - 1); ang = arm * 2 * np.pi / 5 + t * 3.2
            rad = R * (0.12 + 0.86 * t); wdt = 0.010 + 0.022 * np.sin(np.pi * t)
            ca, sa = np.cos(ang), np.sin(ang)
            nx, nz = -sa, ca
            V.append((ca * rad - nx * wdt, 0.002 * arm, sa * rad - nz * wdt)); V.append((ca * rad + nx * wdt, 0.002 * arm, sa * rad + nz * wdt))
        for i in range(n - 1):
            a = base + 2 * i; F += [(a, a + 1, a + 3), (a, a + 3, a + 2)]
    parts.append(('Portal_Swirl', np.array(V), np.array(F), (0.45, 0.35, 1.0), 0.75))
    # dark core
    n = 32; ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
    V = [(0, -0.003, 0)] + [(np.cos(a) * R * 0.92, -0.003, np.sin(a) * R * 0.92) for a in ang]
    F = [(0, 1 + (i + 1) % n, 1 + i) for i in range(n)]
    parts.append(('Portal_Core', np.array(V, float), np.array(F), (0.05, 0.02, 0.15), 0.85))
    return parts

def smoothstep(x):
    x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)

def fx_tracks(sword_frames, ctrl, blade_len, fps=30.0):
    """sword_frames: list of (R 3x3 world sword frame incl. roll, grip position). ctrl: list of dicts with
    sword_vis, portal, aura.  Returns per-frame dict with aura level, ghost matrices, portal matrix."""
    N = len(sword_frames)
    tips = np.array([g + R[:, 1] * blade_len * 0.85 for R, g in sword_frames])
    spd = np.zeros(N)
    for i in range(N):
        i0, i1 = max(0, i - 1), min(N - 1, i + 1)
        spd[i] = np.linalg.norm(tips[i1] - tips[i0]) / max(1, i1 - i0) * fps
    vis = np.array([c.get('sword_vis', 1.0) for c in ctrl])
    aura = smoothstep((spd - 2.5) / 3.5) * vis
    aura = np.maximum(aura, np.array([c.get('aura', 0.0) for c in ctrl]))
    aura = np.maximum(aura, 3.2 * vis * (1 - vis))                     # flash while the blade materialises
    k = np.exp(-0.5 * (np.arange(-2, 3) / 1.0) ** 2); k /= k.sum()
    aura = np.clip(np.convolve(np.pad(aura, 2, mode='edge'), k, 'valid'), 0, 1)
    def frame_at(t):
        t = np.clip(t, 0, N - 1); a = int(np.floor(t)); b = min(a + 1, N - 1); w = t - a
        Ra, ga = sword_frames[a]; Rb, gb = sword_frames[b]
        M = Ra * (1 - w) + Rb * w; U, _, Vt = np.linalg.svd(M); R = U @ Vt
        return R, ga * (1 - w) + gb * w, vis[a] * (1 - w) + vis[b] * w
    out = []
    spin = 0.0
    for i in range(N):
        ghosts = []
        for j in range(N_GHOST):
            R, g, v = frame_at(i - (j + 1) * GHOST_LAG)
            a = aura[i] * min(1.0, i / max(1e-6, (j + 1) * GHOST_LAG))
            s = max(a, 1e-3)
            M = np.eye(4); M[:3, :3] = R @ np.diag([s, max(v, 1e-3), s]); M[:3, 3] = g
            ghosts.append(M)
        po = smoothstep(ctrl[i].get('portal', 0.0)); spin += 9.0 + 16.0 * po
        R, g = sword_frames[i]
        ang = np.radians(spin); Ry = np.array([[np.cos(ang), 0, np.sin(ang)], [0, 1, 0], [-np.sin(ang), 0, np.cos(ang)]])
        P = np.eye(4); P[:3, :3] = R @ Ry * max(po, 1e-3); P[:3, 3] = g
        out.append(dict(aura=float(aura[i]), ghosts=ghosts, portal=P, speed=float(spd[i])))
    return out

def glow_shell(Sc, blade_start, pad_w=0.065, pad_t=0.055, tip_ext=0.10, n_sec=40, ring=12):
    """wide soft outer glow envelope around the blade (x edge, y blade, z flat): rounded sections, tapers in at the
    guard and runs on past the tip, so the shader's view-angle falloff reads as a volumetric halo."""
    y = Sc[:, 1]; m = y > blade_start
    y0, y1 = blade_start, y[m].max()
    ys = np.linspace(y0 - 0.02, y1 + tip_ext, n_sec)
    def half_w(yy):
        s = m & (np.abs(y - yy) < 0.02)
        if s.sum() < 3: return 0.0, 0.0
        return 0.5 * (Sc[s, 0].max() - Sc[s, 0].min()), 0.5 * (Sc[s, 0].max() + Sc[s, 0].min())
    ang = np.linspace(0, 2 * np.pi, ring, endpoint=False); V = []; F = []
    for k, yy in enumerate(ys):
        w, xc = half_w(min(max(yy, y0 + 0.01), y1 - 0.01))
        u = (yy - ys[0]) / (ys[-1] - ys[0])
        taper = np.sin(np.clip(u / 0.06, 0, 1) * np.pi / 2) * np.clip((1 - u) / 0.14, 0, 1) ** 0.6
        W = (w + pad_w) * taper; T = pad_t * taper
        for a in ang: V.append((xc + np.cos(a) * W, yy, np.sin(a) * T))
    for k in range(n_sec - 1):
        for j in range(ring):
            a = k * ring + j; b = k * ring + (j + 1) % ring; c = a + ring; d = b + ring
            F += [(a, b, d), (a, d, c)]
    return np.array(V, float), np.array(F, int)
