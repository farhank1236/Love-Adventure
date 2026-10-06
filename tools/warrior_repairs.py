"""Apply reviewed joint/skin repairs and a guard-relative blade extension, once."""
import json,math,struct
from pathlib import Path

def apply(g,binary,gender):
    manifest=json.loads((Path(__file__).parent/(gender+'-joint-bindings.json')).read_text())
    nodes=g['nodes'];skin=g['skins'][0];parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}
    world={}
    for i in skin['joints']:
        parent=parents.get(i);world[i]=tuple(a+b for a,b in zip(nodes[i].get('translation',[0,0,0]),world.get(parent,(0,0,0))))
    desired={i:tuple(manifest['joint_world_positions'].get(nodes[i]['name'],world[i])) for i in skin['joints']}
    def offset(index):
        a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];return v.get('byteOffset',0)+a.get('byteOffset',0)
    # Preserve all unaffected world joint positions and the original rest geometry.
    for i in skin['joints']:
        parent=parents.get(i);nodes[i]['translation']=[a-b for a,b in zip(desired[i],desired.get(parent,(0,0,0)))]
    ib=offset(skin['inverseBindMatrices'])
    for n,i in enumerate(skin['joints']):
        x,y,z=desired[i];struct.pack_into('<16f',binary,ib+n*64,1,0,0,0,0,1,0,0,0,0,1,0,-x,-y,-z,1)
    p=g['meshes'][0]['primitives'][0];j=offset(p['attributes']['JOINTS_0']);w=offset(p['attributes']['WEIGHTS_0'])
    for vertex,bones,weights in manifest['patches']:
        struct.pack_into('<4H',binary,j+vertex*8,*bones)
        total=sum(weights);struct.pack_into('<4f',binary,w+vertex*16,*[q/total for q in weights])
    extra=g.setdefault('extras',{})
    if not extra.get('bladeExtension'):
        tip=tuple(extra.get('swordTip',(-.253,-.366,.176) if gender=='female' else (.079,-.445,.474)))
        length=math.sqrt(sum(q*q for q in tip));axis=tuple(q/length for q in tip)
        guard=.065 if gender=='female' else .09
        sword=next(i for i,n in enumerate(nodes) if n['name']=='Sword');origin=desired[sword]
        # Female weapon has its own rigid mesh; male weapon uses rigid skin weights.
        for mesh_id,mesh in enumerate(g['meshes']):
            primitive=mesh['primitives'][0];pi=primitive['attributes']['POSITION'];a=g['accessors'][pi];po=offset(pi)
            separate=gender=='female' and mesh_id in [1,2]
            if mesh_id!=0 and not separate:continue
            for vertex in range(a['count']):
                if not separate:
                    bones=struct.unpack_from('<4H',binary,j+vertex*8);weights=struct.unpack_from('<4f',binary,w+vertex*16)
                    if not any(b==sword and q>.999 for b,q in zip(bones,weights)):continue
                pos=struct.unpack_from('<3f',binary,po+vertex*12);local=pos if separate else tuple(q-r for q,r in zip(pos,origin))
                along=sum(q*r for q,r in zip(local,axis));extension=.1*max(0,along-guard)
                new=[q+r*extension for q,r in zip(pos,axis)]
                struct.pack_into('<3f',binary,po+vertex*12,*new)
            # Recompute position bounds for Blender and renderer tooling.
            positions=[struct.unpack_from('<3f',binary,po+i*12) for i in range(a['count'])]
            a['min']=[min(p[k] for p in positions) for k in range(3)];a['max']=[max(p[k] for p in positions) for k in range(3)]
        extra.update(bladeExtension=1.1,swordTip=[q+axis[i]*.1*(length-guard) for i,q in enumerate(tip)],bladeGuard=guard)
    extra['rigNote']='Repaired anatomical knee/ankle alignment and normalized thigh/shin transitions; limb translations stay fixed.'
