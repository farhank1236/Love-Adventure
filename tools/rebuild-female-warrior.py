#!/usr/bin/env python3
"""Bake coherent arm/sword animation into the existing split GLB, preserving meshes.

Uses only Python's standard library. Run from any directory. Optionally supply
--export /path/to/female-warrior.glb for Blender inspection. Repeatable: existing animation accessors are reused. Joint/skin repairs and a
10% guard-relative blade extension preserve the body, UVs and textures.
"""
import argparse
import base64
import json
import math
from pathlib import Path
import struct
import sys
sys.dont_write_bytecode=True

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / 'assets/models'
PREFIX = 'window.LoveAdventureModelParts.female.push('
# All angles in degrees, authored on the existing skeleton. Positive cloth pitch trails backwards.
STARTS=[0.,.72,1.38,2.15,2.93,4.05]
ENDS=[.72,1.38,2.15,2.93,4.05,5.05]
HITS=[.42,1.10,1.85,2.63,3.55,4.62]
GUARD=(-38,8,-10)

def quaternion(degrees):
 x,y,z=[math.radians(v)/2 for v in degrees]
 cx,sx,cy,sy,cz,sz=math.cos(x),math.sin(x),math.cos(y),math.sin(y),math.cos(z),math.sin(z)
 return (sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz)

def interpolate(a,b,u):
 u=max(0.,min(1.,u));u=u*u*(3-2*u)
 return tuple(x+(y-x)*u for x,y in zip(a,b))

def pose(shoulder=GUARD,elbow=-57,wrist=(0,0,0),blade=(0,0,0),turn=0,drop=0,step=0,lead=0):
 return dict(RShoulder=shoulder,RElbow=(elbow,0,0),RWrist=wrist,RHand=(0,0,0),Sword=blade,
 Hips=(0,turn*.22,0),Spine=(4,turn*.32,0),Chest=(2,turn*.46,0),Neck=(-3,-turn*.15,0),Head=(0,-turn*.12,0),
 LShoulder=(-18,-turn*.30,14),LElbow=(-50,0,0),LWrist=(0,0,0),LHand=(0,0,0),
 RHip=(-lead,0,-2),RKnee=(drop*650+max(0,lead)*.6,0,0),RAnkle=(lead-drop*650-max(0,lead)*.6,0,0),RFoot=(0,0,0),
 LHip=(lead*.5,0,2),LKnee=(drop*650+max(0,-lead)*.6,0,0),LAnkle=(-lead*.5-drop*650-max(0,-lead)*.6,0,0),LFoot=(0,0,0),
 CapeTop=(4,turn*-.12,0),CapeMid=(7,turn*-.18,0),CapeBottom=(9,turn*-.12,0),
 Hair=(2,-turn*.05,0),HairMid=(5,-turn*.12,0),HairTip=(6,-turn*.18,0),SkirtFront=(2,0,0),SkirtR=(4,0,1),SkirtL=(4,0,-1),
 _drop=drop,_step=step)

# The shared boundary pose is also the next cut's preparation; there is no guard reset between cuts.
KEYS=[
 (0.,pose()),
 (.23,pose((-132,-22,-15),-68,(-10,-12,6),(-3,0,3),-32,.025,.008,-9)),
 (.42,pose((-48,38,20),-30,(16,22,-6),(7,0,-7),29,.013,.057,18)),
 (.72,pose((-20,57,24),-47,(-10,10,-8),(0,0,-3),38,.018,.075,8)),
 (.90,pose((-42,72,19),-60,(-12,20,8),(-4,0,5),43,.032,.080,2)),
 (1.10,pose((-48,-65,-16),-32,(12,-25,-6),(5,0,-6),-36,.019,.120,-14)),
 (1.38,pose((-65,-61,-12),-50,(-8,-14,7),(0,0,3),-39,.022,.130,-5)),
 (1.61,pose((-115,-52,-22),-70,(-14,-18,8),(-4,0,4),-49,.049,.141,-10)),
 (1.85,pose((-37,60,25),-28,(18,26,-7),(8,0,-8),47,.022,.225,25)),
 (2.15,pose((-40,72,24),-49,(-8,17,-5),(0,0,-2),53,.024,.240,12)),
 (2.38,pose((-54,68,18),-61,(-9,17,5),(-3,0,4),65,.036,.249,6)),
 (2.63,pose((-50,-79,-14),-33,(15,-24,-8),(6,0,-6),-68,.021,.265,-17)),
 (2.93,pose((8,-32,-23),-55,(-12,-15,6),(-3,0,3),-47,.036,.270,-7)),
 (3.24,pose((24,-35,-23),-72,(-18,-20,8),(-5,0,4),-56,.062,.279,-12)),
 (3.55,pose((-130,36,16),-24,(20,25,-8),(9,0,-8),57,.004,.408,28)),
 (3.77,pose((-143,24,4),-36,(8,15,-4),(3,0,-3),44,.011,.430,15)),
 (4.05,pose(step=.430)),
 (4.30,pose((-122,-38,-25),-74,(-8,-12,4),turn=-58,drop=.065,step=.445)),
 (4.62,pose((-40,74,32),-22,(12,18,-6),turn=66,drop=.028,step=.555)),
 (4.82,pose((-22,78,28),-38,(4,10,-3),turn=54,drop=.034,step=.585)),
 (5.05,pose(step=.585))]

def sword_attack_pose(t):
 k=next((i for i in range(len(KEYS)-1) if t<=KEYS[i+1][0]),len(KEYS)-2)
 a,A=KEYS[k];b,B=KEYS[k+1];u=max(0,min(1,(t-a)/(b-a)))
 out={}
 for n,v in A.items():
  if isinstance(v,(int,float)):out[n]=interpolate((v,),(B[n],),u)[0];continue
  prev_t,prev=KEYS[max(0,k-1)];next_t,nex=KEYS[min(len(KEYS)-1,k+2)]
  tangent_a=[(y-x)/max(1e-6,b-prev_t) for x,y in zip(prev[n],B[n])]
  tangent_b=[(y-x)/max(1e-6,next_t-a) for x,y in zip(A[n],nex[n])]
  if a not in HITS:tangent_a=[x*.55 for x in tangent_a]
  if b not in HITS:tangent_b=[x*.55 for x in tangent_b]
  out[n]=tuple((2*u**3-3*u*u+1)*x+(u**3-2*u*u+u)*(b-a)*m+(-2*u**3+3*u*u)*y+(u**3-u*u)*(b-a)*q for x,y,m,q in zip(v,B[n],tangent_a,tangent_b))
 return out


# Body keys define the six-cut rhythm, with grounded compression and
# shifts toward the supporting leg. Values: drop, lateral shift, fore/aft shift,
# pelvis pitch/roll, lower-spine pitch, chest pitch/roll, free-arm pitch/elbow.
BODY_KEYS=[
 (0.,(.015,0.,0.,2.,0.,4.,2.,0.,-18.,-50.)),
 (.23,(.044,-.022,-.018,4.,-2.,7.,3.,-4.,-10.,-64.)),
 (.42,(.018,.025,.020,3.,3.,10.,5.,5.,-37.,-35.)),
 (.72,(.026,.018,.013,2.,2.,5.,2.,3.,-30.,-43.)),
 (.90,(.046,.020,-.006,3.,3.,4.,2.,4.,-14.,-60.)),
 (1.10,(.021,-.025,.012,2.,-3.,6.,3.,-5.,-40.,-35.)),
 (1.38,(.030,-.018,.006,2.,-2.,5.,2.,-3.,-28.,-47.)),
 (1.61,(.073,-.026,-.019,5.,-3.,10.,5.,-5.,-9.,-66.)),
 (1.85,(.021,.029,.026,4.,3.,12.,5.,6.,-44.,-30.)),
 (2.15,(.035,.022,.016,2.,2.,6.,3.,4.,-29.,-48.)),
 (2.38,(.056,.021,.001,3.,3.,7.,2.,5.,-15.,-57.)),
 (2.63,(.027,-.028,.018,3.,-3.,8.,4.,-6.,-42.,-33.)),
 (2.93,(.041,-.020,-.004,3.,-2.,5.,1.,-4.,-25.,-50.)),
 (3.24,(.092,-.027,-.022,5.,-3.,11.,4.,-5.,-8.,-69.)),
 (3.55,(.018,.030,.029,2.,3.,3.,-5.,6.,-48.,-30.)),
 (3.77,(.033,.020,.019,1.,2.,1.,-2.,3.,-36.,-41.)),
 (4.05,(.015,0.,0.,2.,0.,4.,2.,0.,-18.,-50.)),
 (4.30,(.075,-.030,-.020,6.,-4.,14.,7.,-6.,-8.,-70.)),
 (4.62,(.032,.035,.030,5.,4.,16.,6.,7.,-45.,-32.)),
 (4.82,(.036,.022,.020,3.,2.,8.,3.,4.,-30.,-45.)),
 (5.05,(.015,0.,0.,2.,0.,4.,2.,0.,-18.,-50.))]

def attack_pose(t):
    result=sword_attack_pose(t)
    k=next((i for i in range(len(BODY_KEYS)-1) if t<=BODY_KEYS[i+1][0]),len(BODY_KEYS)-2)
    a,A=BODY_KEYS[k];b,B=BODY_KEYS[k+1]
    drop,x,z,pitch,roll,spine,chest,chest_roll,free,elbow=interpolate(A,B,(t-a)/(b-a))
    turn=result['Hips'][1]/.22
    result.update(Hips=(pitch,turn*.42,roll),Spine=(spine,turn*.28,roll*.35),Chest=(chest,turn*.30,chest_roll),
                  Neck=(-pitch*.5-spine*.65-chest*.7,-turn*.46,-chest_roll*.65),
                  Head=(-pitch*.5-spine*.35-chest*.3,-turn*.26,-roll),
                  LShoulder=(free,-turn*.25,20+abs(turn)*.12),LElbow=(elbow,0,0),
                  LWrist=(0,turn*.07,0),_drop=drop,_shift_x=-x,_shift_z=z)
    result.update(RFingers=(-3,0,0),RThumb=(0,0,-2),LFingers=(8+5*math.sin(t*5),0,0),LThumb=(2,0,0))
    return result


def attack_rotations(t):
    # Pelvis leads; torso, free arm, head, hair and cloth overlap the release.
    delays={'Spine':.020,'Chest':.038,'Neck':.025,'Head':.040,'LShoulder':.045,'LElbow':.050,
            'CapeTop':.045,'CapeMid':.065,'CapeBottom':.085,'Hair':.060,'HairMid':.080,'HairTip':.100}
    keys=attack_pose(t)
    qs={name:quaternion(attack_pose(max(0,t-delays.get(name,0)))[name]) for name,value in keys.items() if not name.startswith('_')}
    # The sword has no animation independent of the grip. Forearm and wrist
    # articulation change the cutting angle while the rigid blade stays in hand.
    for name,delay in {'RShoulder':.024,'RElbow':.028,'RWrist':.034}.items():
        qs[name]=quaternion(sword_attack_pose(max(0,t-delay))[name])
    qs['RHand']=qs['Sword']=(0,0,0,1)
    return qs

def authored(clip,t):
 if clip=='Combo' or clip.startswith('Attack'):
  return attack_pose(t if clip=='Combo' else STARTS[int(clip[-1])-1]+t)
 r=pose()
 if clip in ['Walk','Run','Sprint']:
  duration={'Walk':.9,'Run':.72,'Sprint':.62}[clip];a=math.sin(2*math.pi*t/duration);b=math.cos(2*math.pi*t/duration)
  amp={'Walk':24,'Run':42,'Sprint':53}[clip];lean={'Walk':2,'Run':16,'Sprint':22}[clip]
  r.update(RHip=(-amp*a,0,-2),LHip=(amp*a,0,2),RKnee=(9+amp*1.1*max(0,a),0,0),LKnee=(9+amp*1.1*max(0,-a),0,0),
   RAnkle=(amp*a*.48-6,0,0),LAnkle=(-amp*a*.48-6,0,0),Hips=(0 if clip=='Walk' else 7,2*a,a),Spine=(lean,-3*a,0),Chest=(lean*.45,-4*a,0),Neck=(-lean*.65,0,0),Head=(-lean*.5,2*a,0),
   RShoulder=(-30-amp*.55*a,8,-10),RElbow=(-55-14*a,0,0),RWrist=(2*b,3*a,0),Sword=(a,0,-a),
   LShoulder=(-12+amp*.65*a,-8,10),LElbow=(-40-lean*3-5*a,0,0),
   CapeTop=(lean*.6,0,0),CapeMid=(lean+3+2*math.sin(2*math.pi*t/duration-.7),2*a,0),CapeBottom=(lean+5+4*math.sin(2*math.pi*t/duration-1.1),3*a,0),
   HairMid=(lean*.8+2*b,0,0),HairTip=(lean+3*math.sin(2*math.pi*t/duration-.6),2*a,0),SkirtFront=(lean*.5,0,0),SkirtR=(lean*.6+4*a,0,0),SkirtL=(lean*.6-4*a,0,0),
   _drop=.006+.009*(1-math.cos(4*math.pi*t/duration)))
 elif clip in ['Jump','Fall','Land','Stop','Turn']:
  # Anticipation, extension, tuck, fall preparation, and landing compression are distinct poses.
  if clip=='Jump':
   frames=[(0,pose()),(.13,pose(drop=.055,lead=6)),(.25,pose((-63,8,-9),-68,drop=0,lead=0)),(.52,pose((-53,12,-10),-65,drop=.015,lead=30)),(.78,pose((-43,8,-10),-58,drop=.018,lead=12)),(.90,pose(drop=.052,lead=7)),(1.12,pose())]
  elif clip=='Fall':frames=[(0,pose((-53,12,-10),-65,drop=.015,lead=30)),(.6,pose((-43,8,-10),-58,drop=.018,lead=12))]
  elif clip=='Land':frames=[(0,pose(drop=.018,lead=12)),(.08,pose(drop=.056,lead=7)),(.25,pose())]
  elif clip=='Stop':frames=[(0,pose(drop=.025,lead=12)),(.25,pose())]
  else:frames=[(0,pose(turn=-18,drop=.015,lead=6)),(.30,pose())]
  k=next((i for i in range(len(frames)-1) if t<=frames[i+1][0]),len(frames)-2);a,A=frames[k];b,B=frames[k+1];u=(t-a)/(b-a)
  r={n:(interpolate((v,),(B[n],),u)[0] if isinstance(v,(int,float)) else interpolate(v,B[n],u)) for n,v in A.items()}
  r['CapeMid']=(5,0,0);r['CapeBottom']=(8,0,0)
 else:
  a=math.sin(t*2*math.pi/3);r.update(RShoulder=(-38+1.2*a,8,-10),Chest=(2+.6*a,0,0),CapeMid=(2+a,0,0),CapeBottom=(3+1.5*a,0,0),HairTip=(2+a,0,0))
 r.update(RFingers=(-3,0,0),RThumb=(0,0,-2),LFingers=(6 if clip=='Idle' else 10,0,0),LThumb=(2,0,0))
 return r


def add(a,b):return tuple(x+y for x,y in zip(a,b))
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def mul(a,k):return tuple(x*k for x in a)
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def norm(a):return math.sqrt(dot(a,a))
def unit(a):return mul(a,1/max(1e-9,norm(a)))
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def qmul(a,b):
 x,y,z,w=a;X,Y,Z,W=b
 return (w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z)
def inverse(q):return (-q[0],-q[1],-q[2],q[3])
def rotate(q,v):return qmul(qmul(q,(*v,0)),inverse(q))[:3]
def align(a,b):
 a,b=unit(a),unit(b);q=(*cross(a,b),1+dot(a,b));return mul(q,1/max(1e-9,norm(q)))
def foot_step(side,t):
    # The receiving foot plants before the strike transfers force into it.
    steps={'L':[(.12,.36,.075),(1.49,1.77,.225),(3.07,3.48,.430),(4.17,4.54,.585)],
           'R':[(.79,1.04,.145),(2.27,2.54,.270),(3.72,4.05,.430),(4.76,5.05,.585)]}[side]
    z=0.;lift=0.
    for start,end,target in steps:
        if t>=end:z=target
        elif t>start:
            u=(t-start)/(end-start);z=interpolate((z,),(target,),u)[0];lift=.036*math.sin(math.pi*u);break
        else:break
    return z,lift

def foot_target(side,t):
    z,lift=foot_step(side,t)
    return ((-.158 if side=='R' else .158),.074+lift,.001+z)

def grounded_attack_pose(g,pose,t,scale=1.,targets=None):
    # Keep foot contacts reachable instead of straightening a leg and allowing
    # its planted foot to hover when the torso shifts over the supporting leg.
    pose=dict(pose);nodes={n['name']:n for n in g['nodes']};hipq=quaternion(pose['Hips'])
    hipbase=add(nodes['Hips']['translation'],(pose.get('_shift_x',0)*scale,0,(pose['_step']+pose.get('_shift_z',0))*scale))
    turn=0 if targets else sword_attack_pose(t)['Hips'][1]/.22
    for side in ['R','L']:
        H,U,V,F=[nodes[side+n]['translation'] for n in ['Hip','Knee','Ankle','Foot']]
        rest=add(nodes['Hips']['translation'],add(H,add(U,V)));z,lift=foot_step(side,t)
        base=add(rest,targets[side][:3]) if targets else add(rest,(0,lift*scale,z*scale));footq=quaternion(targets[side][3:]) if targets else quaternion((0,turn*.32,0))
        target=sub(add(base,F),rotate(footq,F));origin=add(hipbase,rotate(hipq,H))
        dx,dz=origin[0]-target[0],origin[2]-target[2]
        reach=norm(U)+norm(V)-.003*scale
        vertical=math.sqrt(max(0,reach*reach-dx*dx-dz*dz))
        pose['_drop']=max(pose['_drop'],(origin[1]-target[1]-vertical)/scale)
    return pose

def attack_legs(g,pose,t,scale=1.,targets=None):
    nodes={n['name']:n for n in g['nodes']}
    hipq=quaternion(pose['Hips'])
    hippos=add(nodes['Hips']['translation'],(pose.get('_shift_x',0)*scale,-pose['_drop']*scale,(pose['_step']+pose.get('_shift_z',0))*scale))
    turn=0 if targets else sword_attack_pose(t)['Hips'][1]/.22
    result={}
    for side in ['R','L']:
        H,U,V,F=[nodes[side+n]['translation'] for n in ['Hip','Knee','Ankle','Foot']]
        rest=add(nodes['Hips']['translation'],add(H,add(U,V)))
        z,lift=foot_step(side,t)
        base=add(rest,targets[side][:3]) if targets else add(rest,(0,lift*scale,z*scale))
        footq=quaternion(targets[side][3:]) if targets else quaternion((0,turn*.32,0))
        # Pivot the heel around the forefoot contact, rather than sliding the foot.
        contact=add(base,F)
        target=sub(contact,rotate(footq,F))
        origin=add(hippos,rotate(hipq,H))
        goal=rotate(inverse(hipq),sub(target,origin))
        distance=min(norm(goal),norm(U)+norm(V)-.0001);axis=unit(goal)
        along=(norm(U)**2-norm(V)**2+distance**2)/(2*distance)
        height=math.sqrt(max(0,norm(U)**2-along**2))
        forward=rotate(inverse(hipq),rotate(footq,(0,0,1)))
        pole=unit(sub(forward,mul(axis,dot(forward,axis))))
        knee=add(mul(axis,along),mul(pole,height))
        upper=align(U,knee);lower=align(V,rotate(inverse(upper),sub(mul(axis,distance),knee)))
        result[side+'Hip']=upper;result[side+'Knee']=lower
        result[side+'Ankle']=qmul(inverse(qmul(hipq,qmul(upper,lower))),footq)
        result[side+'Foot']=(0,0,0,1)
    return result

GAIT_DUTY={'Walk':.62,'Run':.18,'Sprint':.16}
GAIT_STRIDE={'Walk':.32/.62,'Run':.38/.18,'Sprint':.44/.16}

def gait_targets(clip,t,scale=1.):
    duration={'Walk':.9,'Run':.72,'Sprint':.62}[clip]
    duty=GAIT_DUTY[clip]
    lift={'Walk':.035,'Run':.14,'Sprint':.18}[clip]
    half=GAIT_STRIDE[clip]*duty/2
    targets={}
    for side,offset in [('R',0),('L',.5)]:
        phase=(t/duration+offset)%1
        if phase<duty:
            u=phase/duty;z=half*(1-2*u);height=0.
            # A small ankle roll through heel acceptance and forefoot push-off.
            pitch=8*max(0,1-u*5)-12*max(0,(u-.75)/.25)
        else:
            u=(phase-duty)/(1-duty);z=interpolate((-half,),(half,),u)[0]
            height=lift*math.sin(math.pi*u);pitch=-10*math.sin(math.pi*u)
        targets[side]=(0,height*scale,z*scale,pitch,0,0)
    return targets

def resolved_pose(g,clip,t,scale=1.):
    p=authored(clip,t)
    if clip in GAIT_STRIDE:
        duration={'Walk':.9,'Run':.72,'Sprint':.62}[clip]
        phase=t/duration;wave=math.sin(2*math.pi*phase)
        p['_shift_x']=.008*wave;p['_drop']={'Walk':.018,'Run':.034,'Sprint':.040}[clip]-.007*math.cos(4*math.pi*phase)
        targets=gait_targets(clip,t,scale)
        p=grounded_attack_pose(g,p,t,scale,targets)
        legs=attack_legs(g,p,t,scale,targets)
    elif clip=='Combo' or clip.startswith('Attack'):
        full=t if clip=='Combo' else STARTS[int(clip[-1])-1]+t
        p=grounded_attack_pose(g,p,full,scale);legs=attack_legs(g,p,full,scale)
    elif clip in ['Idle','Land','Stop','Turn'] or (clip=='Jump' and (t<.25 or t>.85)):
        targets={side:(0,0,0,0,0,0) for side in ['R','L']}
        p=grounded_attack_pose(g,p,t,scale,targets);legs=attack_legs(g,p,t,scale,targets)
    else: legs={}
    # Airborne legs retain the authored tuck and never use a foot-plant solver.
    return p,legs

def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--export', type=Path); args = parser.parse_args()
    files = sorted(PARTS.glob('female-*.js'))
    data = base64.b64decode(''.join(json.loads(p.read_text()[len(PREFIX):].strip().removesuffix(';').removesuffix(')')) for p in files), validate=True)
    magic, version, size = struct.unpack_from('<4sII', data); assert magic == b'glTF' and version == 2 and size == len(data)
    json_size = struct.unpack_from('<I', data, 12)[0]; g = json.loads(data[20:20+json_size]); bin_start = 28+json_size
    binary = bytearray(data[bin_start:]); assert len(binary) == g['buffers'][0]['byteLength']

    import warrior_repairs
    warrior_repairs.apply(g,binary,'female')
    import importlib.util
    detail_spec=importlib.util.spec_from_file_location('hand_rig',ROOT/'tools/warrior-hand-rig.py')
    detail=importlib.util.module_from_spec(detail_spec);detail_spec.loader.exec_module(detail)
    detail.apply(g,binary,'female')

    def values(index):
        a = g['accessors'][index]; v = g['bufferViews'][a['bufferView']]
        width = {'SCALAR':1, 'VEC3':3, 'VEC4':4}[a['type']]
        assert a['componentType'] == 5126 and not v.get('byteStride')
        offset = v.get('byteOffset', 0)+a.get('byteOffset', 0)
        return list(struct.unpack_from('<'+'f'*(a['count']*width), binary, offset))

    def write(index, flat):
        a = g['accessors'][index]; v = g['bufferViews'][a['bufferView']]
        offset = v.get('byteOffset', 0)+a.get('byteOffset', 0)
        struct.pack_into('<'+'f'*len(flat), binary, offset, *flat)
        # Bounds are optional for animation outputs; old bounds no longer describe the track.
        a.pop('min', None); a.pop('max', None)

    def accessor(flat, kind):
        while len(binary)%4: binary.append(0)
        offset = len(binary); binary.extend(struct.pack('<'+'f'*len(flat), *flat))
        g['bufferViews'].append({'buffer':0, 'byteOffset':offset, 'byteLength':len(flat)*4})
        width = {'SCALAR':1, 'VEC3':3, 'VEC4':4}[kind]
        g['accessors'].append({'bufferView':len(g['bufferViews'])-1, 'componentType':5126, 'count':len(flat)//width, 'type':kind})
        return len(g['accessors'])-1

    durations={'Idle':3.,'Walk':.9,'Run':.72,'Sprint':.62,'Jump':1.12,'Fall':.6,'Land':.25,'Stop':.25,'Turn':.3,'Combo':ENDS[-1]}
    durations.update({f'Attack{i+1}':ENDS[i]-STARTS[i] for i in range(6)})
    old={a['name']:a for a in g['animations']} if g.get('extras',{}).get('revision')in ['BODY_AND_SWORD_V10','BODY_AND_SWORD_V12','BODY_AND_SWORD_V13','BODY_AND_SWORD_V14'] else {}
    animations=[]
    for name,duration in durations.items():
        count=math.ceil(duration*60)+1;ts=[i*duration/(count-1) for i in range(count)]
        previous=old.get(name)
        if previous and g['accessors'][previous['samplers'][0]['input']]['count']!=count: previous=None
        reuse={ (c['target']['node'],c['target']['path']):previous['samplers'][c['sampler']] for c in previous['channels']} if previous else {}
        ti=next(iter(reuse.values()))['input'] if reuse else accessor(ts,'SCALAR')
        write(ti,ts);g['accessors'][ti].update(min=[0],max=[duration])
        animation={'name':name,'samplers':[],'channels':[]}
        resolved=[resolved_pose(g,name,t) for t in ts]
        poses=[p for p,l in resolved];legposes=[l for p,l in resolved]
        rotationposes=[attack_rotations(t if name=='Combo' else STARTS[int(name[-1])-1]+t) for t in ts] if name=='Combo' or name.startswith('Attack') else [{} for _ in ts]
        for index,node in enumerate(g['nodes'][:len(g['skins'][0]['joints'])]):
            for path in ['rotation','translation']:
                flat=[]
                for pose,legs in zip(poses,legposes):
                    if path=='rotation':
                        angles=pose.get(node['name'],(0,0,0))
                        authored_q=rotationposes[len(flat)//4].get(node['name'],quaternion(angles))
                        if node['name']=='Sword': authored_q=(0,0,0,1)
                        flat.extend(legs.get(node['name'],authored_q))
                    else:
                        pos=list(node.get('translation',[0,0,0]))
                        if node['name']=='Root':pos[2]+=pose['_step']
                        if node['name']=='Hips':
                            pos[0]+=pose.get('_shift_x',0);pos[1]-=pose['_drop'];pos[2]+=pose.get('_shift_z',0)
                        flat.extend(pos)
                oi=reuse[(index,path)]['output'] if (index,path) in reuse else accessor(flat,'VEC4' if path=='rotation' else 'VEC3')
                write(oi,flat)
                animation['channels'].append({'sampler':len(animation['samplers']),'target':{'node':index,'path':path}})
                animation['samplers'].append({'input':ti,'output':oi,'interpolation':'LINEAR'})
        animations.append(animation)
    g['animations']=animations

    g['extras'].update(revision='BODY_AND_SWORD_V14', swordControl='Rigid palm grip with shoulder-led full swings and elbow extension',
                       combatNote='Six complete attacks with anticipation, weight transfer and follow-through; forward leaning run', gaitStride=GAIT_STRIDE, gaitDuty=GAIT_DUTY, attackStarts=STARTS, attackEnds=ENDS, attackHits=HITS, attackLabels=['Overhead slash','Reverse sweep','Diagonal slash','Cross-body cut','Rising strike','Sweeping finisher'])
    g['buffers'][0]['byteLength']=len(binary)
    json_bytes=json.dumps(g,separators=(',',':')).encode();json_bytes+=b' '*((-len(json_bytes))%4)
    output=struct.pack('<4sII',b'glTF',2,28+len(json_bytes)+len(binary))+struct.pack('<I4s',len(json_bytes),b'JSON')+json_bytes+struct.pack('<I4s',len(binary),b'BIN\0')+binary
    encoded=base64.b64encode(output).decode();chunk_size=8*1024*1024
    files=[PARTS/f'female-{i+1:02}.js' for i in range(math.ceil(len(encoded)/chunk_size))]
    for i, p in enumerate(files): p.write_text(PREFIX+json.dumps(encoded[i*chunk_size:(i+1)*chunk_size])+');\n')
    if args.export: args.export.parent.mkdir(parents=True, exist_ok=True); args.export.write_bytes(output)
    print(f'Baked {len(g["animations"])} clips into {len(files)} model parts ({len(output):,} bytes).')


if __name__ == '__main__': main()
