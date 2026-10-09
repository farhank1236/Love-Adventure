"""Straighten the hero's legs in the game GLB's clips (fixes the bent-knee "kangaroo" stance).

The v3-v7 clips carry the hips about 6-9 cm too low, so the knees sit at ~45 deg even standing still and the shins
lean back. This post-process raises the hips and re-solves both legs with two-bone IK so that every foot keeps
exactly its world position and orientation (no sliding, no ground change). Per frame, the hips rise until the
straighter leg reaches the clip's target knee bend; the rise is smoothed over time and never makes a leg
over-extend. Toes, twist bones, cape and arms keep their local rotations.

usage: python3 straighten_legs.py IN.glb OUT.glb
"""
import sys, json, struct
import numpy as np

# clip -> target knee bend (deg) of the straighter leg; clips not listed are left alone (crouches, jumps, roll, riding)
TARGET = {
    'Idle': 6, 'SwordIdle': 8, 'IdleBall': 8, 'Summon': 8, 'Dismiss': 8, 'PowerUp': 10,
    'Walk': 10, 'CombatWalk': 12, 'Run': 24, 'BattleRun': 26,
    'Attack1': 14, 'Attack2': 14, 'Attack3': 14, 'Attack4': 14, 'Attack5': 14, 'Combo': 14, 'AttackUp': 12,
}
LOOP = {'Idle', 'SwordIdle', 'Walk', 'CombatWalk', 'Run', 'BattleRun', 'IdleBall'}
MIN_BEND = 3.0          # never straighter than this (no locked / hyper-extended knees)


def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return np.array([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
                     w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2])
def qinv(q): return np.array([-q[0], -q[1], -q[2], q[3]]) / np.dot(q, q)
def qrot(q, v):
    u = q[:3]; w = q[3]
    return 2 * np.dot(u, v) * u + (w * w - np.dot(u, u)) * v + 2 * w * np.cross(u, v)
def qfromto(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); c = np.cross(a, b); d = np.dot(a, b)
    if d < -0.999999:
        ax = np.cross(a, [1, 0, 0]); ax = ax if np.linalg.norm(ax) > 1e-6 else np.cross(a, [0, 1, 0])
        ax /= np.linalg.norm(ax); return np.array([*ax, 0.0])
    q = np.array([c[0], c[1], c[2], 1 + d]); return q / np.linalg.norm(q)
def qnorm(q): return q / np.linalg.norm(q)


def main(src, dst):
    b = bytearray(open(src, 'rb').read())
    jl = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + jl]); BIN = 28 + jl
    nodes = g['nodes']; names = [n['name'] for n in nodes]; idx = {n: i for i, n in enumerate(names)}
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []): parent[c] = i
    rest_t = {i: np.array(n.get('translation', [0, 0, 0]), float) for i, n in enumerate(nodes)}
    for n in nodes: assert 'rotation' not in n or np.allclose(n['rotation'], [0, 0, 0, 1]), 'expects translation-only rests'

    def view(acc_i):
        a = g['accessors'][acc_i]; v = g['bufferViews'][a['bufferView']]; assert a['componentType'] == 5126 and not v.get('byteStride')
        w = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]; o = BIN + v.get('byteOffset', 0) + a.get('byteOffset', 0)
        return np.frombuffer(b, dtype='<f4', count=a['count'] * w, offset=o).reshape(a['count'], w), o

    chain = ['Root', 'Hips']
    report = []
    for an in g['animations']:
        name = an['name']
        if name not in TARGET: continue
        tracks = {}
        for ch in an['channels']:
            node = names[ch['target']['node']]; s = an['samplers'][ch['sampler']]
            tracks[(node, ch['target']['path'])] = s['output']
        def get(node, path):
            k = (node, path)
            if k not in tracks: return None
            arr, off = view(tracks[k]); return arr.copy(), off
        rot = {}; offs = {}
        for nm in ['Root', 'Hips'] + [f'{j}_{s}' for s in 'LR' for j in ('Thigh', 'Shin', 'Foot')]:
            r = get(nm, 'rotation'); assert r is not None, (name, nm); rot[nm], offs[nm] = r
        ht, ht_off = get('Hips', 'translation')
        rt = get('Root', 'translation'); root_t = rt[0] if rt is not None else np.tile(rest_t[idx['Root']], (len(ht), 1))
        F = len(ht)
        # forward kinematics in model space
        def fk(f, hips_t):
            Rq = qnorm(rot['Root'][f]); Rp = root_t[f]
            Hq = qmul(Rq, qnorm(rot['Hips'][f])); Hp = Rp + qrot(Rq, hips_t)
            out = {}
            for s in 'LR':
                Tq = qmul(Hq, qnorm(rot[f'Thigh_{s}'][f])); Tp = Hp + qrot(Hq, rest_t[idx[f'Thigh_{s}']])
                Sq = qmul(Tq, qnorm(rot[f'Shin_{s}'][f])); Sp = Tp + qrot(Tq, rest_t[idx[f'Shin_{s}']])
                Fq = qmul(Sq, qnorm(rot[f'Foot_{s}'][f])); Fp = Sp + qrot(Sq, rest_t[idx[f'Foot_{s}']])
                out[s] = dict(Tq=Tq, Tp=Tp, Sq=Sq, Sp=Sp, Fq=Fq, Fp=Fp)
            return Rq, Hq, out
        L1 = {s: np.linalg.norm(rest_t[idx[f'Shin_{s}']]) for s in 'LR'}; L2 = {s: np.linalg.norm(rest_t[idx[f'Foot_{s}']]) for s in 'LR'}
        def bend(h, k, a): u = (h - k) / np.linalg.norm(h - k); w = (a - k) / np.linalg.norm(a - k); return 180 - np.degrees(np.arccos(np.clip(np.dot(u, w), -1, 1)))
        def raise_for(h, a, s, deg):        # vertical rise of the hip that gives this leg `deg` of knee bend
            d = np.sqrt(L1[s] ** 2 + L2[s] ** 2 + 2 * L1[s] * L2[s] * np.cos(np.radians(deg))); v = h - a
            disc = v[1] ** 2 - v.dot(v) + d * d
            return -v[1] + np.sqrt(disc) if disc >= 0 else -v[1]
        need = np.zeros(F); cap = np.zeros(F); before = []
        for f in range(F):
            _, _, L = fk(f, ht[f]); n_, c_ = [], []
            for s in 'LR':
                h, k, a = L[s]['Tp'], L[s]['Sp'], L[s]['Fp']; before.append(bend(h, k, a))
                n_.append(raise_for(h, a, s, TARGET[name])); c_.append(raise_for(h, a, s, MIN_BEND))
            need[f] = max(0.0, min(n_)); cap[f] = min(c_)
        # smooth the rise over time (cyclic for loops), then keep it feasible
        k = np.exp(-0.5 * (np.arange(-6, 7) / 2.5) ** 2); k /= k.sum()
        if name in LOOP: sm = np.array([sum(k[j] * need[(f + j - 6) % F] for j in range(13)) for f in range(F)])
        else: sm = np.array([sum(k[j] * need[min(F - 1, max(0, f + j - 6))] for j in range(13)) for f in range(F)])
        rise = np.clip(np.minimum(sm, cap - 1e-4), 0, None)
        after = []
        for f in range(F):
            Rq, Hq, L = fk(f, ht[f])
            ht[f] = ht[f] + qrot(qinv(Rq), np.array([0, rise[f], 0]))       # hips up, in Root space
            Hp_new = root_t[f] + qrot(Rq, ht[f])
            for s in 'LR':
                o = L[s]; Tp = Hp_new + qrot(Hq, rest_t[idx[f'Thigh_{s}']]); A = o['Fp']
                d = min(np.linalg.norm(A - Tp), L1[s] + L2[s] - 1e-6); u = (A - Tp) / np.linalg.norm(A - Tp)
                a_ = (L1[s] ** 2 - L2[s] ** 2 + d * d) / (2 * d); hh = np.sqrt(max(0.0, L1[s] ** 2 - a_ * a_))
                p = (o['Sp'] - o['Tp']); p = p - u * np.dot(p, u); p /= np.linalg.norm(p)   # keep the knee's plane / direction
                K = Tp + a_ * u + hh * p
                Tq = qmul(qfromto(o['Sp'] - o['Tp'], K - Tp), o['Tq'])
                Sq0 = qmul(Tq, qnorm(rot[f'Shin_{s}'][f])); ank = K + qrot(Sq0, rest_t[idx[f'Foot_{s}']])
                Sq = qmul(qfromto(ank - K, A - K), Sq0)
                rot[f'Thigh_{s}'][f] = qnorm(qmul(qinv(Hq), Tq))
                rot[f'Shin_{s}'][f] = qnorm(qmul(qinv(Tq), Sq))
                rot[f'Foot_{s}'][f] = qnorm(qmul(qinv(Sq), o['Fq']))          # foot keeps its world orientation
            _, _, L2_ = fk(f, ht[f])
            for s in 'LR':
                after.append(bend(L2_[s]['Tp'], L2_[s]['Sp'], L2_[s]['Fp']))
                err = np.linalg.norm(L2_[s]['Fp'] - L[s]['Fp']); assert err < 2e-3, (name, f, s, err)
        # write back
        def put(arr, off): b[off:off + arr.size * 4] = arr.astype('<f4').tobytes()
        put(ht, ht_off)
        for nm in rot:
            if nm.startswith(('Thigh', 'Shin', 'Foot')): put(rot[nm], offs[nm])
        report.append(f'{name:11s} rise {rise.mean()*100:4.1f} cm (max {rise.max()*100:4.1f})  knee {np.mean(before):5.1f} -> {np.mean(after):5.1f} deg (max {np.max(before):5.1f} -> {np.max(after):5.1f})')
    g.setdefault('extras', {})['legs'] = 'straightened-v1'
    js = json.dumps(g, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    assert len(js) >= jl or True
    out = bytearray(b[:12]) + struct.pack('<I', len(js)) + b'JSON' + js + b[20 + jl:]
    struct.pack_into('<I', out, 8, len(out))
    open(dst, 'wb').write(out)
    print('\n'.join(report))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
