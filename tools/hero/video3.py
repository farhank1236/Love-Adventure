import sys, os, pickle; sys.path.insert(0, '/home/claude/tools')
from run import *
from bake import pose_baked
from fist import curl, region
from fx import blade_shell, portal_mesh
from scipy.ndimage import gaussian_filter
D = pickle.load(open('/home/claude/work/clips_v3.pkl', 'rb'))
CL = D['clips']; META = D['meta']

def lqs2m(v):
    M = np.eye(4); M[:3, :3] = quat_to_mat(v[3:7]) @ np.diag(v[7:10]); M[:3, 3] = v[:3]; return M

class FXSkin:
    def __init__(self):
        self.sk = skinner(); sk = self.sk
        M = np.load('/home/claude/work/hero-rigged-2_mesh.npz'); G = list(M['groups'])
        self.P0 = M['pos'].astype(float); self.d = {}
        for s in 'RL':
            A = HR.rig.arm['Hand.' + s]; Lall = (np.linalg.inv(A) @ np.c_[self.P0, np.ones(len(self.P0))].T).T[:, :3]
            m = region(Lall) & (M['W'][:, G.index('Hand.' + s)] > 0.02)
            Lc = curl(Lall[m], 1.0, mirror=(s == 'L')); P = self.P0.copy()
            P[m] = (A @ np.c_[Lc, np.ones(len(Lc))].T).T[:, :3]; self.d[s] = P - self.P0
        self.SV, self.SF = blade_shell(sk.Sc, BLADE_START)
        self.portal = portal_mesh()
        self.Gm = np.eye(4); self.Gm[:3, :3] = R_SWORD_IN_HAND; self.Gm[:3, 3] = GRIP_IN_HAND

    def frame(self, clip, i):
        arr = CL[clip]['arr']; fx = CL[clip]['fx']; b = CL[clip]['bones']
        pose_baked(HR, b, arr, i)
        sk = self.sk
        fR, fL = float(fx[i, 7, 0]), float(fx[i, 7, 2])
        sk.P = self.P0 + fR * self.d['R'] + fL * self.d['L']
        body = sk.skin()
        Mh = HR.pose_m['Hand.R'] @ self.Gm               # Sword_Grip rest-relative pose (rest = hand @ G)
        Mg = Mh @ lqs2m(fx[i, 0])
        layers = [(body, sk.T, (0.80, 0.76, 0.72))]
        vis = fx[i, 0, 8]
        if vis > 0.02:
            sw = (Mg @ np.c_[sk.Sc, np.ones(len(sk.Sc))].T).T[:, :3]
            layers.append((sw, sk.ST, (0.86, 0.62, 0.20)))
        glows = []
        Ma = Mg @ lqs2m(fx[i, 1])
        a = fx[i, 1, 7]
        if a > 0.03 and vis > 0.02:
            glows.append(((Ma @ np.c_[self.SV, np.ones(len(self.SV))].T).T[:, :3], self.SF, a * 0.75))
        for k in range(4):
            Mk = lqs2m(fx[i, 2 + k]); s = fx[i, 2 + k, 7]
            if s > 0.03:
                glows.append(((Mk @ np.c_[self.SV, np.ones(len(self.SV))].T).T[:, :3], self.SF, s * (0.42, 0.30, 0.20, 0.12)[k] * 1.4))
        portal = []
        Mp = lqs2m(fx[i, 6]); ps = abs(fx[i, 6, 7])
        if ps > 0.03:
            for name, V, F, col, al in self.portal:
                portal.append(((Mp @ np.c_[V, np.ones(len(V))].T).T[:, :3], F, col))
        return layers, glows, portal

def draw(fs, layers, glows, portal, eye, tgt, fov, W=480, H=600, floor=0.0):
    img, z = render(layers + [(P, F, c) for P, F, c in portal], eye, tgt, W=W, H=H, fov=fov, light=(0.3, -0.7, 0.8), bg=(0.95, 0.95, 0.96), floor=floor, return_z=True)
    if portal:   # portal glow
        _, zp = render([(P, F, c) for P, F, c in portal], eye, tgt, W=W, H=H, fov=fov, return_z=True, flat=True)
        m = (np.isfinite(zp) & (zp <= z + 1e-4)).astype(float)
        g = gaussian_filter(m, 6) * 0.9
        img = img * (1 - g[..., None] * 0.5) + np.array([0.35, 0.7, 1.0]) * g[..., None] * 0.5
    acc = np.zeros(img.shape[:2])
    for P, F, a in glows:
        _, zg = render([(P, F, (1, 1, 1))], eye, tgt, W=W, H=H, fov=fov, return_z=True, flat=True)
        m = np.isfinite(zg) & (zg <= z + 0.02)
        core = m.astype(float)
        halo = gaussian_filter(core, 5) * 1.6 + gaussian_filter(core, 14) * 0.9
        acc = np.maximum(acc, a * np.clip(core * 0.55 + halo, 0, 1.2))
    acc = np.clip(acc, 0, 1)[..., None]
    blue = np.array([0.30, 0.68, 1.0]); white = np.array([0.85, 0.95, 1.0])
    img = img * (1 - acc * 0.75) + (blue * 0.8 + white * 0.2) * acc * 0.95
    return np.clip(img, 0, 1)

SEGMENTS = {
 'attacks': [('Hero_Sword_Idle', 1, 'Hero_Sword_Idle (guard)'), ('Hero_Attack_Combo', 1, None)],
 'states': [('Hero_Idle', 1, 'Hero_Idle (sword stored)'), ('Hero_Walk', 3, 'Hero_Walk - no enemy, sword stored'),
            ('Hero_Sword_Summon', 1, 'Hero_Sword_Summon - attack pressed'), ('Hero_Combat_Walk', 3, 'Hero_Combat_Walk - ready stance'),
            ('Hero_Sword_Dismiss', 1, 'Hero_Sword_Dismiss - 5 s without attacking')],
 'run': [('Hero_Run', 4, 'Hero_Run - sword stored'), ('Hero_Battle_Run', 5, 'Hero_Battle_Run - sword out'), ('Hero_Jump', 1, 'Hero_Jump')],
}
SPEED = {'Hero_Walk': 'walk', 'Hero_Run': 'run', 'Hero_Combat_Walk': 'combat_walk', 'Hero_Battle_Run': 'battle_run'}
NAMES = ['Hero_Attack1  forehand diagonal', 'Hero_Attack2  wide backhand sweep', 'Hero_Attack3  overhead chop', 'Hero_Attack4  backhand diagonal', 'Hero_Attack5  X cross finisher']
LOOPS = ('Hero_Idle', 'Hero_Walk', 'Hero_Run', 'Hero_Sword_Idle', 'Hero_Combat_Walk', 'Hero_Battle_Run')

def plan(which):
    fr = []
    for clip, rep, label in SEGMENTS[which]:
        n = len(CL[clip]['arr']); n = n - 1 if clip in LOOPS else n
        for r in range(rep):
            for i in range(n): fr.append((clip, i, label))
    return fr

if __name__ == '__main__':
    which, part, nparts = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    out = f'/home/claude/work/frames3_{which}'; os.makedirs(out, exist_ok=True)
    frames = plan(which); FS = FXSkin()
    cams = [((-3.4, -5.2, 1.6), (0, -0.55, 1.05), 30), ((3.8, -4.8, 1.5), (0, -0.55, 1.05), 30)] if which == 'attacks' else \
           [((-5.6, -1.6, 1.4), (0, -0.45, 1.05), 30), ((-3.2, -5.0, 1.5), (0, -0.45, 1.05), 30)]
    dist = []; d = 0.0
    for clip, i, lab in frames:
        dist.append(d); d += META['speeds'].get(SPEED.get(clip, ''), 0.0) / 30.0
    for k in range(part, len(frames), nparts):
        fn = f'{out}/f{k:04d}.png'
        if os.path.exists(fn): continue
        clip, i, label = frames[k]
        layers, glows, portal = FS.frame(clip, i)
        ims = [draw(FS, layers, glows, portal, e, t, fv, floor=-dist[k]) for e, t, fv in cams]
        pil = Image.fromarray((np.concatenate(ims, 1) * 255).astype(np.uint8)); dr = ImageDraw.Draw(pil)
        if label is None:
            bd = META['bounds']; j = max(q for q in range(5) if bd[q] <= i) if i < bd[-1] else 4
            label = NAMES[j]
            if any(abs(i - bd[j] - h) <= 1 for h in META['hits'][f'Hero_Attack{j + 1}']): dr.text((12, 42), 'HIT', fill=(200, 30, 30))
        dr.text((12, 10), label, fill=(30, 30, 30)); dr.text((12, 26), f'frame {i}', fill=(100, 100, 100))
        pil.save(fn)
