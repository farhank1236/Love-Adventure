#!/usr/bin/env python3
"""Bake coherent arm/sword animation into the existing split GLB, preserving meshes.

Uses only Python's standard library. Run from any directory. Optionally supply
--export /path/to/female-warrior.glb for Blender inspection. Repeatable: existing
Run accessors are reused, and no mesh, skin weights or textures are rewritten.
"""
import argparse
import base64
import copy
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / 'assets/models'
PREFIX = 'window.LoveAdventureModelParts.female.push('
STARTS = [0., .9, 1.7, 2.5]
ENDS = [.9, 1.7, 2.5, 3.6]
HITS = [.56, 1.36, 2.16, 3.19]
# XYZ degrees: shoulder drives the cut; elbow only flexes in its hinge plane.
GUARD = (-35, 8, -10)
SWINGS = [
    ((-140, -15, -12), (-30, 12, 16), (8, 18, 10), -12, 14),
    ((-55, -75, -20), (-60, 75, 20), (-30, 90, 10), -25, 25),
    ((-55, 70, 20), (-60, -75, -20), (-30, -90, -10), 25, -25),
    ((15, -20, -25), (-125, 30, 10), (-140, 15, -10), -18, 18),
]


def quaternion(degrees):
    x, y, z = [math.radians(v)/2 for v in degrees]
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    return (sx*cy*cz+cx*sy*sz, cx*sy*cz-sx*cy*sz, cx*cy*sz+sx*sy*cz, cx*cy*cz-sx*sy*sz)


def interpolate(a, b, u):
    # Smooth keyed transitions, evaluated into uniform GLTF samples.
    u = max(0., min(1., u)); u = u*u*(3-2*u)
    return tuple(x+(y-x)*u for x, y in zip(a, b))


def attack_pose(time):
    i = next((i for i, end in enumerate(ENDS) if time <= end), 3)
    t = time-STARTS[i]; duration = ENDS[i]-STARTS[i]; hit = HITS[i]-STARTS[i]
    windup, strike, follow, turn_from, turn_to = SWINGS[i]
    frames = [0., hit*.52, hit, min(duration*.88, hit+.16), duration]
    values = [(GUARD, -60., 0.), (windup, -55., turn_from),
              (strike, -30., turn_to), (follow, -35., turn_to*.75), (GUARD, -60., 0.)]
    k = min(len(frames)-2, next((j for j in range(len(frames)-1) if t <= frames[j+1]), len(frames)-2))
    u = (t-frames[k])/(frames[k+1]-frames[k])
    shoulder = interpolate(values[k][0], values[k+1][0], u)
    elbow, turn = interpolate(values[k][1:], values[k+1][1:], u)
    return shoulder, elbow, turn


def rotations(clip, t):
    if clip == 'Combo' or clip.startswith('Attack'):
        full_t = t if clip == 'Combo' else STARTS[int(clip[-1])-1]+t
        shoulder, elbow, turn = attack_pose(full_t)
        return {'RShoulder': shoulder, 'RElbow': (elbow, 0, 0), 'RWrist': (0, 0, 0),
                'RHand': (0, 0, 0), 'Sword': (0, 0, 0), 'Spine': (3, turn*.4, 0),
                'Chest': (4, turn*.6, 0), 'LShoulder': (-20, -8, 12), 'LElbow': (-65, 0, 0)}
    phase = 2*math.pi*t/(.8 if clip == 'Run' else 2.4)
    wave = math.sin(phase)
    result = {'RHand': (0, 0, 0), 'Sword': (0, 0, 0), 'RWrist': (0, 0, 0)}
    if clip == 'Run':
        result.update(RShoulder=(-30-14*wave, 10, -12), RElbow=(-65+8*wave, 0, 0),
                      LShoulder=(-20+32*wave, -8, 12), LElbow=(-75-8*wave, 0, 0),
                      LWrist=(0, 0, 0), LHand=(0, 0, 0), Hips=(8, 3*wave, 2*wave),
                      Spine=(5, -4*wave, 0), Chest=(5, -5*wave, 0), Neck=(-5, 0, 0), Head=(-4, 0, 0),
                      RHip=(-48*wave, 0, 0), LHip=(48*wave, 0, 0),
                      RKnee=(20+55*max(0, wave), 0, 0), LKnee=(20+55*max(0, -wave), 0, 0),
                      RAnkle=(-12-15*max(0, wave), 0, 0), LAnkle=(-12-15*max(0, -wave), 0, 0),
                      RFoot=(5, 0, 0), LFoot=(5, 0, 0), CapeTop=(-12, 0, 0), CapeMid=(-18, 3*wave, 0),
                      CapeBottom=(-15, 5*wave, 0), Hair=(5, 0, 0), HairMid=(12, 2*wave, 0),
                      HairTip=(8, 3*wave, 0), SkirtFront=(-10, 0, 0), SkirtR=(-8-8*wave, 0, 0), SkirtL=(-8+8*wave, 0, 0))
    elif clip == 'Walk':
        result.update(RShoulder=(-35-8*wave, 8, -10), RElbow=(-60+4*wave, 0, 0),
                      LShoulder=(-12+20*wave, -8, 10), LElbow=(-35, 0, 0))
    elif clip == 'Jump':
        lift = math.sin(math.pi*min(1, t/1.))
        result.update(RShoulder=(-35-18*lift, 8, -10), RElbow=(-60-10*lift, 0, 0))
    else:
        breath = math.sin(t*2*math.pi/3)
        result.update(RShoulder=(-35+1.5*breath, 8, -10), RElbow=(-60, 0, 0))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--export', type=Path); args = parser.parse_args()
    files = sorted(PARTS.glob('female-*.js'))
    data = base64.b64decode(''.join(json.loads(p.read_text()[len(PREFIX):].strip().removesuffix(';').removesuffix(')')) for p in files), validate=True)
    magic, version, size = struct.unpack_from('<4sII', data); assert magic == b'glTF' and version == 2 and size == len(data)
    json_size = struct.unpack_from('<I', data, 12)[0]; g = json.loads(data[20:20+json_size]); bin_start = 28+json_size
    binary = bytearray(data[bin_start:]); assert len(binary) == g['buffers'][0]['byteLength']

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

    if not any(a['name']=='Run' for a in g['animations']):
        run = copy.deepcopy(next(a for a in g['animations'] if a['name']=='Idle')); run['name']='Run'
        ts = [i*.8/48 for i in range(49)]; ti = accessor(ts, 'SCALAR')
        g['accessors'][ti].update(min=[0], max=[.8])
        for channel in run['channels']:
            sampler = run['samplers'][channel['sampler']]
            kind = 'VEC4' if channel['target']['path']=='rotation' else 'VEC3'
            sampler['input']=ti; sampler['output']=accessor([0.]*(len(ts)*(4 if kind=='VEC4' else 3)), kind)
        g['animations'].append(run)

    for animation in g['animations']:
        for channel in animation['channels']:
            node = g['nodes'][channel['target']['node']]; name = node['name']; path = channel['target']['path']
            sampler = animation['samplers'][channel['sampler']]; ts = values(sampler['input']); flat = []
            if path == 'rotation':
                authored = [rotations(animation['name'], t).get(name) for t in ts]
                if authored[0] is None: continue
                for degrees in authored: flat.extend(quaternion(degrees))
            elif path == 'translation' and name == 'RHand':
                flat = node['translation']*len(ts)
            elif path == 'translation' and animation['name']=='Run':
                for t in ts:
                    pos = list(node.get('translation', [0,0,0]))
                    if name=='Hips': pos[1] += .012*math.cos(4*math.pi*t/.8)
                    flat.extend(pos)
            else: continue
            write(sampler['output'], flat)

    g['extras'].update(revision='BODY_AND_SWORD_V9', swordControl='Rigid hand grip; no independent blade rotation or hand translation',
                       combatNote='Shoulder-led four cuts, hinge-constrained elbow, coordinated chest rotation; separate Run loop')
    g['buffers'][0]['byteLength']=len(binary)
    json_bytes=json.dumps(g,separators=(',',':')).encode();json_bytes+=b' '*((-len(json_bytes))%4)
    output=struct.pack('<4sII',b'glTF',2,28+len(json_bytes)+len(binary))+struct.pack('<I4s',len(json_bytes),b'JSON')+json_bytes+struct.pack('<I4s',len(binary),b'BIN\0')+binary
    encoded=base64.b64encode(output).decode();chunk_size=8*1024*1024
    assert math.ceil(len(encoded)/chunk_size)==len(files), 'Update HTML model script tags if the part count changes.'
    for i, p in enumerate(files): p.write_text(PREFIX+json.dumps(encoded[i*chunk_size:(i+1)*chunk_size])+');\n')
    if args.export: args.export.parent.mkdir(parents=True, exist_ok=True); args.export.write_bytes(output)
    print(f'Baked {len(g["animations"])} clips into {len(files)} model parts ({len(output):,} bytes).')


if __name__ == '__main__': main()
