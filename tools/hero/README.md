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

v6 (current game model, `HERO_V6`, build `v6-horse`):
- `fun5.py`: Summon and Dismiss redone. The sword is drawn with the right hand out of a pocket portal that opens at the left hip; the `Sword_Portal` track (position, facing and open amount as scale) drives the game's portal effect and the clipping plane. `IdleBall` (240 frames) is the 30 s idle: a ball drops out of a small portal above him, keepy-uppy, a header back into a second portal. The ball path, both portals and the speech cues are exported in `extras.idleBall`.
- `ride5.py`: `Mount` (left foot into the stirrup, step up, swing the right leg over the cantle, settle), `Dismount`, `RideIdle`, `RideWalk` (phase-locked to the horse's 1.0 s walk) and `RideGallop` (half-seat, two gallop strides). The hero is parented to the horse's `Saddle` bone while riding; `extras.ride` holds the frame offsets. The cape collides with the horse (`horse_colliders`).
- `build6.py` makes `clips_v6.pkl`; `export_glb6.py OUT.glb clips_v6.pkl` writes the game GLB; `rsheet.py` renders hero + horse contact sheets.

v7 clips (same model, `HERO_V6` revision):
- `run7.py`: natural running arms. The upper arm swings about 40° forward and 25° back, the elbow is held near 90°, and the hands are relaxed closed fists with thumbs up, pumping close to the chest. The old run reached forward with an open, palm-up hand. The legs and body are unchanged.
- `ride7.py`: the rider visibly rides.
  - **Walk:** the pelvis sways and rocks with the horse's back, the upper body balances against it, and the hands follow the head nod.
  - **Gallop:** two-point seat with knee absorption, torso pitch and hands travelling along the neck.
  - **Idle:** breathing, weight shift, a look left and right, and a rein adjustment.
- `build7.py` makes `clips_v7.pkl`; then `export_glb6.py OUT.glb clips_v7.pkl`, then `tools/lod` to reduce and chunk. `csheet.py` renders clip contact sheets.
