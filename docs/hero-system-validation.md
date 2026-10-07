# Two-warrior integration verification

The approved V14 runtime chunks match the downloadable GLBs byte for byte. The game, selection cards and standalone preview use one hero configuration, model loader and rig sampler. The existing shared Three.js runtime is byte-identical to the removed inline duplicate.

Verified behavior:

- Male and female selection cards visibly show the approved 3D models, and their gameplay render paths show those same cached rigs.
- New Game, both stages, restart, saving and Continue retain the canonical hero identity. Legacy sprite, role and default-selection saves migrate while preserving progress.
- Failed model loading stays on selection, exposes a useful error and permits retry; no playable sprite or alternate male model is loaded.
- Normal damage reduces HP and the existing health bar without moving the hero, resetting combat, clearing enemies or moving the camera. Brief skeletal recoil retains the rigid sword grip.
- Temporary immunity blocks repeated contact. Falling out of Stage 1 alone uses checkpoint recovery. Lethal hits stop play and open Game Over.
- Stage 2 restart restores visible HP, clears aerial/combo/recoil state and resumes the timer. Simulation scheduling permits only one pending game frame.
- Both warriors preserve locomotion, jump/fall/landing phases, full-body cuts, running attacks, blade effects, attack timing, planted feet and animation transitions.

Regression coverage includes `hero-selection.cjs`, `hero-damage.cjs`, the existing warrior combat/body/preview suites, rig checks and Python geometry/texture/boot/cape integrity checks. Software WebGL in Chromium was exercised; hardware GPU performance is not established by those checks. Enemy models and gameplay patterns remain covered by their existing regression tests.

Passing runs include 41 selection/loading/save/navigation checks; 82 damage/defeat/restart checks; 880 animation assertions and 28 combat checks; 815 male animation/gameplay checks; 480 body mechanics checks; 25 preview clips with scrubbing and mobile layout; 32,734 warrior rig checks; 134 enemy animation/pattern checks; and 1,557,937 enemy skin/pose checks. Both Python body/model integrity checks and the male boot/cape validation passed. Delaying a real model request confirms returning to the menu cancels startup; changing selection also cancels the previously captured hero.

`tools/capture-hero-qa.cjs` captures local menu and gameplay images into ignored `docs/qa/` for visual review. Browser save data is local to each origin; legacy saves migrate when opened at that origin.
