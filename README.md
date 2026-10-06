# Love Adventure

Version 18 with the Female Warrior V9 model and animations.

Open index.html, then select New Game → Female → Warrior. Default controls: arrow keys move, Space attacks, Shift jumps, and holding R while moving runs. Run has its own animation and can be remapped in Settings. Each press triggers one cut; four presses queue the combo. A one-second input gap resets it. Attacking while jumping works in both stages.

Keep the entire assets folder beside index.html. Model data is divided into script files so no repository file exceeds the single-file limit. All chunks are loaded before the 3D combat code runs. The original self-contained game has the same model and animation data.

The female sword stays rigidly attached to the hand. Shoulder-led cuts use a bounded elbow hinge and coordinated torso rotation. Sword sweeps cancel nearby incoming arrows, waves, lasers and boss blades, including low attacks; Stage 2 close attacks are interrupted too. Rear attacks and the recovery tail remain vulnerable. The original geometry and texture are retained, including the existing cloth/sleeve deformation limitations. Software WebGL rendering and Blender import were checked; hardware GPU rendering was not verified.

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
```

`tools/rebuild-female-warrior.py` reproducibly bakes the shoulder-led attack tracks and running loop into the eight model parts without changing mesh geometry or textures. Run `python3 tools/rebuild-female-warrior.py --export /tmp/female-warrior-v9.glb` to regenerate the bundled animation and produce an editable GLB for Blender.

Inspect the female warrior in `character-preview.html`: choose guard, walking, running, jumping, the full combo or an individual cut, then rotate, zoom, pause or scrub the animation. This page uses the bundled model parts and has no CDN dependencies.
