# Hero Sword V3 asset source

`tools/blender/hero_sword_v3.py` is the uploaded Blender authoring script for the next hero character and sword combat animation set.

This file is not loaded directly by the browser game. The current game runtime loads chunked JavaScript model data from `assets/models/male-01.js` through `assets/models/male-08.js` and the matching female files. To make Hero Sword V3 the live playable character, the Blender script must first be run in Blender 4.2 or newer with these source assets available:

- `hero-rigged-2.blend`
- `GeminiGeneratedImagez0vn5oz0vn5o.glb`

The script saves `hero-sword-v3.blend`. After that, export the hero as a GLB and convert it into the same chunked JavaScript model format used by the existing playable heroes. Store the generated runtime chunks in this directory or replace the approved `male-XX.js` chunks, then update `assets/viewer/hero-config.js` to point at the new chunk set and revision.

Until those exported runtime chunks exist, the playable in-game hero remains the approved V14 warrior so the menu, character selection, and 3D world do not break.
