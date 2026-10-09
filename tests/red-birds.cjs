// Red Birds check:
//  - the light model (<= 3,000 triangles, 88 bones) loads; flocks are placed outside the guarded areas
//  - a flying flock spots the hero, circles him and attacks in pairs: lock-on hover with a red aura and a ground ring,
//    then a straight dash; standing still costs 10% health per hit
//  - rolling as they dash makes them miss: they crash, lie dazed (killable), then get up and fly back
//  - a sword hit timed on a diving bird is a COUNTER: it dies, no damage, slow motion; attacks turn toward the enemy
//  - a ground flock pecks and ignores him; one sword hit kills a bird and the rest take off and hunt
//  - stepping into Dawnmeadow (guarded) ends the hunt; at night flying flocks roost; dead birds return after a game day
//  - at 0 health the hero is sent back to Dawnmeadow with full health
// Usage: python -m http.server 8000 --bind 127.0.0.1 &  node tests/red-birds.cjs
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
  await page.waitForFunction(() => window.KingdomDebug?.rig && KingdomDebug.birds?.ready, null, { timeout: 600000 });
  await page.evaluate(() => { KingdomDebug.paused = true; KingdomDebug.setHour(14); });
  const key = (down, up) => page.evaluate(([d, u]) => { d.forEach(c => dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }))); u.forEach(c => dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }))); }, [down, up]);
  const shot = async n => { await page.evaluate(() => KingdomDebug.render()); await page.screenshot({ path: `${OUT}/birds-${n}.png`, timeout: 240000 }); };
  const tick = sec => page.evaluate(sec => { for (let i = 0; i < Math.round(sec * 30); i++) KingdomDebug.tick(1 / 30); }, sec);
  // run until a predicate (evaluated in the page) holds, up to `sec` seconds of game time
  const until = (fn, sec) => page.evaluate(([src, sec]) => { const f = new Function('D', 'return (' + src + ')(D)'); const D = KingdomDebug;
    for (let i = 0; i < sec * 30; i++) { D.tick(1 / 30); if (f(D)) return true; } return false; }, [fn.toString(), sec]);

  const info = await page.evaluate(() => { const B = KingdomDebug.birds, safe = ['dawnmeadow', 'palace', 'city', 'aldmere', 'brenmoor', 'varkhold'];
    const R = Aethelos.Layout.REGIONS.filter(r => safe.includes(r.id));
    const badSites = B.SITES.filter(s => R.some(r => Math.hypot(s.x - r.x, s.z - r.z) < r.r + 10)).map(s => s.id);
    const sizes = B.SITES.map(s => s.n);
    let tris = 0, bones = 0; const r = Aethelos.RedBird; return { badSites, sizes, flocks: B.flocks.length, birds: B.birds.length }; });
  expect(!info.badSites.length, 'no flock lives in a guarded area', info);
  expect(info.sizes.every(n => n >= 6 && n <= 18), 'flocks of 6-18', info);
  // ---------------------------------------------------------------- flying flock: spot, circle, attack in pairs
  await page.evaluate(() => { const D = KingdomDebug, F = D.birds.flocks.find(f => f.site.id === 'meadow-west'); D.teleport(F.center.x + 6, F.center.z + 6, 0); });
  await tick(0.5);
  const model = await page.evaluate(() => { const b = KingdomDebug.birds.birds.find(b => b.rig); return b && { tris: b.rig.mesh.geometry.index.count / 3, bones: b.rig.bones.length }; });
  expect(model && model.tris <= 3000 && model.bones === 88, 'light bird model, 88 bones', model);
  const hunting = await until(D => D.birds.flocks.find(f => f.site.id === 'meadow-west').mode === 'hunt', 6);
  expect(hunting, 'the flock spots him and hunts', {});
  const locked = await until(D => D.birds.birds.filter(b => b.state === 'lock' && b.lock.aimed && b.aura > 0.6).length >= 2, 12);
  const pair = await page.evaluate(() => { const L = KingdomDebug.birds.birds.filter(b => b.state === 'lock');
    return { n: L.length, aura: L.map(b => +b.aura.toFixed(2)), ring: L.some(b => b.rig.ring.visible), sides: L.map(b => +b.lock.ang.toFixed(2)) }; });
  expect(locked && pair.n === 2 && pair.sides[0] !== pair.sides[1], 'two birds lock on together, from both sides, red aura', pair);
  await page.evaluate(() => { const D = KingdomDebug, L = D.birds.birds.filter(b => b.state === 'lock'); const p = L[0].pos; D.state.camYaw = Math.atan2(p.x - D.player.position.x, p.z - D.player.position.z) + 0.5; D.state.camPitch = 0.15; });
  await tick(0.3); await shot('lock');
  const hp0 = await page.evaluate(() => KingdomDebug.health.hp);
  await until(D => D.birds.birds.some(b => b.state === 'dash'), 3); await tick(0.08); await shot('dash');
  await tick(1.2);
  const hp1 = await page.evaluate(() => KingdomDebug.health.hp);
  expect(hp1 <= hp0 - 9.99 && hp1 >= hp0 - 20.01, 'standing still: each hit takes 10% health', { hp0, hp1 });
  // ---------------------------------------------------------------- dodge: they miss and crash
  await page.evaluate(() => KingdomDebug.health.reset());
  await until(D => D.birds.birds.some(b => b.state === 'dash' && b.t < 0.06), 12);
  await key(['KeyC'], ['KeyC']); await tick(1.3);
  const after = await page.evaluate(() => ({ hp: KingdomDebug.health.hp, stunned: KingdomDebug.birds.birds.filter(b => b.state === 'stunned').length }));
  expect(after.hp === 100 && after.stunned >= 1, 'rolling through the dash: no damage, the birds crash and lie dazed', after);
  await page.evaluate(() => { const D = KingdomDebug, b = D.birds.birds.find(b => b.state === 'stunned'); D.state.camYaw = Math.atan2(b.pos.x - D.player.position.x, b.pos.z - D.player.position.z); D.state.camPitch = 0.2; D.state.camZoom = 0.7; });
  await tick(0.5); await shot('dazed');
  // a dazed bird can be finished off; left alone it gets up and flies back
  const finish = await page.evaluate(() => { const D = KingdomDebug, S = D.birds.birds.filter(b => b.state === 'stunned'); const b = S[0]; window.__other = S[1] || null;
    D.teleport(b.pos.x - 1.4, b.pos.z, Math.PI / 2); D.birds.swordHit({ kind: 'combo' }); return b.state; });
  const faced = await page.evaluate(() => KingdomDebug.player.rotation.y);
  expect(finish === 'dead', 'a dazed bird dies to one sword hit', { finish });
  await page.evaluate(() => { const D = KingdomDebug; for (const b of D.birds.birds) if (b.state === 'stunned' && !window.__other) window.__other = b; });
  const rejoin = await until(D => !window.__other || ['takeoff', 'fly', 'lock', 'dash', 'recover'].includes(window.__other.state), 6);
  expect(rejoin, 'left alone, a dazed bird gets up and flies back', {});
  // perfect counter: the sword meets a diving bird -> it dies, no damage, slow motion
  await page.evaluate(() => KingdomDebug.health.reset());
  const ctr = await until(D => { const b = D.birds.birds.find(b => b.state === 'dash'); if (!b) return false; const p = D.player.position;
    if (Math.hypot(b.pos.x - p.x, b.pos.z - p.z) > 2.6) return false; D.player.rotation.y = Math.atan2(b.pos.x - p.x, b.pos.z - p.z); window.__ctr = b; D.birds.swordHit({ kind: 'combo' }); return true; }, 20);
  const c2 = await page.evaluate(() => ({ state: window.__ctr && window.__ctr.state, slow: KingdomDebug.state.slowT, pop: document.getElementById('battlePop').textContent }));
  await tick(0.8);
  const c3 = await page.evaluate(() => KingdomDebug.health.hp);
  expect(ctr && c2.state === 'dead' && c2.slow > 0 && c2.pop === 'COUNTER!', 'sword timed on a diving bird: COUNTER, it dies', c2);
  expect(c3 >= 90, 'no damage from the countered bird (only its partner can still hit)', { hp: c3 });
  // ---------------------------------------------------------------- Dawnmeadow is guarded: the hunt ends
  await page.evaluate(() => { const S = Aethelos.Layout.SPAWN; KingdomDebug.teleport(S.x, S.z, S.yaw); });
  const ended = await until(D => D.birds.flocks.find(f => f.site.id === 'meadow-west').mode !== 'hunt', 3);
  expect(ended, 'a hunt breaks off at the edge of Dawnmeadow', {});
  // ---------------------------------------------------------------- ground flock: passive until struck
  await page.evaluate(() => { const D = KingdomDebug, F = D.birds.flocks.find(f => f.site.id === 'meadow-pickers'); D.teleport(F.patch.x - 4.5, F.patch.z - 4.5, Math.PI / 4); });
  await page.evaluate(() => KingdomDebug.health.reset()); await tick(6);
  const calm = await page.evaluate(() => { const F = KingdomDebug.birds.flocks.find(f => f.site.id === 'meadow-pickers'); return { mode: F.mode, states: [...new Set(F.birds.map(b => b.state))], hp: KingdomDebug.health.hp }; });
  expect(calm.mode === 'grounded' && calm.states.every(s => s === 'ground') && calm.hp === 100, 'pecking flock ignores him', calm);
  await page.evaluate(() => { const D = KingdomDebug, F = D.birds.flocks.find(f => f.site.id === 'meadow-pickers'); const p = D.player.position; const b = F.birds.filter(b => b.state === 'ground').sort((a, c) => a.pos.distanceTo(p) - c.pos.distanceTo(p))[0];
    D.state.camYaw = 0.7; D.state.camPitch = 0.25; D.render(); window.__target = b; });
  await shot('pecking');
  await page.evaluate(() => { const D = KingdomDebug, b = window.__target; D.teleport(b.pos.x - 1.3, b.pos.z - 0.2, Math.atan2(1.3, 0.2) + 1.6); });   // facing away
  await key(['Space'], ['Space']);                                                         // first press also draws the sword from its portal
  const aim = await page.evaluate(() => { const D = KingdomDebug, p = D.player.position, b = window.__target, want = Math.atan2(b.pos.x - p.x, b.pos.z - p.z), y = D.player.rotation.y;
    return { off: Math.abs(Math.atan2(Math.sin(want - y), Math.cos(want - y))), faceT: !!D.state.faceT }; });
  expect(aim.off < 0.25, 'attack turns him toward the bird', aim);
  await tick(2.4);
  await page.evaluate(() => { const D = KingdomDebug, b = window.__target; D.teleport(b.pos.x - 1.3, b.pos.z - 0.2, Math.atan2(1.3, 0.2)); });
  await key(['Space'], ['Space']);
  await tick(1.2);
  const struck = await page.evaluate(() => { const F = KingdomDebug.birds.flocks.find(f => f.site.id === 'meadow-pickers'); return { mode: F.mode, dead: F.birds.filter(b => b.state === 'dead' || b.state === 'gone').length, up: F.birds.filter(b => ['takeoff', 'fly', 'lock', 'dash', 'recover'].includes(b.state)).length }; });
  expect(struck.dead >= 1 && struck.mode === 'hunt' && struck.up >= 3, 'one sword hit kills; the group takes off and hunts', struck);
  await tick(1.0); await shot('takeoff');
  // red feathers dropped by the dead birds can be picked up
  const loot = await page.evaluate(() => { const D = KingdomDebug, P = D.birds.pickups; if (!P.length) return { n: 0 }; const before = D.birds.feathers, q = P[0].sp.position;
    D.teleport(q.x, q.z, 0); for (let i = 0; i < 20; i++) D.tick(1 / 30); return { n: P.length, before, after: D.birds.feathers }; });
  expect(loot.n === 0 || loot.after === loot.before + 1, 'walking over a red feather picks it up', loot);
  // ---------------------------------------------------------------- night roost and respawn after a day
  const deadBird = await page.evaluate(() => { const b = KingdomDebug.birds.birds.find(b => b.state === 'dead' || b.state === 'gone'); return b && { id: b.F.site.id, i: b.i }; });
  await tick(3.5);
  const resp = await page.evaluate(([id, i]) => { const D = KingdomDebug, b = D.birds.flocks.find(f => f.site.id === id).birds[i]; const now = D.world.sky.day * 24 + D.world.sky.hour; return { state: b.state, wait: +(b.respawnAt - now).toFixed(2) }; }, [deadBird.id, deadBird.i]);
  expect(resp.state === 'gone' && resp.wait > 23.5 && resp.wait <= 24.01, 'a dead bird comes back after one game day', resp);
  await page.evaluate(() => { KingdomDebug.birds.respawnAll(); });
  await tick(0.2);
  const back = await page.evaluate(([id, i]) => KingdomDebug.birds.flocks.find(f => f.site.id === id).birds[i].state, [deadBird.id, deadBird.i]);
  expect(back !== 'gone' && back !== 'dead', 'respawned in its flock', { back });
  await page.evaluate(() => { const S = Aethelos.Layout.SPAWN; KingdomDebug.teleport(S.x, S.z, S.yaw); KingdomDebug.setHour(22.5); });
  const roost = await until(D => D.birds.flocks.filter(f => f.site.kind === 'air').every(f => f.mode === 'grounded' || f.mode === 'land'), 8);
  expect(roost, 'flying flocks roost at night', await page.evaluate(() => KingdomDebug.birds.flocks.map(f => f.site.id + ':' + f.mode)));
  await page.evaluate(() => KingdomDebug.setHour(9));
  const woke = await until(D => D.birds.flocks.filter(f => f.site.kind === 'air').every(f => f.mode === 'roam'), 8);
  expect(woke, 'and fly again in the morning', await page.evaluate(() => KingdomDebug.birds.flocks.filter(f => f.site.kind === 'air').map(f => f.site.id + ':' + f.mode + ':' + f.active + ':' + [...new Set(f.birds.map(b => b.state))].join('/'))));
  // ---------------------------------------------------------------- defeat
  await page.evaluate(() => { const D = KingdomDebug; D.teleport(-60, 470, 0); D.health.damage(0.95); D.health.damage(0.1); });
  await page.waitForTimeout(2600); await tick(0.1);
  const def = await page.evaluate(() => { const D = KingdomDebug, p = D.player.position, S = Aethelos.Layout.SPAWN; return { hp: D.health.hp, d: Math.hypot(p.x - S.x, p.z - S.z) }; });
  expect(def.hp === 100 && def.d < 2, 'defeat: back in Dawnmeadow at full health', def);
  // ---------------------------------------------------------------- a roaming flock from afar
  await page.evaluate(() => { const D = KingdomDebug, F = D.birds.flocks.find(f => f.site.id === 'east-plains'); D.teleport(F.center.x - 30, F.center.z - 30, 0.8); D.state.camYaw = 0.8; D.state.camPitch = 0.05; D.state.camZoom = 1.3; });
  await tick(2.5); await shot('flock');
  console.log(JSON.stringify({ fails, errors: errors.slice(0, 5), kills: await page.evaluate(() => KingdomDebug.birds.killCount) }, null, 1));
  await browser.close();
  if (fails.length || errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
