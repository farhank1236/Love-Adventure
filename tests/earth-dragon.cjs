// Earth Dragon boss check (Heart of the Grove, Moonpine Forest):
//  - light model (<= 8,000 triangles, 211 bones); the clearing has no trees; he sleeps until the hero walks in
//  - waking: roar, thorn wall, boss bar with the 4:00 enrage timer
//  - every attack hurts a hero standing in it and spares one outside: claw swipes, tail slap, seismic stomp
//    (a travelling rock line), vine-whip spin (12 m ring), 10 stone spears in pairs, blight breath + lingering clouds
//  - ultimate: horns in the ground, eruption waves + debris, reduced damage taken, exhausted afterwards
//  - sword / boom damage; enrage after 4:00: flight + 20-spear barrage; victory and defeat flows
// Usage: python -m http.server 8000 --bind 127.0.0.1 &  node tests/earth-dragon.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const URL = process.env.GAME_URL || 'http://127.0.0.1:8000/index.html', OUT = process.env.QA_DIR || '/tmp/hero-qa';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const fails = [], errors = [], expect = (c, m, p) => { if (!c) fails.push(m + ' ' + JSON.stringify(p)); }, log = [];
  const page = await browser.newPage({ viewport: { width: 1100, height: 660 } });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL + '?gfx=low', { timeout: 240000 });
  await page.waitForFunction(() => typeof window.startGame === 'function' && window.Aethelos?.createKingdom, null, { timeout: 120000 });
  await page.evaluate(() => { playerGender = 'male'; window.startGame(); });
  await page.waitForFunction(() => window.KingdomDebug?.rig, null, { timeout: 600000 });
  await page.evaluate(() => { KingdomDebug.paused = true; KingdomDebug.setHour(15); });
  await page.waitForFunction(() => KingdomDebug.boss?.ready, null, { timeout: 600000 });
  const shot = async n => { await page.evaluate(() => KingdomDebug.render()); await page.screenshot({ path: `${OUT}/dragon-${n}.png`, timeout: 240000 }); };
  const tick = sec => page.evaluate(sec => { for (let i = 0; i < Math.round(sec * 30); i++) KingdomDebug.tick(1 / 30); }, sec);
  const key = (down, up) => page.evaluate(([d, u]) => { d.forEach(c => dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }))); u.forEach(c => dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }))); }, [down, up]);
  // camera from the hero's side looking at the dragon
  const cam = (yawOff = 0.5, pitch = 0.18, zoom = 1.5) => page.evaluate(([yo, pi, zo]) => { const D = KingdomDebug, b = D.boss.position, p = D.player.position;
    D.state.camYaw = Math.atan2(b.x - p.x, b.z - p.z) + yo; D.state.camPitch = pi; D.state.camZoom = zo; for (let i = 0; i < 20; i++) D.tick(1 / 120); }, [yawOff, pitch, zoom]);
  // put the hero at (dist m, ang rad) from the dragon, relative to the way he faces; the dragon keeps facing as he is
  const place = (dist, ang) => page.evaluate(([d, a]) => { const D = KingdomDebug, B = D.boss.debug.D, y = B.yaw + a; D.teleport(B.pos.x + Math.sin(y) * d, B.pos.z + Math.cos(y) * d, y + Math.PI); }, [dist, ang]);
  const hp = () => page.evaluate(() => KingdomDebug.health.hp);
  const force = n => page.evaluate(n => { const B = KingdomDebug.boss.debug; B.D.cd = {}; B.D.exhausted = 0; B.start(n); }, n);
  const settle = () => page.evaluate(() => { const B = KingdomDebug.boss.debug; B.D.act = null; B.D.idleT = 99; B.D.exhausted = 0; KingdomDebug.health.reset(); B.D.hp = 2400; KingdomDebug.state.velocity.set(0, 0, 0); });

  const info = await page.evaluate(() => { const B = KingdomDebug.boss, r = B.debug.rig, G = Aethelos.DRAGON_ARENA, W = KingdomDebug.world;
    const trees = W.objects.filter(o => /^(tree_|bush|rock|log|boulder)/.test(o.type) && Math.hypot(o.position.x - G.x, o.position.z - G.z) < G.r).length;
    return { tris: r.mesh.geometry.index.count / 3, bones: r.bones.length, trees, state: B.state }; });
  expect(info.tris <= 8000 && info.bones === 211, 'light dragon model, 211 bones', info);
  expect(info.trees === 0 && info.state === 'dormant', 'clear arena; the dragon sleeps', info);
  // ---------------------------------------------------------------- wake
  await page.evaluate(() => { const G = Aethelos.DRAGON_ARENA; KingdomDebug.teleport(G.x - 30, G.z - 30, Math.PI / 4); });
  await tick(0.5); await cam(0.4, 0.2, 1.6); await shot('dormant');
  await page.evaluate(() => { const G = Aethelos.DRAGON_ARENA; KingdomDebug.teleport(G.x - 18, G.z - 18, Math.PI / 4); });
  await tick(2.2); await cam(0.4, 0.15, 1.6); await shot('roar');
  await tick(2.5);
  const awake = await page.evaluate(() => ({ s: KingdomDebug.boss.state, bar: getComputedStyle(document.getElementById('bossBar')).display, regen: KingdomDebug.health.noRegen }));
  expect(awake.s === 'fight' && awake.bar === 'block' && awake.regen === true, 'he wakes: boss bar, no regeneration', awake);
  // ---------------------------------------------------------------- attacks: in range -> hurt; out of range -> safe
  async function attack(name, inPos, outPos, sec, shotAt, cfg = {}) {
    await settle(); await place(...inPos); await tick(0.1); const a = await hp(); await force(name);
    if (shotAt) { await tick(shotAt); await cam(cfg.yaw ?? 0.6, cfg.pitch ?? 0.2, cfg.zoom ?? 1.6); await shot(name); await tick(sec - shotAt); } else await tick(sec);
    const b = await hp(); await settle(); await place(...outPos); await tick(0.1); const c = await hp(); await force(name); await tick(sec); const d = await hp();
    log.push({ name, inLoss: +(a - b).toFixed(1), outLoss: +(c - d).toFixed(1) }); return { inLoss: a - b, outLoss: c - d };
  }
  let r;
  r = await attack('claw', [5, 0], [16, 0], 2.3, 0.5); expect(r.inLoss >= 11 && r.outLoss === 0, 'claw swipes', r);
  r = await attack('tail', [5.5, Math.PI * 0.8], [18, Math.PI], 2.0, 0.85); expect(r.inLoss >= 14 && r.outLoss === 0, 'tail slap behind', r);
  r = await attack('stomp', [15, 0], [15, 0], 2.6, 1.2, { yaw: 0.9, pitch: 0.3, zoom: 1.9 }); expect(r.inLoss >= 17, 'seismic stomp rock line', r);
  { await settle(); await place(15, 0); await tick(0.1); const s0 = await hp(); await force('stomp'); await tick(1.08);          // sidestep after the slam: the line misses
    await page.evaluate(() => { const D = KingdomDebug, p = D.player.position, B = D.boss.debug.D, y = B.yaw + Math.PI / 2; D.teleport(p.x + Math.sin(y) * 4, p.z + Math.cos(y) * 4, 0); });
    await tick(1.5); const s1 = await hp(); expect(s1 === s0, 'sidestepping the rock line avoids it', { s0, s1 }); }
  r = await attack('whip', [9, 0.5], [16, 0.5], 2.7, 0.9, { yaw: 0.5, pitch: 0.45, zoom: 2.0 }); expect(r.inLoss >= 19 && r.outLoss === 0, 'vine whip reaches 12 m', r);
  r = await attack('spears', [16, 0], [16, 0], 4.6, 1.6, { yaw: 0.7, pitch: 0.25, zoom: 1.9 }); expect(r.inLoss >= 6.9, 'stone spears hit a hero who stands still', r);
  r = await attack('breath', [10, 0], [26, 0], 3.7, 1.8, { yaw: 0.8, pitch: 0.25, zoom: 1.8 }); expect(r.inLoss > 0 && r.outLoss === 0, 'blight breath', r);
  const clouds = await page.evaluate(() => KingdomDebug.boss.debug.clouds.length); expect(clouds >= 3, 'spore clouds linger', { clouds });
  // ---------------------------------------------------------------- dodge: a roll through the claw takes no damage
  await settle(); await place(5, 0); await tick(0.1); const a0 = await hp(); await force('claw'); await tick(0.42); await key(['KeyC'], ['KeyC']); await tick(0.25);
  const a1 = await hp(); expect(a0 - a1 < 13, 'rolling through a swipe avoids it', { a0, a1 }); await tick(1.6);
  // ---------------------------------------------------------------- hero damage
  await settle(); await place(3.5, 0); await tick(0.1);
  const h0 = await page.evaluate(() => KingdomDebug.boss.hp);
  await page.evaluate(() => KingdomDebug.boss.swordHit({ kind: 'combo', index: 0 }));
  const h1 = await page.evaluate(() => KingdomDebug.boss.hp); expect(Math.round(h0 - h1) === 24, 'sword combo hit = 24', { h0, h1 });
  await page.evaluate(() => Aethelos.Combat.targets.find(t => t.boss).onHit(40, null, 'sonicBoom'));
  const h2 = await page.evaluate(() => KingdomDebug.boss.hp); expect(Math.round(h1 - h2) === 60, 'sonic boom = 60', { h1, h2 });
  // ---------------------------------------------------------------- left to himself he mixes his moves (phase 2)
  await settle(); await place(9, 0);
  const seen = await page.evaluate(() => { const D = KingdomDebug, B = D.boss.debug.D; B.hp = 1300; B.phase = 2; B.ultDone = [true, true]; B.idleT = 0; const names = new Set(), G = Aethelos.DRAGON_ARENA;
    for (let i = 0; i < 90 * 30; i++) { D.tick(1 / 30); if (B.act) names.add(B.act.name); if (i % 15 === 0) { D.health.reset(); D.health.noRegen = true; }
      if (i % 240 === 0) { const a = i / 240; D.teleport(G.x + Math.cos(a) * 12, G.z + Math.sin(a) * 12, 0); } }
    B.hp = 2400; return [...names]; });
  expect(seen.length >= 5, 'the dragon chooses among many attacks', { seen }); log.push({ seen });
  // ---------------------------------------------------------------- ultimate
  await settle(); await place(14, 0.4); await tick(0.1); const u0 = await hp(); await force('ult');
  const tickAlive = async sec => { for (let k = 0; k < sec / 0.5; k++) { await tick(0.5); await page.evaluate(() => { KingdomDebug.health.reset(); KingdomDebug.health.noRegen = true; }); } };
  await tickAlive(3.5);
  const ult = await page.evaluate(() => { const B = KingdomDebug.boss.debug, hp0 = B.D.hp; B.hurt(100); return { taken: hp0 - B.D.hp, fx: B.live.length }; });
  expect(ult.taken < 40 && ult.fx > 10, 'ultimate: eruptions, horns down = reduced damage', ult);
  await cam(0.3, 0.55, 2.2); await shot('ultimate'); await tickAlive(7.5);
  const after = await page.evaluate(() => ({ ex: KingdomDebug.boss.debug.D.exhausted, hp: KingdomDebug.health.hp }));
  expect(after.ex > 0, 'exhausted after the ultimate', after); log.push({ ult: true, heroHpAfter: after.hp });
  // ---------------------------------------------------------------- enrage at 4:00 -> flight, 20-spear barrage, swoop
  await settle(); await place(14, 0); await page.evaluate(() => { const B = KingdomDebug.boss.debug; B.D.idleT = 0; B.setFightTime(239.9); });
  await tickAlive(3.0);
  const fl = await page.evaluate(() => { const B = KingdomDebug.boss.debug.D; return { enraged: B.enraged, alt: B.alt, mode: B.fly && B.fly.mode }; });
  expect(fl.enraged && fl.alt > 6, 'enraged: he flies', fl);
  await tick(1.4); await cam(0.2, 0.05, 2.2); await shot('flying');
  await page.evaluate(() => { KingdomDebug.health.reset(); KingdomDebug.health.noRegen = true; });
  await tickAlive(2.0);
  const spears = await page.evaluate(() => KingdomDebug.boss.debug.live.filter(e => e.obj && e.obj.geometry && e.obj.geometry.type === 'ConeGeometry' && e.state).length);
  expect(spears >= 15, 'a barrage of 20 stone spears', { spears });
  // ---------------------------------------------------------------- victory
  await page.evaluate(() => { const B = KingdomDebug.boss.debug; B.D.fly = null; B.D.alt = 0; KingdomDebug.health.reset(); B.D.exhausted = 0; B.D.hp = 1; B.hurt(50); });
  await tick(3.5); await cam(0.6, 0.2, 1.7); await shot('defeated');
  const barW = await page.evaluate(() => document.querySelector('#bossBar .bf').style.width); expect(barW === '0%', 'health bar empty when he falls', { barW });
  await tick(6);
  const win = await page.evaluate(() => ({ s: KingdomDebug.boss.state, bar: getComputedStyle(document.getElementById('bossBar')).display, regen: KingdomDebug.health.noRegen, hp: KingdomDebug.health.hp }));
  expect(win.s === 'gone' && win.bar === 'none' && !win.regen, 'victory: he falls, the arena opens', win);
  // ---------------------------------------------------------------- defeat
  await page.evaluate(() => { const B = KingdomDebug.boss.debug; B.resetSleep(); const G = Aethelos.DRAGON_ARENA; KingdomDebug.teleport(G.x - 15, G.z - 15, Math.PI / 4); });
  await tick(5);
  await page.evaluate(() => { KingdomDebug.boss.debug.D.act = null; KingdomDebug.health.damage(1.0); });
  await page.waitForTimeout(2800); await tick(0.2);
  const lost = await page.evaluate(() => { const S = Aethelos.Layout.SPAWN, p = KingdomDebug.player.position; return { s: KingdomDebug.boss.state, bossHp: KingdomDebug.boss.hp, home: Math.hypot(p.x - S.x, p.z - S.z) < 3, hp: KingdomDebug.health.hp }; });
  expect(lost.s === 'dormant' && lost.bossHp === 2400 && lost.home && lost.hp === 100, 'hero falls: wakes in Dawnmeadow, the dragon sleeps at full health', lost);
  console.log(JSON.stringify({ fails, errors: errors.slice(0, 5), log }, null, 1));
  await browser.close();
  if (fails.length || errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
