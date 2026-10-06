#!/usr/bin/env python3
"""Retarget the approved female movement set to the original male warrior.

Preserves geometry, textures, bind transforms and skin weights. Uses the shared
animation recipe, adapting arm axes and solving foot plants for male proportions.
"""
import argparse
import base64
import importlib.util
import json
import math
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('warrior_motion', ROOT / 'tools/rebuild-female-warrior.py')
motion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(motion)


def read_model(gender):
    prefix = f'window.LoveAdventureModelParts.{gender}.push('
    files = sorted((ROOT / 'assets/models').glob(f'{gender}-*.js'))
    raw = base64.b64decode(''.join(json.loads(p.read_text()[len(prefix):].strip().removesuffix(';').removesuffix(')')) for p in files), validate=True)
    size = struct.unpack_from('<I', raw, 12)[0]
    return files, json.loads(raw[20:20+size]), bytearray(raw[28+size:])



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', type=Path)
    args = parser.parse_args()
    files, g, binary = read_model('male')
    _, female, _ = read_model('female')
    nodes = {n['name']: n for n in g['nodes']}
    source_nodes = {n['name']: n for n in female['nodes']}
    count_bones = len(g['skins'][0]['joints'])
    parents = {child: i for i, node in enumerate(g['nodes'][:count_bones]) for child in node.get('children', [])}
    scale = nodes['Hips']['translation'][1] / source_nodes['Hips']['translation'][1]
    basis = {}
    for side in ['R', 'L']:
        for name, child in [('Shoulder', 'Elbow'), ('Elbow', 'Wrist'), ('Wrist', 'Hand')]:
            basis[side+name] = motion.align(nodes[side+child]['translation'], source_nodes[side+child]['translation'])
    male_tip, female_tip = (.079, -.445, .474), (-.253, -.366, .176)
    # Orient the original grip and blade together; the sword still articulates around that grip.
    basis['RHand'] = basis['Sword'] = motion.align(male_tip, female_tip)

    def accessor(flat, kind):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(struct.pack('<'+'f'*len(flat), *flat))
        g['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(flat)*4})
        width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[kind]
        g['accessors'].append({'bufferView': len(g['bufferViews'])-1, 'componentType': 5126, 'count': len(flat)//width, 'type': kind})
        return len(g['accessors'])-1

    def write(index, flat):
        a = g['accessors'][index]
        v = g['bufferViews'][a['bufferView']]
        struct.pack_into('<'+'f'*len(flat), binary, v.get('byteOffset', 0)+a.get('byteOffset', 0), *flat)
        a.pop('min', None)
        a.pop('max', None)

    durations = {'Idle': 3., 'Walk': .9, 'Run': .72, 'Sprint': .62, 'Jump': 1.12, 'Fall': .6, 'Land': .25, 'Stop': .25, 'Turn': .3, 'Combo': 4.05}
    durations.update({f'Attack{i+1}': motion.ENDS[i]-motion.STARTS[i] for i in range(5)})
    old = {a['name']: a for a in g['animations']} if g.get('extras', {}).get('revision') in ['MALE_BODY_AND_SWORD_V11','MALE_BODY_AND_SWORD_V12'] else {}
    animations = []
    for name, duration in durations.items():
        count = math.ceil(duration*60)+1
        times = [i*duration/(count-1) for i in range(count)]
        previous = old.get(name)
        reuse = {(c['target']['node'], c['target']['path']): previous['samplers'][c['sampler']] for c in previous['channels']} if previous else {}
        ti = next(iter(reuse.values()))['input'] if reuse else accessor(times, 'SCALAR')
        write(ti, times)
        g['accessors'][ti].update(min=[0], max=[duration])
        animation = {'name': name, 'samplers': [], 'channels': []}
        rotations, translations = [], []
        attack = name == 'Combo' or name.startswith('Attack')
        for t in times:
            full_t = t if name == 'Combo' or not attack else motion.STARTS[int(name[-1])-1]+t
            pose = motion.authored(name, t)
            if attack:
                pose = motion.grounded_attack_pose(g, pose, full_t, scale)
            source_world, target_world, local = {}, {}, {}
            authored_qs = motion.attack_rotations(full_t) if attack else {}
            for i, node in enumerate(g['nodes'][:count_bones]):
                bone_name = node['name']
                angles = pose.get(bone_name, (0, 0, 0))
                source_q = authored_qs.get(bone_name, motion.quaternion(angles))
                parent = parents.get(i)
                source_world[i] = motion.qmul(source_world[parent], source_q) if parent is not None else source_q
                # Retarget limb bind axes in world space, then recover local joint rotations.
                target_world[i] = motion.qmul(source_world[i], basis.get(bone_name, (0, 0, 0, 1)))
                local[bone_name] = motion.qmul(motion.inverse(target_world[parent]), target_world[i]) if parent is not None else target_world[i]
            if attack:
                local.update(motion.attack_legs(g, pose, full_t, scale))
            positions = {}
            for node in g['nodes'][:count_bones]:
                pos = list(node['translation'])
                if node['name'] == 'Root':
                    pos[2] += pose['_step']*scale
                if node['name'] == 'Hips':
                    pos[0] += pose.get('_shift_x',0)*scale
                    pos[1] -= pose['_drop']*scale
                    pos[2] += pose.get('_shift_z',0)*scale
                positions[node['name']] = pos
            rotations.append(local)
            translations.append(positions)
        for i, node in enumerate(g['nodes'][:count_bones]):
            for path, frames, kind in [('rotation', rotations, 'VEC4'), ('translation', translations, 'VEC3')]:
                flat = [v for frame in frames for v in frame[node['name']]]
                oi = reuse[(i, path)]['output'] if reuse else accessor(flat, kind)
                write(oi, flat)
                animation['channels'].append({'sampler': len(animation['samplers']), 'target': {'node': i, 'path': path}})
                animation['samplers'].append({'input': ti, 'output': oi, 'interpolation': 'LINEAR'})
        animations.append(animation)
    g['animations'] = animations
    g.setdefault('extras', {}).update(revision='MALE_BODY_AND_SWORD_V12', gender='male', swordTip=male_tip, motionScale=scale,
                                     combatNote='Grounded body rhythm and pivots retargeted to male proportions; approved blade orientation preserved')
    g['buffers'][0]['byteLength'] = len(binary)
    header = json.dumps(g, separators=(',', ':')).encode()
    header += b' '*((-len(header)) % 4)
    raw = struct.pack('<4sII', b'glTF', 2, 28+len(header)+len(binary))+struct.pack('<I4s', len(header), b'JSON')+header+struct.pack('<I4s', len(binary), b'BIN\0')+binary
    encoded = base64.b64encode(raw).decode()
    size = 8*1024*1024
    assert math.ceil(len(encoded)/size) == len(files)
    for i, path in enumerate(files):
        path.write_text('window.LoveAdventureModelParts.male.push('+json.dumps(encoded[i*size:(i+1)*size])+');\n')
    if args.export:
        args.export.parent.mkdir(parents=True, exist_ok=True)
        args.export.write_bytes(raw)
    print(f'Retargeted {len(animations)} clips to {count_bones} bones ({len(raw):,} bytes).')


if __name__ == '__main__':
    main()
