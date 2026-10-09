/* Aethelos default kingdom: generates the editable object list (every house, tree, lamp, bridge, NPC spot ...).
   Each object: {id, name, type, category, position:{x,y,z}, rotation:{x,y,z}, scale:{x,y,z}, metadata:{region,...}}.
   Deterministic (seeded), so the default map is identical on every machine; the editor saves changes as JSON. */
(() => {
  const A = window.Aethelos ||= {};
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const faceYaw = (fx, fz) => Math.atan2(fx, fz);            // local +z (the front) points along (fx, fz)
  const alongYaw = (dx, dz) => Math.atan2(-dz, dx);           // local +x points along (dx, dz)

  function generate(terrain) {
    const M = A.Models.TYPES, L = A.Layout, R = rng(20261009), objs = [], counters = {};
    const occ = new Map(), CELL = 8;                          // footprint occupancy (circles) to avoid overlaps
    const occKey = (i, j) => i + ',' + j;
    function free(x, z, r) {
      const i0 = Math.floor((x - r - 12) / CELL), i1 = Math.floor((x + r + 12) / CELL), j0 = Math.floor((z - r - 12) / CELL), j1 = Math.floor((z + r + 12) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const c of occ.get(occKey(i, j)) || []) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
      return true;
    }
    function mark(x, z, r) { const i = Math.floor(x / CELL), j = Math.floor(z / CELL); const k = occKey(i, j); (occ.get(k) || occ.set(k, []).get(k)).push({ x, z, r }); }
    function footprint(type, sx = 1) {
      const T = M[type]; let r = 0.5;
      for (const c of T.col) r = Math.max(r, c.k === 'box' ? Math.hypot(Math.abs(c.x) + c.w / 2, Math.abs(c.z) + c.d / 2) : Math.hypot(c.x, c.z) + c.r);
      for (const d of T.deck) r = Math.max(r, Math.hypot(d.w / 2, d.d / 2));
      if (T.flat) r = 12;
      return r * sx;
    }
    /* place an object; opts: {yaw, scale, name, meta, check:false, pad, y} */
    function put(type, x, z, o = {}) {
      const T = M[type], s = o.scale || 1, sv = typeof s === 'number' ? { x: s, y: s, z: s } : s, r = (o.r ?? footprint(type, sv.x)) + (o.pad ?? 0.6);
      if (o.check !== false && !free(x, z, r)) return null;
      if (o.check !== false && !o.allowRoad && terrain.roadDist(x, z) < r * 0.55 - 0.5 && !T.bridge) return null;
      if (!T.bridge && !o.allowWater && terrain.riverDist(x, z) < Math.min(r, 6)) return null;
      mark(x, z, r);
      const n = (counters[type] = (counters[type] || 0) + 1);
      const obj = { id: `${type}_${String(n).padStart(3, '0')}`, name: o.name || `${T.label} ${n}`, type, category: o.category || T.category,
        position: { x: +x.toFixed(2), y: +(o.y ?? groundY(x, z, r * (T.flat ? 0.6 : 0.5))).toFixed(2), z: +z.toFixed(2) },
        rotation: { x: 0, y: +((o.yaw || 0)).toFixed(4), z: 0 }, scale: sv, metadata: { region: regionOf(x, z), ...(o.meta || {}) } };
      objs.push(obj); return obj;
    }
    /* buildings sit level on the LOWEST corner so no side floats; foundations hide the rest */
    function groundY(x, z, r) {
      let m = terrain.heightAt(x, z);
      if (r > 1.5) for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; m = Math.min(m, terrain.heightAt(x + Math.cos(a) * r * 0.8, z + Math.sin(a) * r * 0.8)); }
      return m;
    }
    function regionOf(x, z) { for (const g of L.REGIONS) if (g.r && Math.hypot(x - g.x, z - g.z) < g.r) return g.id; return 'wilds'; }
    const pick = a => a[Math.floor(R() * a.length)];
    // nearest point on any road (for facing buildings to the street)
    function faceRoad(x, z) {
      let best = null;
      for (const rd of terrain.roads) for (let i = 0; i < rd.pts.length - 1; i++) {
        const [x0, z0] = rd.pts[i], [x1, z1] = rd.pts[i + 1], dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
        const t = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / L2)), px = x0 + dx * t, pz = z0 + dz * t, d = Math.hypot(x - px, z - pz);
        if (!best || d < best.d) best = { d, px, pz };
      }
      return best ? faceYaw(best.px - x, best.pz - z) : 0;
    }

    // ================================================================= bridges where roads cross rivers
    for (const rd of terrain.roads) for (let i = 0; i < rd.pts.length - 1; i++) {
      const [x0, z0] = rd.pts[i], [x1, z1] = rd.pts[i + 1], w0 = terrain.waterAt(x0, z0), w1 = terrain.waterAt(x1, z1);
      if (!(w1 && !w0)) continue;                                   // entering a river channel
      let j = i + 1; while (j < rd.pts.length - 1 && terrain.waterAt(rd.pts[j][0], rd.pts[j][1])) j++;
      const [ax, az] = rd.pts[i], [bx, bz] = rd.pts[j], cx = (ax + bx) / 2, cz = (az + bz) / 2, span = Math.hypot(bx - ax, bz - az) + 7;
      const river = w1.river, stone = river.width >= 10, type = stone ? 'bridge_stone' : 'bridge_wood', baseLen = stone ? 24 : 14;
      const deckY = Math.max(terrain.heightAt(ax, az), terrain.heightAt(bx, bz), w1.level + 1.6);
      const widthScale = Math.max(1, (rd.width + 1) / (stone ? 7 : 4.2));
      put(type, cx, cz, { yaw: alongYaw(bx - ax, bz - az), scale: { x: Math.max(1, span / baseLen), y: 1, z: widthScale }, y: deckY - (stone ? 0.3 : 0.15), check: false,
        name: `${rd.name} bridge`, meta: { road: rd.id, river: river.id } });
    }

    // ================================================================= MAIN CITY (walls, gates, plaza, streets)
    const WALL_R = 128, gates = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    put('plaza', 0, 0, { check: false, name: 'Crown Plaza' });
    for (const a of gates) put('city_gate', Math.cos(a) * WALL_R, Math.sin(a) * WALL_R, { yaw: alongYaw(-Math.sin(a), Math.cos(a)), check: false, name: ['East Gate', 'South Gate', 'West Gate', 'North Gate'][gates.indexOf(a)] });
    const segs = 60;
    for (let k = 0; k < segs; k++) {
      const a = (k + 0.5) / segs * Math.PI * 2;
      if (gates.some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.085)) continue;
      put('city_wall', Math.cos(a) * WALL_R, Math.sin(a) * WALL_R, { yaw: alongYaw(-Math.sin(a), Math.cos(a)), check: false, scale: { x: 1.02, y: 1, z: 1 } });
    }
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; put('wall_tower', Math.cos(a) * WALL_R, Math.sin(a) * WALL_R, { check: false }); }
    // plaza centrepiece
    put('fountain', 0, 0, { check: false, name: 'Crown Fountain' });
    put('statue', 0, -20, { yaw: 0, name: 'Statue of the First King', allowRoad: true });
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; put('lamp_post', Math.cos(a) * 17, Math.sin(a) * 17, { yaw: faceYaw(-Math.cos(a), -Math.sin(a)), check: false }); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.25; put('market_stall', Math.cos(a) * 25, Math.sin(a) * 25, { yaw: faceYaw(-Math.cos(a), -Math.sin(a)), name: `Market stall ${k + 1}`, allowRoad: true }); }
    // landmark buildings
    put('guild_hall', 56, -24, { yaw: faceYaw(-0.4, -1), name: 'Adventure Guild', check: false });
    put('quest_board', 49, -40, { yaw: faceYaw(-0.4, -1), name: 'Guild quest board', check: false });
    put('training_dummy', 70, -46, { name: 'Guild training dummy' }); put('training_dummy', 75, -42, { name: 'Guild training dummy' });
    put('tavern', -40, 26, { yaw: faceYaw(0.2, -1), name: 'The Gilded Tankard' });
    put('restaurant', 38, 28, { yaw: faceYaw(-0.2, -1), name: 'Hearth & Honey' });
    put('general_store', -36, -26, { yaw: faceYaw(0.3, 1), name: 'Aethelgard Provisions' });
    for (const [x, z, nm] of [[26, 12, 'Smithy & Arms'], [-26, 12, 'Apothecary'], [26, -12, 'Tailor'], [-24, -12, 'Jeweller']]) put('shop', x, z, { yaw: faceRoad(x, z), name: nm });
    // houses along every city street
    const houseTypes = ['house_cottage', 'house_cottage_b', 'house_two', 'house_two_b', 'house_long', 'house_tower', 'house_two', 'house_cottage'];
    for (const rd of terrain.roads.filter(r => r.id.startsWith('city'))) {
      for (let i = 0; i < rd.pts.length - 1; i += 2) {
        const [x0, z0] = rd.pts[i], [x1, z1] = rd.pts[Math.min(rd.pts.length - 1, i + 1)], dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        for (const side of [-1, 1]) {
          const type = pick(houseTypes), off = rd.width / 2 + footprint(type) * 0.75 + 1.5, x = x0 + nx * side * off, z = z0 + nz * side * off, d = Math.hypot(x, z);
          if (d > WALL_R - 12 || d < 34) continue;
          put(type, x, z, { yaw: faceYaw(-nx * side, -nz * side), meta: { district: 'city' } });
        }
      }
    }
    // fill blocks between streets
    for (let k = 0; k < 900; k++) {
      const a = R() * Math.PI * 2, d = 36 + R() * (WALL_R - 50), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (terrain.roadDist(x, z) < 7) continue;
      put(pick(houseTypes), x, z, { yaw: faceRoad(x, z), meta: { district: 'city' } });
    }
    // street furniture
    for (const rd of terrain.roads.filter(r => r.id.startsWith('city') || r.id === 'kings-way' || r.id === 'royal-road')) {
      let acc = 0;
      for (let i = 1; i < rd.pts.length; i++) {
        acc += Math.hypot(rd.pts[i][0] - rd.pts[i - 1][0], rd.pts[i][1] - rd.pts[i - 1][1]);
        if (acc < 18) continue; acc = 0;
        const [x0, z0] = rd.pts[i - 1], [x1, z1] = rd.pts[i], l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / l, nz = (x1 - x0) / l, side = i % 2 ? 1 : -1;
        put('lamp_post', x1 + nx * side * (rd.width / 2 + 0.9), z1 + nz * side * (rd.width / 2 + 0.9), { yaw: faceYaw(-nx * side, -nz * side), pad: 0.2 });
      }
    }
    for (let k = 0; k < 60; k++) { const a = R() * Math.PI * 2, d = 30 + R() * 80, x = Math.cos(a) * d, z = Math.sin(a) * d; put(pick(['barrel', 'crate', 'bench', 'cart', 'barrel', 'flower_bed']), x, z, { yaw: R() * 6.28, pad: 0.3 }); }
    for (let k = 0; k < 14; k++) { const a = R() * Math.PI * 2, d = 20 + R() * 95; put(pick(['npc_villager', 'npc_villager', 'npc_merchant']), Math.cos(a) * d, Math.sin(a) * d, { yaw: R() * 6.28, allowRoad: true, pad: 0.3 }); }
    for (const a of gates) for (const s of [-1, 1]) { const t = a + s * 0.07; put('npc_guard', Math.cos(t) * (WALL_R + 5), Math.sin(t) * (WALL_R + 5), { yaw: faceYaw(Math.cos(a), Math.sin(a)), name: 'Gate guard', pad: 0.2 }); }

    // ================================================================= ROYAL PALACE
    const P = { x: 0, z: -262 };
    put('palace_keep', P.x, P.z - 20, { yaw: 0, name: 'Royal Palace', check: false });
    put('palace_gate', P.x, P.z + 40, { yaw: 0, name: 'Palace Gate', check: false });
    const PW = 50, PD = 44;                                         // palace curtain wall (half sizes)
    for (let x = -PW + 7; x <= PW - 7; x += 14) { put('palace_wall', P.x + x, P.z - PD, { check: false }); if (Math.abs(x) > 12) put('palace_wall', P.x + x, P.z + PD - 4, { check: false }); }
    for (let z = -PD + 7; z <= PD - 7; z += 14) for (const sx of [-1, 1]) put('palace_wall', P.x + sx * PW, P.z + z, { yaw: Math.PI / 2, check: false });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put('palace_tower', P.x + sx * PW, P.z + sz * (sz > 0 ? PD - 4 : PD), { check: false });
    for (const sx of [-1, 1]) { put('guard_post', P.x + sx * 9, P.z + 46, { yaw: 0, check: false }); }
    for (let z = -6; z <= 26; z += 8) for (const sx of [-1, 1]) {
      put('hedge', P.x + sx * 9, P.z + z, { yaw: Math.PI / 2, check: false }); put('flower_bed', P.x + sx * 15, P.z + z, { check: false });
      put('topiary', P.x + sx * 21, P.z + z, { check: false }); if (z % 16 === 2) put('lamp_post', P.x + sx * 6.5, P.z + z, { yaw: faceYaw(-sx, 0), check: false });
    }
    for (const sx of [-1, 1]) { put('fountain', P.x + sx * 32, P.z + 22, { scale: 0.7, check: false }); put('gazebo', P.x + sx * 34, P.z - 10, { check: false }); }
    for (let z = -150; z >= -218; z -= 12) for (const sx of [-1, 1]) put('banner', sx * 7.6, z, { yaw: sx > 0 ? Math.PI : 0, check: false, name: 'Royal banner' });
    put('story_marker', P.x, P.z + 30, { name: 'Royal audience (story)', meta: { story: 'royal-audience' } });

    // ================================================================= DAWNMEADOW (safe start)
    put('save_point', 10, 372, { name: 'Dawnmeadow Waystone', meta: { savePoint: true } });
    put('portal', -24, 396, { yaw: faceYaw(1, -0.5), name: 'Dawnmeadow Portal', meta: { fastTravel: 'dawnmeadow' } });
    put('signpost', 7, 352, { yaw: Math.PI, name: 'Signpost: Aethelgard' });
    put('story_marker', -12, 360, { name: 'Prologue (story)', meta: { story: 'prologue' } });
    for (let k = 0; k < 18; k++) { const a = R() * 6.28, d = 18 + R() * 40; put(pick(['flower_bed', 'bush', 'bush', 'tree_birch', 'tree_oak']), Math.cos(a) * d, 380 + Math.sin(a) * d, { yaw: R() * 6.28 }); }
    for (const x of [20, 24]) put('training_dummy', x, 392, { name: 'Practice dummy' });
    put('npc_villager', -4, 378, { yaw: Math.PI, name: 'Dawnmeadow guide', meta: { npc: 'guide' } });

    // ================================================================= HOUSE ALDMERE (west, elegant gardens)
    const AL = { x: -392, z: -52 };
    put('manor_elegant', AL.x - 8, AL.z, { yaw: faceYaw(1, 0), name: 'Aldmere Manor', check: false });
    for (let z = -36; z <= 36; z += 12) for (const dx of [16, 28]) { put('hedge', AL.x + dx, AL.z + z, { yaw: Math.PI / 2 }); put('flower_bed', AL.x + dx + 6, AL.z + z, {}); }
    put('fountain', AL.x + 22, AL.z + 44, {}); put('gazebo', AL.x + 30, AL.z - 46, {}); put('statue', AL.x - 8, AL.z + 30, { yaw: Math.PI / 2 });
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; put('topiary', AL.x + Math.cos(a) * 58, AL.z + Math.sin(a) * 58, {}); }
    for (const z of [-14, 14]) put('lamp_post', AL.x + 12, AL.z + z, { yaw: faceYaw(1, 0) });
    for (const z of [-24, 24]) put('banner', AL.x + 14, AL.z + z, { name: 'Aldmere banner' });
    put('npc_guard', AL.x + 16, AL.z + 4, { yaw: faceYaw(1, 0) }); put('npc_merchant', AL.x + 24, AL.z - 10, { name: 'Lady Aldmere (placeholder)', meta: { faction: 'aldmere' } });

    // ================================================================= HOUSE BRENMOOR (south, granaries)
    const BR = { x: -352, z: 432 };
    put('manor_rustic', BR.x, BR.z, { yaw: faceYaw(0.3, -1), name: 'Brenmoor Hall', check: false });
    for (const [dx, dz] of [[-28, 10], [26, 14]]) put('barn', BR.x + dx, BR.z + dz, { yaw: faceYaw(0, -1) });
    for (const [dx, dz] of [[-30, -12], [-22, -16], [30, -10]]) put('silo', BR.x + dx, BR.z + dz, {});
    for (let k = 0; k < 10; k++) put('hay_bale', BR.x - 40 + R() * 80, BR.z + 22 + R() * 20, { yaw: R() * 6.28 });
    put('cart', BR.x + 12, BR.z - 18, { yaw: 0.6 }); put('well', BR.x - 10, BR.z - 20, {});
    put('npc_farmer', BR.x + 6, BR.z - 14, { name: 'Lord Brenmoor (placeholder)', meta: { faction: 'brenmoor' } });

    // ================================================================= HOUSE VARKHOLD (mountain bastion)
    const VK = { x: 318, z: -318 };
    put('keep_fortress', VK.x + 6, VK.z - 6, { yaw: faceYaw(-1, 1), name: 'Varkhold Keep', check: false });
    for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a - 2.5), Math.cos(a - 2.5))) < 0.35) continue; put('stone_wall', VK.x + Math.cos(a) * 36, VK.z + Math.sin(a) * 36, { yaw: alongYaw(-Math.sin(a), Math.cos(a)), check: false }); }
    for (const a of [0.6, 2.0, 3.4, 4.9]) put('watchtower', VK.x + Math.cos(a) * 44, VK.z + Math.sin(a) * 44, { name: 'Varkhold watchtower', check: false });
    put('camp', VK.x - 18, VK.z + 16, { yaw: 0.8, name: 'Varkhold soldiers camp' });
    for (const a of [2.3, 2.7]) put('npc_guard', VK.x + Math.cos(a) * 40, VK.z + Math.sin(a) * 40, { yaw: faceYaw(Math.cos(a), Math.sin(a)) });
    put('npc_guard', VK.x - 6, VK.z + 6, { name: 'Lord Varkhold (placeholder)', meta: { faction: 'varkhold' } });

    // ================================================================= FARM VALLEY
    const FV = { x: -265, z: 235 };
    for (let gx = -4; gx <= 4; gx++) for (let gz = -3; gz <= 3; gz++) {
      const x = FV.x + gx * 24 + (gz % 2) * 6, z = FV.z + gz * 18;
      if (Math.hypot(x - FV.x, z - FV.z) > 120 || terrain.roadDist(x, z) < 12 || terrain.riverDist(x, z) < 12) continue;
      if (put(R() < 0.55 ? 'field_wheat' : 'field_veg', x, z, { r: 8.4 }) && R() < 0.35) {
        for (const s of [-1, 1]) for (let f = -2; f <= 2; f++) put('fence', x + f * 4.2, z + s * 8.2, { pad: 0, check: false });
      }
    }
    put('windmill', FV.x + 40, FV.z + 70, { yaw: faceYaw(0, 1), name: 'Valley windmill' });
    for (const [dx, dz] of [[-60, -40], [30, -66], [-90, 30]]) { put('barn', FV.x + dx, FV.z + dz, { yaw: faceRoad(FV.x + dx, FV.z + dz) }); put('farmhouse', FV.x + dx + 18, FV.z + dz + 6, { yaw: faceRoad(FV.x + dx + 18, FV.z + dz + 6) }); }
    for (let k = 0; k < 6; k++) put('farmhouse', FV.x - 100 + R() * 200, FV.z - 100 + R() * 200, { yaw: R() * 6.28 });
    for (let k = 0; k < 5; k++) put('well', FV.x - 90 + R() * 180, FV.z - 90 + R() * 180, {});
    for (let k = 0; k < 30; k++) put('hay_bale', FV.x - 110 + R() * 220, FV.z - 110 + R() * 220, { yaw: R() * 6.28 });
    for (let k = 0; k < 6; k++) put('water_trough', FV.x - 90 + R() * 180, FV.z - 90 + R() * 180, { yaw: R() * 6.28 });
    for (let k = 0; k < 8; k++) put('npc_farmer', FV.x - 100 + R() * 200, FV.z - 100 + R() * 200, { yaw: R() * 6.28, meta: { faction: 'farms' } });

    // ================================================================= MOONPINE FOREST
    const FO = { x: 330, z: 190 };
    put('camp', FO.x + 96, FO.z + 72, { yaw: 2.2, name: 'Woodcutters camp', meta: { faction: 'forest' } });
    put('cave_entrance', FO.x + 150, FO.z - 50, { yaw: faceYaw(-1, 0.2), name: 'Moonpine Hollow (cave)' });
    for (const [dx, dz] of [[60, -90], [-70, 120], [140, 120]]) put('treasure_chest', FO.x + dx, FO.z + dz, { yaw: R() * 6.28 });
    for (const [dx, dz] of [[30, -40], [110, 30], [-30, 140], [170, 60]]) put('enemy_spawn', FO.x + dx, FO.z + dz, { meta: { enemy: 'forest-bandits' } });
    put('story_marker', FO.x - 20, FO.z + 40, { name: 'Moonpine shrine (story)', meta: { story: 'moonpine-shrine' } });
    for (let k = 0; k < 2600; k++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 225, x = FO.x + Math.cos(a) * d, z = FO.z + Math.sin(a) * d;
      if (terrain.roadDist(x, z) < 3 || terrain.riverDist(x, z) < 4 || Math.hypot(x - FO.x - 96, z - FO.z - 72) < 18) continue;
      const t = R(); put(t < 0.5 ? 'tree_moonpine' : t < 0.75 ? 'tree_pine' : t < 0.88 ? 'tree_oak' : t < 0.94 ? 'tree_birch' : 'bush', x, z, { yaw: R() * 6.28, scale: 0.8 + R() * 0.5, pad: 0.4 });
    }
    for (let k = 0; k < 120; k++) { const a = R() * 6.28, d = Math.sqrt(R()) * 220; put(pick(['rock', 'rock', 'log', 'boulder']), FO.x + Math.cos(a) * d, FO.z + Math.sin(a) * d, { yaw: R() * 6.28, scale: 0.7 + R() * 0.6 }); }

    // ================================================================= IRONPEAK MOUNTAINS
    put('mine_entrance', 250, -476, { yaw: faceYaw(0.1, 1), name: 'Ironpeak Mine', check: false });
    put('boss_arena', 410, -492, { name: 'The Shattered Crown', check: false, meta: { boss: 'placeholder' } });
    for (const [x, z] of [[150, -160], [232, -250], [262, -440]]) put('watchtower', x, z, { name: 'Pass watchtower' });
    put('camp', 210, -430, { yaw: 1.2, name: 'Miners camp' }); put('camp', 120, -330, { yaw: -0.5, name: 'Bandit camp', meta: { enemy: 'bandits' } });
    for (const [x, z] of [[140, -360], [300, -460], [380, -420], [200, -540]]) put('enemy_spawn', x, z, { meta: { enemy: 'mountain' } });
    for (const [x, z] of [[350, -520], [180, -390]]) put('treasure_chest', x, z, { yaw: R() * 6.28 });
    put('portal', 276, -282, { yaw: faceYaw(-1, 1), name: 'Varkhold Portal', check: false, meta: { fastTravel: 'varkhold' } });
    for (let k = 0; k < 2200; k++) {
      const x = -580 + R() * 1160, z = -590 + R() * 420, h = terrain.heightAt(x, z), s = terrain.slopeAt(x, z);
      if (h < 18 || terrain.roadDist(x, z) < 4 || terrain.riverDist(x, z) < 5) continue;
      if (h < 70 && s < 0.7 && R() < 0.6) put(R() < 0.8 ? 'tree_pine' : 'tree_birch', x, z, { yaw: R() * 6.28, scale: 0.8 + R() * 0.5, pad: 0.4 });
      else if (R() < 0.25) put(R() < 0.6 ? 'boulder' : 'cliff_rock', x, z, { yaw: R() * 6.28, scale: 0.7 + R() * 0.8 });
    }

    // ================================================================= countryside: scattered trees, rocks, riverbanks
    for (let k = 0; k < 2400; k++) {
      const x = -590 + R() * 1180, z = -590 + R() * 1180, reg = regionOf(x, z);
      if (['city', 'palace', 'forest', 'farms', 'aldmere', 'brenmoor', 'dawnmeadow', 'mountains', 'varkhold', 'arena'].includes(reg)) continue;
      if (terrain.roadDist(x, z) < 5 || terrain.riverDist(x, z) < 4 || terrain.slopeAt(x, z) > 0.8) continue;
      const clump = 0.5 + 0.5 * A.Noise.fbm(x / 70, z / 70, 3); if (R() > clump * 0.9) continue;
      const t = R(); put(t < 0.35 ? 'tree_oak' : t < 0.6 ? 'tree_pine' : t < 0.75 ? 'tree_birch' : t < 0.92 ? 'bush' : 'rock', x, z, { yaw: R() * 6.28, scale: 0.8 + R() * 0.5, pad: 0.4 });
    }
    for (const rv of terrain.rivers) for (let i = 4; i < rv.pts.length; i += 9) {
      const [x, z] = rv.pts[i], a = R() * 6.28, off = rv.width / 2 + 2 + R() * 4, side = R() < 0.5 ? -1 : 1;
      const [x1, z1] = rv.pts[Math.min(rv.pts.length - 1, i + 1)], l = Math.hypot(x1 - x, z1 - z) || 1;
      put(R() < 0.6 ? 'rock' : 'bush', x - (z1 - z) / l * off * side, z + (x1 - x) / l * off * side, { yaw: a, scale: 0.6 + R() * 0.6, pad: 0.2 });
    }
    return objs;
  }
  A.KingdomObjects = { generate, faceYaw, alongYaw };
})();
