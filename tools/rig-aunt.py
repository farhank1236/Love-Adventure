#!/usr/bin/env python3
"""Bind the supplied sorceress to a hovering body and paired wing rig.
The original topology, UVs, texture and appearance are retained. Input GLB is required.
"""
import argparse,json,struct,math
from pathlib import Path
import numpy as np
from scipy.sparse import coo_matrix
p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
b=args.input.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);binary=bytearray(b[28+n:]);pr=g['meshes'][0]['primitives'][0]
def array(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];return np.frombuffer(binary,dtype={5126:'<f4',5125:'<u4'}[a['componentType']],count=a['count']*{'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
# Remove the source object's 100x scale and apply its axis conversion in geometry.
for key in ['POSITION','NORMAL']:
 a=array(pr['attributes'][key]);old=a.copy();a[:,0]=old[:,0];a[:,1]=-old[:,2];a[:,2]=old[:,1]
 if key=='POSITION':positions=a.copy();g['accessors'][pr['attributes'][key]].update(min=a.min(0).tolist(),max=a.max(0).tolist())
del a,old
names=['Root','Hips','Spine','Chest','Neck','Head','RArm','RForearm','LArm','LForearm','RWing','RWingTip','LWing','LWingTip','Skirt','Hair']
parents=[None,0,1,2,3,4,3,6,3,8,3,10,3,12,1,5]
world=np.array([(0,0,0),(0,.48,.02),(0,.65,.02),(0,.79,.015),(0,.92,.01),(-.015,1,.025),(-.12,.82,.015),(-.22,.68,.09),(.12,.82,.015),(.22,.65,.08),(-.075,.84,-.09),(-.22,.68,-.12),(.075,.84,-.09),(.22,.68,-.12),(0,.40,.01),(0,1.04,-.015)])
nodes=[]
for i,name in enumerate(names):
 nodes.append(dict(name=name,translation=(world[i]-(world[parents[i]] if parents[i] is not None else 0)).tolist()))
 for c,parent in enumerate(parents):
  if parent==i:nodes[-1].setdefault('children',[]).append(c)
nodes.append(dict(name='Sorceress',mesh=0,skin=0));g['nodes']=nodes;g['scenes']=[dict(nodes=[0,len(names)])];g['scene']=0
# Continuous transitions at wing shoulders and body joints avoid cracks between adjacent triangles.
x,y,z=positions.T
def smooth(v):
 v=np.clip(v,0,1);return v*v*(3-2*v)
wing=smooth((np.abs(x)-(.09+.14*np.maximum(0,.60-y)))/.055)*smooth((y-.245)/.08)*smooth((-.015-z)/.05)
weights=np.zeros((len(x),len(names)),dtype=np.float32)
head=smooth((y-.92)/.045);chest=smooth((y-.62)/.13)*(1-head);spine=smooth((y-.48)/.14)*(1-head-chest);hips=1-head-chest-spine
weights[:,1]=hips;weights[:,2]=spine;weights[:,3]=chest;weights[:,5]=head
# Dress follows the pelvis with a gentle trailing panel, never the wrists.
skirt=smooth((.43-y)/.16)*.65;weights*= (1-skirt[:,None]);weights[:,14]+=skirt
for side,upper,lower in [(-1,6,7),(1,8,9)]:
 arm=smooth((side*x-.105)/.06)*smooth((y-.54)/.08)*smooth((.90-y)/.05)*(1-wing)*smooth((z+.025)/.06)
 fore=smooth((.75-y)/.10);weights*=1-arm[:,None];weights[:,upper]+=arm*(1-fore);weights[:,lower]+=arm*fore
weights*=1-wing[:,None]
for side,base,tip in [(-1,10,11),(1,12,13)]:
 mask=wing*(x*side>0);outer=smooth((np.abs(x)-.16)/.14)*.75;weights[:,base]+=mask*(1-outer);weights[:,tip]+=mask*outer
# Smooth bindings on welded triangle neighbours; UV/normal seams remain untouched.
_,weld=np.unique(np.round(positions,6),axis=0,return_inverse=True)
tri=array(pr['indices']).ravel().copy().reshape(-1,3);tri=weld[tri];size=int(weld.max())+1
rows=np.r_[tri[:,0],tri[:,1],tri[:,2],tri[:,1],tri[:,2],tri[:,0]];cols=np.r_[tri[:,1],tri[:,2],tri[:,0],tri[:,0],tri[:,1],tri[:,2]]
adj=coo_matrix((np.ones(len(rows)),(rows,cols)),shape=(size,size)).tocsr();adj.data[:]=1;degrees=np.asarray(adj.sum(axis=1)).ravel();counts=np.bincount(weld)
field=np.stack([np.bincount(weld,weights=weights[:,i],minlength=size)/counts for i in range(len(names))],axis=1)
for _ in range(12):field=.55*field+.45*(adj@field)/np.maximum(1,degrees[:,None])
weights=field[weld].astype(np.float32)
js=np.argsort(weights,axis=1)[:,-4:][:,::-1].astype('<u2');ws=np.take_along_axis(weights,js,axis=1);ws/=ws.sum(1,keepdims=True)
def append(a,kind,code=5126):
 raw=a.tobytes();offset=len(binary);binary.extend(raw);binary.extend(b'\0'*((-len(binary))%4));g['bufferViews'].append(dict(buffer=0,byteOffset=offset,byteLength=len(raw)));g['accessors'].append(dict(bufferView=len(g['bufferViews'])-1,componentType=code,count=len(a),type=kind));return len(g['accessors'])-1
pr['attributes']['JOINTS_0']=append(js,'VEC4',5123);pr['attributes']['WEIGHTS_0']=append(ws.astype('<f4'),'VEC4')
ib=np.tile(np.eye(4,dtype='<f4'),(len(names),1,1));ib[:,3,:3]=-world;g['skins']=[dict(joints=list(range(len(names))),skeleton=0,inverseBindMatrices=append(ib.reshape(-1,16),'MAT4'))]
def quaternion(a):
 x,y,z=[q/2 for q in a];cx,sx,cy,sy,cz,sz=math.cos(x),math.sin(x),math.cos(y),math.sin(y),math.cos(z),math.sin(z)
 return (sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz)
def pose(time,casting):
 phase=time*5.2;local=time%1.5;cast=max(0,1-(local-.45)/.45) if casting and local>=.45 else 0
 q={name:(0,0,0) for name in names}
 q.update(Hips=(.025+.025*math.sin(phase-.6),.025*math.sin(phase*.5),.018*math.sin(phase*.25)),Spine=(-.02+.065*cast,0,0),Chest=(0,-.10*cast,0),Neck=(-.025*cast,0,0),Head=(-.06*cast,.035*math.sin(phase*.25),.02*math.sin(phase*.5)),Skirt=(.025*math.sin(phase-.8),0,.018*math.sin(phase*.25)),Hair=(.04*math.sin(phase-.9),0,0))
 for side,sign in [('R',-1),('L',1)]:
  q[side+'Wing']=(.05*math.cos(phase),sign*(.08+.16*math.sin(phase)),sign*.08*math.cos(phase));q[side+'WingTip']=(0,sign*.08*math.sin(phase-.7),0);q[side+'Arm']=(-.06-.12*cast,0,sign*.07*math.sin(phase*.5));q[side+'Forearm']=(-.04-.08*cast,0,0)
 return q
animations=[]
for name,duration in [('Hover',8*math.pi/5.2),('EyeCast',1.5)]:
 times=np.linspace(0,duration,math.ceil(duration*60)+1,dtype='<f4');ti=append(times,'SCALAR');g['accessors'][ti].update(min=[0],max=[duration]);animation=dict(name=name,samplers=[],channels=[])
 for i,node in enumerate(nodes[:len(names)]):
  q=np.array([quaternion(pose(float(t),name=='EyeCast')[node['name']]) for t in times],dtype='<f4');values=np.tile(node['translation'],(len(times),1)).astype('<f4')
  if i==0:values[:,1]+=.06+.018*np.sin(times*5.2-.45)
  for path,flat,kind in [('rotation',q,'VEC4'),('translation',values,'VEC3')]:
   oi=append(flat,kind);animation['channels'].append(dict(sampler=len(animation['samplers']),target=dict(node=i,path=path)));animation['samplers'].append(dict(input=ti,output=oi,interpolation='LINEAR'))
 animations.append(animation)
g['animations']=animations
g['extras']=dict(revision='SORCERESS_FLIGHT_V14',role='aunt',eyePositions=[[-.035,1.028,.10],[-.060,1.030,.075]],wingRig='Two-bone membrane wings, shoulder blends, hovering body, casting arms and head')
g['buffers'][0]['byteLength']=len(binary);header=json.dumps(g,separators=(',',':')).encode();header+=b' '*((-len(header))%4);args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(header)+len(binary))+struct.pack('<I4s',len(header),b'JSON')+header+struct.pack('<I4s',len(binary),b'BIN\0')+binary)
print(f'Bound {len(positions)} vertices to {len(names)} bones; wing influence on {int((wing>.5).sum())} vertices')
