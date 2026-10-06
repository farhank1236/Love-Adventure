"""Run with Blender: blender -b --python tools/export-warrior-rigs.py -- GLB OUTPUT.blend.
Imports the baked game model and adds optional, non-stretching leg IK controls.
"""
import sys
from pathlib import Path
import bpy
from mathutils import Vector
source,destination=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for side in ['R','L']:
    bones=rig.data.edit_bones;ankle=bones[side+'Ankle'];knee=bones[side+'Knee'];hip=bones[side+'Hip']
    control=bones.new(side+'FootIK');control.head=ankle.head;control.tail=control.head+Vector((0,0,.09));control.use_deform=False
    axis=(ankle.head-hip.head).normalized();bend=knee.head-hip.head-axis*(knee.head-hip.head).dot(axis)
    if bend.length<.001:bend=Vector((0,-1,0))
    pole=bones.new(side+'KneePole');pole.head=knee.head+bend.normalized()*.20;pole.tail=pole.head+Vector((0,0,.05));pole.use_deform=False
bpy.ops.object.mode_set(mode='POSE')
for side in ['R','L']:
    control=rig.pose.bones[side+'FootIK'];control['ik_blend']=0.
    control.id_properties_ui('ik_blend').update(min=0.,max=1.,description='0 = baked FK/game animation; 1 = edit using foot IK and knee pole')
    constraint=rig.pose.bones[side+'Knee'].constraints.new('IK');constraint.name='Optional foot placement · no stretch';constraint.target=rig;constraint.subtarget=side+'FootIK';constraint.pole_target=rig;constraint.pole_subtarget=side+'KneePole';constraint.chain_count=2;constraint.use_stretch=False;constraint.influence=0
    driver=constraint.driver_add('influence').driver;driver.expression='blend';var=driver.variables.new();var.name='blend';var.targets[0].id=rig;var.targets[0].data_path='pose.bones["'+side+'FootIK"]["ik_blend"]'
    rig.pose.bones[side+'Hip'].ik_stretch=0;rig.pose.bones[side+'Knee'].ik_stretch=0
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front=True
for action in bpy.data.actions:action.use_fake_user=True
# Pack textures so the editable project opens without external paths.
bpy.ops.file.pack_all()
readme=bpy.data.texts.new('Warrior rig notes')
readme.write('Game GLB uses forward-leaning locomotion, phased jumping and full-body sword swings: five male / six female. Finger curl controls preserve the palm grip; individual fingers remain grouped.\nChoose an action in the Action Editor. R/L FootIK controls expose ik_blend; 0 preserves the game keys, 1 enables manual foot placement with KneePole. Bone stretching is disabled.\n')
assert len(bpy.data.actions) in [15,16]
assert all(b.name in rig.data.bones for b in [rig.data.bones['RHip'],rig.data.bones['RKnee']])
bpy.ops.wm.save_as_mainfile(filepath=str(Path(destination).resolve()),compress=True)
print('EDITABLE_RIG_EXPORTED',destination,len(rig.data.bones),'bones;',len(bpy.data.actions),'actions')
