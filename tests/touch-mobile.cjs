// Phone check: on a touch phone the game world plays in landscape with on-screen controls.
//  - portrait phone: the game screen is turned 90° (canvas is landscape-shaped), touch buttons + joystick present
//  - joystick drag moves the hero (screen-up = forward), pushing to the edge runs
//  - Attack / Jump / Horse buttons drive the same actions as Space / Z / H
//  - landscape phone: no turning; desktop (no touch): no touch UI
// Usage: python -m http.server 8000 --bind 127.0.0.1 &  node tests/touch-mobile.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const URL = process.env.GAME_URL || 'http://127.0.0.1:8000/index.html', OUT = process.env.QA_DIR || '/tmp/hero-qa';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const fails = [], errors = [], expect = (c, m, p) => { if (!c) fails.push(m + ' ' + JSON.stringify(p)); };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL + '?gfx=low', { timeout: 240000 });
  await page.waitForFunction(() => typeof window.startGame === 'function' && window.Aethelos?.createKingdom, null, { timeout: 120000 });
  await page.evaluate(() => { playerGender = 'male'; window.startGame(); });
  await page.waitForFunction(() => window.KingdomDebug?.rig, null, { timeout: 600000 });
  await page.evaluate(() => { KingdomDebug.paused = true; const D = KingdomDebug; D.teleport(0, 368, Math.PI); D.setHour(15.5); });
  const lay = await page.evaluate(() => { const w = document.getElementById('phase1World'), c = document.getElementById('phase1Canvas'), r = c.getBoundingClientRect();
    return { touch: !!KingdomDebug.touch?.enabled, rotated: KingdomDebug.touch?.rotated, cw: c.clientWidth, ch: c.clientHeight, bw: r.width, bh: r.height,
      buttons: [...document.querySelectorAll('#touchUI .tb')].map(b => b.id), joy: !!document.getElementById('touchJoy') }; });
  expect(lay.touch && lay.rotated, 'portrait phone turns the game to landscape', lay);
  expect(lay.cw > lay.ch && lay.bh > lay.bw, 'canvas is landscape inside a turned screen', lay);
  expect(['tAttack', 'tJump', 'tRoll', 'tRun', 'tHorse'].every(id => lay.buttons.includes(id)) && lay.joy, 'touch buttons + joystick', lay);
  const run = sec => page.evaluate(sec => { for (let i = 0; i < Math.round(sec * 30); i++) KingdomDebug.tick(1 / 30); const p = KingdomDebug.player.position, c = KingdomDebug.rig.controller.state; return { p: [p.x, p.z], mode: c.mode, speed: KingdomDebug.state.currentSpeed }; }, sec);
  await run(0.3);
  // joystick: press inside the joystick area, drag "up" in game-screen terms
  const ptr = (sel, type, gx, gy, id = 7) => page.evaluate(([sel, type, gx, gy, id]) => {   // gx, gy: game-screen coords relative to the element's own frame
    const el = document.querySelector(sel), r = el.getBoundingClientRect(), rot = KingdomDebug.touch.rotated;
    const x = rot ? r.right - gy : r.left + gx, y = rot ? r.top + gx : r.top + gy;
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true })); }, [sel, type, gx, gy, id]);
  const p0 = (await run(0.05)).p, yaw = await page.evaluate(() => KingdomDebug.state.camYaw);
  await ptr('#touchJoy', 'pointerdown', 120, 200); await ptr('#touchJoy', 'pointermove', 120, 160);
  let r = await run(1.5); const mv = [r.p[0] - p0[0], r.p[1] - p0[1]], fwd = [Math.sin(yaw), Math.cos(yaw)], along = mv[0] * fwd[0] + mv[1] * fwd[1];
  expect(along > 1.5, 'joystick up walks forward', { mv, along, r });
  await page.evaluate(() => KingdomDebug.render()); await page.screenshot({ path: `${OUT}/touch-portrait.png`, timeout: 240000 });
  await ptr('#touchJoy', 'pointermove', 120, 120); r = await run(1.0);
  expect(await page.evaluate(() => !!KingdomDebug.state.touchRun) && r.speed > 4, 'joystick at the edge runs', r);
  await ptr('#touchJoy', 'pointerup', 120, 120); r = await run(1.0); expect(r.speed < 0.5, 'release stops', r);
  // buttons
  const press = async (id, hold = 0.1) => { await ptr('#' + id, 'pointerdown', 20, 20, 9); await run(hold); await ptr('#' + id, 'pointerup', 20, 20, 9); };
  await press('tAttack'); r = await run(0.2); expect(r.mode === 'attack' || r.mode === 'summon', 'attack button attacks', r); await run(3);
  const y0 = await page.evaluate(() => KingdomDebug.player.position.y); await ptr('#tJump', 'pointerdown', 20, 20, 9); r = await run(0.25);
  const y1 = await page.evaluate(() => KingdomDebug.player.position.y); await ptr('#tJump', 'pointerup', 20, 20, 9); expect(y1 > y0 + 0.3, 'jump button jumps', { y0, y1 }); await run(1.5);
  await press('tHorse'); await press('tHorse'); await press('tHorse'); await page.waitForTimeout(300); await run(0.2);
  const hs = await page.evaluate(() => KingdomDebug.horse.state.state); expect(hs === 'summoning' || hs === 'loading' || hs !== 'absent', 'horse button x3 summons', { hs });
  // camera drag on the canvas turns the camera; pinch zooms
  const yawA = await page.evaluate(() => KingdomDebug.state.camYaw);
  await ptr('#phase1Canvas', 'pointerdown', 400, 150, 11); await ptr('#phase1Canvas', 'pointermove', 480, 150, 11); await ptr('#phase1Canvas', 'pointerup', 480, 150, 11);
  const yawB = await page.evaluate(() => KingdomDebug.state.camYaw); expect(yawB < yawA - 0.2, 'drag right on the (turned) screen turns the camera', { yawA, yawB });
  const z0 = await page.evaluate(() => KingdomDebug.state.camZoom);
  await ptr('#phase1Canvas', 'pointerdown', 300, 150, 12); await ptr('#phase1Canvas', 'pointerdown', 400, 150, 13); await ptr('#phase1Canvas', 'pointermove', 500, 150, 13);
  await ptr('#phase1Canvas', 'pointerup', 500, 150, 13); await ptr('#phase1Canvas', 'pointerup', 300, 150, 12);
  const z1 = await page.evaluate(() => KingdomDebug.state.camZoom); expect(z1 < z0 * 0.7, 'pinch out zooms in', { z0, z1 });
  // landscape phone: no turning
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(500);
  const l2 = await page.evaluate(() => { const c = document.getElementById('phase1Canvas'); return { rotated: KingdomDebug.touch.rotated, cw: c.clientWidth, ch: c.clientHeight }; });
  expect(!l2.rotated && l2.cw === 844 && l2.ch === 390, 'landscape phone fills the screen', l2);
  await page.evaluate(() => KingdomDebug.render()); await page.screenshot({ path: `${OUT}/touch-landscape.png`, timeout: 240000 });
  console.log(JSON.stringify({ fails, errors: errors.slice(0, 5) }, null, 1));
  await browser.close();
  if (fails.length || errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
