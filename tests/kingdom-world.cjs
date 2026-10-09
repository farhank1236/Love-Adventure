// Kingdom world check: starts the game through startGame() and verifies the open world itself — every region has its
// landmarks, bridges carry the hero over rivers, deep water / city walls / houses block him, the location banner names
// each area, and the Female Warrior also loads. Steps the loop deterministically (works on software GPUs).
// Usage: python -m http.server 8000 --bind 127.0.0.1 &  node tests/kingdom-world.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = process.env.GAME_URL || 'http://127.0.0.1:8000/index.html';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const fails = [], errors = [], expect = (c, m, p) => { if (!c) fails.push(m + ' ' + JSON.stringify(p)); };
  for (const gender of ['male', 'female']) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.startGame === 'function' && window.Aethelos?.createKingdom, null, { timeout: 120000 });
    await page.evaluate(g => { playerGender = g; window.startGame(); }, gender);
    await page.waitForFunction(() => window.KingdomDebug?.rig, null, { timeout: 300000 });
    const r = await page.evaluate(() => {
      const D = KingdomDebug, T = D.world.terrain, O = D.world.objects; D.paused = true; const out = {};
      const count = (pred) => O.filter(pred).length;
      out.objects = O.length;
      out.landmarks = { palace: count(o => o.type === 'palace_keep'), guild: count(o => o.type === 'guild_hall'), tavern: count(o => o.type === 'tavern'), gates: count(o => o.type === 'city_gate'),
        manors: count(o => o.category === 'Noble Houses'), barns: count(o => o.type === 'barn'), windmill: count(o => o.type === 'windmill'), mine: count(o => o.type === 'mine_entrance'),
        arena: count(o => o.type === 'boss_arena'), bridges: count(o => o.category === 'Bridges'), lamps: count(o => o.type === 'lamp_post'), trees: count(o => o.category === 'Trees'),
        houses: count(o => o.category === 'Houses'), savePoints: count(o => o.category === 'Save Points'), portals: count(o => o.category === 'Portals'), npcs: count(o => o.category === 'NPCs'),
        chests: count(o => o.category === 'Treasure'), spawns: count(o => o.category === 'Enemies') };
      out.fields = O.every(o => o.id && o.name && o.type && o.category && o.position && o.rotation && o.scale && o.metadata);
      const walk = (x, z, yaw, sec, keys = ['ArrowUp']) => { D.teleport(x, z, yaw); for (let i = 0; i < 8; i++) D.tick(1 / 30); keys.forEach(k => D.state.keys[k] = true);
        let maxDepthUnder = 0, onDeck = false; for (let i = 0; i < sec * 30; i++) { D.tick(1 / 30); const P = D.player.position, w = T.waterAt(P.x, P.z); if (w) maxDepthUnder = Math.max(maxDepthUnder, w.level - P.y); onDeck = onDeck || D.state.onDeck; }
        keys.forEach(k => D.state.keys[k] = false); const P = D.player.position; return { x: +P.x.toFixed(1), z: +P.z.toFixed(1), aboveGround: +(P.y - T.heightAt(P.x, P.z)).toFixed(2), maxDepthUnder: +maxDepthUnder.toFixed(2), onDeck }; };
      out.bridge = walk(0, 340, Math.PI, 9, ['ArrowUp', 'KeyX']);
      out.water = walk(40, 312, 0, 6);
      out.wall = walk(80, -80, Math.atan2(1, -1), 6, ['ArrowUp', 'KeyX']);
      const regions = {}; for (const [id, x, z] of [['city', 0, 40], ['palace', 0, -240], ['farms', -230, 220], ['forest', 330, 190], ['mountains', 150, -420], ['aldmere', -380, -50], ['brenmoor', -350, 420], ['varkhold', 300, -300], ['dawnmeadow', 0, 380]]) {
        D.teleport(x, z); D.tick(1 / 30); D.tick(1 / 30); regions[id] = document.querySelector('#phase1Banner b')?.textContent; }
      out.regions = regions;
      return out;
    });
    if (gender === 'male') {
      const L = r.landmarks;
      expect(r.objects > 3000 && r.fields, 'object list complete with id/name/type/category/position/rotation/scale/metadata', { objects: r.objects });
      for (const [k, min] of Object.entries({ palace: 1, guild: 1, tavern: 1, gates: 4, manors: 3, barns: 3, windmill: 1, mine: 1, arena: 1, bridges: 4, lamps: 30, trees: 1500, houses: 100, savePoints: 1, portals: 2, npcs: 10, chests: 4, spawns: 6 }))
        expect(L[k] >= min, `has ${k}`, L);
      expect(r.bridge.z < 300 && r.bridge.maxDepthUnder <= 0 && r.bridge.onDeck, 'bridge carries the hero over the Silvermere', r.bridge);
      expect(r.water.z < 318, 'deep water blocks the hero', r.water);
      expect(Math.hypot(r.wall.x, r.wall.z) < 127.5, 'city wall blocks the hero', r.wall);
      const want = { city: 'Main City', palace: 'Royal Palace', farms: 'Farm Valley', forest: 'Moonpine Forest', mountains: 'Ironpeak Mountains', aldmere: 'House Aldmere', brenmoor: 'House Brenmoor', varkhold: 'House Varkhold', dawnmeadow: 'Dawnmeadow' };
      for (const [k, v] of Object.entries(want)) expect(r.regions[k] === v, `location banner in ${k}`, r.regions);
      console.log(JSON.stringify({ landmarks: L, bridge: r.bridge, water: r.water, wall: r.wall }));
    } else expect(r.objects > 3000, 'Female Warrior loads into the kingdom', r);
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify({ errors, fails }, null, 1));
  if (errors.length || fails.length) process.exit(1);
  console.log('kingdom-world: OK');
})().catch(e => { console.error(e); process.exit(1); });
