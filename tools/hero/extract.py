import sys, struct, json
sys.path.insert(0, '/home/claude/tools')
from blend import Blend

def ptr_array(B, ptr, n):
    b = B.deref(ptr)
    if not b: return []
    return list(struct.unpack_from("<%dQ" % n, B.d, b.off))

def read_fcurve(B, off):
    path = B.cstr(B.read('FCurve', off, 'rna_path'))
    idx = B.read('FCurve', off, 'array_index')
    n = B.read('FCurve', off, 'totvert')
    bp = B.read('FCurve', off, 'bezt')
    keys = []
    bb = B.deref(bp)
    sz = sum(f[3] for f in B.fields('BezTriple'))
    if bb:
        for i in range(n):
            o = bb.off + i * sz
            v = B.read('BezTriple', o, 'vec')
            keys.append({'co': v[3:5], 'hl': v[0:2], 'hr': v[6:8], 'ipo': B.read('BezTriple', o, 'ipo'),
                         'h1': B.read('BezTriple', o, 'h1'), 'h2': B.read('BezTriple', o, 'h2')})
    return {'path': path, 'index': idx, 'keys': keys}

def read_action(B, b):
    off = b.off
    out = {'name': B.read('ID', off, 'name')[2:], 'fcurves': [],
           'frame_start': B.read('bAction', off, 'frame_start'), 'frame_end': B.read('bAction', off, 'frame_end')}
    nk = B.read('bAction', off, 'strip_keyframe_data_array_num')
    for kp in ptr_array(B, B.read('bAction', off, 'strip_keyframe_data_array'), nk):
        kb = B.deref(kp)
        ncb = B.read('ActionStripKeyframeData', kb.off, 'channelbag_array_num')
        for cp in ptr_array(B, B.read('ActionStripKeyframeData', kb.off, 'channelbag_array'), ncb):
            cb = B.deref(cp)
            nf = B.read('ActionChannelBag', cb.off, 'fcurve_array_num')
            for fp in ptr_array(B, B.read('ActionChannelBag', cb.off, 'fcurve_array'), nf):
                out['fcurves'].append(read_fcurve(B, B.deref(fp).off))
    # legacy
    t, n, o, s, dm = B.field('bAction', 'curves')
    for fo in B.listbase(off + o, 'FCurve'):
        out['fcurves'].append(read_fcurve(B, fo))
    return out

def read_armature(B, b):
    bones = []
    def walk(lb_off, parent):
        for bo in B.listbase(lb_off, 'Bone'):
            name = B.read('Bone', bo, 'name')
            bones.append({'name': name, 'parent': parent,
                          'head': B.read('Bone', bo, 'arm_head'), 'tail': B.read('Bone', bo, 'arm_tail'),
                          'roll': B.read('Bone', bo, 'arm_roll'), 'arm_mat': B.read('Bone', bo, 'arm_mat'),
                          'length': B.read('Bone', bo, 'length'), 'flag': B.read('Bone', bo, 'flag'),
                          'inherit_scale_mode': B.read('Bone', bo, 'inherit_scale_mode')})
            t, n, o, s, dm = B.field('Bone', 'childbase')
            walk(bo + o, name)
    t, n, o, s, dm = B.field('bArmature', 'bonebase')
    walk(b.off + o, None)
    return bones

def read_objects(B):
    objs = {}
    for b in B.blocks_of('OB'):
        name = B.read('ID', b.off, 'name')[2:]
        par = B.deref(B.read('Object', b.off, 'parent'))
        data = B.deref(B.read('Object', b.off, 'data'))
        o = {'name': name, 'parent': B.read('ID', par.off, 'name')[2:] if par else None,
             'data': B.read('ID', data.off, 'name') if data else None,
             'type': B.read('Object', b.off, 'type'),
             'loc': B.read('Object', b.off, 'loc'), 'rot': B.read('Object', b.off, 'rot'),
             'size': B.read('Object', b.off, 'size'), 'rotmode': B.read('Object', b.off, 'rotmode'),
             'parentinv': B.read('Object', b.off, 'parentinv'),
             'partype': B.read('Object', b.off, 'partype'), 'parsubstr': B.read('Object', b.off, 'parsubstr')}
        pose = B.deref(B.read('Object', b.off, 'pose'))
        if pose:
            t, n, oo, s, dm = B.field('bPose', 'chanbase')
            chans = {}
            for co in B.listbase(pose.off + oo, 'bPoseChannel'):
                cons = []
                t2, n2, o2, s2, d2 = B.field('bPoseChannel', 'constraints')
                for cc in B.listbase(co + o2, 'bConstraint'):
                    cons.append({'name': B.read('bConstraint', cc, 'name'), 'type': B.read('bConstraint', cc, 'type')})
                chans[B.read('bPoseChannel', co, 'name')] = {
                    'rotmode': B.read('bPoseChannel', co, 'rotmode'), 'loc': B.read('bPoseChannel', co, 'loc'),
                    'quat': B.read('bPoseChannel', co, 'quat'), 'eul': B.read('bPoseChannel', co, 'eul'),
                    'size': B.read('bPoseChannel', co, 'size'), 'constraints': cons}
            o['pose'] = chans
        adt = B.deref(B.read('Object', b.off, 'adt'))
        if adt:
            act = B.deref(B.read('AnimData', adt.off, 'action'))
            o['action'] = B.read('ID', act.off, 'name')[2:] if act else None
        objs[name] = o
    return objs

if __name__ == '__main__':
    B = Blend(sys.argv[1])
    res = {'objects': read_objects(B), 'armatures': {}, 'actions': {}}
    for b in B.blocks_of('AR'):
        res['armatures'][B.read('ID', b.off, 'name')[2:]] = read_armature(B, b)
    for b in B.blocks_of('AC'):
        a = read_action(B, b); res['actions'][a['name']] = a
    json.dump(res, open(sys.argv[2], 'w'), indent=1)
    print('ok', {k: len(v) for k, v in res['armatures'].items()}, len(res['actions']))
