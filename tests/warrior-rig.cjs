'use strict';
// Exercise the exact renderer's skin sampler without GPU/texture dependencies.
const fs=require('fs'),path=require('path'),vm=require('vm');const root=path.resolve(__dirname,'..');
const context=vm.createContext({console,AbortController,TextDecoder,atob,Uint8Array,DataView,Float32Array,Uint16Array,Uint32Array});
vm.runInContext(fs.readFileSync(path.join(root,'assets/viewer/three-runtime.js'),'utf8')+fs.readFileSync(path.join(root,'assets/viewer/female-warrior-rig.js'),'utf8')+'\nglobalThis.T=THREE;globalThis.load=createWarriorAsset;',context);
const T=context.T;let checks=0;function check(ok,label){if(!ok)throw Error(label);checks++}
for(const gender of ['female','male']){
 const parts=fs.readdirSync(path.join(root,'assets/models')).filter(n=>n.startsWith(gender+'-')).sort().map(n=>JSON.parse(fs.readFileSync(path.join(root,'assets/models',n),'utf8').split('.push(')[1].trim().slice(0,-2)));
 const rig=context.load(T,parts.join(''),{loadTexture:false});
 const point=name=>rig.byName[name].getWorldPosition(new T.Vector3());
 const rest=rig.bones.map(b=>b.position.clone());
 for(const [clip,{duration}] of Object.entries(rig.channels))for(let i=0;i<=30;i++){
  rig.sample(clip,duration*i/30);
  for(let j=0;j<rig.bones.length;j++)if(!['Root','Hips'].includes(rig.bones[j].name))check(rig.bones[j].position.distanceTo(rest[j])<1e-6,gender+' fixed limb length in '+clip);
  check(rig.byName.Sword.quaternion.angleTo(new T.Quaternion())<1e-6,gender+' blade never rotates independently from grip');
  check(point('Sword').distanceTo(point('RHand'))<1e-6,gender+' grip remains in palm');
  if(['Combo','Attack1','Attack2','Attack3','Attack4'].includes(clip))check(rig.tip.getWorldPosition(new T.Vector3()).y>-.005,gender+' attack blade clears ground: '+clip+' '+i);
 }
 for(const [clip,duty] of [['Walk',.62],['Run',.44],['Sprint',.40]]){
  const duration=rig.channels[clip].duration;
  rig.sample(clip,duration*.08);const first=point('RFoot');first.z+=rig.gaitStride[clip]*rig.motionScale*.08;
  const thigh=rig.byName.RHip.quaternion.clone();let minBend=Infinity,maxBend=0,maxThigh=0,flight=false;
  for(let i=0;i<=30;i++){
   const phase=i/30;rig.sample(clip,duration*phase);maxThigh=Math.max(maxThigh,thigh.angleTo(rig.byName.RHip.quaternion));
   const bend=point('RKnee').sub(point('RHip')).angleTo(point('RAnkle').sub(point('RKnee')));minBend=Math.min(minBend,bend);maxBend=Math.max(maxBend,bend);
   if(phase>.08&&phase<duty-.04){const p=point('RFoot');p.z+=rig.gaitStride[clip]*rig.motionScale*phase;check(p.distanceTo(first)<.002,gender+' stance contact matches travel speed '+clip)}
   if(point('RFoot').y>rig.byName.RFoot.position.y+.04&&point('LFoot').y>rig.byName.LFoot.position.y+.04)flight=true;
  }
  rig.sample(clip,duration*.65);check(maxThigh>.35,gender+' thigh swings visibly in '+clip);
  check(maxBend-minBend>.25&&maxBend<2.4,gender+' knee bends with upper leg in '+clip);
  if(clip!=='Walk')check(flight,gender+' running has a brief airborne phase');
 }
 const skin=rig.mesh.geometry.attributes.skinIndex,weights=rig.mesh.geometry.attributes.skinWeight;
 for(const id of [15,19]){let n=0;for(let i=0;i<skin.count;i++)for(let j=0;j<4;j++)if(skin.array[i*4+j]===id&&weights.array[i*4+j]>.5)n++;check(n>2000,gender+' thigh has meaningful skin influence '+id)}
}
console.log(checks+' rigid grip, limb length, blade clearance, thigh, knee and stride checks passed');
