# Æthelos / Love Adventure

The game has two playable heroes: **Male Warrior** and **Female Warrior**, both using the verified V14 3D bodies, rigs, and full-body sword animations. Selection previews, gameplay, both stages, restart, and Continue share `assets/viewer/hero-config.js`. Old saves migrate to `maleWarrior` or `femaleWarrior` while preserving stage, health, and ultimate charge.

## Male Warrior: v4 caped sword warrior (3D world)

New Game → Begin Adventure opens the Phase 1 3D world. There, the **Male Warrior** is the v4 caped sword warrior (`assets/viewer/hero-rig.js`, model `assets/models/hero-01.js` … `hero-08.js`, revision `HERO_V4`). The Female Warrior keeps her V14 model.

| Key | Action |
|---|---|
| Arrow keys (or WASD) | move (relative to the camera) |
| X (or Shift) | run |
| Z | jump |
| Space (or F) | attack: the first press summons the sword from the pocket dimension, and presses chain a 5-hit combo |
| ↑ + Space, or Space then ↑ | rising vertical stab |
| ↓ + Space | crouching straight horizontal slash |
| C | forward dodge roll |

With no fighting, the sword stays stored, and he walks and runs normally. After 5 s without attacking, the sword vanishes into the pocket dimension. The run is authored for the game speed of 5 m/s and plays 1:1. Swings light a blue aura with a glow, a trail and a blue light. The pipeline that authored and exported this model is in `tools/hero/` (see `tools/hero/README.md`). `node tests/hero-game.cjs` starts the game through `startGame()` and checks the warrior with real key events.

## Stages and V14 warriors

Open `index.html`, choose New Game, select a 3D warrior, then Begin Adventure. Both approved models finish loading before spawning. A loading failure keeps selection usable and shows an error; retry uses the same approved asset. There is no playable sprite or alternate-model fallback. Keep the entire `assets` directory beside the pages.

Arrow keys move, Space attacks, Shift jumps, R runs, Ctrl sprints, and Q uses the charged ultimate. Controls can be remapped in Settings. Each press triggers one cut; five male presses or six female presses queue the full combo. A one-second input gap resets it. Attacking while jumping works in both stages. Movement preserves V14 hip/torso rotation, shoulder-led cuts, planted feet, knee flexion, grip synchronization, and red sword/body effects.

Normal enemy hits reduce the existing health bar, cause brief full-body recoil and temporary immunity, and keep the hero at the fight. Falling out of Stage 1 alone recovers at the checkpoint while applying damage. Zero health opens Game Over. Restart restores health, animation state, and the timer.

For local development, serve the checkout with `python -m http.server 8000 --bind 127.0.0.1` and open `http://127.0.0.1:8000`. Browser saves stay in that browser and origin. The character preview and game share the bundled Three.js runtime, rig sampler, hero definitions, and model loader.

## Verification

Browser checks require Playwright with Chromium (or an installed Chrome/Edge through `BROWSER_EXECUTABLE`). With the local server running:

```sh
node tests/hero-selection.cjs
node tests/hero-damage.cjs
node tests/warrior-combat.cjs
node tests/male-warrior.cjs
node tests/warrior-body.cjs
node tests/character-preview.cjs
node tests/enemy-animation.cjs
node tests/warrior-rig.cjs
python tests/warrior-model-integrity.py
python tests/female-model-integrity.py
python tests/male-model-integrity.py
python tests/male-foot-alignment.py
```

`GAME_URL` overrides the local address. Selection checks cover both visible 3D previews and gameplay, save migration, both stages, restart, and failed loading followed by retry. Damage checks exercise actual enemy collisions, immunity, in-place recoil, sword attachment, fall recovery, and defeat. Rig/body checks protect limb lengths, sword direction, foot planting, body proportions, geometry, textures, and animation continuity.

See `docs/hero-asset-provenance.md` for the asset history and SHA-256 comparisons. The V14 downloadable GLBs exactly match the runtime model chunks. Enemy assets and attack patterns are preserved. The obsolete V13 warrior packages, incorrect compact male replacement, playable sprite portraits, and illustration combat fallback have been removed.

## Model authoring

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
