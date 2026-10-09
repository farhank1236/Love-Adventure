import sys, struct, numpy as np
sys.path.insert(0, '/home/claude/tools')
from blend import Blend

def read_mesh(B, mesh_name):
    mb = [b for b in B.blocks_of('ME') if B.read('ID', b.off, 'name') == mesh_name][0]
    off = mb.off
    nv = B.read('Mesh', off, 'totvert'); np_ = B.read('Mesh', off, 'totpoly'); nl = B.read('Mesh', off, 'totloop')
    t, n, o, s, d = B.field('Mesh', 'attribute_storage')
    so = off + o
    na = B.read('AttributeStorage', so, 'dna_attributes_num')
    ab = B.deref(B.read('AttributeStorage', so, 'dna_attributes'))
    asz = sum(f[3] for f in B.fields('Attribute'))
    attrs = {}
    for i in range(na):
        ao = ab.off + i * asz
        name = B.cstr(B.read('Attribute', ao, 'name'))
        dt = B.read('Attribute', ao, 'data_type'); dom = B.read('Attribute', ao, 'domain'); st = B.read('Attribute', ao, 'storage_type')
        dp = B.deref(B.read('Attribute', ao, 'data'))
        arr_ptr = B.read('AttributeArray', dp.off, 'data') if dp else 0
        db = B.deref(arr_ptr)
        attrs[name] = (dt, dom, st, db)
    def raw(name):
        return B.d[attrs[name][3].off: attrs[name][3].off + attrs[name][3].len]
    pos = np.frombuffer(raw('position'), dtype='<f4').reshape(-1, 3)[:nv]
    cv = np.frombuffer(raw('.corner_vert'), dtype='<i4')[:nl]
    pb = B.deref(B.read('Mesh', off, 'poly_offset_indices'))
    po = np.frombuffer(B.d[pb.off:pb.off + 4 * (np_ + 1)], dtype='<i4')
    tris = []
    for i in range(np_):
        a, b_ = po[i], po[i+1]
        c = cv[a:b_]
        for j in range(1, len(c) - 1): tris.append((c[0], c[j], c[j+1]))
    tris = np.array(tris)
    # vertex groups
    t, n, o, s, d = B.field('Mesh', 'vertex_group_names')
    vg = [B.read('bDeformGroup', g, 'name') for g in B.listbase(off + o, 'bDeformGroup')]
    t, n, o, s, d = B.field('Mesh', 'vdata')
    cd = off + o
    nlay = B.read('CustomData', cd, 'totlayer')
    lb = B.deref(B.read('CustomData', cd, 'layers'))
    lsz = sum(f[3] for f in B.fields('CustomDataLayer'))
    W = np.zeros((nv, len(vg)), dtype=np.float32)
    for i in range(nlay):
        lo = lb.off + i * lsz
        if B.read('CustomDataLayer', lo, 'type') == 2:  # MDEFORMVERT
            db = B.deref(B.read('CustomDataLayer', lo, 'data'))
            dsz = sum(f[3] for f in B.fields('MDeformVert'))
            for v in range(nv):
                vo = db.off + v * dsz
                cnt = B.read('MDeformVert', vo, 'totweight')
                if not cnt: continue
                wb = B.deref(B.read('MDeformVert', vo, 'dw'))
                arr = np.frombuffer(B.d[wb.off:wb.off + 8 * cnt], dtype=[('g', '<i4'), ('w', '<f4')])
                for g, w in arr:
                    if g < len(vg): W[v, g] += w
    uv = None
    for k, (dt, dom, st, db) in attrs.items():
        if dom == 3 and db and db.len == nl * 8 and not k.startswith('.'):
            uv = (k, np.frombuffer(raw(k), dtype='<f4').reshape(-1, 2))
    return {'pos': pos, 'tris': tris, 'groups': vg, 'W': W, 'attrs': {k: v[:3] for k, v in attrs.items()},
            'corner_vert': cv, 'poly_offsets': po, 'uv': uv}
