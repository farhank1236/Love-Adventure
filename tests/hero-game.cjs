// Browser check for the v4 sword warrior (Male Warrior) in the Phase 1 3D world, started through the real
// startGame() flow. Steps the Phase 1 game loop at a fixed 30 Hz (deterministic, works on slow
// software GPUs) and drives it with real keyboard events. Verifies: model revision, textures, all clips, sword stored
// while idle/walking/running, Space summons the sword, the 5-hit combo chains, Up+Space (and Space then Up) = rising
// stab, Down+Space = low slash, combat walk / battle run, auto-dismiss after 5 s, C dodge roll (distance + sword kept),
// Z jump (Space no longer jumps), X run at 1:1 clip speed. Screenshots go to QA_DIR (default /tmp/hero-qa).
// Usage: python -m http.server 8000 --bind 127.0.0.1 &  node tests/hero-game.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const URL = process.env.GAME_URL || 'http://127.0.0.1:8000/index.html';
const OUT = process.env.QA_DIR || '/tmp/hero-qa';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(URL);
  await page.waitForFunction(() => typeof window.startGame === 'function' && window.HeroRig && window.HeroSystem, null, { timeout: 120000 });
  await page.evaluate(() => { playerGender = 'male'; window.startGame(); });
  await page.waitForFunction(() => window.Phase1Debug?.rig?.controller, null, { timeout: 300000 });
  await page.evaluate(() => { Phase1Debug.paused = true; });
  const info = await page.evaluate(() => { const r = Phase1Debug.rig, m = r.body.material.map, s = r.fxMeshes.HeroSword.material.map;
    return { clips: Object.keys(r.clips).sort(), bones: r.bones.length, verts: r.body.geometry.attributes.position.count,
      sword: !!r.fxMeshes.HeroSword, glow: !!r.fxMeshes.SwordAuraGlow, light: !!r.fxMeshes.AuraLight, revision: r.extras.revision,
      bodyTex: m && m.image ? m.image.width : 0, swordTex: s && s.image ? s.image.width : 0,
      normalized: r.body.geometry.attributes.normal.normalized, morphs: r.body.geometry.morphAttributes.position.length }; });
  const need = ['Attack1', 'Attack2', 'Attack3', 'Attack4', 'Attack5', 'AttackLow', 'AttackUp', 'BattleRun', 'CombatWalk', 'Combo', 'Dismiss',
    'Dodge', 'DodgeSword', 'Idle', 'Jump', 'JumpAir', 'JumpLand', 'JumpStart', 'Run', 'Summon', 'SwordIdle', 'Walk'];
  const missing = need.filter(n => !info.clips.includes(n));
  // run the game for `sec` seconds with `hold` keys held; `press` keys get a real keydown on the first tick (keyup after 2)
  const run = (sec, hold = [], press = []) => page.evaluate(({ sec, hold, press }) => {
    const D = Phase1Debug, k = D.state.keys;
    const ev = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    for (const key of Object.keys(k)) k[key] = false; hold.forEach(h => ev('keydown', h));
    const log = [], p0 = D.player.position.clone(); let maxY = 0, clipTs = 0;
    const ground = () => D.world ? D.world.terrain.heightAt(D.player.position.x, D.player.position.z) : 0;   // kingdom terrain is not at y = 0
    for (let i = 0; i < Math.round(sec * 30); i++) {
      if (i === 0) press.forEach(p => ev('keydown', p));
      D.tick(1 / 30);
      if (i === 1) press.forEach(p => { if (!hold.includes(p)) ev('keyup', p); });
      const s = D.rig.controller.state; log.push(s.mode + (s.swordOut ? '+' : '-') + (s.attackKind && s.mode === 'attack' ? ':' + s.attackKind : ''));
      maxY = Math.max(maxY, D.player.position.y - ground());
    }
    hold.forEach(h => ev('keyup', h)); for (const key of Object.keys(k)) k[key] = false;
    const m = D.rig.controller.mixer, acts = m._actions.filter(a => a.isRunning() && a.getEffectiveWeight() > .5).map(a => a.getClip().name + '@' + a.timeScale.toFixed(2));
    const s = D.rig.controller.state, g = D.rig.byName.Sword_Grip, v = g.getWorldScale(g.position.clone());
    return { mode: s.mode, swordOut: s.swordOut, combo: s.combo, kind: s.attackKind, swordScale: +v.x.toFixed(3), y: +(D.player.position.y - ground()).toFixed(2), maxY: +maxY.toFixed(2),
      moved: +D.player.position.clone().sub(p0).setY(0).length().toFixed(2), acts, log: [...new Set(log)] };
  }, { sec, hold, press });
  const shot = async n => { await page.evaluate(() => Phase1Debug.render()); await page.screenshot({ path: `${OUT}/${n}.png` }); };
  const fails = []; const expect = (c, m, p) => { if (!c) fails.push(m + ' ' + JSON.stringify(p)); };
  // arrows are camera-relative: Up = away from the camera, Right = screen right (checked at two camera angles)
  for (const yaw of [0, 1.1]) {
    for (const [key, want] of [['ArrowUp', 'fwd'], ['ArrowDown', 'back'], ['ArrowRight', 'right'], ['ArrowLeft', 'left']]) {
      const r = await page.evaluate(({ key, yaw }) => {
        const D = Phase1Debug, ev = (t, c) => dispatchEvent(new KeyboardEvent(t, { code: c }));
        D.state.camYaw = yaw; for (let i = 0; i < 20; i++) D.tick(1 / 30);
        const p0 = D.player.position.clone(); ev('keydown', key); for (let i = 0; i < 15; i++) D.tick(1 / 30); ev('keyup', key);
        for (let i = 0; i < 20; i++) D.tick(1 / 30);
        const d = D.player.position.clone().sub(p0), cam = D.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
        const right = new THREE.Vector3().crossVectors(cam, new THREE.Vector3(0, 1, 0)).normalize();
        return { f: +d.dot(cam).toFixed(2), r: +d.dot(right).toFixed(2) };
      }, { key, yaw });
      const ok = want === 'fwd' ? r.f > .3 && Math.abs(r.r) < .15 : want === 'back' ? r.f < -.3 && Math.abs(r.r) < .15 : want === 'right' ? r.r > .3 && Math.abs(r.f) < .15 : r.r < -.3 && Math.abs(r.f) < .15;
      expect(ok, `${key} moves ${want} relative to the camera (yaw ${yaw})`, r);
    }
  }
  // mouse look: plain mouse movement over the world (no button) turns the camera; camera sits close
  const cam = await page.evaluate(() => {
    const D = Phase1Debug, c = document.getElementById('phase1Canvas'), y0 = D.state.camYaw, p0 = D.state.camPitch;
    c.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', movementX: 120, movementY: -40, bubbles: true }));
    const out = { dyaw: +(D.state.camYaw - y0).toFixed(3), dpitch: +(D.state.camPitch - p0).toFixed(3), buttons: 0 };
    D.state.camYaw = 0; D.state.camPitch = .3; for (let i = 0; i < 60; i++) D.tick(1 / 30);
    out.dist = +D.camera.position.distanceTo(D.player.position).toFixed(2); return out;
  });
  expect(cam.dyaw < -.3 && cam.dpitch < 0, 'mouse movement without clicking turns the camera', cam);
  expect(cam.dist > 4 && cam.dist < 7.5, 'camera is close to the warrior', cam);
  // WASD drives the camera (not the hero): A / D swing it around, W closer + straighter, S farther
  const wasd = await page.evaluate(() => {
    const D = Phase1Debug, ev = (t, c) => dispatchEvent(new KeyboardEvent(t, { code: c })), out = {};
    for (const k of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) {
      D.state.camYaw = 0; D.state.camPitch = .3; D.state.camZoom = 1; for (let i = 0; i < 30; i++) D.tick(1 / 30);
      const p0 = D.player.position.clone(); ev('keydown', k); for (let i = 0; i < 20; i++) D.tick(1 / 30); ev('keyup', k);
      out[k] = { yaw: +D.state.camYaw.toFixed(2), zoom: +D.state.camZoom.toFixed(2), pitch: +D.state.camPitch.toFixed(2), heroMoved: +D.player.position.distanceTo(p0).toFixed(2) };
    }
    D.state.camYaw = 0; D.state.camPitch = .3; D.state.camZoom = 1; return out;
  });
  expect(wasd.KeyA.yaw > .5 && wasd.KeyD.yaw < -.5, 'A / D swing the camera left / right', wasd);
  expect(wasd.KeyW.zoom < .8 && wasd.KeyW.pitch < .3 && wasd.KeyS.zoom > 1.2, 'W moves the camera in and straight, S pulls it back', wasd);
  expect(Object.values(wasd).every(v => v.heroMoved < .05), 'WASD does not move the hero', wasd);
  let p = await run(1.0); expect(!p.swordOut && p.swordScale < .05, 'sword stored at start', p); await shot('01-idle-stored');
  p = await run(0.5, [], ['Space']); expect(p.mode === 'summon' || p.swordOut, 'Space summons the sword (does not jump)', p); expect(p.maxY < 0.05, 'Space does not jump', p);
  p = await run(2.0); expect(p.swordOut, 'sword out after summon + Attack1', p); await shot('02-attack1');
  p = await run(1.0); p = await run(0.15, [], ['Space']); expect(p.mode === 'attack' && p.kind === 'combo', 'combo attack starts', p);
  for (let i = 0; i < 4; i++) { p = await run(0.12, [], ['Space']); }
  await shot('03-combo'); expect(p.mode === 'attack', 'combo running', p);
  p = await run(4.5); expect(p.mode === 'free' && p.swordOut && p.combo === -1, 'full 5-hit combo finished, sword still out', p);
  p = await run(0.3, ['ArrowDown'], ['Space']); expect(p.log.some(l => l.includes(':down')), 'Down + Space = low horizontal slash', p); await shot('04-low-slash');
  p = await run(1.6); expect(p.mode === 'free', 'low slash finishes', p);
  p = await run(0.35, ['ArrowUp'], ['Space']); expect(p.log.some(l => l.includes(':up')), 'Up + Space = rising vertical stab', p); await shot('05-up-stab');
  p = await run(1.6); expect(p.mode === 'free', 'up stab finishes', p);
  p = await run(0.04, [], ['Space']); p = await run(0.3, [], ['ArrowUp']); expect(p.log.some(l => l.includes(':up')), 'Space then Up = rising stab', p);
  p = await run(1.6);
  p = await run(1.0, ['ArrowUp']); expect(p.swordOut && p.swordScale > .9 && p.moved > .6, 'arrows walk (combat walk with sword)', p); await shot('06-combat-walk');
  p = await run(1.0, ['ArrowUp', 'KeyX']); expect(p.swordOut && p.acts.some(a => a.startsWith('BattleRun') && Math.abs(parseFloat(a.split('@')[1]) - 1) < .05), 'X = battle run at 1:1 clip speed', p); expect(p.moved > 3, 'battle run covers ground', p); await shot('07-battle-run');
  p = await run(0.2, [], ['KeyC']); expect(p.mode === 'dodge' && p.swordOut, 'C = dodge roll keeping the sword', p); await shot('08-dodge-sword');
  p = await run(1.2); expect(p.mode === 'free' && p.moved > 2.3, 'roll finishes and travels ~3 m', p);
  p = await run(5.0); expect(!p.swordOut || p.mode === 'dismiss', 'sword dismissed after 5 s without attacking', p); await shot('09-dismiss');
  p = await run(1.5); expect(!p.swordOut && p.swordScale < .05, 'sword stored after dismiss', p);
  p = await run(1.2, ['ArrowUp', 'KeyX']); expect(p.swordScale < .05 && p.acts.some(a => a.startsWith('Run_') && a.endsWith('@1.00')), 'X = run (sword hidden, 1:1 clip speed)', p); await shot('10-run-stored');
  p = await run(0.2, [], ['KeyC']); expect(p.mode === 'dodge' && !p.swordOut, 'C = dodge roll unarmed', p); await shot('11-dodge');
  p = await run(1.3); expect(p.mode === 'free', 'unarmed roll finishes', p);
  p = await run(0.3, [], ['KeyZ']); expect(p.y > .3, 'Z jumps', p); await shot('12-jump');
  p = await run(1.0); expect(Math.abs(p.y) < 0.05, 'lands', p);
  await browser.close();
  console.log(JSON.stringify({ info: { ...info, clips: info.clips.length }, missing, errors, fails }, null, 1));
  if (missing.length || errors.length || fails.length || info.revision !== 'HERO_V4' || info.bodyTex < 2048 || info.swordTex < 1024 || !info.glow || !info.light) process.exit(1);
  console.log('hero-game: OK');
})().catch(e => { console.error(e); process.exit(1); });
