# Love Adventure

Version 18 with V12 body mechanics for both warriors animations.

Open index.html, then select New Game → Female or Male → Warrior. Default controls: arrow keys move, Space attacks, Shift jumps, and holding R while moving runs; holding Ctrl sprints. Run and Sprint have their own animations and can be remapped in Settings. Each press triggers one cut; five presses queue the combo for either warrior. A one-second input gap resets it. Attacking while jumping works in both stages.

Keep the entire assets folder beside index.html. Model data is divided into script files so no repository file exceeds the single-file limit. All chunks are loaded before the 3D combat code runs.

Both warriors use five connected full-body cuts: diagonal, reverse, advancing, pivot sweep, and a stronger rising finisher. Hips and torso lead the shoulder; the elbow remains a bounded hinge, while the wrist and blade rotate around the grip. Two-bone leg solving plants the supporting foot during the stepping combo. Movement accelerates and decelerates, facing turns smoothly, and jumping has anticipation, takeoff, falling and landing poses. Hair and garments have keyed secondary motion; this is skeletal animation rather than a cloth simulation.

Cape and coat panels are rebound to cloth/torso bones so nearby hands cannot pull them into sword poses. Positions, topology, normals, UVs, textures and rest proportions are preserved. Red body/blade energy appears during attacks, with a fading curved sword trail and stronger finisher. Sword sweeps cancel nearby incoming arrows, waves, lasers and boss blades, including low attacks; Stage 2 close attacks are interrupted too. Rear attacks and the recovery tail remain vulnerable. Software WebGL rendering and Blender import were checked; hardware GPU rendering was not verified.

Use 3D Warrior · Animation view inside the game to inspect the character.

Development: serve the checkout with `python3 -m http.server 8000` and open the game in a modern browser. Store purchases use earned game currency and are saved in the browser. Starter roles are free; unlocked roles appear in New Game. Character switching is available from the menu, and the Game Over screen offers Restart Game or Main Menu.

Browser regression checks cover store transactions, affordability, upgrade limits, saved purchases, character selection, pause restoration, mobile sizing, and returning to the menu after defeat. With the local server running, install Playwright outside the checkout and run:

```sh
npm install --prefix /tmp/love-adventure-tests playwright
NODE_PATH=/tmp/love-adventure-tests/node_modules /tmp/love-adventure-tests/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/love-adventure-tests/node_modules node tests/store-game-over.cjs
```

To use an existing Chromium installation, set `BROWSER_EXECUTABLE` (for example `/usr/bin/chromium`) instead of downloading a browser. `GAME_URL` can override the default local server address.

Run the warrior animation and combat regression checks with the same Playwright setup:

```sh
NODE_PATH=/tmp/love-adventure-tests/node_modules node tests/warrior-combat.cjs
NODE_PATH=/tmp/love-adventure-tests/node_modules node tests/character-preview.cjs
NODE_PATH=/tmp/love-adventure-tests/node_modules node tests/male-warrior.cjs
NODE_PATH=/tmp/love-adventure-tests/node_modules node tests/warrior-body.cjs
python3 tests/female-model-integrity.py
python3 tests/male-model-integrity.py
```

`tools/rebuild-female-warrior.py` reproducibly bakes the full-body combo, locomotion and jump tracks, and repairs garment bindings with `tools/female-cloth-bindings.json` into the eight model parts without changing mesh geometry or textures. Run `python3 tools/rebuild-female-warrior.py --export /tmp/female-warrior-v12.glb` to regenerate the bundled animation and produce an editable GLB for Blender.

Inspect the female warrior in `character-preview.html`: choose guard, walking, running, jumping, the full combo or an individual cut, then rotate, zoom, pause or scrub the animation. This page uses the bundled model parts and has no CDN dependencies.

`tools/rebuild-male-warrior.py` retargets the approved movement recipe to the original male arm axes and leg proportions. It preserves his model, textures and skin weights, and solves supporting foot plants in his bind proportions. Run `python3 tools/rebuild-male-warrior.py --export /tmp/hero-warrior-v12.glb` to rebuild and export. Both warriors share five-hit combat timing, root travel, run/sprint, jump phases, red effects and attack interruption.

Use the character buttons in the preview to switch warriors, or open `character-preview.html?gender=male` to inspect the hero directly.

V12 adds grounded body compression and rise, lateral and forward/back hip weight shifts, hip-led torso twist and lean, a balancing free arm, and head movement that stays closer to the attack direction. Foot pivots rotate around forefoot contacts; each rig solves leg reach so planted feet stay on the ground. The finisher has a deeper load and a short catching step. The approved sword orientation and five-hit timing are preserved. Running attacks retain brief forward momentum through the opening step instead of stopping immediately.
