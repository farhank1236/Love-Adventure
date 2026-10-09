# War horse pipeline (numpy, no Blender needed)

Source: the user's `Armored_Horse.glb` (mesh and texture kept exactly as designed; only the texture is resized).

1. `hskel.py`: the skeleton (Root, Hips, 5 tail bones, Spine, Chest, Neck1-2, Head, and per side Scap / Humerus / Forearm / FCannon / FPastern and Thigh / Gaskin / HCannon / HPastern), placed from measurements of the mesh (horse scaled to 2.35 m tall at the ears, y up, +z forward).
2. `weights.py`: skin weights (bone-capsule distances, smoothed over the mesh) -> `weights.npz`. `pose.py`: forward kinematics and linear-blend skinning.
3. `saddle.py`: the fitted war saddle (blanket with gold trim, seat, cantle, pommel, girths, stirrup leathers and irons), bound to the Spine.
4. `gait.py`: Idle, Walk (four-beat, 1.8 m/s), Gallop (15 m/s = 3x the hero's run) and Rear, with hoof plants solved so the feet don't slide.
5. `export_horse.py` -> `horse.glb` (KHR_mesh_quantization, two skins), chunked as `window.AethelosModelParts.horse` into `assets/models/horse-01.js`..`04.js`.
6. Checks: `hsheet.py` and `look_saddle.py` render contact sheets.
