import numpy as np
class GLB:
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.acc = []
    def view(self, data, target=None):
        while len(self.bin) % 4: self.bin += b'\0'
        off = len(self.bin); self.bin += data
        v = dict(buffer=0, byteOffset=off, byteLength=len(data))
        if target: v['target'] = target
        self.views.append(v); return len(self.views) - 1
    def accessor(self, arr, comp, typ, target=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[comp]
        a = arr.astype(dt)
        w = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[typ]
        v = self.view(a.tobytes(), target)
        d = dict(bufferView=v, componentType=comp, count=int(a.size // w), type=typ)
        if minmax:
            r = a.reshape(-1, w); d['min'] = r.min(0).tolist(); d['max'] = r.max(0).tolist()
        self.acc.append(d); return len(self.acc) - 1
    def qaccessor(self, arr, comp, typ, normalized=False, stride=None):
        """integer (optionally normalized) vertex attribute; `stride` pads each element (glTF 4-byte vertex alignment)."""
        dt = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16}[comp]
        w = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[typ]
        a = np.ascontiguousarray(arr).astype(dt).reshape(-1, w); n = len(a)
        if stride and stride != a.itemsize * w:
            pad = np.zeros((n, stride // a.itemsize), dt); pad[:, :w] = a; a = pad
        v = self.view(a.tobytes(), 34962)
        if stride and stride != np.dtype(dt).itemsize * w: self.views[v]['byteStride'] = stride
        d = dict(bufferView=v, componentType=comp, count=n, type=typ)
        if normalized: d['normalized'] = True
        self.acc.append(d); return len(self.acc) - 1
    def sparse_vec3(self, dense, minmax=True):
        """float VEC3 accessor that stores only the non-zero rows (glTF sparse accessor, zero base)."""
        dense = np.asarray(dense, np.float32); idx = np.nonzero(np.abs(dense).max(1) > 1e-7)[0].astype(np.uint32)
        iv = self.view(idx.tobytes()); vv = self.view(dense[idx].tobytes())
        d = dict(componentType=5126, count=len(dense), type='VEC3',
                 sparse=dict(count=int(len(idx)), indices=dict(bufferView=iv, componentType=5125), values=dict(bufferView=vv)))
        if minmax: d['min'] = dense.min(0).tolist(); d['max'] = dense.max(0).tolist()
        self.acc.append(d); return len(self.acc) - 1
def q_normals(N):
    N = np.asarray(N, float); N = N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)
    return np.clip(np.round(N * 127), -127, 127)
def q_weights(W):
    W = np.asarray(W, float); W = W / W.sum(1, keepdims=True); q = np.floor(W * 255).astype(int)
    r = 255 - q.sum(1); o = np.argsort(-(W * 255 - q), 1)
    for k in range(4): q[np.arange(len(q)), o[:, k]] += (r > k)
    return q
def q_uv(UV, comp_name):
    UV = np.asarray(UV, float)
    if UV.min() < -1e-6 or UV.max() > 1 + 1e-6: return None
    return np.round(np.clip(UV, 0, 1) * 65535)

def vertex_normals(P, T, inv=None):
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    key = T if inv is None else inv[T]
    n = int(key.max()) + 1
    vn = np.zeros((n, 3))
    for k in range(3): np.add.at(vn, key[:, k], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
    return vn if inv is None else vn[inv]

