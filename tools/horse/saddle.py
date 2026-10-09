"""War saddle fitted to the horse's back (horse space, y up, +z forward, +x = horse's left).
Parts: navy saddle blanket with gold trim, leather seat (dished, high cantle, pommel), skirts/flaps, girth strap,
stirrup leathers and iron stirrups.  Returns a list of parts: dict(name, V, F, UV, N, mat, bone)."""
import numpy as np
from scipy.ndimage import gaussian_filter
Q = np.load('/home/claude/horse/Q.npy')
YC = 1.18
TH = np.radians(np.arange(-180, 181, 3.0)); ZS = np.arange(-0.80, 0.30, 0.02)

def build_radius():
    R = np.zeros((len(ZS), len(TH)))
    d = Q[:, [0, 1]] - [0, YC]; th = np.arctan2(d[:, 0], d[:, 1]); r = np.linalg.norm(d, axis=1)
    for i, z in enumerate(ZS):
        m = np.abs(Q[:, 2] - z) < 0.025
        thm, rm = th[m], r[m]
        for j, t in enumerate(TH):
            k = np.abs(np.angle(np.exp(1j * (thm - t)))) < np.radians(3)
            R[i, j] = rm[k].max() if k.any() else np.nan
    # fill gaps and smooth (straps and buckles shouldn't dent the saddle)
    for i in range(len(ZS)):
        row = R[i]; ok = ~np.isnan(row)
        R[i] = np.interp(np.arange(len(row)), np.where(ok)[0], row[ok])
    R = gaussian_filter(R, (1.2, 1.5), mode='nearest')
    return R
RAD = build_radius()

def radius(z, th):
    """bilinear on the (z, theta) grid; th in radians"""
    zi = np.clip((np.asarray(z) - ZS[0]) / (ZS[1] - ZS[0]), 0, len(ZS) - 1.001)
    ti = np.clip((np.asarray(th) - TH[0]) / (TH[1] - TH[0]), 0, len(TH) - 1.001)
    i0 = np.floor(zi).astype(int); j0 = np.floor(ti).astype(int); u = zi - i0; v = ti - j0
    return (RAD[i0, j0] * (1 - u) * (1 - v) + RAD[i0 + 1, j0] * u * (1 - v) + RAD[i0, j0 + 1] * (1 - u) * v + RAD[i0 + 1, j0 + 1] * u * v)

def surf(z, th, off):
    r = radius(z, th) + off
    return np.stack([np.sin(th) * r, YC + np.cos(th) * r, np.asarray(z) + 0 * r], -1)

def grid_mesh(Pg, uv=None):
    """Pg: (nz, nt, 3) grid -> V, F, UV"""
    nz, nt, _ = Pg.shape; V = Pg.reshape(-1, 3); F = []
    for i in range(nz - 1):
        for j in range(nt - 1):
            a = i * nt + j; b = a + 1; c = a + nt; d = c + 1; F += [(a, c, b), (b, c, d)]
    return V, np.array(F), (uv.reshape(-1, 2) if uv is not None else None)

def normals(V, F):
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]); vn = np.zeros_like(V)
    for k in range(3): np.add.at(vn, F[:, k], fn)
    return vn / (np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12)

def solid(top, bottom, uvt):
    """closed slab from two matching grids (nz, nt, 3): top, bottom (reversed), and the 4 edge walls"""
    nz, nt, _ = top.shape
    V1, F1, U1 = grid_mesh(top, uvt); V2, F2, U2 = grid_mesh(bottom, uvt)
    F2 = F2[:, ::-1] + len(V1)
    V = np.r_[V1, V2]; U = np.r_[U1, U2]; F = [F1, F2]; n = len(V1)
    ring = [(0, j) for j in range(nt)] + [(i, nt - 1) for i in range(1, nz)] + [(nz - 1, j) for j in range(nt - 2, -1, -1)] + [(i, 0) for i in range(nz - 2, 0, -1)]
    W = []
    for k in range(len(ring)):
        i0, j0 = ring[k]; i1, j1 = ring[(k + 1) % len(ring)]
        a = i0 * nt + j0; b = i1 * nt + j1; W += [(a, b, b + n), (a, b + n, a + n)]
    F.append(np.array(W))
    return V, np.concatenate(F), U

def tube(path, r, n=8, closed=False):
    path = np.asarray(path, float); m = len(path); V = []; F = []; U = []
    for i in range(m):
        t = path[min(i + 1, m - 1)] - path[max(i - 1, 0)] if not closed else path[(i + 1) % m] - path[i - 1]
        t /= np.linalg.norm(t) + 1e-12
        a = np.cross(t, [0, 1, 0]) if abs(t[1]) < 0.9 else np.cross(t, [1, 0, 0]); a /= np.linalg.norm(a); b = np.cross(t, a)
        for k in range(n):
            ang = 2 * np.pi * k / n; V.append(path[i] + r * (np.cos(ang) * a + np.sin(ang) * b)); U.append((i / max(1, m - 1) * 4, k / n))
    rows = m if closed else m - 1
    for i in range(rows):
        for k in range(n):
            a = i * n + k; b = i * n + (k + 1) % n; c = ((i + 1) % m) * n + k; d = ((i + 1) % m) * n + (k + 1) % n
            F += [(a, c, b), (b, c, d)]
    return np.array(V), np.array(F), np.array(U)

def strap(path, width, thick, normal_hint):
    """flat strap along path; normal_hint(i) gives the outward normal at each point"""
    path = np.asarray(path, float); m = len(path); top = []; bot = []
    for i in range(m):
        t = path[min(i + 1, m - 1)] - path[max(i - 1, 0)]; t /= np.linalg.norm(t) + 1e-12
        nrm = normal_hint(i); s = np.cross(t, nrm); s /= np.linalg.norm(s) + 1e-12
        top.append([path[i] - s * width / 2 + nrm * thick, path[i] + s * width / 2 + nrm * thick])
        bot.append([path[i] - s * width / 2, path[i] + s * width / 2])
    top = np.array(top); bot = np.array(bot)
    lens = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
    uv = np.stack(np.meshgrid(lens / 0.25, [0, width / 0.25], indexing='ij'), -1)
    return solid(top, bot, uv)

def build():
    parts = []
    # ---------------- blanket (navy, gold trim)
    nz, nt = 30, 46
    zs = np.linspace(-0.64, 0.05, nz); ths = np.radians(np.linspace(-82, 82, nt))
    Zg, Tg = np.meshgrid(zs, ths, indexing='ij')
    # rounded lower corners: pull the side drop in near the ends
    end = np.minimum((Zg - zs[0]) / 0.14, (zs[-1] - Zg) / 0.10).clip(0, 1)
    lim = np.radians(55 + 27 * np.sqrt(end))
    Tg = np.clip(Tg, -lim, lim)
    top = surf(Zg, Tg, 0.016); bot = surf(Zg, Tg, 0.004)
    arc = Tg * radius(Zg, Tg); uv = np.stack([arc / 0.35, Zg / 0.35], -1)
    V, F, U = solid(top, bot, uv); parts.append(dict(name='Blanket', V=V, F=F, UV=U, mat='cloth', bone='Saddle'))
    # gold trim along the blanket's outer edge (lower edges + front/back)
    lim1 = lambda z: np.radians(55 + 27 * np.sqrt(max(0.0, min((z - zs[0]) / 0.14, (zs[-1] - z) / 0.10, 1))))
    edge = np.array([surf(z, -lim1(z), 0.022) for z in zs]); edgeR = np.array([surf(z, lim1(z), 0.022) for z in zs])
    back = np.array([surf(zs[0] + 0.004, t, 0.022) for t in np.radians(np.linspace(-55, 55, 24))])
    front = np.array([surf(zs[-1] - 0.004, t, 0.022) for t in np.radians(np.linspace(-55, 55, 24))])
    for nm, pth in (('TrimL', edgeR), ('TrimR', edge), ('TrimBack', back), ('TrimFront', front)):
        V, F, U = tube(pth, 0.011, 6); parts.append(dict(name=nm, V=V, F=F, UV=U, mat='gold', bone='Saddle'))
    # ---------------- seat (leather): dished, cantle at the back, pommel at the front
    nz, nt = 34, 34
    zs2 = np.linspace(-0.52, -0.02, nz); th2 = np.radians(np.linspace(-62, 62, nt))
    Zs, Ts = np.meshgrid(zs2, th2, indexing='ij')
    zn0 = (Zs - zs2[0]) / (zs2[-1] - zs2[0])
    flim = np.radians(38 + 24 * np.clip(np.minimum(zn0 / 0.35, (1 - zn0) / 0.25), 0, 1) ** 0.6)    # rounded skirts
    Ts = np.clip(Ts, -flim, flim)
    zn = zn0; tn = np.abs(Ts) / th2[-1]
    centre = np.clip(1 - tn / 0.45, 0, 1) ** 1.5
    cantle = np.exp(-((zn - 0.0) / 0.12) ** 2) * 0.17 * np.clip(1 - tn / 0.55, 0, 1) ** 0.8
    pommel = np.exp(-((zn - 1.0) / 0.10) ** 2) * 0.11 * np.clip(1 - tn / 0.42, 0, 1) ** 0.9
    seat = 0.045 + 0.02 * centre * np.sin(np.pi * zn) * 0 + cantle + pommel
    flap = 0.03 + 0.012 * (1 - centre)
    lift = np.where(tn < 0.45, seat, flap + (seat - flap) * np.clip((0.55 - tn) / 0.1, 0, 1))
    top = surf(Zs, Ts, 0.016 + lift); bot = surf(Zs, Ts, 0.016 + np.maximum(lift - 0.035, 0.006))
    arc = Ts * radius(Zs, Ts); uv = np.stack([arc / 0.3, Zs / 0.3], -1)
    V, F, U = solid(top, bot, uv); parts.append(dict(name='Seat', V=V, F=F, UV=U, mat='leather', bone='Saddle'))
    # gold rim along the cantle top and a pommel cap
    ct = [surf(zs2[0] + 0.03, t, 0.016 + 0.045 + 0.17 * np.clip(1 - abs(t) / th2[-1] / 0.55, 0, 1) ** 0.8 * np.exp(-((0.03 / 0.5) / 0.12) ** 2) + 0.006) for t in np.radians(np.linspace(-30, 30, 25))]
    V, F, U = tube(np.array(ct), 0.012, 8); parts.append(dict(name='CantleRim', V=V, F=F, UV=U, mat='gold', bone='Saddle'))
    pc = surf(zs2[-1] - 0.035, 0.0, 0.016 + 0.045 + 0.11 * np.exp(-((0.965 - 1.0) / 0.10) ** 2) + 0.02)
    ang = np.linspace(0, 2 * np.pi, 12); V = [pc]; F = []
    sph_u, sph_v = np.meshgrid(np.linspace(0, np.pi, 8), np.linspace(0, 2 * np.pi, 12, endpoint=False), indexing='ij')
    Vs = pc + 0.032 * np.stack([np.sin(sph_u) * np.cos(sph_v), np.cos(sph_u), np.sin(sph_u) * np.sin(sph_v)], -1)
    Vk, Fk, Uk = grid_mesh(Vs, np.stack([sph_v / 6.28, sph_u / 3.14], -1))
    parts.append(dict(name='PommelCap', V=Vk, F=Fk, UV=Uk, mat='gold', bone='Saddle'))
    # ---------------- girth strap under the belly
    for side in (1, -1):
        path = [surf(-0.08, side * t, 0.024) for t in np.radians(np.linspace(52, 180, 40))]
        V, F, U = strap(path, 0.075, 0.008, lambda i, p=path: (np.array(p[i]) - [0, YC, np.array(p[i])[2]]) / (np.linalg.norm(np.array(p[i])[:2] - [0, YC]) + 1e-9) * [1, 1, 0])
        parts.append(dict(name='Girth' + ('L' if side > 0 else 'R'), V=V, F=F, UV=U, mat='leather', bone='Saddle'))
    # ---------------- stirrup leathers and irons (hang from the flap; the iron's tread is about 0.95 m up)
    STIR = {}
    for side, nm in ((1, 'L'), (-1, 'R')):
        zst = -0.22
        top_pts = [surf(zst, side * t, 0.045) for t in np.radians(np.linspace(46, 92, 14))]
        x0 = top_pts[-1][0]
        hang = [np.array([x0 + side * 0.005, y, zst]) for y in np.linspace(top_pts[-1][1] - 0.05, 1.10, 8)]
        path = np.array(top_pts + hang)
        def nh(i, p=path, s=side):
            v = p[i] - [0, YC, p[i][2]]; v[2] = 0; v /= np.linalg.norm(v) + 1e-9
            return v if i < 14 else np.array([s, 0, 0.0])
        V, F, U = strap(path, 0.042, 0.007, nh)
        # upper part rides on the saddle; the hanging part swings with the stirrup bone
        pivot = path[13].copy()
        bone_split = (V[:, 1] < pivot[1] - 0.02)
        parts.append(dict(name='Leather' + nm + 'Top', V=V, F=F, UV=U, mat='leather', bone='Saddle', split=('Stirrup.' + nm, bone_split)))
        # iron: rounded arch in the x-y plane (tread along x), at the bottom of the leather
        cx = x0 + side * 0.012; bottom = 0.95
        arch = []
        for t in np.linspace(0, np.pi, 18):
            arch.append([cx + 0.065 * np.cos(t), bottom + 0.03 + 0.12 * np.sin(t) ** 0.8, zst])
        V1, F1, U1 = tube(arch, 0.011, 8)
        tread = [[cx - 0.068, bottom + 0.012, zst], [cx + 0.068, bottom + 0.012, zst]]
        V2, F2, U2 = tube(tread, 0.022, 6); V2[:, 1] = np.where(V2[:, 1] > bottom + 0.012, bottom + 0.018, V2[:, 1])
        V3, F3, U3 = tube([[cx, bottom + 0.15, zst], [cx, 1.115, zst]], 0.012, 6)
        V = np.r_[V1, V2, V3]; F = np.r_[F1, F2 + len(V1), F3 + len(V1) + len(V2)]; U = np.r_[U1, U2, U3]
        parts.append(dict(name='Iron' + nm, V=V, F=F, UV=U, mat='iron', bone='Stirrup.' + nm))
        STIR[nm] = dict(pivot=pivot, tread=np.array([cx, bottom + 0.02, zst]))
    for p in parts: p['N'] = normals(p['V'], p['F'])
    return parts, STIR

if __name__ == '__main__':
    parts, STIR = build()
    print({p['name']: (len(p['V']), len(p['F'])) for p in parts}); print(STIR)
    import pickle; pickle.dump((parts, STIR), open('/home/claude/horse/saddle.pkl', 'wb'))
