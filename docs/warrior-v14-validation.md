# V14 movement and enemy rendering

Male combat uses five full-body swings; female combat uses six. Each cut includes anticipation, shoulder travel, elbow extension, torso/pelvis turn, stepping weight transfer and recovery. Head and free arm counterbalance the torso. Running adds forward lean and higher swing-foot trajectories; the fixed-length leg solver keeps stance contacts synchronized with actual travel. The sword is rigidly attached at the palm. Interruption uses its rendered hilt-to-tip segment plus the forgiving low sweep, so projectiles near the visible blade and ground attacks can both be cancelled. Finger-curl/thumb bones retain the existing sculpted grip and add subtle hand movement; these are grouped finger controls rather than individual phalanges.

The original male left boot pointed about 65 degrees outward. The reviewed correction rotates its existing geometry forward around the ankle with a smooth transition into the shin and transforms normals with the twist Jacobian. `tools/male-foot-alignment.json` records the original affected vertices/normals and isolates the actual boot by welded mesh connectivity, excluding clothing that shared foot weights. Lower cape bindings are blended back to CapeBottom, independently of the boots. The actual boot sole is rigidly foot-bound with a smooth shin transition. Appearance validation checks this exact correction and reconstructs the original hashes for those vertices; all other body/handle vertices, topology, UVs and texture bytes remain protected by the original baseline. The previous ten-percent blade extension is retained, not applied again.

The supplied aunt was a static, unrigged sorceress. It now has sixteen deform bones, paired wing/wing-tip controls, smoothed surface bindings, torso/head/arm motion, hovering, head-driven hair and a trailing dress and baked Hover/EyeCast actions. The hover cycle loops without a pose seam. Runtime eyes have an additive glow and a local light; projected eye locations emit her laser. The uncle keeps his original artwork with casting recoil and rings; BLAH! projectiles are extruded meshes with lit faces and beveled sides. The two original projectile types, speeds (7.2 laser / 2.3 wave), 90-tick firing interval, damage and interruption behavior remain intact.

The uncle's supplied GLB exceeds the executor's 32 MiB attachment transfer limit and could not be imported. His uploaded body, wings and flight are therefore not implemented. A smaller GLB or compressed ZIP is needed to finish that part.

## Verification

- Actual game sampler: fixed limb lengths, sword/palm stability, blade ground clearance, thigh/knee participation, stance contact versus traveled distance, run flight phase and locomotion seams.
- Browser gameplay: all six female/five male queued presses and finisher damage, held-key latch, one-second reset, low/forward enemy interruption, run/sprint/jump/landing, and running attack momentum.
- Body mechanics: compression, hip travel, pelvis/torso motion, head tracking, support-foot pivots, upper-arm participation, elbow extension and full blade arcs for every attack.
- Enemy rig: normalized vertex weights, finite flight poses, wing travel, hover, cast-light recovery, actual eye emitter locations and unchanged firing cadence/speeds. Baked Blender tracks match the game's procedural poses and the Hover seam is continuous.
- Preview: every available attack, correct per-gender attack buttons, scrub controls, selection and mobile sizing. Store and Game Over menu regressions remain passing.
- Blender imports: female 16 actions / 40 bones including four optional IK controls; male 15 actions / 35 bones including IK controls; aunt 2 actions / 16 bones. Packed textures and the same exported GLBs are included in the ZIP packages.

## Limits

The rigs use linear skinning and keyed secondary motion. Deep poses can still compress armor or stretch clothing; there is no physical cloth or muscle simulation. Individual phalanges, toes and extra clavicle/mid-spine controls are not supplied. Browser checks use software Chromium WebGL; hardware GPU behavior has not been tested. Renderer footage shows the real models/sampler from front, side and rear and is an inspection recording, not a frame-rate benchmark.
