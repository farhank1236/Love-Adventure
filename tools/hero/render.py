"""Tiny numpy triangle rasterizer (z-buffer, flat-ish shading) for previews."""
import numpy as np

def vert_normals(P, T):
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    vn = np.zeros_like(P)
    for k in range(3): np.add.at(vn, T[:, k], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
    return vn

def look_at(eye, target, up=(0, 0, 1)):
    eye = np.array(eye, float); f = np.array(target, float) - eye; f /= np.linalg.norm(f)
    r = np.cross(f, up); r /= np.linalg.norm(r); u = np.cross(r, f)
    return eye, np.stack([r, u, -f])  # rows: camera x, y, z(back)

def render(layers, eye, target, W=480, H=640, fov=35, light=(0.4, -0.8, 0.6), bg=(0.93, 0.93, 0.95), ortho=None, floor=None, glow=None, return_z=False, flat=False):
    """layers: list of (P, T, color(3,) or per-vertex colors (N,3))."""
    eye, Rc = look_at(eye, target)
    img = np.ones((H, W, 3)) * np.array(bg)
    zbuf = np.full((H, W), np.inf)
    L = np.array(light, float); L /= np.linalg.norm(L)
    f = 0.5 * H / np.tan(np.radians(fov) / 2)
    if floor is not None:   # analytic checker ground plane z=0; floor = y-offset of the pattern (metres)
        yy, xx = np.mgrid[0:H, 0:W]
        dirc = np.stack([(xx - W / 2) / f, -(yy - H / 2) / f, -np.ones_like(xx, float)], -1)
        dw = dirc @ Rc
        t = -eye[2] / np.where(np.abs(dw[..., 2]) < 1e-9, -1e-9, dw[..., 2])
        hit = t > 0
        px = eye[0] + t * dw[..., 0]; py = eye[1] + t * dw[..., 1] + floor
        chk = ((np.floor(px / 0.5) + np.floor(py / 0.5)) % 2 == 0)
        fade = np.clip(1 - np.hypot(px, py + 0.3 - floor) / 7.0, 0, 1)
        colf = np.where(chk[..., None], np.array([0.80, 0.80, 0.82]), np.array([0.69, 0.69, 0.72]))
        colf = colf * fade[..., None] + np.array(bg) * (1 - fade[..., None])
        img[hit] = colf[hit]
        zbuf[hit] = t[hit]   # camera-space depth = t along -z (dirc z = -1)
    for P, T, col in layers:
        vn = vert_normals(P, T)
        pc = (P - eye) @ Rc.T
        z = -pc[:, 2]
        if ortho:
            sx = W / 2 + pc[:, 0] * (H / ortho); sy = H / 2 - pc[:, 1] * (H / ortho)
        else:
            sx = W / 2 + f * pc[:, 0] / z; sy = H / 2 - f * pc[:, 1] / z
        shade = np.ones(len(P)) if flat else np.clip(vn @ L, 0, 1) * 0.65 + 0.35 + 0.15 * np.clip(vn @ (-Rc[2]), 0, 1) * 0
        vc = (np.ones((len(P), 3)) * np.array(col)) if np.ndim(col) == 1 else col
        vc = vc * shade[:, None]
        # rasterize triangles via barycentric on bounding boxes (vectorized per small tris: use centroid splat + vertex splat)
        tri = T
        x = sx[tri]; y = sy[tri]; zz = z[tri]
        keep = (zz.min(1) > 0.05)
        x, y, zz, tri = x[keep], y[keep], zz[keep], tri[keep]
        zf = zbuf.reshape(-1); imf = img.reshape(-1, 3)
        for c0 in range(0, len(tri), 40000):
            sl = slice(c0, c0 + 40000)
            xs, ys, zs, ts = x[sl], y[sl], zz[sl], tri[sl]
            area = np.abs((xs[:, 1] - xs[:, 0]) * (ys[:, 2] - ys[:, 0]) - (xs[:, 2] - xs[:, 0]) * (ys[:, 1] - ys[:, 0])) / 2
            n = np.clip(np.ceil(area * 2.5), 1, 150).astype(int)
            idx = np.repeat(np.arange(len(ts)), n)
            r1 = np.random.rand(len(idx)); r2 = np.random.rand(len(idx))
            sq = np.sqrt(r1); a = 1 - sq; b = sq * (1 - r2); c = sq * r2
            px = a * xs[idx, 0] + b * xs[idx, 1] + c * xs[idx, 2]
            py = a * ys[idx, 0] + b * ys[idx, 1] + c * ys[idx, 2]
            pz = a * zs[idx, 0] + b * zs[idx, 1] + c * zs[idx, 2]
            cc = a[:, None] * vc[ts[idx, 0]] + b[:, None] * vc[ts[idx, 1]] + c[:, None] * vc[ts[idx, 2]]
            ix = np.round(px).astype(int); iy = np.round(py).astype(int)
            ok = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
            lin = (iy * W + ix)[ok]; pz = pz[ok]; cc = cc[ok]
            order = np.lexsort((pz, lin))
            lin, pz, cc = lin[order], pz[order], cc[order]
            first = np.r_[True, lin[1:] != lin[:-1]] if len(lin) else np.zeros(0, bool)
            lin, pz, cc = lin[first], pz[first], cc[first]
            better = pz < zf[lin]
            zf[lin[better]] = pz[better]; imf[lin[better]] = cc[better]
    if glow:
        acc = np.zeros((H, W, 3)); zf = zbuf.reshape(-1)
        for P, T, col, alpha in glow:
            if alpha <= 0.003 or len(T) == 0: continue
            pc = (P - eye) @ Rc.T; z = -pc[:, 2]
            sx = W / 2 + f * pc[:, 0] / np.maximum(z, 1e-3); sy = H / 2 - f * pc[:, 1] / np.maximum(z, 1e-3)
            x = sx[T]; y = sy[T]; zz = z[T]; keep = zz.min(1) > 0.05
            x, y, zz = x[keep], y[keep], zz[keep]
            area = np.abs((x[:, 1] - x[:, 0]) * (y[:, 2] - y[:, 0]) - (x[:, 2] - x[:, 0]) * (y[:, 1] - y[:, 0])) / 2
            n = np.clip(np.ceil(area * 2.0), 1, 400).astype(int)
            idx = np.repeat(np.arange(len(x)), n)
            r1 = np.random.rand(len(idx)); r2 = np.random.rand(len(idx)); sq = np.sqrt(r1)
            a = 1 - sq; b = sq * (1 - r2); c = sq * r2
            px = a * x[idx, 0] + b * x[idx, 1] + c * x[idx, 2]; py = a * y[idx, 0] + b * y[idx, 1] + c * y[idx, 2]
            pz = a * zz[idx, 0] + b * zz[idx, 1] + c * zz[idx, 2]
            ix = np.round(px).astype(int); iy = np.round(py).astype(int)
            ok = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
            lin = (iy * W + ix)[ok]; pz = pz[ok]
            vis = pz < zf[lin] + 0.02
            m = np.zeros(H * W, bool); m[lin[vis]] = True
            acc.reshape(-1, 3)[m] += np.array(col) * alpha
        from scipy.ndimage import gaussian_filter
        halo = np.stack([gaussian_filter(acc[..., k], 4.0) for k in range(3)], -1)
        img = img * (1 - np.clip(acc.max(-1, keepdims=True), 0, 0.6)) + acc * 1.1 + halo * 1.6
    if return_z: return np.clip(img, 0, 1), zbuf
    return np.clip(img, 0, 1)
