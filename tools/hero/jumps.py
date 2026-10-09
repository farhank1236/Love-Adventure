"""max frame-to-frame rotation (relative to parent) per bone -> catches pops/flips"""
import sys, pickle; sys.path.insert(0, '/home/claude/tools')
import numpy as np
from run import HR
from bake import pose_baked
def jumps(pkl, clip, bones=None):
    D = pickle.load(open(pkl, 'rb')); C = D['clips'][clip]; prev = None; worst = {}
    bones = bones or [b for b in HR.bones if not b.startswith(('Cape', 'FrontRobe', 'SideRobe')) and 'Twist' not in b]
    for i in range(len(C['arr'])):
        pose_baked(HR, C['bones'], C['arr'], i)
        cur = {b: HR.world_rot(b) for b in bones}
        loc = {b: (cur[HR.rig.parent[b]].T @ cur[b]) if HR.rig.parent.get(b) in cur else cur[b] for b in bones}
        if prev is not None:
            for b in bones:
                R = prev[b].T @ loc[b]; a = np.degrees(np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1)))
                if a > worst.get(b, (0, 0))[0]: worst[b] = (round(a, 1), i)
        prev = loc
    return sorted(worst.items(), key=lambda x: -x[1][0])[:8]
if __name__ == '__main__':
    print(sys.argv[2], jumps(sys.argv[1], sys.argv[2]))
