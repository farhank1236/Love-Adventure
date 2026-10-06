# Love Adventure

Version 18 with V14 full-body warrior animation and a rigged winged aunt.

Open index.html, then select New Game → Female or Male → Warrior. Default controls: arrow keys move, Space attacks, Shift jumps, and holding R while moving runs; holding Ctrl sprints. Run and Sprint have their own animations and can be remapped in Settings. Each press triggers one cut; five male presses or six female presses queue the full combo. A one-second input gap resets it. Attacking while jumping works in both stages.

Keep the entire assets folder beside index.html. Model data is divided into script files so no repository file exceeds the single-file limit. All chunks are loaded before the 3D combat code runs.

Both warriors use five male / six female connected full-body swings: overhead, reverse sweep, diagonal, cross-body, rising strike, and a female sweeping finisher. Hips and torso lead the shoulder; the elbow remains a bounded hinge, while the forearm and wrist change the angle of the rigidly held blade. Two-bone leg solving plants the supporting foot during the stepping combo. Movement accelerates and decelerates, facing turns smoothly, and jumping has anticipation, takeoff, falling and landing poses. Hair and garments have keyed secondary motion; this is skeletal animation rather than a cloth simulation.

Cape and coat panels are rebound to cloth/torso bones so nearby hands cannot pull them into sword poses. Body/handle positions, topology, UVs, textures and rest proportions are preserved, with the reviewed male left-boot direction correction and the existing blade extension. Red body/blade energy appears during attacks, with a fading curved sword trail and stronger finisher. Sword sweeps cancel nearby incoming arrows, waves, lasers and boss blades, including low attacks; Stage 2 close attacks are interrupted too. Rear attacks and the recovery tail remain vulnerable. Software WebGL rendering and Blender import were checked; hardware GPU rendering was not verified.

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
node tests/enemy-animation.cjs
python3 tests/female-model-integrity.py
python3 tests/male-model-integrity.py
```

`tools/rebuild-female-warrior.py` reproducibly bakes the full-body combo, locomotion and jump tracks, and retains repaired garment and leg bindings in the eight model parts while preserving body geometry and textures. Run `python3 tools/rebuild-female-warrior.py --export /tmp/female-warrior-v14.glb` to regenerate the bundled animation and produce an editable GLB for Blender.

Inspect the female warrior in `character-preview.html`: choose guard, walking, running, jumping, the full combo or an individual cut, then rotate, zoom, pause or scrub the animation. This page uses the bundled model parts and has no CDN dependencies.

`tools/rebuild-male-warrior.py` retargets the approved movement recipe to the original male arm axes and leg proportions. It preserves his body geometry and textures while repairing leg skin weights, and solves supporting foot plants in his bind proportions. Run `python3 tools/rebuild-male-warrior.py --export /tmp/hero-warrior-v14.glb` to rebuild and export. Both warriors use their own attack-count metadata with the shared run/sprint, jump, red effects and interruption systems.

Use the character buttons in the preview to switch warriors, or open `character-preview.html?gender=male` to inspect the hero directly.

V14 restores broad shoulder-led swings, flexes the elbow in anticipation and extends it through each cut, distributes turns through hips/spine/chest, counterbalances with the free arm and tracks the attack with the head. Running leans the pelvis and torso forward, swings both arms, lifts the thighs and bends the shins through higher swing-foot trajectories. Foot plants follow distance traveled. Running attacks preserve brief entry momentum. Run/sprint use longer strides and shorter ground-contact phases so legs do not flutter at game speed. Running and attacks face the travel direction; drawing uses the same scale as root travel. The corrected boot sole is rigidly bound to the foot, with a smooth shin transition.

The sword remains rigidly parented at the palm; hand geometry and the handle are preserved. The male left boot is also turned forward in its existing geometry, with a smooth shin transition and corrected normals. Four additional finger-curl/thumb controls add subtle grip and free-hand movement. Fingers are grouped controls rather than individually rigged phalanges. The male detail controls inherit his retargeted hand basis so they cannot counter-rotate against the grip.

`tools/warrior_repairs.py` retains reviewed skin/joint repairs. `tools/warrior-hand-rig.py` supplies the detail hand bindings. `tests/warrior-model-baseline.json` protects body/handle vertices, normals, UVs, topology and textures; the previous 10% guard-relative blade extension remains unchanged.

Export a packed editable project with `blender -b --python tools/export-warrior-rigs.py -- /tmp/female-warrior-v14.glb /tmp/female-warrior-v14.blend`. Female exports have 16 actions / 36 deform bones; male exports have 15 actions / 31 deform bones. Projects add four optional foot IK and knee-pole controls with no stretching. `ik_blend=0` preserves game FK keys; `1` enables authoring IK.

The supplied Plum-Clad-Winged-Sorceress GLB was an unrigged static model. `tools/rig-aunt.py INPUT.glb assets/models/aunt.glb` normalizes its source object transform and adds a 16-bone rig, smoothed skin bindings and baked Hover/EyeCast actions. This helper requires NumPy and SciPy. The original surface/UVs/texture are retained. `assets/viewer/enemy-rig.js` animates wing shoulders/tips, torso, head, arms and dress; the hair follows the head, and attaches glowing eyes and a face light. `assets/viewer/enemy-game.js` uses projected eye positions as laser emitters, preserves the 90-tick interval and original projectile speeds, and draws extruded BLAH! lettering for the uncle.

The Winged-Grey-Haired-Soundwave-Cas.glb upload exceeds the chat executor's 32 MiB transfer limit, so it could not be imported. The uncle therefore keeps his existing illustrated appearance with casting recoil/rings and 3D word projectiles. His uploaded body, wing rig and flight remain pending a smaller GLB or compressed ZIP. This is not a claim that both supplied enemy models are integrated.

Use `enemy-preview.html` to inspect the uploaded aunt. See `warrior-downloads.html` for renderer footage and packed Blender/GLB packages, and `docs/warrior-v14-validation.md` for verification and limits. Skinning is linear: deep poses may compress armor or stretch cloth. Extra clavicle/mid-spine and independent toe/individual finger controls are not provided. Software Chromium and Blender were checked; hardware GPUs were not tested.
