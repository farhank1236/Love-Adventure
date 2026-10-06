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

def foot_transform(position,normal,manifest):
    x,y,z=position;ox,oy,oz=manifest['pivot'];x-=ox;z-=oz
    span=manifest['blendAbove']-manifest['fullBelow'];t=max(0,min(1,(y-manifest['fullBelow'])/span));w=1-t*t*(3-2*t)
    angle=math.radians(manifest['yawDegrees'])*w;c,s=math.cos(angle),math.sin(angle)
    point=(ox+c*x+s*z,y,oz-s*x+c*z)
    derivative=math.radians(manifest['yawDegrees'])*(-6*t*(1-t)/span) if 0<t<1 else 0
    # Inverse transpose of the twist Jacobian keeps the original surface normals coherent.
    nx,ny,nz=normal;X=c*nx+s*nz;Z=-s*nx+c*nz
    A=derivative*(-s*x+c*z);B=derivative*(-c*x-s*z);Y=ny-A*X-B*Z
    length=math.sqrt(X*X+Y*Y+Z*Z);return point,(X/length,Y/length,Z/length)

def align_male_boot(g,binary):
    import base64,gzip
    manifest=json.loads((Path(__file__).parent/'male-foot-alignment.json').read_text());pr=g['meshes'][0]['primitives'][0]
    def offset(i):
        a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];return v.get('byteOffset',0)+a.get('byteOffset',0)
    po,no=offset(pr['attributes']['POSITION']),offset(pr['attributes']['NORMAL']);selected=set(manifest['alignedVertices'])
    jo,wo=offset(pr['attributes']['JOINTS_0']),offset(pr['attributes']['WEIGHTS_0']);cape=next(i for i,n in enumerate(g['nodes']) if n['name']=='CapeBottom')
    for vertex,bones,weights,height in manifest['clothWeights']:
        u=max(0,min(1,(.18-height)/.05));u=u*u*(3-2*u);values={}
        for bone,weight in zip(bones,weights):values[bone]=values.get(bone,0)+weight*(1-u)
        values[cape]=values.get(cape,0)+u;entries=sorted(values.items(),key=lambda q:-q[1])[:4];entries+=[(0,0)]*(4-len(entries));total=sum(w for _,w in entries)
        struct.pack_into('<4H',binary,jo+vertex*8,*[i for i,_ in entries]);struct.pack_into('<4f',binary,wo+vertex*16,*[w/total for _,w in entries])
    foot=next(i for i,n in enumerate(g['nodes']) if n['name']=='LFoot')
    for vertex,bones,weights,height in manifest['bootWeights']:
        u=max(0,min(1,(.17-height)/.07));u=u*u*(3-2*u);values={}
        for bone,weight in zip(bones,weights):values[bone]=values.get(bone,0)+weight*(1-u)
        values[foot]=values.get(foot,0)+u;entries=sorted(values.items(),key=lambda q:-q[1])[:4];entries+=[(0,0)]*(4-len(entries));total=sum(w for _,w in entries)
        struct.pack_into('<4H',binary,jo+vertex*8,*[i for i,_ in entries]);struct.pack_into('<4f',binary,wo+vertex*16,*[w/total for _,w in entries])
    if g.get('extras',{}).get('leftBootAlignmentRevision')==2:return
    for row in struct.iter_unpack('<I6f',gzip.decompress(base64.b64decode(manifest['originalRecords']))):
        vertex,*values=row;point,normal=foot_transform(values[:3],values[3:],manifest) if vertex in selected else (values[:3],values[3:])
        struct.pack_into('<3f',binary,po+vertex*12,*point);struct.pack_into('<3f',binary,no+vertex*12,*normal)
    g.setdefault('extras',{})['leftBootAlignmentRevision']=2
    g['extras']['leftBootAlignment']='Existing left boot turned forward, with a smooth shin transition; design and texture preserved'
    a=g['accessors'][pr['attributes']['POSITION']];values=list(struct.iter_unpack('<3f',binary[po:po+a['count']*12]));a['min']=[min(p[k] for p in values) for k in range(3)];a['max']=[max(p[k] for p in values) for k in range(3)]
