# Hero animation pipeline

Pure-Python tools used to author the warrior's animations and export `assets/models/hero-*.js`.

Inputs (not committed, large): `hero-rigged-2.blend` (Blender 5.x file, zstd-compressed), the sword GLB, and optionally
`hero-warrior-v17.blend` (old warrior, used as attack-timing reference). The scripts currently use absolute working paths
(`/home/claude/work`, `/home/claude/tools`, `/mnt/user-data/uploads`). Adjust these at the top of each file before re-running.

Order:
1. `unzstd.py` + `extract.py` / `mesh.py`: read the .blend (rig, actions, mesh, weights) without Blender.
2. `weights_final.py`: skin-weight cleanup (arm bleed into the cape removed, then smoothing).
3. `attacks3.py`, `locomotion3.py`: key poses (joint-space arms, stiff wrist). `armfk.py` solves forearm/elbow per key.
   `build3.py` adds the grip roll (edge alignment) and left-arm spring. `secondary.py` runs the cape/robe simulation.
   `fx.py` handles the aura, ghost trail and portal.
4. `final_build3.py`: builds all 18 clips into `clips_v3.pkl`.
5. `export_glb.py OUT.glb`: game GLB (Y-up, translation-only joint rests, fist morph targets, decimated sword).
   `verify_glb.py OUT.glb` re-skins the GLB and compares it with the reference poses.
6. Chunk the GLB into 8 base64 parts: `window.AethelosModelParts.hero.push("…")` in `assets/models/hero-01.js` … `hero-08.js`.

v4 (current game model, `HERO_V4`):
- The hero UVs are flipped to glTF's top-down V. Before this, the texture landed upside down on every UV island, so the face and colours were lost. The sword is matte, matching its source material.
- The geometry is full resolution with no decimation (clustering averaged UVs and smeared the texture). Size is kept down with `KHR_mesh_quantization`: int8 normals, uint16 UVs, uint8 joints and weights, and sparse fist morph targets. The model is 31 MB.
- `locomotion4.py`: the run, authored for 5 m/s. `attacks4.py`: AttackLow and AttackUp. `dodge.py`: the roll, using the solver's blendable joint-space leg mode (`lfk_*` controls in `timeline.py`). `secondary.py` adds floor and drawn-blade collisions for the cloth.
- `build4.py` makes `clips_v4.pkl`: the v3 clips byte-identical, plus the 6 new or changed clips. `export_glb4.py OUT.glb clips_v4.pkl` writes the game GLB.
- Checks: `clearance.py` (blade vs body), `ground.py` (floor contact), `jumps.py` (per-frame joint pops), `skel.py` and `sheet.py` (stick-figure and textured contact sheets), `glbread.py` (reader for quantized and sparse GLBs).

`video3.py` renders preview reels with a numpy rasterizer. `blender_build_hero_v3.py` is the self-contained Blender build script.
