"""Add conservative finger/ thumb curl controls to the existing hand geometry.
These controls keep the closed sword grip; they do not remodel or replace fingers.
"""
import struct,math

def apply(g,binary,gender):
 if g.get('extras',{}).get('handControls'):
  refresh(g,binary,gender);return
 skin=g['skins'][0];count=len(skin['joints']);parents={c:i for i,n in enumerate(g['nodes']) for c in n.get('children',[])};world={}
 for i in skin['joints']:
  world[i]=[a+b for a,b in zip(g['nodes'][i]['translation'],world.get(parents.get(i),[0,0,0]))]
 lookup={n['name']:i for i,n in enumerate(g['nodes'])}
 # Keep skin joint indices contiguous and move only scene mesh-node references.
 for node in g['nodes']:
  if 'children'in node:node['children']=[c+4 if c>=count else c for c in node['children']]
 for scene in g['scenes']:scene['nodes']=[i+4 if i>=count else i for i in scene['nodes']]
 added=[]
 for side in ['R','L']:
  for part in ['Fingers','Thumb']:
   h=lookup[side+'Hand'];d=(0,-.020,.006) if gender=='female' else ((.008,0,.015) if side=='R' else (0,-.014,.004))
   if part=='Thumb':d=(d[0]+(-.009 if side=='R' else .009),d[1]*.5,d[2]*.5)
   index=count+len(added);g['nodes'][h].setdefault('children',[]).append(index);added.append(dict(name=side+part,translation=list(d)));world[index]=[a+b for a,b in zip(world[h],d)]
 g['nodes'][count:count]=added;skin['joints']=list(range(count+4))
 def offset(i):
  a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];return v.get('byteOffset',0)+a.get('byteOffset',0)
 # New inverse binds; previous accessor is retained for historical tracks.
 flat=[]
 for i in skin['joints']:
  x,y,z=world[i];flat.extend([1,0,0,0,0,1,0,0,0,0,1,0,-x,-y,-z,1])
 start=len(binary);binary.extend(struct.pack('<'+'f'*len(flat),*flat));g['bufferViews'].append(dict(buffer=0,byteOffset=start,byteLength=len(flat)*4));g['accessors'].append(dict(bufferView=len(g['bufferViews'])-1,componentType=5126,count=count+4,type='MAT4'));skin['inverseBindMatrices']=len(g['accessors'])-1
 pr=g['meshes'][0]['primitives'][0];po=offset(pr['attributes']['POSITION']);jo=offset(pr['attributes']['JOINTS_0']);wo=offset(pr['attributes']['WEIGHTS_0']);n=g['accessors'][pr['attributes']['POSITION']]['count']
 for v in range(n):
  js=list(struct.unpack_from('<4H',binary,jo+v*8));ws=list(struct.unpack_from('<4f',binary,wo+v*16));dominant=max(range(4),key=lambda i:ws[i]);hand=js[dominant]
  if hand not in [lookup['RHand'],lookup['LHand']] or ws[dominant]<.7:continue
  p=struct.unpack_from('<3f',binary,po+v*12);side='R'if hand==lookup['RHand'] else 'L';delta=[a-b for a,b in zip(p,world[hand])]
  distal=delta[2] if gender=='male'and side=='R' else -delta[1]
  u=max(0,min(1,(distal-.018)/.023));u=u*u*(3-2*u)*.55
  if not u:continue
  index=count+(0 if side=='R'else 2);fingerweight=ws[dominant]*u;ws[dominant]-=fingerweight
  empty=min(range(4),key=lambda i:ws[i]);js[empty]=index;ws[empty]+=fingerweight;total=sum(ws);ws=[q/total for q in ws]
  struct.pack_into('<4H',binary,jo+v*8,*js);struct.pack_into('<4f',binary,wo+v*16,*ws)
 refresh(g,binary,gender)
 g.setdefault('extras',{})['handControls']='Finger curl and thumb controls; closed grip follows palm, free fingers overlap body motion'

def refresh(g,binary,gender):
 def offset(i):
  a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];return v.get('byteOffset',0)+a.get('byteOffset',0)
 ns=g['nodes'];lookup={n['name']:i for i,n in enumerate(ns)};parents={c:i for i,n in enumerate(ns) for c in n.get('children',[])};world={}
 for i in g['skins'][0]['joints']:world[i]=[a+b for a,b in zip(ns[i]['translation'],world.get(parents.get(i),[0,0,0]))]
 pr=g['meshes'][0]['primitives'][0];po=offset(pr['attributes']['POSITION']);jo=offset(pr['attributes']['JOINTS_0']);wo=offset(pr['attributes']['WEIGHTS_0']);n=g['accessors'][pr['attributes']['POSITION']]['count']
 for vertex in range(n):
  js=list(struct.unpack_from('<4H',binary,jo+vertex*8));ws=list(struct.unpack_from('<4f',binary,wo+vertex*16));d={}
  for j,w in zip(js,ws):d[j]=d.get(j,0)+w
  for side in ['R','L']:
   hand,finger,thumb=[lookup[side+k] for k in ['Hand','Fingers','Thumb']];amount=d.get(hand,0)+d.pop(finger,0)+d.pop(thumb,0)
   if amount<.7:continue
   p=struct.unpack_from('<3f',binary,po+vertex*12);dx,dy,dz=[a-b for a,b in zip(p,world[hand])]
   distal=dz if gender=='male' and side=='R' else -dy
   u=max(0,min(1,(distal-.018)/.023));u=u*u*(3-2*u)*.55
   inner=dx if side=='R' else -dx;v=max(0,min(1,(inner-.008)/.025));v=v*v*(3-2*v)*.35
   d[hand]=amount*(1-max(u,v));d[finger]=amount*max(0,u-v);d[thumb]=amount*min(u,v)+amount*max(0,v-u)
  entries=sorted(d.items(),key=lambda v:-v[1])[:4];entries+=[(0,0)]*(4-len(entries));total=sum(w for _,w in entries)
  struct.pack_into('<4H',binary,jo+vertex*8,*[j for j,_ in entries]);struct.pack_into('<4f',binary,wo+vertex*16,*[w/total for _,w in entries])
