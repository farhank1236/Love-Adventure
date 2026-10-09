import sys, json, struct, numpy as np
sys.path.insert(0, '/home/claude/tools')
from solver import *
from render import render

class Skinner:
    def __init__(self, HR, decimate=1):
        M = np.load('/home/claude/work/hero-rigged-2_mesh.npz')
        self.P = M['pos'].astype(np.float64); self.T = M['tris']; self.Wt = M['W']
        self.groups = list(M['groups'])
        self.gidx = [HR.bones.index(g) if g in HR.bones else -1 for g in self.groups]
        self.HR = HR
        self.inv_arm = {n: np.linalg.inv(HR.rig.arm[n]) for n in HR.bones}
        # sparse top-4 weights for speed
        Wt = self.Wt
        top = np.argsort(-Wt, axis=1)[:, :4]
        w = np.take_along_axis(Wt, top, 1); w /= w.sum(1, keepdims=True) + 1e-12
        self.top, self.w = top, w
        S = np.load('/home/claude/work/sword_pos.npy')
        d = open('/mnt/user-data/uploads/GeminiGeneratedImagez0vn5oz0vn5o.glb', 'rb').read()
        L = struct.unpack_from('<I', d, 12)[0]; J = json.loads(d[20:20+L]); b0 = 20 + L + 8
        bv = J['bufferViews'][3]
        self.ST = np.frombuffer(d[b0+bv['byteOffset']:b0+bv['byteOffset']+bv['byteLength']], dtype='<u4').reshape(-1, 3)
        # canonical sword coords: (edge, blade-from-grip, flat)
        self.Sc = reshape_blade(np.stack([S[:, 0], -S[:, 2] - GRIP_FROM_POMMEL / SWORD_SCALE, S[:, 1]], 1) * SWORD_SCALE)

    def skin(self):
        HR = self.HR
        mats = np.stack([HR.pose_m[g] @ self.inv_arm[g] if g in HR.pose_m else np.eye(4) for g in self.groups])
        out = np.zeros_like(self.P)
        Ph = np.c_[self.P, np.ones(len(self.P))]
        for k in range(4):
            Mk = mats[self.top[:, k]]
            out += self.w[:, k:k+1] * np.einsum('nij,nj->ni', Mk[:, :3, :], Ph)
        return out

    def sword(self):
        HR = self.HR
        Rh = HR.world_rot('Hand.R'); g = HR.world_head('Hand.R') + Rh @ GRIP_IN_HAND
        Rs = Rh @ R_SWORD_IN_HAND @ rot((0, 1, 0), getattr(HR, 'sword_roll', 0.0))
        sv = getattr(HR, 'sword_vis', 1.0)
        return g + (self.Sc * np.array([max(sv, 1e-3) ** 0.5, max(sv, 1e-3), max(sv, 1e-3) ** 0.5])) @ Rs.T

def views(sk, cams, W=360, H=480):
    body = sk.skin(); sw = sk.sword()
    ims = []
    for eye, tgt, fov in cams:
        ims.append(render([(body, sk.T, (0.78, 0.74, 0.70)), (sw, sk.ST, (0.85, 0.65, 0.25))], eye, tgt, W=W, H=H, fov=fov))
    return np.concatenate(ims, 1)

CAMS = [((-3.2, -5.2, 1.6), (0, -0.4, 1.0), 30), ((-6.5, -0.4, 1.3), (0, -0.4, 1.0), 26), ((3.5, -4.8, 1.6), (0, -0.4, 1.0), 30)]
