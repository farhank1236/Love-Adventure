#!/usr/bin/env python3
"""Protect appearance/topology while verifying the reviewed blade, boot and skin edits."""
import base64,hashlib,json,math,struct,sys,gzip
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
BASELINE=json.loads((ROOT/'tests/warrior-model-baseline.json').read_text())
def read(gender):
 prefix='window.LoveAdventureModelParts.'+gender+'.push('
 raw=base64.b64decode(''.join(json.loads(p.read_text()[len(prefix):].strip().removesuffix(';').removesuffix(')')) for p in sorted((ROOT/'assets/models').glob(gender+'-*.js'))))
 size=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+size]),raw[28+size:]
def verify(gender):
 g,binary=read(gender);expected=BASELINE[gender]
 boot={}
 if gender=='male':
  sys.path.insert(0,str(ROOT/'tools'));import warrior_repairs
  manifest=json.loads((ROOT/'tools/male-foot-alignment.json').read_text())
  boot={row[0]:row[1:] for row in struct.iter_unpack('<I6f',gzip.decompress(base64.b64decode(manifest['originalRecords'])))}
  selected=set(manifest['alignedVertices'])
  assert len(boot)==manifest['vertexCount'] and len(selected)>10000 and g['extras'].get('leftBootAlignmentRevision')==2

 def data(i):
  a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];size={5126:4,5123:2,5125:4}[a['componentType']];off=v.get('byteOffset',0)+a.get('byteOffset',0);return binary[off:off+a['count']*width*size]
 tip=expected['tip'];length=math.sqrt(sum(x*x for x in tip));axis=[x/length for x in tip];guard=g['extras']['bladeGuard'];max_blade=-math.inf
 for mi,mesh in enumerate(g['meshes']):
  p=mesh['primitives'][0];joints=list(struct.iter_unpack('<4H',data(p['attributes']['JOINTS_0']))) if 'JOINTS_0' in p['attributes'] else []
  weights=list(struct.iter_unpack('<4f',data(p['attributes']['WEIGHTS_0']))) if 'WEIGHTS_0' in p['attributes'] else []
  immutable=bytearray()
  for i,pos in enumerate(struct.iter_unpack('<3f',data(p['attributes']['POSITION']))):
   blade=(gender=='female' and mi in [1,2]) or (bool(joints) and any(j==10 and w>.999 for j,w in zip(joints[i],weights[i])))
   local=pos if gender=='female' and mi in [1,2] else [x-y for x,y in zip(pos,expected['grip'])]
   along=sum(x*y for x,y in zip(local,axis))
   if mi==0 and i in boot:
    corrected=warrior_repairs.foot_transform(boot[i][:3],boot[i][3:],manifest)[0] if i in selected else boot[i][:3]
    assert max(abs(a-b) for a,b in zip(pos,corrected))<2e-6,'Reviewed boot alignment'
    immutable.extend(struct.pack('<3f',*boot[i][:3]))
   elif not blade or along<=guard+1e-7:immutable.extend(struct.pack('<3f',*pos))
   elif mi==(2 if gender=='female' else 0):max_blade=max(max_blade,along)
  assert hashlib.sha256(immutable).hexdigest()==expected['meshes'][mi]['immutablePosition'],(gender,mi,'body or handle changed')
  for name,index in p['attributes'].items():
   if name in ['POSITION','JOINTS_0','WEIGHTS_0']:continue
   raw=bytearray(data(index))
   if mi==0 and name=='NORMAL' and boot:
    for vertex,original in boot.items():
     corrected=warrior_repairs.foot_transform(original[:3],original[3:],manifest)[1] if vertex in selected else original[3:];current=struct.unpack_from('<3f',raw,vertex*12)
     assert max(abs(a-b) for a,b in zip(current,corrected))<2e-6,'Reviewed boot normals'
     struct.pack_into('<3f',raw,vertex*12,*original[3:])
   assert hashlib.sha256(raw).hexdigest()==expected['meshes'][mi][name],(gender,mi,name)
  assert hashlib.sha256(data(p['indices'])).hexdigest()==expected['meshes'][mi]['indices']
  for row in weights:assert all(math.isfinite(w) and w>=0 for w in row) and abs(sum(row)-1)<1e-5
 image=g['bufferViews'][g['images'][0]['bufferView']];texture=binary[image['byteOffset']:image['byteOffset']+image['byteLength']]
 assert hashlib.sha256(texture).hexdigest()==expected['texture']
 assert abs((max_blade-guard)/(expected['bladeMax']-guard)-1.1)<1e-5,'Blade must be 10% longer beyond the guard'
 count=6 if gender=='female' else 5
 assert len(g['animations'])==10+count and {a['name'] for a in g['animations']}=={'Idle','Walk','Run','Sprint','Jump','Fall','Land','Stop','Turn','Combo'}|{f'Attack{i+1}' for i in range(count)}
 assert len(g['extras']['attackStarts'])==count and len(g['extras']['attackHits'])==count
 assert all(n in {v['name'] for v in g['nodes']} for n in ['RFingers','RThumb','LFingers','LThumb'])
 print(gender+': body/handle preservation and reviewed left-boot rotation; topology, UVs and textures preserved; 10% blade extension, normalized skin and distinct gender attack sets verified.')
if __name__=='__main__':
 for gender in sys.argv[1:] or ['female','male']:verify(gender)
