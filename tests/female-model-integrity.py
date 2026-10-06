#!/usr/bin/env python3
"""Verify the user's original appearance survives animation and cloth-weight edits."""
import base64
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'window.LoveAdventureModelParts.female.push('
raw = base64.b64decode(''.join(json.loads(p.read_text()[len(PREFIX):].strip().removesuffix(';').removesuffix(')')) for p in sorted((ROOT / 'assets/models').glob('female-*.js'))))
size = struct.unpack_from('<I', raw, 12)[0]
g = json.loads(raw[20:20+size])
binary = raw[28+size:]
EXPECTED = {
  "mesh0_POSITION": "3609f5ebcf0bc77fbcda8b51bf7de2b7685614fba96957d5204856eaa9b550b0",
  "mesh0_NORMAL": "7db1d82983d48227555cb8cf3838527c010b80c2b7944f626b1d52cd6b5844ef",
  "mesh0_TEXCOORD_0": "063577f1fceba8d7e205cf47d054674436113d57f9f8b30a99a229568e354a45",
  "mesh1_POSITION": "b8096508d81a417133748071d74034e6e2e3cccc338eb38f674c18ee26ba1ad3",
  "mesh1_NORMAL": "a6d41fa3c9d26525c4b7f8b2f19430ed50d92b61f39e90c3211b7f00b95648dd",
  "mesh2_POSITION": "d54f3696677076cf234c218e216178fc150568232ef78f692200ea77d8bb5447",
  "mesh2_NORMAL": "9219fc5a7352fc888ed4bba03f79c9054f0873b7221dc5ddb0b427029d3b3f21",
  "mesh2_TEXCOORD_0": "4b07d9f866d5bdae19ccde5fe17946e9ab2fcbb276a0dcb538fc9a2ae8c1e335",
  "texture": "069ccce63a64a6db9d1f382f4d0a80ffaea0f7732036e37719a88fd01998b92c"
}

def data(index):
    a = g['accessors'][index]
    v = g['bufferViews'][a['bufferView']]
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    width = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4, 'MAT4':16}[a['type']]
    size = {5126:4, 5123:2, 5125:4}[a['componentType']]
    return binary[offset:offset+a['count']*width*size]

for i, mesh in enumerate(g['meshes']):
    primitive = mesh['primitives'][0]
    for name, index in primitive['attributes'].items():
        if name in ['JOINTS_0', 'WEIGHTS_0']:
            continue
        assert hashlib.sha256(data(index)).hexdigest() == EXPECTED[f'mesh{i}_{name}'], name
image = g['bufferViews'][g['images'][0]['bufferView']]
texture = binary[image['byteOffset']:image['byteOffset']+image['byteLength']]
assert hashlib.sha256(texture).hexdigest() == EXPECTED['texture']
assert len(g['skins'][0]['joints']) == 32
assert len(g['animations']) == 15
print('Original geometry, normals, UVs and texture preserved; 15 clips and 32 bones verified.')
