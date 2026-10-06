# Love Adventure

Version 18 with the Female Warrior V10 model and animations.

Open index.html, then select New Game → Female → Warrior. Default controls: arrow keys move, Space attacks, Shift jumps, and holding R while moving runs; holding Ctrl sprints. Run and Sprint have their own animations and can be remapped in Settings. Each press triggers one cut; five presses queue the female combo (the male warrior retains four cuts). A one-second input gap resets it. Attacking while jumping works in both stages.

Keep the entire assets folder beside index.html. Model data is divided into script files so no repository file exceeds the single-file limit. All chunks are loaded before the 3D combat code runs.

The female warrior uses five connected full-body cuts: diagonal, reverse, advancing, pivot sweep, and a stronger rising finisher. Hips and torso lead the shoulder; the elbow remains a bounded hinge, while the wrist and blade rotate around the grip. Two-bone leg solving plants the supporting foot during the stepping combo. Movement accelerates and decelerates, facing turns smoothly, and jumping has anticipation, takeoff, falling and landing poses. Hair and garments have keyed secondary motion; this is skeletal animation rather than a cloth simulation.

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
python3 tests/female-model-integrity.py
```

`tools/rebuild-female-warrior.py` reproducibly bakes the full-body combo, locomotion and jump tracks, and repairs garment bindings with `tools/female-cloth-bindings.json` into the eight model parts without changing mesh geometry or textures. Run `python3 tools/rebuild-female-warrior.py --export /tmp/female-warrior-v10.glb` to regenerate the bundled animation and produce an editable GLB for Blender.

Inspect the female warrior in `character-preview.html`: choose guard, walking, running, jumping, the full combo or an individual cut, then rotate, zoom, pause or scrub the animation. This page uses the bundled model parts and has no CDN dependencies.
