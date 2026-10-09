"""Pack the Poly Haven 4K material sets into game-ready 1024 px layers.

For every material: <name>_c.jpg  = albedo (sRGB) with a light cavity occlusion baked in
                    <name>_n.jpg  = R,G = tangent normal x,y (0.5 = flat), B = roughness
The normal is rebuilt from the 16-bit displacement map (the EXR normal maps use DWAA, which no
available tool decodes); its strength is calibrated per material. Tangent +y = increasing image row,
which is +v once the browser uploads the pixels into a DataArrayTexture (no flip).
Usage: python3 build_textures.py <dir with textures/> <out dir>"""
import sys, json, os, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
SRC, OUT = sys.argv[1], sys.argv[2]
N = 1024
# name: (normal RMS slope, cavity strength, base roughness, roughness spread)
MATS = {
  'rocky_terrain_02':   (0.42, 0.30, 0.90, 0.10),
  'farm_soil':          (0.45, 0.30, 0.92, 0.08),
  'aerial_rocks_02':    (0.55, 0.40, 0.85, 0.12),
  'dark_rock':          (0.35, 0.30, 0.72, 0.18),
  'dry_river_pebbles':  (0.60, 0.45, 0.70, 0.20),
  'grassy_cobblestone': (0.50, 0.45, 0.80, 0.15),
  'marble_cliff_05':    (0.35, 0.30, 0.60, 0.20),
  'stone_wall_04':      (0.55, 0.45, 0.82, 0.12),
  'wooden_garage_door': (0.35, 0.35, 0.62, 0.15),
  'eucalyptus_bark':    (0.55, 0.40, 0.88, 0.08),
  'metal_plate_02':     (0.25, 0.25, 0.55, 0.30),
}
def wrap_resize(a, n, clip=True):
    """resize a tileable HxW(xC) float array to n x n without edge seams"""
    h = a.shape[0]; p = h // 32
    big = np.pad(a, ((p, p), (p, p)) + ((0, 0),) * (a.ndim - 2), mode='wrap')
    s = n / h; q = round(p * s)
    chans = [big] if a.ndim == 2 else [big[..., c] for c in range(a.shape[2])]
    out = [np.asarray(Image.fromarray(c.astype(np.float32), 'F').resize((round(big.shape[1] * s),) * 2, Image.LANCZOS)) for c in chans]
    out = [o[q:q + n, q:q + n] for o in out]
    out = out[0] if a.ndim == 2 else np.stack(out, -1)
    return np.maximum(out, 0) if clip else out
def blur(a, sigma):
    f = np.fft.fftfreq(a.shape[0]); k = np.exp(-2 * (np.pi * sigma) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * k))
def load(path):
    im = Image.open(path)
    if im.mode in ('I;16', 'I;16B', 'I'): return np.asarray(im, dtype=np.float32) / 65535.0
    return np.asarray(im.convert('RGB') if im.mode not in ('L',) else im, dtype=np.float32) / 255.0
meta = {}
os.makedirs(OUT, exist_ok=True)
for name, (rms, cavK, r0, rs) in MATS.items():
    T = os.path.join(SRC, 'textures', name)
    diff = load(T + '_diff_4k.jpg')
    disp = load(T + '_disp_4k.png')
    if disp.ndim == 3: disp = disp.mean(-1)
    if diff.ndim == 2: diff = np.stack([diff] * 3, -1)
    h = wrap_resize(disp, 2048)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2
    g = np.sqrt(gx ** 2 + gy ** 2); k = rms / max(1e-6, np.sqrt((g ** 2).mean()))
    nx, ny = -gx * k, -gy * k                       # +y = increasing row
    nz = np.ones_like(nx); l = np.sqrt(nx ** 2 + ny ** 2 + 1); n3 = np.stack([nx / l, ny / l, nz / l], -1)
    n3 = wrap_resize(n3, N, clip=False); n3 /= np.linalg.norm(n3, axis=-1, keepdims=True)
    h1 = wrap_resize(disp, N); d = blur(h1, 10) - h1   # positive in pits
    cav = 1 - np.clip(d / max(1e-6, np.percentile(d, 98)), 0, 1)     # 0 in the deepest pits
    occl = 1 - cavK * (1 - cav)
    alb = wrap_resize(diff, N) ** 2.2 * occl[..., None]               # to linear, occlude, back to sRGB
    alb = np.clip(alb, 0, 1) ** (1 / 2.2)
    rp = T + '_rough_4k.jpg'
    if os.path.exists(rp): r_ = load(rp); rough = wrap_resize(r_ if r_.ndim == 2 else r_.mean(-1), N)
    else:
        lum = alb.mean(-1); rough = r0 + rs * ((1 - cav) - 0.3) * 1.5 - rs * (lum - lum.mean()) / (lum.std() + 1e-6) * 0.5
    rough = np.clip(rough, 0.05, 1)
    Image.fromarray((alb * 255 + 0.5).astype(np.uint8)).save(f'{OUT}/{name}_c.jpg', quality=86, subsampling=2, optimize=True)
    pk = np.stack([n3[..., 0] * 0.5 + 0.5, n3[..., 1] * 0.5 + 0.5, rough], -1)
    Image.fromarray((np.clip(pk, 0, 1) * 255 + 0.5).astype(np.uint8)).save(f'{OUT}/{name}_n.jpg', quality=80, subsampling=0, optimize=True)
    lin = (alb ** 2.2).reshape(-1, 3).mean(0)
    meta[name] = {'mean': [round(float(v), 4) for v in lin], 'rough': round(float(rough.mean()), 3)}
    print(name, meta[name], os.path.getsize(f'{OUT}/{name}_c.jpg') // 1024, 'KB +', os.path.getsize(f'{OUT}/{name}_n.jpg') // 1024, 'KB', flush=True)
json.dump(meta, open(f'{OUT}/materials.json', 'w'), indent=1)
