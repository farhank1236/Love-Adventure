"""min distance between blade and body (excluding hands/forearms) per frame: python clearance.py PKL CLIP"""
import sys, pickle; sys.path.insert(0, '/home/claude/tools')
import numpy as np
from scipy.spatial import cKDTree
import video3 as V
def check(pkl, clip, step=1):
    D = pickle.load(open(pkl, 'rb')); V.CL = D['clips']; FS = V.FXSkin(); sk = FS.sk
    G = sk.groups; W = sk.Wt
    hand = np.zeros(len(sk.P), bool)
    for g in ('Hand.R', 'Forearm.R', 'ForearmTwist.R'):
        if g in G: hand |= W[:, G.index(g)] > 0.15
    for g in [x for x in G if 'Finger' in x or 'Thumb' in x or 'Index' in x or 'Middle' in x or 'Ring' in x or 'Pinky' in x]:
        hand |= W[:, G.index(g)] > 0.15
    blade = sk.Sc[:, 1] > 0.12; res = []
    for i in range(0, len(D['clips'][clip]['arr']), step):
        layers, _, _ = FS.frame(clip, i)
        if len(layers) < 2: res.append(9); continue
        body = layers[0][0][~hand]; sw = layers[1][0][blade][::7]
        d, _ = cKDTree(body).query(sw); res.append(float(d.min()))
    return np.array(res)
if __name__ == '__main__':
    r = check(sys.argv[1], sys.argv[2]); print(sys.argv[2], 'min clearance %.3f m at frame %d' % (r.min(), r.argmin()), np.round(r, 3).tolist())
