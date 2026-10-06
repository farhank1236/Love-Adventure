# Love Adventure

Version 17 with the Female Warrior V8 model and animations.

Open index.html, then select New Game → Female → Warrior. Default controls: arrow keys move, Space attacks, Shift jumps. Each press triggers one cut; four presses queue the combo. A one-second input gap resets it. Attacking while jumping works in both stages.

Keep the entire assets folder beside index.html. Model data is divided into script files so no repository file exceeds the single-file limit. All chunks are loaded before the 3D combat code runs. The original self-contained game has the same model and animation data.

The male warrior and existing stage systems are retained. Some sleeve deformation remains on the female model. Automated combat and model-load checks passed; live GPU rendering was not verified.

Use 3D Warrior · Animation view inside the game to inspect the character.

Development: serve the checkout with `python3 -m http.server 8000` and open the game in a modern browser. Store purchases use earned game currency and are saved in the browser. Starter roles are free; unlocked roles appear in New Game. Character switching is available from the menu, and the Game Over screen offers Restart Game or Main Menu.

Browser regression checks cover store transactions, affordability, upgrade limits, saved purchases, character selection, pause restoration, mobile sizing, and returning to the menu after defeat. With the local server running, install Playwright outside the checkout and run:

```sh
npm install --prefix /tmp/love-adventure-tests playwright
NODE_PATH=/tmp/love-adventure-tests/node_modules /tmp/love-adventure-tests/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/love-adventure-tests/node_modules node tests/store-game-over.cjs
```

To use an existing Chromium installation, set `BROWSER_EXECUTABLE` (for example `/usr/bin/chromium`) instead of downloading a browser. `GAME_URL` can override the default local server address.
