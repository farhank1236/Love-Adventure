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

`video3.py` renders preview reels with a numpy rasterizer. `blender_build_hero_v3.py` is the self-contained Blender build script.
