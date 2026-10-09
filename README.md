# Æthelos / Love Adventure

The game has two playable heroes: **Male Warrior** and **Female Warrior**, both using the verified V14 3D bodies, rigs, and full-body sword animations. Selection previews, gameplay, both stages, restart, and Continue share `assets/viewer/hero-config.js`. Old saves migrate to `maleWarrior` or `femaleWarrior` while preserving stage, health, and ultimate charge.

## The Kingdom of Aethelos (3D open world)

**Begin Adventure** opens one continuous 1.2 km × 1.2 km kingdom. The title screen, menus and hero select are unchanged.

- **Starting area:** you start in Dawnmeadow (safe area, waystone, portal, practice dummies). King's Way crosses the Silvermere on a stone bridge to the city.
- **Main City (Aethelgard):** walls with four gates and eight towers, ring and cross streets, about 130 houses, Crown Plaza (fountain, market stalls, statue), the Adventure Guild with quest board and training dummies, the Gilded Tankard tavern, a restaurant, shops, a general store, street lamps, NPC and guard placeholders.
- **Royal Palace:** on its plateau north of the city, reached by the Royal Road. Banners, curtain walls, towers, gate and guard posts, garden courtyard, story marker.
- **House Aldmere** (west): elegant manor, hedged gardens, gazebo, fountain.
- **House Brenmoor** (south): granary hall, barns, silos, hay.
- **House Varkhold** (Ironpeak foothills): keep, stone walls, watchtowers, soldiers' camp.
- **Farm Valley:** wheat and vegetable fields, fences, barns, farmhouses, a turning windmill, wells, the Millrace irrigation channel.
- **Moonpine Forest:** about 2,000 trees, Pinewhisper Path, a woodcutters' camp, a cave, treasure chests, enemy spawn markers.
- **Ironpeak Mountains:** snow peaks, the Ironpeak Pass, the mine, the Shattered Crown boss-arena placeholder, camps.
- **Rivers:** the Silvermere, Moonbrook and Millrace. Bridges are placed automatically where roads cross.

**Movement:** the hero walks on the terrain, crosses bridges, wades only in shallow water, and can't pass through buildings, walls, trees or rocks. A banner names each area as you enter it.

**Look:** grounded fantasy, rendered in HDR.
- **Materials:** 11 Poly Haven 4K material sets, packed to 1024 px for the web (`assets/world/tex/`, built by `tools/textures/build_textures.py`):
  - **Ground:** meadow grass (rocky_terrain_02), farm soil, river pebbles on the banks and beds, mossy rock (aerial_rocks_02) on hillsides, slate (dark_rock) around Varkhold and the high slopes, pale marble cliffs near the peaks, then snow.
  - **Roads:** cobble roads and the plaza use grassy_cobblestone (pale flagstones on the Royal Road); dirt tracks have cart ruts.
  - **Buildings:** walls, towers and foundations use stone_wall_04. Doors and gates use the studded wooden_garage_door. Trunks use eucalyptus_bark (birch is pale). Iron uses rusty metal_plate_02. Columns and steps use marble.
  - **Procedural surfaces:** roof tiles, plank grain, lime plaster with damp and stains, leaded windows, and grime near the ground.
- **Sky and time:** a 24-hour clock (1 real minute = 1 game hour; **hold T** to fast-forward).
  - Two suns and three moons rise in the west and set in the east. The moons have phases.
  - The sky uses physically based scattering, so mornings, noon, sunsets and night look right. It has stars, a galaxy band, drifting clouds and cloud shadows.
  - Valley mist comes at dawn. Lamps, lanterns, campfires and windows light up at night.
- **Nature:** dense GPU grass (4–5 blades per clump, tight spacing, two rings out to 50 m on High) and wild flowers sway in the wind and part around the hero. Wheat fields grow real stalks. Trees and bushes are made of leaf and needle cards, sway in the wind and cast leafy shadows.
- **Water:** rivers have depth colour (clear shallows show the pebble bed) and flow downstream. They reflect the banks, trees and buildings, show sun and moon glints, and have foam along the banks.
- **Post-processing:** SSAO contact shadows, height fog and aerial haze, bloom, a filmic curve, a colour grade, and night-time exposure.
- **Graphics quality:** Low, Medium and High are picked automatically from the GPU. **Press G** to switch (saved per browser), or open the page with `?gfx=high`. Dynamic resolution drops to 60 % when frames are slow. Small props fade out with distance, and there are two grass rings.

**Code:** the world is modular, in `assets/world/`:
- `kingdom-layout.js`: regions, rivers, roads, height shaping.
- `terrain.js`: heightfield with carved rivers and graded roads, surface weights for the splat shader, and a data texture for grass and water.
- `models.js`: about 75 model types with colliders and per-part materials. A type can be replaced by a GLB later under the same id.
- `kingdom-objects.js`: the default object list. Every object has id, name, type, category, position, rotation, scale and metadata, ready for the editor and JSON save/load.
- `materials.js`: texture arrays plus the terrain, road and object shaders.
- `sky.js`: day/night, suns, moons, clouds, lights and image-based lighting.
- `grass.js`, `water.js`: grass and flowers, rivers.
- `post.js`: the HDR pipeline.
- `world.js`: rendering (tiled instancing, distance culling, shadows near the player), collision, player, camera.

**World editor:** press **E** in the world, or use the **Editor (E)** button.
- **Selecting and moving:** click an object to select it, drag it to move it along the ground, R / Shift+R rotates it 15°, + / − scales it, Del deletes it, Ctrl+D duplicates it, F focuses the camera on it.
- **Properties panel:** name, category, position, rotation, scale and metadata, plus snap-to-ground.
- **Adding:** search or filter the catalogue on the left, click a type, then click the ground to place it (Shift+click places several, R rotates the preview, Esc stops).
- **Undo:** Ctrl+Z and Ctrl+Y.
- **Saving:** changes save automatically in this browser and come back on refresh. The toolbar also has Save, Load saved, Export JSON (falls back to copy-the-text where downloads are blocked), Import JSON (file or paste) and Reset map (click twice).
- **Camera:** right-drag (or Alt+drag) orbits, the wheel zooms, WASD or the arrows fly, Q/Z go down/up, Shift is faster.
- **Code:** `assets/world/editor.js`.

**Tests:**
- `node tests/kingdom-world.cjs` checks regions, landmarks, bridges, water, walls and banners for both warriors.
- `node tests/kingdom-editor.cjs` drives the editor with real mouse and keyboard events: select, drag, rotate, scale, rename, delete and undo, place, export and import, persistence across reload, reset.

## Male Warrior: caped sword warrior (3D world)

New Game → Begin Adventure opens the Phase 1 3D world. There, the **Male Warrior** is the v4 caped sword warrior (`assets/viewer/hero-rig.js`, model `assets/models/hero-01.js` … `hero-08.js`, revision `HERO_V6`). The Female Warrior keeps her V14 model.

| Key | Action |
|---|---|
| Arrow keys | move (relative to the camera) |
| W / A / S / D (and the mouse) | camera: A / D swing it left and right around the hero, W moves it in closer and straight ahead, S pulls it back and up |
| X (or Shift) | run |
| Z | jump |
| Space (or F) | attack: the first press summons the sword from the pocket dimension, and presses chain a 5-hit combo |
| ↓ + Space | crouching straight horizontal slash |
| C | forward dodge roll |
| V | **Azure Tempest** (special skill) |
| H ×3 (within 3 s) | summon the war horse through a blue portal; again to send it back through the portal |
| H | walk to the horse (round the front) and mount it / dismount |
| Z (on horseback) | the horse jumps |
| M | sound on / off |

With no fighting, the sword stays stored, and he walks and runs normally. After 5 s without attacking, the sword vanishes into the pocket dimension. The run is authored for the game speed of 5 m/s and plays 1:1. Swings light a blue aura with a glow, a trail and a blue light. The sword is drawn with the right hand out of a blue pocket-dimension portal that tears open at his left hip, and pushed back into it when it is put away (the blade is clipped by the portal, so it really comes out of the hole). After 30 s without any input he gets bored: a leather ball drops out of a small portal above him, he plays keepy-uppy and heads it back in, and a speech bubble shows what he says (any move ends it). The pipeline that authored and exported this model is in `tools/hero/` (see `tools/hero/README.md`); the extras live in `assets/world/hero-extras.js` and `assets/world/portal.js`.

### War horse (H)

The user's armored horse (`assets/models/horse-01.js` … `horse-04.js`, revision `HORSE_V1`), rigged without changing its design (spine, neck, head, five tail bones, shoulder blades and four full legs) and given a fitted war saddle with stirrups. Press H three times within 3 s: a blue portal tears open ahead and to the side, the horse gallops out, pulls up beside the hero and rears. Press H once and he walks to its left side, puts his left foot in the stirrup, steps up and swings over into the saddle. On horseback the arrow keys steer (camera-relative); it walks at 1.8 m/s and gallops at 15 m/s (3× the hero's 5 m/s run) while X or Shift is held. The rider's clips are phase-locked to the horse's walk and gallop. Press H again to slow down and dismount. You can't attack or use Azure Tempest while riding. The pipeline is in `tools/horse/` (see `tools/horse/README.md`); the runtime is `assets/world/horse.js`; `node tests/hero-horse.cjs` checks summoning, mounting, speeds, dismounting, the sword portal, the idle and the sonic boom.

### Townsfolk and sound

26 named townsfolk (`assets/world/npcs.js`) walk the streets of Aethelgard. Among them are bakers, guards, a herbalist, a weaver and a fisherman. They rest now and then, turn their heads to watch the hero, step aside or wait when he is in the way, and greet him when he comes close. Their names and jobs appear above them when he is near. Each one is a single procedural mesh of about 1.5k triangles with a 13-bone walk.

All sound is synthesised live with Web Audio (`assets/world/audio.js`, no sound files): neighs, snorts, hooves on the beat of the gait (knocks on roads, thuds on grass), the saddle creak, sword swings, the blade drawn from and returned to the portal, portals opening and closing, the power-up and ignition, the blue fire crackle, sonic booms and impacts, footsteps, jumps, landings and rolls, the ball kicks, plus wind, birdsong by day and crickets at night. M mutes it.

### Phones and tablets

On a touch phone or tablet (iPhone, Android, iPad), the 3D world switches to touch controls (`assets/world/touch.js`). The title screen and menus are unchanged.

- **Landscape:** the first tap asks for fullscreen and locks the screen to landscape where the browser allows it (Android Chrome). Where it can't (iPhone Safari, or the game inside an embedded page) and the phone is held upright, the game screen turns 90° so it still plays in landscape.
- **Left thumb:** a floating joystick. Push it to the edge to run.
- **Right thumb:** Attack (hold the stick down for the low slash), Jump (also makes the horse jump), Roll, Run (latches on and off), Summon (one tap calls the horse through the portal and he climbs straight into the saddle; one tap on horseback gets off; three taps call it without riding, or send it back), and the Azure Tempest emblem for the special power.
- **Top bar:** fast time (hold), graphics quality, sound and fullscreen.
- **Camera:** drag anywhere else to turn it; pinch to zoom.

`?touch=1` forces the touch layout on a desktop and `?touch=0` turns it off. `node tests/touch-mobile.cjs` checks it on an emulated iPhone, in portrait and landscape.

### Azure Tempest (V)

V plays a full power-up pose (the sword is summoned and planted, then thrust out at the burst), then he burns with dark-cored blue fire over his whole body and sword for 6 s. During that window every attack also throws a sonic boom: a crescent of blue fire over 4 m tall that flies dead straight along the line he faces. Combo hits 1 and 3 throw it tilted right, 2 and 4 tilted left, and the finisher throws both at once as an X. Each boom skims the ground, throwing up dust, embers and a flame wake. Hold an arrow key while attacking to aim. If an enemy is in front (within 45 m and 40°), the boom locks on and flies straight into it. Booms burst on walls and buildings. The blue fire is a thin glow over his whole body, so his face and armour stay visible. V can be used again 12 s after ignition (6 s active, then a 6 s cooldown, shown by the V icon). Only the Male Warrior has the skill. Booms report hits through `Aethelos.Combat` (`register({position, radius, onHit})`), ready for enemies. The code is in `assets/world/sonic-skill.js`, and `node tests/hero-skill.cjs` checks it.

`node tests/hero-game.cjs` starts the game through `startGame()` and checks the warrior with real key events.

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
