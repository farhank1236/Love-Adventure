// Azure Tempest (V) check: power-up pose then blue fire for 6 s, every attack in that window throws a sonic boom
// (two for the X finisher), arrow keys aim them, booms damage registered targets and burst on walls, V is usable
// again 12 s after ignition, and the Female Warrior does not get the skill. Screenshots to QA_DIR.
// Usage: python -m http.server 8000 --bind 127.0.0.1 &  node tests/hero-skill.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const URL = process.env.GAME_URL || 'http://127.0.0.1:8000/index.html', OUT = process.env.QA_DIR || '/tmp/hero-qa';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const fails = [], errors = [], expect = (c, m, p) => { if (!c) fails.push(m + ' ' + JSON.stringify(p)); };
  async function boot(gender) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.startGame === 'function' && window.Aethelos?.createKingdom, null, { timeout: 120000 });
    await page.evaluate(g => { playerGender = g; window.startGame(); }, gender);
    await page.waitForFunction(() => window.KingdomDebug?.rig, null, { timeout: 300000 });
    await page.evaluate(() => { KingdomDebug.paused = true; });
    return page;
  }
  const page = await boot('male');
  const run = (sec, { hold = [], press = [], shot = null, shotAt = -1 } = {}) => page.evaluate(({ sec, hold, press, shotAt }) => {
    const D = KingdomDebug, ev = (t, c) => dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), log = new Set(); let booms = 0, maxBooms = 0;
    hold.forEach(h => ev('keydown', h));
    for (let i = 0; i < Math.round(sec * 30); i++) {
      if (i === 0) press.forEach(p => ev('keydown', p)); if (i === 1) press.forEach(p => { if (!hold.includes(p)) ev('keyup', p); });
      D.tick(1 / 30); const s = D.skill.state; log.add(s.state + ':' + D.rig.controller.state.mode); maxBooms = Math.max(maxBooms, s.booms.length);
      if (i === shotAt) D.render();
    }
    hold.forEach(h => ev('keyup', h));
    const s = D.skill.state; return { state: s.state, booms: s.booms.length, maxBooms, log: [...log], mode: D.rig.controller.state.mode, swordOut: D.rig.controller.state.swordOut,
      icon: document.getElementById('skillV')?.className, label: document.querySelector('#skillV span')?.textContent };
  }, { sec, hold, press, shotAt });
  const shot = async n => { await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 240000 }); };
  // count every boom launched (wrap spawnBoom)
  await page.evaluate(() => { const D = KingdomDebug; D.teleport(0, 380, Math.PI); window.__booms = []; const sp = D.skill.spawnBoom; D.skill.spawnBoomOrig = sp;
    Aethelos.Combat.on(e => { if (e.type === 'sonicBoom') window.__booms.push({ dir: [e.dir.x, e.dir.z], y: e.origin.y }); }); });
  let r = await run(0.5);
  expect(r.state === 'ready' && r.icon === 'ready', 'skill starts ready', r);
  r = await run(0.4, { press: ['KeyV'] });
  expect(r.log.some(l => l.startsWith('charging')) && !r.log.some(l => l.startsWith('active')), 'V starts the power-up pose (sword summoned first)', r);
  r = await run(1.6, { shotAt: 6 }); await shot('skill-01-ignite');
  expect(r.state === 'active' && r.icon === 'active' && r.swordOut, 'blue fire ignites after the pose', r);
  // a target 6 m in front registers a hit
  await page.evaluate(() => { const D = KingdomDebug, p = D.player.position, f = new THREE.Vector3(Math.sin(D.player.rotation.y), 0, Math.cos(D.player.rotation.y));
    window.__hits = 0; window.__unreg = Aethelos.Combat.register({ position: p.clone().addScaledVector(f, 7).setY(p.y + 1.2), radius: 1, onHit: () => window.__hits++ }); });
  r = await run(0.75, { press: ['Space'], shotAt: 18 }); await shot('skill-02-boom');
  let b = await page.evaluate(() => ({ booms: window.__booms.length, hits: window.__hits }));
  expect(b.booms >= 1, 'attack throws a sonic boom', b);
  expect(b.hits >= 1, 'boom damages a registered target', b);
  await page.evaluate(() => window.__unreg());
  // finish the combo: 4 more presses -> Attack2..5 (Attack5 is the X: two booms)
  for (let i = 0; i < 4; i++) r = await run(0.12, { press: ['Space'] });
  r = await run(2.6, { shotAt: 30 }); await shot('skill-03-combo');
  b = await page.evaluate(() => window.__booms.length);
  expect(b >= 6, 'full combo throws 6 booms (X finisher = 2)', { booms: b });
  // aim with the arrow keys: hold Left and attack -> boom flies toward the camera's left
  r = await run(1.0);
  const aim = await page.evaluate(() => { const D = KingdomDebug, n0 = window.__booms.length, cam = D.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const left = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cam).normalize(); return { n0, left: [left.x, left.z] }; });
  r = await run(0.8, { hold: ['ArrowLeft'], press: ['Space'] });
  const aimed = await page.evaluate(n0 => window.__booms.slice(n0), aim.n0);
  const dot = aimed.length ? aimed[0].dir[0] * aim.left[0] + aimed[0].dir[1] * aim.left[1] : -1;
  expect(dot > 0.8, 'arrow keys aim the boom', { aimed, left: aim.left, dot });
  // active window ends at 6 s, V refused during cooldown, ready again at 12 s
  r = await run(3.5);
  expect(r.state === 'cooldown' && r.icon === 'cooldown', 'aura ends after 6 s, cooldown starts', r);
  r = await run(0.3, { press: ['KeyV'] });
  expect(r.state === 'cooldown' && !r.log.some(l => l.startsWith('charging')), 'V refused during cooldown', r);
  r = await run(5.5);
  expect(r.state === 'ready' && r.label === 'READY', 'ready again 12 s after ignition', r);
  // boom bursts on the city wall: stand inside the wall facing it
  await page.evaluate(() => { KingdomDebug.teleport(84, -84, Math.atan2(1, -1)); });
  r = await run(0.3, { press: ['KeyV'] }); r = await run(2.0);
  const wall = await page.evaluate(() => { const n0 = window.__booms.length; return n0; });
  r = await run(0.6, { press: ['Space'] }); r = await run(0.6);
  expect(r.booms === 0, 'boom bursts against the city wall instead of passing through', r);
  await page.close();
  // Female Warrior: V does nothing
  const fpage = await boot('female');
  const fr = await fpage.evaluate(() => { dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); KingdomDebug.tick(1 / 30); return { skill: !!KingdomDebug.skill, icon: !!document.getElementById('skillV') }; });
  expect(!fr.skill && !fr.icon, 'Female Warrior has no Azure Tempest', fr);
  await browser.close();
  console.log(JSON.stringify({ errors, fails }, null, 1));
  if (errors.length || fails.length) process.exit(1);
  console.log('hero-skill: OK');
})().catch(e => { console.error(e); process.exit(1); });
