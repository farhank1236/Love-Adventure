// World editor check with real pointer/keyboard events: E opens the editor, click selects an object, drag moves it
// along the ground, R rotates, + scales, rename/category edits, Delete + Ctrl+Z, placing a new object from the
// catalogue, JSON export/import, auto-save surviving a page reload, and reset to the default kingdom.
// Usage: python -m http.server 8000 --bind 127.0.0.1 &  node tests/kingdom-editor.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = process.env.GAME_URL || 'http://127.0.0.1:8000/index.html';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  const errors = [], fails = [], expect = (c, m, p) => { if (!c) fails.push(m + ' ' + JSON.stringify(p)); };
  page.on('pageerror', e => errors.push(String(e)));
  async function boot() {
    await page.goto(URL, { timeout: 240000 });
    await page.waitForFunction(() => typeof window.startGame === 'function' && window.Aethelos?.createEditor, null, { timeout: 120000 });
    await page.evaluate(() => { playerGender = 'male'; window.startGame(); });
    await page.waitForFunction(() => window.KingdomDebug?.rig && window.KingdomDebug.editor, null, { timeout: 300000 });
    await page.evaluate(() => { KingdomDebug.paused = true; });
  }
  await boot();
  await page.evaluate(() => localStorage.removeItem('aethelos.kingdom.map.v1'));
  const key = (code, opts = {}) => page.evaluate(([code, opts]) => { dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...opts })); dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, ...opts })); KingdomDebug.tick(1 / 30); }, [code, opts]);
  // screen position of an object's centre (or of a world point)
  const screenOf = (id, wp) => page.evaluate(([id, wp]) => { const D = KingdomDebug, E = D.editor, THREE = window.THREE; for (let i = 0; i < 3; i++) D.tick(1 / 30); D.render();
    const p = wp ? new THREE.Vector3(...wp) : D.world.layer.boundsOf(D.world.objects.find(o => o.id === id)).getCenter(new THREE.Vector3());
    p.project(D.camera); const r = document.getElementById('phase1Canvas').getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }, [id, wp]);
  const pointer = (type, x, y, button = 0) => page.evaluate(([type, x, y, button]) => { document.getElementById('phase1Canvas').dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button, pointerType: 'mouse', bubbles: true })); KingdomDebug.tick(1 / 30); }, [type, x, y, button]);

  await key('KeyE');
  let r = await page.evaluate(() => ({ active: KingdomDebug.editor.active, editing: KingdomDebug.state.editing, panel: !document.getElementById('kEditor').hidden }));
  expect(r.active && r.editing && r.panel, 'E opens the editor', r);
  // focus the camera on the Adventure Guild and click it
  const gid = await page.evaluate(() => { const D = KingdomDebug, g = D.world.objects.find(o => o.type === 'guild_hall'); D.editor.select(g.id); const c = D.editor.cam; c.focus.set(g.position.x, g.position.y + 4, g.position.z); c.dist = 70; c.pitch = 0.9; D.editor.select(null); return g.id; });
  let [sx, sy] = await screenOf(gid);
  await pointer('pointerdown', sx, sy); await pointer('pointerup', sx, sy);
  r = await page.evaluate(() => KingdomDebug.editor.selected?.id);
  expect(r === gid, 'clicking the Adventure Guild selects it', { selected: r, gid });
  // drag it 10 m east along the ground
  const before = await page.evaluate(id => ({ ...KingdomDebug.world.objects.find(o => o.id === id).position }), gid);
  const [tx, ty] = await screenOf(null, [before.x + 10, before.y, before.z]), [ox, oy] = await screenOf(null, [before.x, before.y, before.z]);
  await pointer('pointerdown', sx, sy); await pointer('pointermove', sx + (tx - ox) / 2, sy + (ty - oy) / 2); await pointer('pointermove', sx + (tx - ox), sy + (ty - oy)); await pointer('pointerup', sx + (tx - ox), sy + (ty - oy));
  r = await page.evaluate(id => { const o = KingdomDebug.world.objects.find(o => o.id === id); return { ...o.position, ground: KingdomDebug.world.terrain.heightAt(o.position.x, o.position.z) }; }, gid);
  expect(Math.abs(r.x - before.x - 10) < 2 && Math.abs(r.z - before.z) < 2, 'drag moves the object along the ground', { before, after: r });
  // rotate, scale, rename, category
  const rot0 = await page.evaluate(id => KingdomDebug.world.objects.find(o => o.id === id).rotation.y, gid);
  await key('KeyR'); await key('Equal');
  await page.evaluate(() => { const E = KingdomDebug.editor; E.setField('name', 'Guild of Heroes'); E.setField('category', 'Quest Areas'); });
  r = await page.evaluate(id => KingdomDebug.world.objects.find(o => o.id === id), gid);
  expect(Math.abs(r.rotation.y - rot0 - Math.PI / 12) < 1e-3, 'R rotates 15 degrees', r.rotation);
  expect(Math.abs(r.scale.x - 1.1) < 1e-3 && Math.abs(r.scale.z - 1.1) < 1e-3, '+ scales up', r.scale);
  expect(r.name === 'Guild of Heroes' && r.category === 'Quest Areas', 'rename + change category', { name: r.name, category: r.category });
  // collisions follow the moved building
  r = await page.evaluate(id => { const D = KingdomDebug, o = D.world.objects.find(o => o.id === id); const [x, z, hit] = D.world.collide.resolve(o.position.x, o.position.z, 0.4, o.position.y); return hit; }, gid);
  expect(r, 'colliders rebuilt at the new position', r);
  // delete + undo
  const n0 = await page.evaluate(() => KingdomDebug.world.objects.length);
  await key('Delete');
  const n1 = await page.evaluate(() => KingdomDebug.world.objects.length);
  await key('KeyZ', { ctrlKey: true });
  const n2 = await page.evaluate(() => KingdomDebug.world.objects.length);
  expect(n1 === n0 - 1 && n2 === n0, 'Delete removes, Ctrl+Z brings it back', { n0, n1, n2 });
  // place a new street lamp from the catalogue by clicking the ground
  await page.evaluate(() => KingdomDebug.editor.startPlacing('lamp_post'));
  const lampAt = await page.evaluate(id => { const o = KingdomDebug.world.objects.find(o => o.id === id); return [o.position.x - 14, o.position.y, o.position.z + 14]; }, gid);
  const [lx, ly] = await screenOf(null, lampAt);
  await pointer('pointermove', lx, ly); await pointer('pointerdown', lx, ly); await pointer('pointerup', lx, ly);
  r = await page.evaluate(() => { const o = KingdomDebug.world.objects[KingdomDebug.world.objects.length - 1]; return { type: o.type, id: o.id, name: o.name, pos: o.position, cat: o.category, meta: o.metadata }; });
  expect(r.type === 'lamp_post' && r.meta.addedInEditor && Math.hypot(r.pos.x - lampAt[0], r.pos.z - lampAt[2]) < 2, 'clicking the ground places a new object', r);
  const newLamp = r.id;
  // export -> import round trip
  r = await page.evaluate(() => { const E = KingdomDebug.editor, j = JSON.parse(E.mapJson()); const n = j.objects.length; j.objects = j.objects.slice(0, 500);
    E.act('import'); E.applyImport(JSON.stringify(j), document.querySelector('#kEditor .modal')); const after = KingdomDebug.world.objects.length; E.undo(); return { exported: n, format: j.format, afterImport: after, afterUndo: KingdomDebug.world.objects.length }; });
  expect(r.format === 'aethelos-map' && r.afterImport === 500 && r.afterUndo === r.exported, 'export JSON, import JSON (and undo)', r);
  // auto-save -> reload keeps the edited map
  await page.waitForTimeout(800);
  r = await page.evaluate(() => JSON.parse(localStorage.getItem('aethelos.kingdom.map.v1') || '{}').objects?.length);
  expect(r > 3000, 'map auto-saved in the browser', r);
  await boot();
  r = await page.evaluate(([gid, lamp]) => { const D = KingdomDebug, g = D.world.objects.find(o => o.id === gid); return { fromSave: D.world.fromSave, name: g?.name, scale: g?.scale.x, lamp: !!D.world.objects.find(o => o.id === lamp) }; }, [gid, newLamp]);
  expect(r.fromSave && r.name === 'Guild of Heroes' && Math.abs(r.scale - 1.1) < 1e-3 && r.lamp, 'refresh keeps the saved map', r);
  // reset to default (two clicks)
  r = await page.evaluate(gid => { const E = KingdomDebug.editor; E.toggle(true); E.act('reset'); E.act('reset'); const g = KingdomDebug.world.objects.find(o => o.id === gid); return { name: g.name, scale: g.scale.x }; }, gid);
  expect(r.name === 'Adventure Guild' && r.scale === 1, 'reset restores the default kingdom', r);
  await page.evaluate(() => { KingdomDebug.editor.toggle(false); localStorage.removeItem('aethelos.kingdom.map.v1'); });
  r = await page.evaluate(() => ({ editing: KingdomDebug.state.editing, hud: document.getElementById('phase1Hud').style.visibility }));
  expect(!r.editing && r.hud === '', 'leaving the editor returns to play', r);
  await page.screenshot({ path: (process.env.QA_DIR || '/tmp') + '/kingdom-editor-final.png', timeout: 240000 });
  await browser.close();
  console.log(JSON.stringify({ errors, fails }, null, 1));
  if (errors.length || fails.length) process.exit(1);
  console.log('kingdom-editor: OK');
})().catch(e => { console.error(e); process.exit(1); });
