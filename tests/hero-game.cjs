// Browser check for the sword warrior. Steps the real game loop at a fixed 30 Hz (deterministic, works on slow
// software GPUs) and verifies: model + clips, sword stored while idle/walking/running, F summons the sword (also while
// walking), the 5-hit combo chains, combat walk / battle run while the sword is out, auto-dismiss after 5 s, jumping.
// Screenshots go to QA_DIR (default /tmp/hero-qa).
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
  await page.waitForFunction(() => window.AethelosDebug?.rig?.controller, null, { timeout: 300000 });
  await page.evaluate(() => { AethelosDebug.paused = true; });
  const info = await page.evaluate(() => { const r = AethelosDebug.rig; return { clips: Object.keys(r.clips).sort(), bones: r.bones.length,
    verts: r.body.geometry.attributes.position.count, sword: !!r.fxMeshes.HeroSword, revision: r.extras.revision }; });
  const need = ['Attack1', 'Attack2', 'Attack3', 'Attack4', 'Attack5', 'BattleRun', 'CombatWalk', 'Combo', 'Dismiss', 'Idle', 'Jump', 'JumpAir', 'JumpLand', 'JumpStart', 'Run', 'Summon', 'SwordIdle', 'Walk'];
  const missing = need.filter(n => !info.clips.includes(n));
  // run the game for `sec` seconds with the given keys held; `press` keys are tapped on the first tick
  const run = (sec, hold = [], press = []) => page.evaluate(({ sec, hold, press }) => {
    const D = AethelosDebug, k = D.state.keys; for (const key of Object.keys(k)) k[key] = false; hold.forEach(h => k[h] = true);
    const log = [];
    for (let i = 0; i < Math.round(sec * 30); i++) {
      if (i === 0) press.forEach(p => { if (p === 'KeyF') D.rig.controller.attack(); else k[p] = true; });
      D.tick(1 / 30);
      if (i === 1) press.forEach(p => { if (p !== 'KeyF') k[p] = false; });
      const s = D.rig.controller.state; log.push(s.mode + (s.swordOut ? '+' : '-'));
    }
    for (const key of Object.keys(k)) k[key] = false;
    const s = D.rig.controller.state, g = D.rig.byName.Sword_Grip, v = g.getWorldScale(g.position.clone());
    return { mode: s.mode, swordOut: s.swordOut, combo: s.combo, swordScale: +v.x.toFixed(3), y: +D.player.position.y.toFixed(2), log: [...new Set(log)] };
  }, { sec, hold, press });
  const shot = async n => { await page.evaluate(() => AethelosDebug.render()); await page.screenshot({ path: `${OUT}/${n}.png` }); };
  const fails = []; const expect = (c, m, p) => { if (!c) fails.push(m + ' ' + JSON.stringify(p)); };
  let p = await run(1.0); expect(!p.swordOut && p.swordScale < .05, 'sword stored at start', p); await shot('01-idle-stored');
  p = await run(1.2, ['KeyW']); expect(p.swordScale < .05, 'sword hidden while walking', p); await shot('02-walk-stored');
  p = await run(0.25, ['KeyW'], ['KeyF']); expect(p.mode === 'summon', 'F summons the sword while walking', p); await shot('03-summon-walking');
  p = await run(0.7, ['KeyW']); expect(p.swordOut, 'sword out after summon (then Attack1)', p); await shot('04-attack1');
  p = await run(1.0); p = await run(0.15, [], ['KeyF']); expect(p.mode === 'attack', 'attack starts', p);
  for (let i = 0; i < 4; i++) { p = await run(0.12, [], ['KeyF']); }
  await shot('05-combo'); expect(p.mode === 'attack', 'combo running', p);
  p = await run(4.5); expect(p.mode === 'free' && p.swordOut && p.combo === -1, 'full 5-hit combo finished, sword still out', p); await shot('06-sword-idle');
  p = await run(1.0, ['KeyW']); expect(p.swordOut && p.swordScale > .9, 'combat walk with sword', p); await shot('07-combat-walk');
  p = await run(1.0, ['KeyW', 'ShiftLeft']); expect(p.swordOut, 'battle run with sword', p); await shot('08-battle-run');
  p = await run(4.0); expect(!p.swordOut || p.mode === 'dismiss', 'sword dismissed after 5 s without attacking', p); await shot('09-dismiss');
  p = await run(1.5); expect(!p.swordOut && p.swordScale < .05, 'sword stored after dismiss', p);
  p = await run(1.2, ['KeyW', 'ShiftLeft']); expect(p.swordScale < .05, 'sword hidden while running', p); await shot('10-run-stored');
  p = await run(0.3, ['KeyW', 'ShiftLeft'], ['Space']); expect(p.y > .3, 'jump leaves the ground', p); await shot('11-jump');
  p = await run(1.0); expect(p.y === 0, 'lands', p);
  await browser.close();
  console.log(JSON.stringify({ info: { ...info, clips: info.clips.length }, missing, errors, fails }, null, 1));
  if (missing.length || errors.length || fails.length) process.exit(1);
  console.log('hero-game: OK');
})().catch(e => { console.error(e); process.exit(1); });
