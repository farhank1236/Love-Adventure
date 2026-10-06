#!/usr/bin/env python3
"""Protect the original male warrior appearance and bindings while retargeting."""
import base64
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'window.LoveAdventureModelParts.male.push('
raw = base64.b64decode(''.join(json.loads(p.read_text()[len(PREFIX):].strip().removesuffix(';').removesuffix(')')) for p in sorted((ROOT / 'assets/models').glob('male-*.js'))))
size = struct.unpack_from('<I', raw, 12)[0]
g = json.loads(raw[20:20+size])
binary = raw[28+size:]
EXPECTED = {
  "POSITION": "c565314d5a7d7bd2a77276b533e6edb55d0ba7e4aa8910c8f38a9645873d494c",
  "NORMAL": "68dc83c7d98789184c990ef61cdfca6fee924252b706254ab3e68f7be5d012ba",
  "TEXCOORD_0": "8c6ff14e4c3e8f0fc3bfa57e19a3f3994c2decb9f4d0612d7d89ee1f3ca31868",
  "JOINTS_0": "78c691208d955cc841153611b8161045769f4eb6c66f5ff332e82ddd89b3bf64",
  "WEIGHTS_0": "2ba03665acf0ad77122bf1bb5a0955522f75d6952ddc3ff682aaf869a8e1184f",
  "indices": "1754b652060c116c8d45a1c0d2d7d63dfb3b3250debceb0cb0e71b154be79338",
  "texture": "a1a59a56abe6f175f42298b776e5e65a179c60e6a3aebffc17a3ba4ba49d3794"
}

def data(index):
    a = g['accessors'][index]
    v = g['bufferViews'][a['bufferView']]
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    width = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4, 'MAT4':16}[a['type']]
    size = {5126:4, 5123:2, 5125:4}[a['componentType']]
    return binary[offset:offset+a['count']*width*size]

primitive = g['meshes'][0]['primitives'][0]
for name, index in primitive['attributes'].items():
    assert hashlib.sha256(data(index)).hexdigest() == EXPECTED[name], name
assert hashlib.sha256(data(primitive['indices'])).hexdigest() == EXPECTED['indices']
image = g['bufferViews'][g['images'][0]['bufferView']]
texture = binary[image['byteOffset']:image['byteOffset']+image['byteLength']]
assert hashlib.sha256(texture).hexdigest() == EXPECTED['texture']
assert len(g['skins'][0]['joints']) == 27
assert len(g['animations']) == 15
print('Male geometry, topology, normals, UVs, textures and skin weights preserved; 15 clips verified.')
