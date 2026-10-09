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
| WASD / arrows | move (relative to the camera) |
| Shift | run |
| Space | jump |
| F | attack — the first press summons the sword from the pocket dimension; repeated presses chain the 5-hit combo |
| Mouse drag | rotate camera |
| E | world editor |

## Hero behaviour

- **Sword stored** (no fighting): `Idle`, `Walk` (normal walk), `Run`, jumps. The sword is hidden in the pocket dimension.
- **F pressed**: `Summon` plays — a blue portal opens at the right hand and the sword grows out of it — then Attack 1. While moving, only the upper body plays the summon, so the legs keep walking or running.
- **Sword out**: `SwordIdle` (guard), `CombatWalk` (ready stance), `BattleRun`. Each F press plays the next cut: Attack1 forehand diagonal, Attack2 wide backhand sweep, Attack3 overhead chop, Attack4 backhand diagonal, Attack5 X finisher. A gap of more than 1 s restarts the combo.
- **5 s without attacking**: `Dismiss` — the sword spins into the portal and vanishes. This plays on the upper body only if the hero is moving.
- Swings use a stiff wrist (the angle comes from the arm and body), and the sword rolls in the fist so an edge leads. Wide, extended arms; the left arm counterbalances. A blue aura and ghost trail follow fast swings. The cape and robe are baked spring simulations.
- Movement speed is matched to the animations (walk 1.7 m/s, combat walk 1.25, run 5.4, battle run 5.0), so the feet don't slide.

`assets/viewer/hero-rig.js` contains the GLB loader (skin, morph-target fists, textured sword, additive FX meshes) and the state machine. It uses `THREE.AnimationMixer` with upper/lower-body layers and cross-fades.

## Verification

```sh
python -m http.server 8000 --bind 127.0.0.1 &
node tests/hero-game.cjs          # needs Playwright + Chromium (BROWSER_EXECUTABLE to override)
node tests/enemy-animation.cjs
node tests/enemy-rig.cjs
```

`tests/hero-game.cjs` steps the real game loop at a fixed 30 Hz, so it is deterministic even on a software GPU. It checks the model and all 18 clips, sword visibility in every state, summon while walking, the full combo, combat walk / battle run, the 5 s auto-dismiss, and jumping, and writes screenshots to `/tmp/hero-qa`.

## Hero asset pipeline

`tools/hero/` contains the Python pipeline that authored the animations and exported the game model. It needs NumPy, SciPy and Pillow, but not Blender. The source files are not in the repository: `hero-rigged-2.blend` (rigged hero, 65 bones), the sword GLB, and the old warrior reference. See `tools/hero/README.md`.

`tools/hero/blender_build_hero_v3.py` builds the same animation set inside Blender. Open `hero-rigged-2.blend` and run it from the Scripting tab. It produces `hero-sword-v3.blend` with the helper bones, FX meshes, finger shape keys and all actions.

## Enemies

The supplied Plum-Clad-Winged-Sorceress GLB was an unrigged static model. `tools/rig-aunt.py INPUT.glb assets/models/aunt.glb` normalizes its source object transform and adds a 16-bone rig, smoothed skin bindings and baked Hover/EyeCast actions. This helper requires NumPy and SciPy. The original surface/UVs/texture are retained. `assets/viewer/enemy-rig.js` animates wing shoulders/tips, torso, head, arms and dress; the hair follows the head, and attaches glowing eyes and a face light. `assets/viewer/enemy-game.js` uses projected eye positions as laser emitters, preserves the 90-tick interval and original projectile speeds, and draws extruded BLAH! lettering for the uncle.

The Winged-Grey-Haired-Soundwave-Cas.glb upload exceeds the chat executor's 32 MiB transfer limit, so it could not be imported. The uncle therefore keeps his existing illustrated appearance with casting recoil/rings and 3D word projectiles. His uploaded body, wing rig and flight remain pending a smaller GLB or compressed ZIP. This is not a claim that both supplied enemy models are integrated.

Use `enemy-preview.html` to inspect the aunt.
