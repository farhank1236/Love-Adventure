# Red Bird model

Source: `red-bird-rigged.blend` (not committed): a 500,000-triangle sculpt, an 88-bone skeleton and a 4K texture.

The texture is an AI-made atlas cut into thousands of tiny UV islands. Because a seam-preserving reduction has to keep every island border, it cannot get anywhere near a light model. So the light model gets its own texture, baked from the original:

1. **Read the blend** (pure Python, no Blender). Use `/home/claude/tools/unzstd.py`, `extract.py` (rig) and `mesh.py` (mesh, skin weights, UVs). The packed PNG is pulled from the `Image.packedfile` block.
2. **Weld and reduce the shape.** Exact-duplicate positions are welded (the surface is closed). `tools/lod/simplify.cpp` then reduces it to 3,000 triangles, with the head and beak weighted ×7 and the feet ×3.
3. **Build and bake the texture** with `build_bird.py`:
   - It packs the light triangles into a 1024² atlas: edge-sharing pairs share a square cell, sized by area.
   - Each texel takes the colour of the closest point on the original surface. Only candidates facing the same way count, and sampling stays inside the source UV island, away from its dark gutters.
   - The atlas is dilated, and pure whites are softened so the eyes don't bloom.
   - Zero-length normals (thin folds) are replaced.
4. **Export the GLB.** Skin weights come from the original vertices (top 4). The skeleton is the original 88 bones with translation-only rests, Y up, the bird facing +Z, 1 unit = 1 m. The file is about 650 KB, including a 300 KB JPEG.

```sh
python3 unzstd.py red-bird-rigged.blend bird.blend
python3 extract.py bird.blend rig.json          # + mesh.py -> mesh.pkl, packed PNG -> tex.png
# weld + write simplify input (see build notes in build_bird.py), then:
./simplify in.bin out_3000.bin 3000
python3 -I tools/bird/build_bird.py work mesh.pkl rig.json tex.png work/out_3000.bin redbird.glb 1024
python3 tools/lod/chunk.py redbird.glb redbird 1
```

There are no baked animation clips. `assets/world/redbird-rig.js` poses the bones procedurally:

- the wing beat, with lagging forearm and hand and a partial fold on the upstroke
- the folded wings
- the dash sweep
- tucked legs
- pecking, the head look and an open beak
- the tail fan
- a limp death pose

States blend continuously this way, and nothing extra is downloaded.

## Earth Dragon (same tool)

`earth-dragon-rigged.blend`: 499,906 triangles, 211 bones, a 4K texture. Reduced to 8,000 triangles, with the head, jaw and horns weighted ×7 and the claws ×3, and baked onto a 2048² atlas. The GLB is 2.1 MB, chunked into `assets/models/dragon-01..02.js`.

```sh
./simplify in.bin out_8000.bin 8000
python3 -I tools/bird/build_bird.py work mesh.pkl rig.json tex.png work/out_8000.bin dragon.glb 2048
python3 tools/lod/chunk.py dragon.glb dragon 2
```
