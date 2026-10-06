"""Check the corrected sole direction and the separation of boot/cape bindings."""
import json,struct,sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import importlib.util
spec=importlib.util.spec_from_file_location('model_reader',Path(__file__).resolve().parents[1]/'tools/rebuild-male-warrior.py');reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
_,g,binary=reader.read_model('male');pr=g['meshes'][0]['primitives'][0];manifest=json.loads((reader.ROOT/'tools/male-foot-alignment.json').read_text())
def array(key):
 a=g['accessors'][pr['attributes'][key]];v=g['bufferViews'][a['bufferView']];return np.frombuffer(binary,dtype='<u2'if key=='JOINTS_0'else'<f4',offset=v['byteOffset'],count=a['count']* (4 if key in ['JOINTS_0','WEIGHTS_0'] else 3)).reshape(a['count'],-1)
p=array('POSITION');sole=p[manifest['alignedVertices']];sole=sole[sole[:,1]<.055][:,[0,2]];cov=np.cov(sole.T);eigenvalues,axes=np.linalg.eigh(cov);axis=axes[:,-1];axis*=1 if axis[1]>0 else -1
assert abs(axis[0])<.01 and axis[1]>.999,'Corrected left sole faces the torso travel direction'
assert eigenvalues[1]>eigenvalues[0]*2,'Boot length remains distinct from boot width'
js,ws=array('JOINTS_0'),array('WEIGHTS_0');cape=next(i for i,n in enumerate(g['nodes'])if n['name']=='CapeBottom');count=0
for vertex,_,_,height in manifest['clothWeights']:
 if height<=.13:
  assert sum(w for j,w in zip(js[vertex],ws[vertex])if j==cape)>.999,'Low cape follows cape, not a foot';count+=1
assert count>1000
print(f'Forward boot axis and {count} independent lower cape bindings verified')
