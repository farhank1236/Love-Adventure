"""Horse skeleton (horse space: y up, +z forward, +x = the horse's left side, metres, origin on the ground)."""
import numpy as np
def M(x): return (-x[0], x[1], x[2])
B = []   # (name, parent, head, tail)
def bone(n, p, h, t): B.append((n, p, np.array(h, float), np.array(t, float)))
bone('Root', None, (0, 0, 0), (0, 0, 0.3))
bone('Hips', 'Root', (0, 1.42, -0.30), (0, 1.48, -0.88))
bone('Tail1', 'Hips', (0, 1.47, -0.98), (0, 1.25, -1.07))
bone('Tail2', 'Tail1', (0, 1.25, -1.07), (0, 0.95, -1.13))
bone('Tail3', 'Tail2', (0, 0.95, -1.13), (0, 0.65, -1.20))
bone('Tail4', 'Tail3', (0, 0.65, -1.20), (0, 0.35, -1.27))
bone('Tail5', 'Tail4', (0, 0.35, -1.27), (0, 0.08, -1.32))
bone('Spine', 'Root', (0, 1.42, -0.30), (0, 1.45, 0.25))
bone('Chest', 'Spine', (0, 1.45, 0.25), (0, 1.55, 0.60))
bone('Neck1', 'Chest', (0, 1.55, 0.60), (0, 1.88, 0.83))
bone('Neck2', 'Neck1', (0, 1.88, 0.83), (0, 2.10, 0.98))
bone('Head', 'Neck2', (0, 2.10, 0.98), (0, 1.72, 1.32))
LEGS = {}
for s, f in (('L', lambda p: p), ('R', M)):
    bone('Scap.' + s, 'Chest', f((0.15, 1.62, 0.30)), f((0.20, 1.30, 0.66)))
    bone('Humerus.' + s, 'Scap.' + s, f((0.20, 1.30, 0.66)), f((0.18, 1.02, 0.42)))
    bone('Forearm.' + s, 'Humerus.' + s, f((0.18, 1.02, 0.42)), f((0.155, 0.58, 0.455)))
    bone('FCannon.' + s, 'Forearm.' + s, f((0.155, 0.58, 0.455)), f((0.152, 0.20, 0.445)))
    bone('FPastern.' + s, 'FCannon.' + s, f((0.152, 0.20, 0.445)), f((0.148, 0.03, 0.52)))
    bone('Thigh.' + s, 'Hips', f((0.19, 1.32, -0.70)), f((0.21, 0.97, -0.50)))
    bone('Gaskin.' + s, 'Thigh.' + s, f((0.21, 0.97, -0.50)), f((0.16, 0.57, -0.86)))
    bone('HCannon.' + s, 'Gaskin.' + s, f((0.16, 0.57, -0.86)), f((0.17, 0.20, -0.80)))
    bone('HPastern.' + s, 'HCannon.' + s, f((0.17, 0.20, -0.80)), f((0.176, 0.03, -0.75)))
NAMES = [b[0] for b in B]
PARENT = {b[0]: b[1] for b in B}
HEAD = {b[0]: b[2] for b in B}
TAIL = {b[0]: b[3] for b in B}
