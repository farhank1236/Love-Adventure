// War horse + hero extras check (Male Warrior):
//  - H x3 within 3 s opens the blue portal and the horse gallops out of it, stops beside the hero and rears
//  - H walks him to the left stirrup and plays Mount; he ends up seated on the Saddle bone
//  - riding: walks at 1.8 m/s with the arrows, gallops at 15 m/s (3x the 5 m/s run) while X is held; Ride* clips follow the gait
//  - H while riding slows the horse and plays Dismount; he stands beside the horse again (horse blocks him)
//  - the sword is drawn out of the left-hip portal (portal opens, blade clipped by its plane)
//  - 30 s with no input: IdleBall (ball + portals + speech bubble); any move cancels it
//  - sonic boom: upright, flies straight and locks onto a target in front
// Usage: python -m http.server 8000 --bind 127.0.0.1 &  node tests/hero-horse.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const URL = process.env.GAME_URL || 'http://127.0.0.1:8000/index.html', OUT = process.env.QA_DIR || '/tmp/hero-qa';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const fails = [], errors = [], expect = (c, m, p) => { if (!c) fails.push(m + ' ' + JSON.stringify(p)); };
  const page = await browser.newPage({ viewport: { width: 1100, height: 660 } });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL + '?gfx=low', { timeout: 240000 });
  await page.waitForFunction(() => typeof window.startGame === 'function' && window.Aethelos?.createKingdom, null, { timeout: 120000 });
  await page.evaluate(() => { playerGender = 'male'; window.startGame(); });
  await page.waitForFunction(() => window.KingdomDebug?.rig, null, { timeout: 600000 });
  await page.evaluate(() => { KingdomDebug.paused = true; document.querySelectorAll('.phase1-controls').forEach(e => e.style.display = 'none'); });
  const key = (down, up) => page.evaluate(([d, u]) => { d.forEach(c => dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }))); u.forEach(c => dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }))); }, [down, up]);
  const run = sec => page.evaluate(sec => { const D = KingdomDebug, h = D.horse, ctl = D.rig.controller, seen = new Set(); let maxSp = 0, maxOpen = 0;
    for (let i = 0; i < Math.round(sec * 30); i++) { D.tick(1 / 30); seen.add(h.state.state + ':' + ctl.state.mode + ':' + (ctl.state.rideKind || '')); maxSp = Math.max(maxSp, h.speed); maxOpen = Math.max(maxOpen, h.state.portal.open, D.extras.swordPortal.open); }
    const anchor = h.state.anchor; return { st: h.state.state, mode: ctl.state.mode, speed: h.speed, maxSp, maxOpen, seen: [...seen], seated: !!anchor && D.rig.root.parent === anchor,
      p: [D.player.position.x, D.player.position.z], hp: [h.root.position.x, h.root.position.z], ball: D.extras.ball.visible, bubble: document.querySelector('.heroSay')?.classList.contains('show') ? document.querySelector('.heroSay').textContent : '' }; }, sec);
  const shot = async n => { await page.evaluate(() => KingdomDebug.render()); await page.screenshot({ path: `${OUT}/horse-${n}.png`, timeout: 240000 }); };
  await page.evaluate(() => { const D = KingdomDebug; D.teleport(0, 368, Math.PI); D.setHour(15.5); });
  let r = await run(0.3);
  // ---- summon
  await key(['KeyH'], ['KeyH']); await key(['KeyH'], ['KeyH']); await key(['KeyH'], ['KeyH']);
  await page.waitForFunction(() => KingdomDebug.horse.state.state === 'summoning', null, { timeout: 600000 });
  r = await run(0.9); expect(r.maxOpen > 0.9, 'summon portal opens', r); await shot('summon');
  r = await run(3.5); expect(r.st === 'idle' || r.st === 'rear', 'horse arrived', r); expect(r.seen.some(s => s.startsWith('rear')), 'horse rears on arrival', r);
  const gap = Math.hypot(r.p[0] - r.hp[0], r.p[1] - r.hp[1]); expect(gap > 1.5 && gap < 6, 'horse stops beside the hero', { gap });
  // ---- mount, starting from the horse's RIGHT side: he must walk round the front, never through the horse
  await page.evaluate(() => { const D = KingdomDebug, h = D.horse.root; h.updateMatrixWorld(true); const p = new THREE.Vector3(-2.2, 0, -0.3).applyMatrix4(h.matrixWorld); D.teleport(p.x, p.z, 0); });
  await key(['KeyH'], ['KeyH']); await page.waitForTimeout(800);
  r = await run(0.2); expect(r.st === 'approach', 'single H walks to the horse', r);
  const inside = await page.evaluate(() => { const D = KingdomDebug, h = D.horse.root; let n = 0;
    for (let i = 0; i < 450 && D.horse.state.state === 'approach'; i++) { D.tick(1 / 30); h.updateMatrixWorld(true); const l = D.player.position.clone().applyMatrix4(h.matrixWorld.clone().invert()); if (Math.abs(l.x) < 0.5 && l.z > -1.3 && l.z < 1.5) n++; }
    return n; });
  expect(inside === 0, 'walks round the front of the horse, not through it', { inside });
  r = await run(0.1);
  expect(r.st === 'mounting' && r.mode === 'mount', 'mount clip plays', r);
  r = await run(2.4); expect(r.st === 'ridden' && r.mode === 'ride' && r.seated, 'seated on the saddle', r); await shot('seated');
  // ---- ride
  await key(['ArrowUp'], []); r = await run(2.5); expect(Math.abs(r.speed - 1.8) < 0.15, 'walk speed 1.8', r); expect(r.seen.some(s => s.endsWith(':walk')), 'RideWalk plays', r);
  await key(['KeyX'], []); r = await run(3.0); expect(r.maxSp > 14.5 && r.maxSp <= 15.01, 'gallop 15 m/s', r); expect(r.seen.some(s => s.endsWith(':gallop')), 'RideGallop plays', r); await shot('gallop');
  await key(['KeyZ'], []); r = await run(0.3); await key([], ['KeyZ']); const jumped = await page.evaluate(() => KingdomDebug.horse.jumping || KingdomDebug.horse.state.jump !== null);
  expect(jumped && r.seen.some(s => s.startsWith('ridden')), 'Z makes the horse jump', r); r = await run(1.0); expect(!(await page.evaluate(() => KingdomDebug.horse.jumping)), 'horse lands', r);
  await key([], ['KeyX', 'ArrowUp']); r = await run(3.0); expect(r.speed < 0.2, 'stops when released', r);
  // ---- dismount
  await key(['KeyH'], ['KeyH']); await page.waitForTimeout(800); r = await run(0.3); expect(r.st === 'dismounting' && r.mode === 'dismount', 'dismount clip plays', r);
  r = await run(2.0); expect(r.st === 'idle' && r.mode === 'free' && !r.seated, 'back on the ground', r);
  const g2 = Math.hypot(r.p[0] - r.hp[0], r.p[1] - r.hp[1]); expect(g2 > 0.6 && g2 < 1.6, 'standing at the horse\'s side', { g2 });
  // ---- H x3 with the horse out: it gallops back into the pocket dimension
  await key(['KeyH'], ['KeyH']); await key(['KeyH'], ['KeyH']); await key(['KeyH'], ['KeyH']);
  r = await run(0.3); expect(r.st === 'leaving', 'H x3 sends the horse back', r);
  for (let i = 0; i < 20 && r.st === 'leaving'; i++) r = await run(0.5);
  expect(r.st === 'absent' && !(await page.evaluate(() => KingdomDebug.horse.root.visible)), 'horse gone through the portal', r);
  // ---- sword from the left portal
  await page.evaluate(() => KingdomDebug.teleport(0, 368, Math.PI)); await run(0.3);
  await key(['Space'], ['Space']); r = await run(0.5); expect(r.maxOpen > 0.9, 'sword portal opens', r); await run(7);
  // ---- idle ball
  r = await run(29.0); expect(r.mode === 'free', 'no idle before 30 s', r);
  r = await run(3.0); expect(r.mode === 'idlefun' && r.ball && r.bubble, 'idle ball + speech bubble after 30 s', r); await shot('idle');
  await key(['ArrowLeft'], []); r = await run(0.3); await key([], ['ArrowLeft']); expect(r.mode === 'free' && !r.ball, 'moving cancels the idle', r);
  // ---- sonic boom lock-on
  await page.evaluate(() => { const D = KingdomDebug; D.teleport(0, 368, Math.PI); const p = D.player.position; window.__hit = 0;
    Aethelos.Combat.register({ position: new THREE.Vector3(p.x + 5, p.y, p.z - 18), radius: 0.8, onHit() { window.__hit++; } }); });
  await key(['KeyV'], ['KeyV']); await run(2.6); await key(['Space'], ['Space']); await run(0.5);
  const boom = await page.evaluate(() => { const b = KingdomDebug.skill.state.booms[0]; if (!b) return null; const box = new THREE.Box3().setFromObject(b.g.children[3]); return { h: box.max.y - box.min.y, dir: [b.dir.x, b.dir.z] }; });
  await shot('boom'); await run(1.5);
  const hits = await page.evaluate(() => window.__hit);
  expect(boom && boom.h > 3.0, 'boom stands upright and tall', boom); expect(hits >= 1, 'boom hits the target in front', { hits });
  console.log(JSON.stringify({ fails, errors: errors.slice(0, 5) }, null, 1));
  await browser.close();
  if (fails.length || errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
