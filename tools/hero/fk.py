"""Forward kinematics + fcurve evaluation matching Blender conventions."""
import numpy as np, re, json

def bez_eval(k0, k1, x):
    # Blender bezier segment between keyframes k0,k1 at frame x
    if k0['ipo'] == 0:  # constant
        return k0['co'][1]
    if k0['ipo'] == 1:  # linear
        x0, y0 = k0['co']; x1, y1 = k1['co']
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0) if x1 != x0 else y0
    p0 = np.array(k0['co']); p1 = np.array(k0['hr']); p2 = np.array(k1['hl']); p3 = np.array(k1['co'])
    # clamp handles in x (Blender correct_bezpart)
    h1 = p1 - p0; h2 = p2 - p3; L = p3[0] - p0[0]
    if L <= 0: return p0[1]
    l1 = h1[0]; l2 = -h2[0]
    if l1 + l2 > L and l1 + l2 > 0:
        f = L / (l1 + l2); p1 = p0 + h1 * f; p2 = p3 + h2 * f
    # solve x(t)=x by bisection/newton
    lo, hi = 0.0, 1.0
    for _ in range(40):
        t = 0.5 * (lo + hi)
        xt = (1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t**2*p2[0] + t**3*p3[0]
        if xt < x: lo = t
        else: hi = t
    t = 0.5 * (lo + hi)
    return (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t**2*p2[1] + t**3*p3[1]

def fc_eval(keys, x):
    if not keys: return 0.0
    if x <= keys[0]['co'][0]: return keys[0]['co'][1]
    if x >= keys[-1]['co'][0]: return keys[-1]['co'][1]
    for i in range(len(keys) - 1):
        if keys[i]['co'][0] <= x <= keys[i+1]['co'][0]:
            return bez_eval(keys[i], keys[i+1], x)

def quat_to_mat(q):
    w, x, y, z = q
    n = np.sqrt(w*w + x*x + y*y + z*z) or 1.0
    w, x, y, z = w/n, x/n, y/n, z/n
    return np.array([[1-2*(y*y+z*z), 2*(x*y-w*z), 2*(x*z+w*y)],
                     [2*(x*y+w*z), 1-2*(x*x+z*z), 2*(y*z-w*x)],
                     [2*(x*z-w*y), 2*(y*z+w*x), 1-2*(x*x+y*y)]])

def mat_to_quat(m):
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2; w = 0.25 * s
        x = (m[2,1] - m[1,2]) / s; y = (m[0,2] - m[2,0]) / s; z = (m[1,0] - m[0,1]) / s
    elif m[0,0] > m[1,1] and m[0,0] > m[2,2]:
        s = np.sqrt(1.0 + m[0,0] - m[1,1] - m[2,2]) * 2
        w = (m[2,1] - m[1,2]) / s; x = 0.25 * s; y = (m[0,1] + m[1,0]) / s; z = (m[0,2] + m[2,0]) / s
    elif m[1,1] > m[2,2]:
        s = np.sqrt(1.0 + m[1,1] - m[0,0] - m[2,2]) * 2
        w = (m[0,2] - m[2,0]) / s; x = (m[0,1] + m[1,0]) / s; y = 0.25 * s; z = (m[1,2] + m[2,1]) / s
    else:
        s = np.sqrt(1.0 + m[2,2] - m[0,0] - m[1,1]) * 2
        w = (m[1,0] - m[0,1]) / s; x = (m[0,2] + m[2,0]) / s; y = (m[1,2] + m[2,1]) / s; z = 0.25 * s
    q = np.array([w, x, y, z]); return q / np.linalg.norm(q)

class Rig:
    def __init__(self, bones):
        self.bones = bones
        self.idx = {b['name']: i for i, b in enumerate(bones)}
        self.arm = {b['name']: np.array(b['arm_mat']).reshape(4, 4).T for b in bones}  # blender stores column-major
        self.parent = {b['name']: b['parent'] for b in bones}
        self.length = {b['name']: b['length'] for b in bones}

    def pose(self, basis):
        """basis: name -> 4x4 local transform. returns name -> 4x4 armature-space pose matrix."""
        out = {}
        for b in self.bones:  # bones listed parent-first
            n = b['name']; p = b['parent']
            B = basis.get(n, np.eye(4))
            if p is None:
                out[n] = self.arm[n] @ B
            else:
                rel = np.linalg.inv(self.arm[p]) @ self.arm[n]
                out[n] = out[p] @ rel @ B
        return out

def basis_from_action(action, frame):
    ch = {}
    for fc in action['fcurves']:
        m = re.match(r'pose\.bones\["(.+?)"\]\.(\w+)', fc['path'] or '')
        if not m: continue
        b, prop = m.groups()
        ch.setdefault(b, {}).setdefault(prop, {})[fc['index']] = fc_eval(fc['keys'], frame)
    out = {}
    for b, props in ch.items():
        M = np.eye(4)
        loc = [props.get('location', {}).get(i, 0.0) for i in range(3)]
        q = [props.get('rotation_quaternion', {}).get(i, 1.0 if i == 0 else 0.0) for i in range(4)]
        s = [props.get('scale', {}).get(i, 1.0) for i in range(3)]
        R = quat_to_mat(q)
        M[:3, :3] = R @ np.diag(s)
        M[:3, 3] = loc
        out[b] = M
    return out
