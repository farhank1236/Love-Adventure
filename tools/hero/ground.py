"""lowest skinned-mesh point per frame (+ which bone region) -> ground contact / penetration check"""
import sys, pickle; sys.path.insert(0, '/home/claude/tools')
import numpy as np
import video3 as V
def ground(pkl, clip):
    D = pickle.load(open(pkl, 'rb')); V.CL = D['clips']; FS = V.FXSkin(); sk = FS.sk
    dom = np.array(sk.groups)[np.argmax(sk.Wt, 1)]; out = []
    for i in range(len(D['clips'][clip]['arr'])):
        layers, _, _ = FS.frame(clip, i); P = layers[0][0]; k = np.argmin(P[:, 2])
        sw = layers[1][0][:, 2].min() if len(layers) > 1 else 9
        out.append((i, round(float(P[k, 2]), 3), dom[k], round(float(sw), 3)))
    return out
if __name__ == '__main__':
    for r in ground(sys.argv[1], sys.argv[2]): print(*r)
