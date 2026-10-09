"""minimal glTF accessor reader with KHR_mesh_quantization (normalized ints, byteStride) and sparse support"""
import json, struct, numpy as np
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NW = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def load(path):
    d = open(path, 'rb').read(); L = struct.unpack_from('<I', d, 12)[0]; J = json.loads(d[20:20 + L]); b0 = 20 + L + 8
    def raw(view, dt, count, w, off=0):
        v = J['bufferViews'][view]; it = np.dtype(dt).itemsize; st = v.get('byteStride', it * w)
        o = b0 + v.get('byteOffset', 0) + off
        buf = np.frombuffer(d, np.uint8, count=st * (count - 1) + it * w, offset=o)
        rows = np.lib.stride_tricks.as_strided(buf, (count, it * w), (st, 1))
        return np.ascontiguousarray(rows).view(dt).reshape(count, w)
    def acc(i):
        a = J['accessors'][i]; w = NW[a['type']]; dt = CT[a['componentType']]
        x = raw(a['bufferView'], dt, a['count'], w, a.get('byteOffset', 0)).astype(np.float64) if 'bufferView' in a else np.zeros((a['count'], w))
        if a.get('normalized'):
            x = np.maximum(x / {np.int8: 127, np.uint8: 255, np.int16: 32767, np.uint16: 65535}[dt], -1)
        if 'sparse' in a:
            sp = a['sparse']; idx = raw(sp['indices']['bufferView'], CT[sp['indices']['componentType']], sp['count'], 1).ravel()
            x = x.copy(); x[idx] = raw(sp['values']['bufferView'], dt, sp['count'], w)
        return x if w > 1 else x.ravel()
    return J, acc, d, b0
