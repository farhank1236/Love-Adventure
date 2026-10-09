# Light models (level of detail)

The characters were sculpted at about 500,000 triangles each. The game uses light copies made here, all under 50,000 triangles, with the same textures, UVs, skeleton, skin weights, morph targets (fist), animations and extras. Movement is identical, and from the game camera they look the same.

| Model | Original | Game |
|---|---|---|
| Hero body + sword (`assets/models/hero-01..02.js`) | 499,734 + 500,000 | 44,000 + 5,000 |
| War horse + saddle (`assets/models/horse-01.js`) | 484,000 + 13,500 | 44,000 + 4,500 |
| Female Warrior, 3D world copy (`assets/models/femaleworld-01..02.js`) | 485,741 + 27,670 | 40,000 + 7,000 |

The approved Female Warrior files (`assets/models/female-NN.js`) are untouched; the menus and the integrity tests still use them.

## Tools

- `simplify.cpp`: the simplifier. Build it with `g++ -O2 -std=c++17 -o simplify simplify.cpp`.
  - It uses quadric error with half-edge collapses onto existing vertices. Vertices are only removed, never moved, so every kept vertex keeps its exact attributes.
  - UV/normal seams and open borders are preserved: seam corners only collapse along the seam, and both sides move together.
  - The cost also includes the *texture slide*: how far the texel under a removed vertex would move.
- `simplify_glb.py IN.glb OUT.glb ./simplify 'Mesh:triangles[:lockmorph][:imp=hero|female]' …`: rewrites a GLB, keeping everything else byte-for-byte.
  - **Region budgets (`imp=`):** they keep detail where it matters, for example face 9,000, rest of the head 6,500, chest front 7,000, rest of the body 22,500.
  - **Morph vertices (`lockmorph`):** vertices with morph deltas are locked, so the fist morph keeps its fingers.
  - **Normals:** they are recomputed on the light surface, smooth across seams but keeping hard edges, so big flat armour plates shade cleanly.
  - **Primitives:** vertices shared between primitives of one mesh (the horse body is split into chunks) are locked, so no cracks open between them.
- `jpeg_textures.py IN.glb OUT.glb 92`: re-encodes opaque PNG textures as JPEG at the same resolution. The Female Warrior's 4K texture drops from 16.7 MB to 2.5 MB.
- `chunk.py IN.glb name parts`: writes `assets/models/name-NN.js` (base64 parts pushed to `window.AethelosModelParts.name`).

## Rebuild

```sh
g++ -O2 -std=c++17 -o /tmp/simplify tools/lod/simplify.cpp
UV_SCALE=1.0 python3 tools/lod/simplify_glb.py hero_v6.glb hero_lod.glb /tmp/simplify 'HeroBody:44000:lockmorph:imp=hero' 'HeroSword:5000'
UV_SCALE=1.0 python3 tools/lod/simplify_glb.py horse.glb horse_lod.glb /tmp/simplify 'HorseBody:37000' 'Saddle:4500'
UV_SCALE=1.0 python3 tools/lod/simplify_glb.py female_v14.glb female_world.glb /tmp/simplify 'OriginalWarriorSurface:40000:imp=female' 'Red_Blade_Aura:3000' 'IndependentSwordMesh:4000'
python3 tools/lod/jpeg_textures.py female_world.glb female_world_j.glb 92
python3 tools/lod/chunk.py hero_lod.glb hero 2; python3 tools/lod/chunk.py horse_lod.glb horse 1; python3 tools/lod/chunk.py female_world_j.glb femaleworld 2
```

New characters should be built (or reduced here) to about 15,000–30,000 triangles.
