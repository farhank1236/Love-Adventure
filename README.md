# Æthelos / Love Adventure

A Three.js 3D open-world prototype with one playable hero: the caped **Warrior** with a summonable long sword.

Serve the checkout and open the game:

```sh
python -m http.server 8000 --bind 127.0.0.1
# open http://127.0.0.1:8000
```

Keep the whole `assets` directory beside `index.html`. The hero model loads from eight script chunks (`assets/models/hero-01.js` … `hero-08.js`), so the page also works from a static host with no extra loaders or CDNs.

## Controls

| Key | Action |
|---|---|
| Arrow keys (or WASD) | move (relative to the camera) |
| X (or Shift) | run |
| Z | jump |
| Space (or F) | attack — the first press summons the sword from the pocket dimension; repeated presses chain the 5-hit combo |
| ↑ + Space, or Space then ↑ | rising vertical stab (`AttackUp`) |
| ↓ + Space | crouching straight horizontal slash (`AttackLow`) |
| C | forward dodge roll (`Dodge`, or `DodgeSword` with the sword out) |
| Mouse drag | rotate camera |
| E | world editor |

## Hero behaviour

- **Sword stored** (no fighting): `Idle`, `Walk` (normal walk), `Run`, jumps. The sword is hidden in the pocket dimension.
- **Space pressed**: `Summon` plays — a blue portal opens at the right hand and the sword grows out of it — then Attack 1. While moving, only the upper body plays the summon, so the legs keep walking or running.
- **Sword out**: `SwordIdle` (guard), `CombatWalk` (ready stance), `BattleRun`. Each Space press plays the next cut: Attack1 forehand diagonal, Attack2 wide backhand sweep, Attack3 overhead chop, Attack4 backhand diagonal, Attack5 X finisher. A gap of more than 1 s restarts the combo.
- **Directional attacks**: ↓ + Space drops into a deep lunge and cuts one level slash at knee height from right to left (the blade stays within 3° of horizontal through the whole 170° sweep). ↑ + Space gathers low, then drives up onto the toes and thrusts the point straight up beside the head. Both start and end in the guard, so they mix with the combo; Space followed by ↑ within 0.16 s also upgrades to the stab.
- **Dodge (C)**: a forward roll: crouch, dive with hands to the floor, tuck, roll over the shoulders and back, plant and rise (1 s, 3.2 m). The game moves the player along the roll's ground-contact curve (`extras.dodge.curve`), so the planted feet don't slide. With the sword out, the blade is held straight out along the roll axis and never touches the floor or the body.
- **5 s without attacking**: `Dismiss` — the sword spins into the portal and vanishes. This plays on the upper body only if the hero is moving.
- Swings use a stiff wrist (the angle comes from the arm and body), and the sword rolls in the fist so an edge leads. Wide, extended arms; the left arm counterbalances. Fast swings light a blue aura: a white-hot core inside a wide deep-blue glow (view-angle falloff, energy flowing along the blade, slight flicker), a ghost trail, and a blue point light that lights the hero and the ground. The cape and robe are baked spring simulations.
- Movement speed is matched to the animations, so the feet don't slide. Walk is 1.7 m/s and combat walk 1.25. Run and battle run are 5.0 m/s and are authored for that speed: 180 steps/min, a flight phase, heel kick-up, knee drive, forward lean and 90° arm pumping, played at 1:1.

`assets/viewer/hero-rig.js` contains the GLB loader (skin, morph-target fists, textured sword, `KHR_mesh_quantization` and sparse accessors, aura shader) and the state machine. It uses `THREE.AnimationMixer` with upper/lower-body layers and cross-fades.

## Verification

```sh
python -m http.server 8000 --bind 127.0.0.1 &
node tests/hero-game.cjs          # needs Playwright + Chromium (BROWSER_EXECUTABLE to override)
node tests/enemy-animation.cjs
node tests/enemy-rig.cjs
```

`tests/hero-game.cjs` steps the real game loop at a fixed 30 Hz, so it is deterministic even on a software GPU. It drives the game with real key events and checks the model revision, textures, all 22 clips, sword visibility in every state, the full combo, both directional attacks (including Space then ↑), walking and running at 1:1 clip speed, both dodge rolls (distance travelled, sword kept), the 5 s auto-dismiss, and Z jumping (Space must not jump), and writes screenshots to `/tmp/hero-qa`.

## Hero asset pipeline

`tools/hero/` contains the Python pipeline that authored the animations and exported the game model. It needs NumPy, SciPy and Pillow, but not Blender. The source files are not in the repository: `hero-rigged-2.blend` (rigged hero, 65 bones), the sword GLB, and the old warrior reference. See `tools/hero/README.md`.

`tools/hero/blender_build_hero_v3.py` builds the same animation set inside Blender. Open `hero-rigged-2.blend` and run it from the Scripting tab. It produces `hero-sword-v3.blend` with the helper bones, FX meshes, finger shape keys and all actions.

## Enemies

The supplied Plum-Clad-Winged-Sorceress GLB was an unrigged static model. `tools/rig-aunt.py INPUT.glb assets/models/aunt.glb` normalizes its source object transform and adds a 16-bone rig, smoothed skin bindings and baked Hover/EyeCast actions. This helper requires NumPy and SciPy. The original surface/UVs/texture are retained. `assets/viewer/enemy-rig.js` animates wing shoulders/tips, torso, head, arms and dress; the hair follows the head, and attaches glowing eyes and a face light. `assets/viewer/enemy-game.js` uses projected eye positions as laser emitters, preserves the 90-tick interval and original projectile speeds, and draws extruded BLAH! lettering for the uncle.

The Winged-Grey-Haired-Soundwave-Cas.glb upload exceeds the chat executor's 32 MiB transfer limit, so it could not be imported. The uncle therefore keeps his existing illustrated appearance with casting recoil/rings and 3D word projectiles. His uploaded body, wing rig and flight remain pending a smaller GLB or compressed ZIP. This is not a claim that both supplied enemy models are integrated.

Use `enemy-preview.html` to inspect the aunt.
