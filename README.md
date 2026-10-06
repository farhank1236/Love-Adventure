# Love Adventure

Version 18 with V13 rig repairs and four-attack combat for both warriors.

Open index.html, then select New Game → Female or Male → Warrior. Default controls: arrow keys move, Space attacks, Shift jumps, and holding R while moving runs; holding Ctrl sprints. Run and Sprint have their own animations and can be remapped in Settings. Each press triggers one cut; four presses queue the combo for either warrior. A one-second input gap resets it. Attacking while jumping works in both stages.

Keep the entire assets folder beside index.html. Model data is divided into script files so no repository file exceeds the single-file limit. All chunks are loaded before the 3D combat code runs.

Both warriors use four connected full-body cuts: downward, cut to the right, right-to-left, and a stronger rising finisher. Hips and torso lead the shoulder; the elbow remains a bounded hinge, while the forearm and wrist change the angle of the rigidly held blade. Two-bone leg solving plants the supporting foot during the stepping combo. Movement accelerates and decelerates, facing turns smoothly, and jumping has anticipation, takeoff, falling and landing poses. Hair and garments have keyed secondary motion; this is skeletal animation rather than a cloth simulation.

Cape and coat panels are rebound to cloth/torso bones so nearby hands cannot pull them into sword poses. Body and handle positions, topology, normals, UVs, textures and rest proportions are preserved; the blade extension is intentional. Red body/blade energy appears during attacks, with a fading curved sword trail and stronger finisher. Sword sweeps cancel nearby incoming arrows, waves, lasers and boss blades, including low attacks; Stage 2 close attacks are interrupted too. Rear attacks and the recovery tail remain vulnerable. Software WebGL rendering and Blender import were checked; hardware GPU rendering was not verified.

Use 3D Warrior · Animation view inside the game to inspect the character.

Development: serve the checkout with `python3 -m http.server 8000` and open the game in a modern browser. Store purchases use earned game currency and are saved in the browser. Starter roles are free; unlocked roles appear in New Game. Character switching is available from the menu, and the Game Over screen offers Restart Game or Main Menu.

Browser regression checks cover store transactions, affordability, upgrade limits, saved purchases, character selection, pause restoration, mobile sizing, and returning to the menu after defeat. With the local server running, install Playwright outside the checkout and run:

```sh
npm install --prefix /tmp/love-adventure-tests playwright
/tmp/love-adventure-tests/node_modules/.bin/playwright install chromium
export NODE_PATH=/tmp/love-adventure-tests/node_modules
node tests/store-game-over.cjs
```

To use an existing Chromium installation, set `BROWSER_EXECUTABLE` (for example `/usr/bin/chromium`) instead of downloading a browser. `GAME_URL` can override the default local server address.

Run the warrior animation and combat regression checks with Playwright setup:

```sh
node tests/warrior-combat.cjs
node tests/character-preview.cjs
node tests/male-warrior.cjs
node tests/warrior-body.cjs
node tests/warrior-rig.cjs
python3 tests/female-model-integrity.py
python3 tests/male-model-integrity.py
```

`tools/rebuild-female-warrior.py` reproducibly bakes the full-body combo, locomotion and jump tracks, and repairs garment bindings with `tools/female-cloth-bindings.json` into the eight model parts while preserving body geometry and textures. Run `python3 tools/rebuild-female-warrior.py --export /tmp/female-warrior-v13.glb` to regenerate the bundled animation and produce an editable GLB for Blender.

Inspect the female warrior in `character-preview.html`: choose guard, walking, running, jumping, the full combo or an individual cut, then rotate, zoom, pause or scrub the animation. This page uses the bundled model parts and has no CDN dependencies.

`tools/rebuild-male-warrior.py` retargets the approved movement recipe to the original male arm axes and leg proportions. It preserves his body geometry and textures while repairing leg skin weights, and solves supporting foot plants in his bind proportions. Run `python3 tools/rebuild-male-warrior.py --export /tmp/hero-warrior-v13.glb` to rebuild and export. Both warriors share four-hit combat timing, root travel, run/sprint, jump phases, red effects and attack interruption.

Use the character buttons in the preview to switch warriors, or open `character-preview.html?gender=male` to inspect the hero directly.

V13 adds grounded body compression and rise, lateral and forward/back hip weight shifts, hip-led torso twist and lean, a balancing free arm, and head movement that stays closer to the attack direction. Foot pivots rotate around forefoot contacts; each rig solves leg reach so planted feet stay on the ground. The finisher has a deeper load and a short catching step. The four attacks use character-relative directions and a rigid grip. Running attacks retain brief forward momentum through the opening step instead of stopping immediately.


V13 repairs the female thigh vertices previously caught by the coat controls, smooths knee/ankle skin transitions, centers knee/ankle pivots within the leg surfaces, and uses fixed-length two-bone leg solves. Cape bindings remain separate from the hands and thighs. Walking, running and sprinting use stance/swing foot trajectories; gameplay advances animation by traveled distance and the baked stride length. Running includes a brief flight phase. Airborne attacks retain jump legs and use landing compression when touching down.

The four attacks are downward slash with a left-foot step, lower-front cut to the character’s right, right-to-left slash, and a rising red-mana finisher. Each Space press queues one attack; holding Space queues no extra attacks, and a one-second input gap resets the sequence. The sword bone stays fixed relative to the hand. Only the blade beyond the guard is 10% longer; handle, guard, grip, textures and body geometry remain unchanged.

`tools/warrior_repairs.py` applies the reviewed manifests in `tools/female-joint-bindings.json` and `tools/male-joint-bindings.json`; rebuilding is repeatable and does not lengthen the sword again. `tests/warrior-model-baseline.json` protects unchanged body/handle vertices, normals, UVs, topology and textures while allowing the intentional blade extension and skin repairs.

Export an editable project with `blender -b --python tools/export-warrior-rigs.py -- /tmp/female-warrior-v13.glb /tmp/female-warrior-v13.blend`. The project packs textures, retains all 14 baked actions, and adds optional foot IK and knee-pole controls with stretching disabled. Set a foot control’s `ik_blend` to 1 for authoring; leave 0 for the baked game animation.

The original meshes use sculpted hands and a compact torso/foot skeleton. Individual finger/toe articulation and extra clavicle/mid-spine deformation bones are not present in the game export. Skinning is linear, not a muscle/cloth simulation; extreme poses can still compress armor or overlap cloth. The supplied footage and front/side/rear viewer show the actual game renderer rather than an authoring-only correction.

See `warrior-downloads.html` for the renderer footage and both editable model packages, and `docs/warrior-v13-validation.md` for validation scope and remaining deformation limits.
