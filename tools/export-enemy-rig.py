"""blender -b --python tools/export-enemy-rig.py -- AUNT.glb OUTPUT.blend"""
import sys
from pathlib import Path
import bpy
source,destination=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.show_in_front=True
for action in bpy.data.actions:action.use_fake_user=True
assert len(rig.data.bones)==16
print('ACTION_NAMES',[a.name for a in bpy.data.actions])
assert len(bpy.data.actions)==2
assert all(any(a.name==clip or a.name.startswith(clip+'_') for a in bpy.data.actions) for clip in ['Hover','EyeCast'])
bpy.ops.file.pack_all();notes=bpy.data.texts.new('Sorceress rig notes');notes.write('The supplied sorceress retains her original surface, UVs and texture. A sixteen-bone flight rig adds two controls per wing, hovering torso, head, casting arms, hair and trailing dress. Hover and EyeCast are baked from the game motion. Eye glow, lights and laser projectiles are rendered in the game. Uncle upload is not included: it exceeds the available 32 MiB transfer limit.\n')
bpy.ops.wm.save_as_mainfile(filepath=str(Path(destination).resolve()),compress=True)
print('ENEMY_RIG_EXPORTED',len(rig.data.bones),'bones',len(bpy.data.actions),'actions')
