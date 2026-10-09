/* Aethelos low-poly model library. Every placeable object type is built once from simple shapes into one merged,
   vertex-coloured geometry (plus an optional emissive "glow" part for lanterns, crystals, portals) and drawn with GPU
   instancing. Each type also declares its collision shapes (boxes / circles in local space) and walkable decks (bridges).
   Replace any type with a real GLB later by giving it the same id. */
(() => {
  const A = window.Aethelos ||= {};
  const C = {   // palette
    plaster: 0xe6d9bf, plaster2: 0xd8c39d, plaster3: 0xefe6d4, timber: 0x6b4a2e, wood: 0x8a6239, darkwood: 0x4e3622,
    stone: 0x9a948c, stone2: 0x847e76, lightstone: 0xc4bdb1, white: 0xebe6dc, gold: 0xd8b04a, royal: 0x2f4f8f,
    red: 0xa63a2c, roofRed: 0xa8432f, roofSlate: 0x4b5d73, roofBrown: 0x7a4a2c, roofGreen: 0x4f6b45, roofDark: 0x4a403a,
    glass: 0x2c3a4a, door: 0x5a3b22, leaf: 0x3f7f3a, leaf2: 0x5c9a42, pine: 0x2f6a45, moonpine: 0x2b5a4c, trunk: 0x6a4a30,
    birch: 0xe4e0d6, hay: 0xd9b45a, soil: 0x6e5034, wheat: 0xd8b85a, veg: 0x5f9c3c, cloth1: 0xc0392b, cloth2: 0xf3e9d2,
    cloth3: 0x2e6da4, skin: 0xe2b48c, rock: 0x8d8984, rock2: 0x76726c, water: 0x4a9ccc, black: 0x1d1a18, iron: 0x55595e,
    lantern: 0xffd27a, crystal: 0x86e0ff, portal: 0x9b7bff, ember: 0xff8a3a, flowerR: 0xd84a5a, flowerY: 0xf0c94a, flowerB: 0x6a7fd8
  };
  // ---------------------------------------------------------------- mesh builder
  // which surface material each palette colour gets (Aethelos.Mat.M ids); per-primitive override with { mat: 'name' }
  const MATS = { PLAIN: 0, STONE: 1, MARBLE: 2, PLASTER: 3, WOOD: 4, DOOR: 5, BARK: 6, METAL: 7, ROCK: 8, SLATE: 9, SOIL: 10, ROOF: 11, LEAF: 12, GLASS: 13, STRAW: 14, COBBLE: 15, WATER: 16, GOLD: 17, CLOTH: 18, BIRCH: 19, LEAFCARD: 20 };
  const MAT_OF = new Map(Object.entries({
    stone: 'STONE', stone2: 'STONE', lightstone: 'MARBLE', white: 'PLASTER', plaster: 'PLASTER', plaster2: 'PLASTER', plaster3: 'PLASTER',
    timber: 'WOOD', wood: 'WOOD', darkwood: 'WOOD', red: 'WOOD', door: 'DOOR', trunk: 'BARK', birch: 'BIRCH', iron: 'METAL', gold: 'GOLD',
    rock: 'ROCK', rock2: 'SLATE', soil: 'SOIL', roofRed: 'ROOF', roofSlate: 'ROOF', roofBrown: 'ROOF', roofGreen: 'ROOF', roofDark: 'ROOF', royal: 'CLOTH',
    leaf: 'LEAF', leaf2: 'LEAF', pine: 'LEAF', moonpine: 'LEAF', veg: 'LEAF', glass: 'GLASS', hay: 'STRAW', wheat: 'STRAW', water: 'WATER',
    cloth1: 'CLOTH', cloth2: 'CLOTH', cloth3: 'CLOTH'
  }).map(([k, m]) => [C[k], MATS[m]]));
  // ---------------------------------------------------------------- mesh builder
  class MB {
    constructor(THREE) { this.T = THREE; this.parts = { std: [], glow: [] }; this.lights = []; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); }
    add(geo, color, [x = 0, y = 0, z = 0] = [], { rx = 0, ry = 0, rz = 0, s = null, part = 'std', jitter = 0.05, mat = null, smooth = false, center = null, card = -1, needles = false } = {}) {
      const T = this.T, g = geo.index ? geo.toNonIndexed() : geo;
      if (smooth) {                                   // spherical normals (foliage balls): soft, rounded shading
        const p = g.attributes.position, nn = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) { const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), l = Math.hypot(vx, vy, vz) || 1; nn.set([vx / l, vy / l, vz / l], i * 3); }
        g.setAttribute('normal', new T.BufferAttribute(nn, 3));
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      this.e.set(rx, ry, rz); this.q.setFromEuler(this.e);
      this.m.compose(new T.Vector3(x, y, z), this.q, s ? new T.Vector3(...(Array.isArray(s) ? s : [s, s, s])) : new T.Vector3(1, 1, 1));
      g.applyMatrix4(this.m);
      if (center) {                                    // foliage cards: normals point out of the crown, so it shades like a soft mass
        const p = g.attributes.position, nn = g.attributes.normal;
        for (let i = 0; i < p.count; i++) { const vx = p.getX(i) - center[0], vy = (p.getY(i) - center[1]) * 1.3, vz = p.getZ(i) - center[2], l = Math.hypot(vx, vy, vz) || 1; nn.setXYZ(i, vx / l, vy / l, vz / l); }
      }
      const c = new T.Color(color), p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
      for (let f = 0; f < n; f += 3) {
        const k = 1 + jitter * (((Math.sin((p.getX(f) * 12.9898 + p.getY(f) * 78.233 + p.getZ(f) * 37.719)) * 43758.5453) % 1 + 1) % 1 - 0.5) * 2;
        for (let v = 0; v < 3 && f + v < n; v++) { col[(f + v) * 3] = c.r * k; col[(f + v) * 3 + 1] = c.g * k; col[(f + v) * 3 + 2] = c.b * k; }
      }
      // material id + long axis of this primitive (wood grain direction)
      g.computeBoundingBox(); const sz = g.boundingBox.getSize(new T.Vector3()), axis = sz.x >= sz.y && sz.x >= sz.z ? 0 : sz.y >= sz.z ? 1 : 2;
      const id = mat != null ? MATS[mat.toUpperCase()] : (MAT_OF.has(color) ? MAT_OF.get(color) : 0), ma = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { ma[i * 2] = id; ma[i * 2 + 1] = axis; }
      const luv = new Float32Array(n * 2);
      if (card >= 0 && g.attributes.uv) { const uv = g.attributes.uv; for (let i = 0; i < n; i++) { luv[i * 2] = uv.getX(i) + 2 * card; luv[i * 2 + 1] = uv.getY(i) + (needles ? 2 : 0); } }
      this.parts[part].push({ pos: p.array.slice(), nrm: g.attributes.normal.array.slice(), col, mat: ma, luv });
      return this;
    }
    box(w, h, d, at, color, o) { return this.add(new this.T.BoxGeometry(w, h, d), color, [at[0], at[1] + h / 2, at[2]], o); }      // at = base centre
    cyl(rt, rb, h, seg, at, color, o) { return this.add(new this.T.CylinderGeometry(rt, rb, h, seg), color, [at[0], at[1] + h / 2, at[2]], o); }
    cone(r, h, seg, at, color, o) { return this.add(new this.T.ConeGeometry(r, h, seg), color, [at[0], at[1] + h / 2, at[2]], o); }
    ball(r, detail, at, color, o = {}) { return this.add(new this.T.IcosahedronGeometry(r, detail), color, at, { smooth: MAT_OF.get(color) === MATS.LEAF, ...o }); }
    rock(r, at, color, o) { return this.add(new this.T.DodecahedronGeometry(r, 0), color, at, o); }
    /* gable roof: ridge along x, width w (x) depth d (z), height h, base at y */
    gable(w, d, h, at, color, o = {}) {
      const T = this.T, g = new T.BufferGeometry(), x = w / 2, z = d / 2;
      const v = [-x, 0, -z, x, 0, -z, x, h, 0, -x, 0, -z, x, h, 0, -x, h, 0,  -x, 0, z, -x, h, 0, x, h, 0, -x, 0, z, x, h, 0, x, 0, z,
                 -x, 0, -z, -x, h, 0, -x, 0, z,  x, 0, -z, x, 0, z, x, h, 0,  -x, 0, -z, -x, 0, z, x, 0, z, -x, 0, -z, x, 0, z, x, 0, -z];
      g.setAttribute('position', new T.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
      return this.add(g, color, at, o);
    }
    hip(w, d, h, at, color, o = {}) { const g = new this.T.ConeGeometry(Math.SQRT1_2, 1, 4).toNonIndexed(); g.rotateY(Math.PI / 4); g.scale(w, h, d); g.deleteAttribute('normal'); g.computeVertexNormals(); return this.add(g, color, [at[0], at[1] + h / 2, at[2]], o); }
    light(x, y, z, kind = 'lamp') { this.lights.push({ x, y, z, kind }); return this; }
    finish() {
      const T = this.T, out = {};
      for (const [k, list] of Object.entries(this.parts)) {
        if (!list.length) continue;
        const n = list.reduce((s, p) => s + p.pos.length, 0), pos = new Float32Array(n), nrm = new Float32Array(n), col = new Float32Array(n), mat = new Float32Array(n / 3 * 2), luv = new Float32Array(n / 3 * 2); let o = 0, om = 0;
        for (const p of list) { pos.set(p.pos, o); nrm.set(p.nrm, o); col.set(p.col, o); mat.set(p.mat, om); luv.set(p.luv, om); o += p.pos.length; om += p.mat.length; }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
        g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('mat', new T.BufferAttribute(mat, 2)); g.setAttribute('luv', new T.BufferAttribute(luv, 2));
        g.computeBoundingSphere(); out[k] = g;
      }
      return out;
    }
  }
  // ---------------------------------------------------------------- shared details
  const win = (b, x, y, z, ry = 0, w = 0.9, h = 1.1) => { b.box(w + 0.2, h + 0.2, 0.12, [x, y - 0.1, z], C.timber, { ry }); b.box(w, h, 0.16, [x, y, z], C.glass, { ry }); };
  const door = (b, x, z, ry = 0, w = 1.2, h = 2.2) => { b.box(w + 0.3, h + 0.15, 0.14, [x, 0, z], C.timber, { ry }); b.box(w, h, 0.2, [x, 0, z], C.door, { ry }); };
  const chimney = (b, x, y, z, h = 2.2) => b.box(0.8, h, 0.8, [x, y, z], C.stone2);
  const lanternGlow = (b, x, y, z, r = 0.18) => { b.light(x, y + r * 1.2, z); return b.box(r * 2, r * 2.4, r * 2, [x, y, z], C.lantern, { part: 'glow', jitter: 0 }); };
  function house(b, { w, d, h, roof, wall, roofH = 2.6, story2 = false, hipped = false }) {
    b.box(w + 0.3, 0.5, d + 0.3, [0, 0, 0], C.stone2);
    b.box(w, h, d, [0, 0.4, 0], wall);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.3, h, 0.3, [sx * (w / 2 - 0.05), 0.4, sz * (d / 2 - 0.05)], C.timber);
    b.box(w + 0.1, 0.25, d + 0.1, [0, 0.4 + h - 0.25, 0], C.timber);
    if (story2) { b.box(w + 0.1, 0.25, d + 0.1, [0, 0.4 + h / 2 - 0.1, 0], C.timber); }
    if (hipped) b.hip(w + 1.2, d + 1.2, roofH, [0, 0.4 + h, 0], roof); else b.gable(w + 1.0, d + 1.2, roofH, [0, 0.4 + h, 0], roof);
    door(b, 0, d / 2 + 0.02);
    const rows = story2 ? [1.4, 1.4 + h / 2] : [1.4];
    for (const y of rows) for (const x of (w > 9 ? [-w / 3, w / 3] : [-w / 4 - 0.4, w / 4 + 0.4])) win(b, x, y + 0.4, d / 2 + 0.02);
    for (const y of rows) { win(b, w / 2 + 0.02, y + 0.4, 0, Math.PI / 2); win(b, -w / 2 - 0.02, y + 0.4, 0, Math.PI / 2); }
    if (story2) win(b, 0, 1.4 + h / 2 + 0.4, d / 2 + 0.02);
    return b;
  }
  function figure(b, cloth, { hat = null, spear = false, x = 0, z = 0 } = {}) {
    b.cyl(0.11, 0.13, 0.85, 6, [x - 0.12, 0, z], C.darkwood).cyl(0.11, 0.13, 0.85, 6, [x + 0.12, 0, z], C.darkwood);
    b.cyl(0.26, 0.32, 0.75, 8, [x, 0.8, z], cloth);
    b.cyl(0.08, 0.09, 0.62, 6, [x - 0.36, 0.95, z], cloth, { rz: 0.12 }).cyl(0.08, 0.09, 0.62, 6, [x + 0.36, 0.95, z], cloth, { rz: -0.12 });
    b.ball(0.2, 1, [x, 1.78, z], C.skin);
    if (hat) b.cone(0.3, 0.32, 8, [x, 1.9, z], hat);
    if (spear) { b.cyl(0.03, 0.03, 2.6, 5, [x + 0.45, 0, z + 0.1], C.wood); b.cone(0.07, 0.3, 5, [x + 0.45, 2.6, z + 0.1], C.iron); }
  }
  /* level of detail while building: 0 full, 1 mid distance (fewer, larger cards), 2 far (silhouette only) */
  let LOD = 0;
  /* a crown of leaf cards around (cx,cy,cz): n cards within radius r (each card shows a few procedural leaves) */
  function foliage(b, cx, cy, cz, r, color, n, { size = 1.4, seed = 1, flat = 0.8, droop = 0 } = {}) {
    let sd = Math.floor(seed * 7919) % 2147483646 + 1; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    if (LOD === 2) return;
    if (LOD === 1) { n = Math.max(3, Math.round(n * 0.4)); size *= 1.45; }
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = r * Math.cbrt(0.3 + 0.7 * rnd()), q = Math.sqrt(1 - u * u);
      const sz = size * (0.7 + 0.6 * rnd());
      b.add(new b.T.PlaneGeometry(sz, sz), color, [cx + q * Math.cos(th) * rr, cy + u * rr * flat - droop * (1 - u) * 0.5, cz + q * Math.sin(th) * rr],
        { rx: rnd() * Math.PI, ry: rnd() * Math.PI * 2, rz: rnd() * Math.PI, mat: 'leafcard', center: [cx, cy, cz], card: Math.floor(rnd() * 60), jitter: 0.14 });
    }
  }
  /* a pine tier: a dark core cone plus drooping needle cards around its rim */
  function pineTier(b, y, r, h, color, n, seed) {
    b.cone(LOD === 2 ? r : r * 0.8, h, LOD ? 6 : 8, [0, y, 0], color, { jitter: 0.08 });
    let sd = seed * 48271 % 2147483646 + 1; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    if (LOD === 2) return;
    const cards = LOD === 1 ? Math.max(4, Math.round(n * 0.7)) : n * 2, grow = LOD === 1 ? 1.35 : 1;
    for (let i = 0; i < cards; i++) {
      const a = i / cards * Math.PI * 2 + rnd() * 0.4, rr = r * (0.5 + 0.4 * rnd()), sz = r * (0.6 + 0.35 * rnd()) * grow;
      b.add(new b.T.PlaneGeometry(sz, sz * 1.2), color, [Math.cos(a) * rr, y + h * (0.25 + 0.2 * rnd()), Math.sin(a) * rr],
        { rx: -0.9 - 0.3 * rnd(), ry: -a + Math.PI / 2, rz: (rnd() - 0.5) * 0.6, mat: 'leafcard', center: [0, y + h * 0.4, 0], card: Math.floor(rnd() * 60), jitter: 0.1, needles: true });
    }
  }
  function tent(b, x, z, ry, color) { b.add(new b.T.ConeGeometry(1.8, 2.2, 4), color, [x, 1.1, z], { ry: ry + Math.PI / 4 }); }
  function crenels(b, len, y, t, color, ax = 'x') {
    for (let i = -len / 2 + 0.6; i <= len / 2 - 0.6; i += 1.6) b.box(ax === 'x' ? 0.8 : t, 0.9, ax === 'x' ? t : 0.8, ax === 'x' ? [i, y, 0] : [0, y, i], color);
  }
  function tower(b, r, h, color, roof, { x = 0, z = 0, roofH = null, finial = false } = {}) {
    b.cyl(r, r * 1.08, h, 12, [x, 0, z], color);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; b.box(0.8, 0.9, 0.8, [x + Math.cos(a) * (r - 0.3), h, z + Math.sin(a) * (r - 0.3)], color); }
    if (roof) b.cone(r * 1.15, roofH || r * 2.2, 12, [x, h + 0.2, z], roof);
    if (finial) { b.cyl(0.08, 0.08, 1.6, 5, [x, h + 0.2 + (roofH || r * 2.2), z], C.gold); b.ball(0.22, 0, [x, h + 1.8 + (roofH || r * 2.2), z], C.gold); }
    for (let i = 0; i < 3; i++) { const a = i * 2.1; win(b, x + Math.cos(a) * (r + 0.02), h * (0.45 + 0.15 * i), z + Math.sin(a) * (r + 0.02), -a + Math.PI / 2, 0.6, 1.0); }
  }
  function pillarRing(b, n, R, h, color, broken = false) {
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, hh = broken ? h * (0.45 + 0.55 * ((i * 7919) % 5) / 4) : h; b.cyl(0.7, 0.85, hh, 8, [Math.cos(a) * R, 0, Math.sin(a) * R], color); }
  }
  // ---------------------------------------------------------------- catalogue
  // each: {label, category, build(b), col: [colliders], deck: [walkable decks], radius (LOD), shadow}
  const box = (w, d, x = 0, z = 0, h = 6) => ({ k: 'box', w, d, x, z, h });
  const circ = (r, x = 0, z = 0, h = 4) => ({ k: 'circ', r, x, z, h });
  const T = {};
  const def = (id, label, category, build, extra = {}) => { T[id] = { id, label, category, build, col: [], deck: [], ...extra }; };

  // --- city houses
  def('house_cottage', 'Cottage', 'Houses', b => { house(b, { w: 7, d: 6, h: 3.4, roof: C.roofRed, wall: C.plaster }); chimney(b, 2, 4.6, -1); }, { col: [box(7.4, 6.4)] });
  def('house_cottage_b', 'Cottage (slate)', 'Houses', b => { house(b, { w: 7, d: 6, h: 3.4, roof: C.roofSlate, wall: C.plaster2 }); chimney(b, -2, 4.6, -1); }, { col: [box(7.4, 6.4)] });
  def('house_two', 'Townhouse', 'Houses', b => { house(b, { w: 7.5, d: 7, h: 6.4, roof: C.roofBrown, wall: C.plaster3, story2: true, hipped: true, roofH: 3 }); chimney(b, 2.2, 6.6, 1.5); }, { col: [box(7.9, 7.4)] });
  def('house_two_b', 'Townhouse (green)', 'Houses', b => { house(b, { w: 7.5, d: 7, h: 6.4, roof: C.roofGreen, wall: C.plaster, story2: true, hipped: true, roofH: 3 }); }, { col: [box(7.9, 7.4)] });
  def('house_long', 'Longhouse', 'Houses', b => { house(b, { w: 12, d: 6, h: 3.6, roof: C.roofDark, wall: C.plaster2 }); chimney(b, -4, 4.9, 0.5); door(b, 3.5, 3.02); }, { col: [box(12.4, 6.4)] });
  def('house_tower', 'Tall house', 'Houses', b => { house(b, { w: 5, d: 5, h: 9, roof: C.roofSlate, wall: C.plaster3, story2: true, hipped: true, roofH: 3.6 }); }, { col: [box(5.4, 5.4)] });
  def('shop', 'Shop', 'Shops', b => {
    house(b, { w: 8, d: 7, h: 6.2, roof: C.roofRed, wall: C.plaster3, story2: true, roofH: 3 });
    for (let i = 0; i < 6; i++) b.box(8.4 / 6, 0.12, 2.2, [-4.2 + 8.4 / 12 + i * 8.4 / 6, 3.0, 4.4], i % 2 ? C.cloth2 : C.cloth1, { rx: -0.35 });
    b.box(2.4, 0.9, 0.12, [0, 4.0, 3.62], C.wood); b.box(1.2, 0.9, 1.2, [-2.8, 0, 4.6], C.wood).box(1, 0.8, 1, [-3.9, 0, 4.4], C.wood);
  }, { col: [box(8.4, 7.4), box(1.4, 1.4, -3.2, 4.5)] });
  def('general_store', 'General store', 'Stores', b => {
    house(b, { w: 11, d: 7, h: 4, roof: C.roofBrown, wall: C.plaster2, roofH: 2.8 });
    b.box(4.5, 1.1, 0.15, [0, 3.1, 3.62], C.darkwood); b.box(4.1, 0.8, 0.2, [0, 3.25, 3.66], C.gold);
    for (const x of [-4.2, -3.3, 3.6]) b.cyl(0.45, 0.45, 1.1, 8, [x, 0, 4.4], C.wood);
  }, { col: [box(11.4, 7.4), box(2.4, 1.2, -3.8, 4.4)] });
  def('tavern', 'Tavern', 'Restaurants', b => {
    house(b, { w: 13, d: 9, h: 7, roof: C.roofDark, wall: C.plaster, story2: true, roofH: 3.8 });
    chimney(b, 4.5, 8.4, -2, 3); chimney(b, -4.5, 8.4, -2, 3);
    b.cyl(0.06, 0.06, 1.6, 5, [4.4, 3.4, 5.2], C.iron, { rx: Math.PI / 2 }); b.box(1.4, 1.0, 0.1, [4.4, 3.0, 5.6], C.wood); b.box(1.0, 0.6, 0.12, [4.4, 3.2, 5.62], C.gold);
    for (const x of [-4, -1.5]) { b.box(2.2, 0.8, 0.8, [x, 0, 6], C.wood); b.box(2.2, 0.1, 0.35, [x, 0.45, 6.8], C.darkwood); }
    lanternGlow(b, -1.2, 2.6, 4.7); lanternGlow(b, 1.2, 2.6, 4.7);
  }, { col: [box(13.4, 9.4), box(6, 1.6, -2.7, 6.3)] });
  def('restaurant', 'Restaurant', 'Restaurants', b => {
    house(b, { w: 9, d: 7, h: 3.8, roof: C.roofGreen, wall: C.plaster3, roofH: 2.6 });
    for (const x of [-2.5, 2.5]) { b.cyl(0.7, 0.7, 0.08, 8, [x, 0.8, 5.8], C.cloth2); b.cyl(0.08, 0.1, 0.8, 5, [x, 0, 5.8], C.darkwood); b.cyl(0.04, 0.04, 2.4, 4, [x, 0, 5.8], C.wood); b.cone(1.5, 0.7, 8, [x, 2.4, 5.8], x < 0 ? C.cloth1 : C.cloth3); }
  }, { col: [box(9.4, 7.4), circ(0.9, -2.5, 5.8), circ(0.9, 2.5, 5.8)] });
  def('guild_hall', 'Adventure Guild hall', 'Adventure Guild', b => {
    b.box(19, 0.8, 14, [0, 0, 0], C.stone2); b.box(18, 4.5, 13, [0, 0.7, 0], C.stone);
    b.box(18.2, 4.2, 13.2, [0, 5.1, 0], C.plaster2); for (const x of [-8.9, -4.5, 0, 4.5, 8.9]) b.box(0.4, 4.2, 13.3, [x, 5.1, 0], C.timber);
    b.gable(19.5, 14.6, 6.5, [0, 9.3, 0], C.roofRed); b.gable(5, 7, 4.2, [0, 10, 7], C.roofRed, { ry: Math.PI / 2 });
    for (const x of [-3.4, 3.4]) b.cyl(0.45, 0.5, 5, 10, [x, 0.7, 8.2], C.lightstone); b.box(8, 0.5, 3, [0, 5.6, 8.2], C.stone);
    b.box(9, 0.4, 3.6, [0, 0, 8.2], C.stone2);
    b.box(2.8, 3.6, 0.3, [0, 0.7, 6.55], C.door); b.box(3.2, 0.25, 0.35, [0, 4.3, 6.55], C.gold);
    b.box(2.2, 2.2, 0.2, [0, 7.4, 6.7], C.royal); b.box(2.8, 0.18, 0.25, [0, 8.4, 6.75], C.gold, { rz: 0.75 }).box(2.8, 0.18, 0.25, [0, 8.4, 6.75], C.gold, { rz: -0.75 });
    for (const x of [-6, 6]) { b.cyl(0.06, 0.06, 6, 5, [x, 9.6, 6.7], C.wood); b.box(1.4, 2.2, 0.06, [x + 0.75, 13.2, 6.7], C.cloth1); }
    for (const x of [-6.5, 6.5]) for (const y of [2.4, 6.6]) win(b, x, y, 6.62, 0, 1.2, 1.4);
    lanternGlow(b, -1.9, 3.1, 7); lanternGlow(b, 1.9, 3.1, 7);
  }, { col: [box(19, 14), circ(0.6, -3.4, 8.2), circ(0.6, 3.4, 8.2)] });
  def('quest_board', 'Quest board', 'Adventure Guild', b => {
    b.cyl(0.1, 0.12, 2.6, 5, [-1.4, 0, 0], C.wood).cyl(0.1, 0.12, 2.6, 5, [1.4, 0, 0], C.wood);
    b.box(3.2, 1.8, 0.15, [0, 0.8, 0], C.darkwood); b.gable(3.6, 0.6, 0.5, [0, 2.6, 0], C.roofBrown);
    for (const [x, y] of [[-1, 1.1], [-0.2, 1.3], [0.7, 1.0], [1.1, 1.6], [-0.9, 1.9], [0.2, 1.8]]) b.box(0.55, 0.45, 0.05, [x, y, 0.09], C.cloth2, { rz: (x * 7 % 3 - 1) * 0.08 });
  }, { col: [box(3.4, 0.5, 0, 0, 3)] });
  def('market_stall', 'Market stall', 'City', b => {
    b.box(3, 1, 1.6, [0, 0, 0], C.wood); for (const x of [-1.4, 1.4]) for (const z of [-0.8, 0.8]) b.cyl(0.06, 0.06, 2.6, 4, [x, 0, z], C.darkwood);
    for (let i = 0; i < 5; i++) b.box(0.66, 0.08, 2.4, [-1.32 + i * 0.66, 2.6, 0], i % 2 ? C.cloth2 : C.cloth3, { rx: 0.2 });
    for (let i = 0; i < 6; i++) b.ball(0.16, 0, [-1 + i * 0.4, 1.12, 0.2], [C.flowerR, C.flowerY, C.veg][i % 3]);
  }, { col: [box(3.1, 1.8, 0, 0, 2)] });
  def('fountain', 'Fountain', 'City', b => {
    b.cyl(4, 4.2, 0.9, 10, [0, 0, 0], C.lightstone); b.cyl(3.5, 3.5, 0.05, 10, [0, 0.82, 0], C.water, { jitter: 0.02 });
    b.cyl(0.6, 0.8, 2.6, 8, [0, 0.8, 0], C.lightstone); b.cyl(1.4, 0.4, 0.4, 8, [0, 3.2, 0], C.lightstone); b.cyl(0.25, 0.3, 1, 6, [0, 3.6, 0], C.lightstone); b.ball(0.35, 0, [0, 4.8, 0], C.gold);
  }, { col: [circ(4.2)] });
  def('statue', 'Hero statue', 'Decorations', b => {
    b.box(3, 1.6, 3, [0, 0, 0], C.stone2); b.box(2.4, 0.4, 2.4, [0, 1.6, 0], C.lightstone);
    b.cyl(0.35, 0.45, 2.2, 8, [0, 2, 0], C.lightstone); b.ball(0.38, 1, [0, 4.6, 0], C.lightstone); b.box(0.2, 3.2, 0.2, [0.7, 2.5, 0.2], C.lightstone, { rz: -0.2 });
    b.cyl(0.14, 0.14, 1.1, 6, [-0.55, 2.4, 0], C.lightstone, { rz: 0.4 }).cyl(0.14, 0.14, 1.1, 6, [0.55, 3.2, 0], C.lightstone, { rz: -1.2 });
  }, { col: [box(3.1, 3.1)] });
  def('city_wall', 'City wall', 'City', b => { b.box(14, 7, 2.6, [0, 0, 0], C.stone); b.box(14, 0.4, 3, [0, 7, 0], C.stone2); crenels(b, 14, 7.4, 0.6, C.stone); }, { col: [box(14, 2.8, 0, 0, 8)], shadow: true });
  def('wall_tower', 'Wall tower', 'City', b => tower(b, 4.2, 11, C.stone, C.roofSlate), { col: [circ(4.4, 0, 0, 12)] });
  def('city_gate', 'City gate', 'City', b => {
    for (const x of [-7, 7]) tower(b, 3.6, 12, C.stone, C.roofSlate, { x });
    b.box(10.4, 4, 3, [0, 7.4, 0], C.stone); crenels(b, 10.4, 11.4, 0.7, C.stone);
    b.box(9.2, 0.6, 3.2, [0, 7.0, 0], C.stone2); b.box(1.8, 1.4, 0.15, [0, 9, 1.55], C.royal); b.box(0.9, 0.9, 0.16, [0, 9.2, 1.6], C.gold);
    for (const x of [-6, 6]) lanternGlow(b, x * 0.82, 4.2, 1.8);
  }, { col: [circ(3.8, -7, 0, 12), circ(3.8, 7, 0, 12)] });
  def('lamp_post', 'Street lamp', 'Decorations', b => {
    b.cyl(0.18, 0.24, 0.4, 6, [0, 0, 0], C.iron); b.cyl(0.07, 0.09, 3.4, 6, [0, 0.4, 0], C.iron); b.box(0.9, 0.08, 0.08, [0.3, 3.6, 0], C.iron);
    b.box(0.46, 0.08, 0.46, [0.65, 3.4, 0], C.iron); lanternGlow(b, 0.65, 2.98, 0, 0.17); b.cone(0.34, 0.3, 4, [0.65, 3.48, 0], C.iron, { ry: Math.PI / 4 });
  }, { col: [circ(0.3, 0, 0, 3.5)], lamp: true });
  def('bench', 'Bench', 'Decorations', b => { b.box(1.8, 0.1, 0.5, [0, 0.45, 0], C.wood); b.box(1.8, 0.45, 0.08, [0, 0.55, -0.22], C.wood); for (const x of [-0.75, 0.75]) b.box(0.1, 0.45, 0.45, [x, 0, 0], C.iron); }, { col: [box(1.9, 0.6, 0, 0, 1)] });
  def('barrel', 'Barrel', 'Decorations', b => { b.cyl(0.45, 0.4, 1.1, 8, [0, 0, 0], C.wood); b.cyl(0.47, 0.47, 0.08, 8, [0, 0.25, 0], C.iron); b.cyl(0.47, 0.47, 0.08, 8, [0, 0.8, 0], C.iron); }, { col: [circ(0.5, 0, 0, 1.1)] });
  def('crate', 'Crate', 'Decorations', b => { b.box(1, 1, 1, [0, 0, 0], C.wood); b.box(1.04, 0.12, 1.04, [0, 0.44, 0], C.darkwood); }, { col: [box(1.05, 1.05, 0, 0, 1)] });
  def('cart', 'Cart', 'Decorations', b => { b.box(2.6, 0.7, 1.5, [0, 0.7, 0], C.wood); for (const z of [-0.85, 0.85]) b.cyl(0.6, 0.6, 0.12, 10, [0, 0.6, z], C.darkwood, { rx: Math.PI / 2 }); b.box(1.8, 0.08, 0.08, [-2.1, 0.9, 0.4], C.wood).box(1.8, 0.08, 0.08, [-2.1, 0.9, -0.4], C.wood); b.box(2.2, 0.5, 1.2, [0, 1.4, 0], C.hay); }, { col: [box(2.8, 1.8, 0, 0, 1.8)] });
  def('signpost', 'Signpost', 'Decorations', b => { b.cyl(0.08, 0.1, 2.6, 5, [0, 0, 0], C.wood); b.box(1.3, 0.3, 0.06, [0.55, 2.1, 0], C.wood, { ry: 0.3 }).box(1.2, 0.3, 0.06, [-0.5, 1.7, 0], C.wood, { ry: -0.5 }); }, { col: [circ(0.2, 0, 0, 2.5)] });

  def('plaza', 'Plaza paving', 'City', b => { b.cyl(30, 30, 0.12, 32, [0, 0.02, 0], C.lightstone, { jitter: 0.03 }); b.cyl(29, 29, 0.14, 32, [0, 0.02, 0], 0xb3aca0, { jitter: 0.03, mat: 'cobble' }); for (let i = 0; i < 4; i++) b.cyl(22 - i * 5, 22 - i * 5, 0.16, 32, [0, 0.02, 0], i % 2 ? 0xa59e92 : 0xbdb6aa, { jitter: 0.02, mat: 'cobble' }); }, { flat: true });
  // --- palace
  def('palace_keep', 'Palace keep', 'Palace', b => {
    b.box(36, 1.2, 26, [0, 0, 0], C.lightstone); b.box(34, 14, 24, [0, 1.2, 0], C.white);
    for (let i = 0; i < 2; i++) for (const x of [-12, -6, 0, 6, 12]) win(b, x, 4 + i * 5.5, 12.03, 0, 1.4, 2.6);
    b.hip(36, 26, 8, [0, 15.2, 0], C.royal); b.box(34.4, 0.6, 24.4, [0, 14.8, 0], C.gold);
    tower(b, 5.2, 26, C.white, C.royal, { roofH: 12, finial: true }); for (const [x, z] of [[-17, -12], [17, -12], [-17, 12], [17, 12]]) tower(b, 3.4, 20, C.white, C.royal, { x, z, roofH: 8, finial: true });
    b.box(9, 9, 2, [0, 1.2, 12.6], C.lightstone); b.box(5, 6.4, 0.4, [0, 1.2, 13.6], C.door); b.box(5.6, 0.5, 0.5, [0, 7.6, 13.6], C.gold); b.gable(10, 3, 3, [0, 10.2, 12.6], C.royal, { ry: Math.PI / 2 });
    for (let i = 0; i < 6; i++) b.box(12 - i * 0.4, 0.3, 1.2, [0, 0.9 - i * 0.15, 15.6 + i * 1.1], C.lightstone);
    for (const x of [-3.6, 3.6]) { b.cyl(0.6, 0.7, 9, 10, [x, 1.2, 14.4], C.white); lanternGlow(b, x, 6, 15.2, 0.25); }
  }, { col: [box(36, 26), circ(3.6, -17, -12), circ(3.6, 17, -12), circ(3.6, -17, 12), circ(3.6, 17, 12), box(10, 3, 0, 13)], shadow: true });
  def('palace_tower', 'Palace tower', 'Palace', b => tower(b, 4.5, 22, C.white, C.royal, { roofH: 10, finial: true }), { col: [circ(4.7, 0, 0, 22)] });
  def('palace_wall', 'Palace wall', 'Palace', b => { b.box(14, 6, 2.2, [0, 0, 0], C.white); b.box(14, 0.4, 2.6, [0, 6, 0], C.gold); crenels(b, 14, 6.4, 0.5, C.white); }, { col: [box(14, 2.4, 0, 0, 7)] });
  def('palace_gate', 'Palace gate', 'Palace', b => {
    for (const x of [-7.5, 7.5]) tower(b, 3.2, 13, C.white, C.royal, { x, roofH: 7, finial: true });
    b.box(11.6, 4.6, 2.6, [0, 7.6, 0], C.white); b.box(10.4, 0.5, 2.8, [0, 7.4, 0], C.gold); crenels(b, 11.6, 12.2, 0.6, C.white);
    b.box(2.4, 2.4, 0.15, [0, 9.2, 1.36], C.royal); b.ball(0.6, 0, [0, 10.4, 1.4], C.gold);
    for (const x of [-4.2, 4.2]) lanternGlow(b, x, 5, 1.6, 0.22);
  }, { col: [circ(3.4, -7.5, 0, 13), circ(3.4, 7.5, 0, 13)] });
  def('banner', 'Royal banner', 'Decorations', b => { b.cyl(0.08, 0.1, 7, 6, [0, 0, 0], C.iron); b.ball(0.18, 0, [0, 7.1, 0], C.gold); b.box(1.8, 0.1, 0.1, [0.85, 6.6, 0], C.iron); b.box(1.6, 3.4, 0.05, [0.85, 3.2, 0], C.royal); b.box(0.9, 0.9, 0.06, [0.85, 5.0, 0], C.gold); b.cone(0.8, 0.6, 3, [0.85, 2.6, 0], C.royal, { rz: Math.PI, s: [1, 1, 0.08] }); }, { col: [circ(0.25)] });
  def('hedge', 'Hedge', 'Nature', b => { b.box(4, 1.3, 1.1, [0, 0, 0], C.leaf, { jitter: 0.12 }); b.box(3.9, 0.15, 1.0, [0, 1.3, 0], C.leaf2, { jitter: 0.12 }); }, { col: [box(4, 1.2, 0, 0, 1.4)] });
  def('flower_bed', 'Flower bed', 'Decorations', b => { b.box(3.2, 0.3, 2, [0, 0, 0], C.soil); for (let i = 0; i < 18; i++) b.ball(0.18, 0, [-1.4 + (i % 6) * 0.56, 0.45, -0.7 + Math.floor(i / 6) * 0.7], [C.flowerR, C.flowerY, C.flowerB][i % 3], { jitter: 0.1 }); }, {});
  def('topiary', 'Topiary tree', 'Trees', b => { b.cyl(0.15, 0.2, 1.4, 6, [0, 0, 0], C.trunk); b.ball(1.1, 2, [0, 2.2, 0], C.leaf2, { jitter: 0.06 }); b.ball(0.6, 2, [0, 3.4, 0], C.leaf2, { jitter: 0.06 }); }, { col: [circ(0.4)] });
  def('guard_post', 'Guard post', 'Palace', b => { b.box(2, 2.6, 2, [0, 0, 0], C.white); b.hip(2.6, 2.6, 1.4, [0, 2.6, 0], C.royal); b.box(1, 1.8, 0.1, [0, 0, 1.02], C.door); figure(b, C.royal, { spear: true, x: 1.8, z: 0.8 }); }, { col: [box(2.2, 2.2, 0, 0, 3), circ(0.4, 1.8, 0.8)] });

  // --- noble houses
  def('manor_elegant', 'Elegant manor', 'Noble Houses', b => {
    b.box(24, 0.8, 15, [0, 0, 0], C.lightstone); b.box(22, 8.2, 13, [0, 0.8, 0], C.white); b.hip(23.4, 14.4, 4.6, [0, 9, 0], C.roofSlate);
    for (const x of [-16, 16]) { b.box(8, 5.6, 10, [x, 0.8, 1], C.white); b.hip(9, 11, 3, [x, 6.4, 1], C.roofSlate); }
    for (const x of [-3, -1, 1, 3]) b.cyl(0.4, 0.45, 7, 10, [x, 0.8, 7.6], C.white); b.gable(9, 3.4, 2.4, [0, 7.8, 7.6], C.roofSlate, { ry: Math.PI / 2 });
    b.box(2.2, 3.4, 0.2, [0, 0.8, 6.55], C.door); for (const x of [-9, -6, 6, 9]) for (const y of [2.2, 5.6]) win(b, x, y, 6.53, 0, 1.1, 1.8);
    for (const x of [-16, 16]) for (const xx of [-2, 2]) win(b, x + xx, 2.4, 6.03, 0, 1, 1.6);
    lanternGlow(b, -1.6, 3.2, 7.2); lanternGlow(b, 1.6, 3.2, 7.2);
  }, { col: [box(24, 15), box(8.4, 10.4, -16, 1), box(8.4, 10.4, 16, 1), circ(0.5, -3, 7.6), circ(0.5, 3, 7.6)], shadow: true });
  def('manor_rustic', 'Granary manor', 'Noble Houses', b => {
    house(b, { w: 18, d: 12, h: 7, roof: C.roofBrown, wall: C.plaster2, story2: true, roofH: 4.4 }); chimney(b, 6, 9.5, -3, 3);
    b.box(10, 0.3, 3, [0, 3.6, 7.5], C.roofBrown); for (const x of [-4.6, 0, 4.6]) b.cyl(0.18, 0.2, 3.6, 6, [x, 0, 8.6], C.wood);
    b.box(2, 1.2, 0.1, [0, 5.4, 6.08], C.gold);
  }, { col: [box(18.4, 12.4)], shadow: true });
  def('keep_fortress', 'Mountain keep', 'Noble Houses', b => {
    b.box(17, 13, 17, [0, 0, 0], C.stone2); crenels(b, 17, 13, 0.8, C.stone2); b.box(17, 0.9, 0.8, [0, 13, 8.1], C.stone2);
    for (const [x, z] of [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]]) tower(b, 2.6, 16, C.stone, C.roofDark, { x, z, roofH: 5 });
    b.box(3, 4.2, 0.4, [0, 0, 8.6], C.darkwood); for (const x of [-4, 4]) for (const y of [5, 9]) win(b, x, y, 8.53, 0, 0.6, 1.4);
    b.cyl(0.06, 0.06, 5, 5, [0, 13.4, 0], C.wood); b.box(2, 1.4, 0.05, [1.05, 16.8, 0], C.red);
  }, { col: [box(17.4, 17.4), circ(2.8, -8.5, -8.5), circ(2.8, 8.5, -8.5), circ(2.8, -8.5, 8.5), circ(2.8, 8.5, 8.5)], shadow: true });
  def('gazebo', 'Gazebo', 'Decorations', b => { b.cyl(3, 3, 0.4, 8, [0, 0, 0], C.lightstone); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.cyl(0.14, 0.14, 3, 6, [Math.cos(a) * 2.7, 0.4, Math.sin(a) * 2.7], C.white); } b.cone(3.6, 2.2, 8, [0, 3.4, 0], C.roofGreen); b.ball(0.25, 0, [0, 5.7, 0], C.gold); }, { col: [] });
  def('stone_wall', 'Stone wall', 'Mountains', b => { for (let i = 0; i < 5; i++) b.box(2.2, 3 + (i % 2) * 0.5, 1.6, [-4 + i * 2, 0, (i % 3 - 1) * 0.08], i % 2 ? C.stone : C.stone2, { jitter: 0.1 }); crenels(b, 10, 3.3, 0.5, C.stone2); }, { col: [box(10.2, 1.8, 0, 0, 4)] });
  def('watchtower', 'Watchtower', 'Mountains', b => {
    for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) b.cyl(0.18, 0.22, 9, 6, [x, 0, z], C.wood, { rx: z * 0.02, rz: -x * 0.02 });
    b.box(4.4, 0.3, 4.4, [0, 9, 0], C.wood); for (const s of [-1, 1]) { b.box(4.4, 1, 0.12, [0, 9.3, s * 2.15], C.wood); b.box(0.12, 1, 4.4, [s * 2.15, 9.3, 0], C.wood); }
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b.cyl(0.08, 0.08, 2.4, 5, [x, 9.3, z], C.wood); b.hip(5.4, 5.4, 2.2, [0, 11.7, 0], C.roofBrown);
    lanternGlow(b, 0, 10.6, 0, 0.25);
    for (let y = 1; y < 9; y += 1.5) b.box(0.08, 0.08, 1.2, [-1.6, y, -1], C.wood);
  }, { col: [circ(2.4, 0, 0, 9)] });
  def('camp', 'Camp', 'Forest', b => {
    tent(b, -3, -1, 0.4, C.cloth1); tent(b, 3, -1.5, -0.3, C.cloth2);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.rock(0.3, [Math.cos(a) * 0.9, 0.15, Math.sin(a) * 0.9 + 2], C.rock2); }
    for (let i = 0; i < 3; i++) b.box(0.15, 0.15, 1.2, [0, 0.2, 2], C.darkwood, { ry: i * 1.05 }); b.cone(0.45, 0.9, 5, [0, 0.2, 2], C.ember, { part: 'glow', jitter: 0 }); b.light(0, 0.9, 2, 'fire');
    for (const [x, z, r] of [[-2, 3.4, 0.3], [2, 3.2, -0.4]]) b.cyl(0.3, 0.3, 1.6, 6, [x, 0.3, z], C.trunk, { rz: Math.PI / 2, ry: r });
  }, { col: [circ(1.6, -3, -1, 2.2), circ(1.6, 3, -1.5, 2.2), circ(0.8, 0, 2, 0.8)], light: true });
  def('cave_entrance', 'Cave entrance', 'Forest', b => {
    for (const [x, y, z, r] of [[0, 2.5, -1, 4], [-3.6, 1.6, 0, 2.6], [3.6, 1.8, 0, 2.8], [0, 5, -2, 3.2], [-2, 4, -2, 2.5], [2.4, 4.2, -2, 2.4]]) b.rock(r, [x, y, z], C.rock, { jitter: 0.12 });
    b.box(3.6, 3.4, 0.6, [0, 0, 1.4], C.black, { jitter: 0 });
  }, { col: [box(10, 6, 0, -1.2, 6)] });
  def('mine_entrance', 'Mine entrance', 'Mountains', b => {
    for (const [x, y, z, r] of [[0, 3, -2, 5], [-4.5, 2, -0.5, 3.2], [4.5, 2.2, -0.5, 3.4], [0, 6.4, -3, 4]]) b.rock(r, [x, y, z], C.rock2, { jitter: 0.12 });
    b.box(4, 4.2, 0.6, [0, 0, 1.6], C.black, { jitter: 0 }); for (const x of [-2.1, 2.1]) b.box(0.4, 4.4, 0.4, [x, 0, 2], C.wood); b.box(5, 0.5, 0.5, [0, 4.4, 2], C.wood);
    for (const x of [-0.6, 0.6]) b.box(0.12, 0.1, 6, [x, 0.05, 5], C.iron); for (let z = 2.5; z < 8; z += 0.9) b.box(1.6, 0.08, 0.25, [0, 0, z], C.wood);
    b.box(1.2, 0.8, 1.6, [0, 0.3, 6.6], C.iron); lanternGlow(b, -2.1, 3.2, 2.3);
  }, { col: [box(12, 6, 0, -1.5, 7), box(1.4, 1.8, 0, 6.6, 1)] });
  def('boss_arena', 'Boss arena', 'Boss Areas', b => {
    b.cyl(19, 19.6, 0.8, 24, [0, -0.5, 0], C.stone2); b.cyl(17, 17, 0.1, 24, [0, 0.3, 0], C.stone, { jitter: 0.1 }); b.cyl(4, 4.4, 1, 10, [0, 0.3, 0], C.lightstone);
    pillarRing(b, 10, 17.5, 9, C.stone, true); b.ball(0.9, 0, [0, 2.4, 0], C.portal, { part: 'glow', jitter: 0 });
  }, { col: Array.from({ length: 10 }, (_, i) => circ(1, Math.cos(i / 10 * Math.PI * 2) * 17.5, Math.sin(i / 10 * Math.PI * 2) * 17.5, 9)) });

  // --- farms
  def('barn', 'Barn', 'Farms', b => {
    b.box(14, 6, 10, [0, 0, 0], C.red); b.gable(15, 11, 4.6, [0, 6, 0], C.roofDark, { ry: Math.PI / 2 });
    b.box(4.6, 4.8, 0.2, [0, 0, 5.02], C.darkwood); b.box(4.8, 0.25, 0.25, [0, 4.8, 5.1], C.white); b.box(0.2, 4.8, 0.25, [-2.3, 0, 5.1], C.white).box(0.2, 4.8, 0.25, [2.3, 0, 5.1], C.white);
    b.box(6.5, 0.2, 0.25, [0, 2.4, 5.12], C.white, { rz: 0.8 }).box(6.5, 0.2, 0.25, [0, 2.4, 5.12], C.white, { rz: -0.8 }); b.box(1.6, 1.4, 0.2, [0, 7.4, 5.4], C.darkwood);
  }, { col: [box(14.2, 10.2)], shadow: true });
  def('farmhouse', 'Farmhouse', 'Farms', b => { house(b, { w: 9, d: 7, h: 3.6, roof: C.roofBrown, wall: C.plaster2, roofH: 3 }); chimney(b, 3, 5.4, -1.5); b.box(9, 0.2, 2.4, [0, 3.0, 4.6], C.roofBrown); for (const x of [-4, 4]) b.cyl(0.12, 0.14, 3, 6, [x, 0, 5.6], C.wood); }, { col: [box(9.4, 7.4)] });
  def('windmill', 'Windmill', 'Farms', b => {
    b.cyl(2.6, 3.6, 12, 10, [0, 0, 0], C.plaster3); b.cone(3.2, 3.2, 10, [0, 12, 0], C.roofBrown); b.box(1.4, 2.2, 0.2, [0, 0, 3.4], C.door, { rx: -0.08 });
    b.cyl(0.3, 0.3, 1.6, 6, [0, 11, 2.6], C.darkwood, { rx: Math.PI / 2 });
  }, { col: [circ(3.6, 0, 0, 12)], sails: { y: 11.6, z: 3.6, r: 8 } });
  def('silo', 'Silo', 'Farms', b => { b.cyl(2.6, 2.6, 9, 12, [0, 0, 0], C.lightstone); for (let y = 1; y < 9; y += 2) b.cyl(2.65, 2.65, 0.15, 12, [0, y, 0], C.iron); b.add(new b.T.SphereGeometry(2.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.roofSlate, [0, 9, 0]); }, { col: [circ(2.7, 0, 0, 10)] });
  def('well', 'Well', 'Farms', b => { b.cyl(1.2, 1.3, 0.9, 10, [0, 0, 0], C.stone); b.cyl(0.95, 0.95, 0.05, 10, [0, 0.7, 0], C.water); for (const x of [-1, 1]) b.cyl(0.08, 0.1, 2.4, 5, [x, 0.9, 0], C.wood); b.gable(2.8, 2.2, 0.9, [0, 3.2, 0], C.roofBrown); b.cyl(0.08, 0.08, 2, 5, [0, 2.6, 0], C.wood, { rz: Math.PI / 2 }); b.cyl(0.22, 0.18, 0.35, 6, [0, 1.6, 0], C.wood); }, { col: [circ(1.35, 0, 0, 1)] });
  def('fence', 'Fence', 'Farms', b => { for (const x of [-2, 0, 2]) b.box(0.16, 1.2, 0.16, [x, 0, 0], C.wood); b.box(4.2, 0.12, 0.08, [0, 0.45, 0], C.wood); b.box(4.2, 0.12, 0.08, [0, 0.9, 0], C.wood); }, { col: [box(4.2, 0.3, 0, 0, 1.2)] });
  def('field_wheat', 'Wheat field', 'Farms', b => { b.box(20, 0.15, 14, [0, -0.05, 0], C.soil); for (let i = 0; i < 9; i++) b.box(19, 0.5, 1.1, [0, 0.05, -6 + i * 1.5], C.wheat, { jitter: 0.08 }); }, { flat: true });
  def('field_veg', 'Vegetable field', 'Farms', b => { b.box(20, 0.15, 14, [0, -0.05, 0], C.soil); for (let i = 0; i < 9; i++) for (let j = 0; j < 12; j++) b.ball(0.38, 0, [-8.8 + j * 1.6, 0.35, -6 + i * 1.5], j % 4 ? C.veg : C.leaf2, { jitter: 0.15 }); }, { flat: true });
  def('hay_bale', 'Hay bale', 'Farms', b => b.cyl(0.8, 0.8, 1.4, 10, [0, 0.8, -0.7], C.hay, { rx: Math.PI / 2 }), { col: [circ(0.9, 0, 0, 1.6)] });
  def('water_trough', 'Water trough', 'Farms', b => { b.box(2.4, 0.7, 0.9, [0, 0, 0], C.wood); b.box(2.2, 0.05, 0.7, [0, 0.62, 0], C.water); }, { col: [box(2.5, 1, 0, 0, 0.8)] });

  // --- nature
  def('tree_pine', 'Pine tree', 'Trees', b => {
    b.cyl(0.14, 0.3, 6.6, 7, [0, 0, 0], C.trunk);
    [[1.6, 2.6, 2.4, 14], [3.0, 2.1, 2.2, 12], [4.3, 1.6, 2.0, 10], [5.5, 1.1, 1.8, 8], [6.5, 0.6, 1.4, 6]].forEach(([y, r, h, n], i) => pineTier(b, y, r, h, C.pine, n, 11 + i));
  }, { col: [circ(0.45, 0, 0, 6)], tree: true });
  def('tree_moonpine', 'Moonpine', 'Trees', b => {
    b.cyl(0.2, 0.46, 10.5, 8, [0, 0, 0], C.trunk);
    [[2.6, 3.3, 3.2, 18], [4.4, 2.8, 3.0, 16], [6.1, 2.3, 2.8, 14], [7.7, 1.8, 2.6, 12], [9.1, 1.25, 2.2, 9], [10.3, 0.7, 1.8, 6]].forEach(([y, r, h, n], i) => pineTier(b, y, r, h, C.moonpine, n, 31 + i));
  }, { col: [circ(0.6, 0, 0, 8)], tree: true });
  def('tree_oak', 'Oak tree', 'Trees', b => {
    b.cyl(0.32, 0.55, 3.4, 9, [0, 0, 0], C.trunk); b.cyl(0.42, 0.62, 0.5, 9, [0, 0, 0], C.trunk);
    for (const [x, z, a, l] of [[0.2, 0, -0.75, 2.6], [-0.15, 0.1, 0.7, 2.4], [0, -0.2, 0.55, 2.2], [0.05, 0.2, -0.5, 2.0]]) b.cyl(0.1, 0.2, l, 6, [x, 2.6, z], C.trunk, { rz: a, ry: x * 4 + z * 3 });
    b.cyl(0.14, 0.26, 2.2, 6, [0, 3.2, 0], C.trunk);
    const crowns = [[0, 5.0, 0, 2.3], [1.7, 4.5, 0.6, 1.7], [-1.6, 4.6, -0.4, 1.8], [0.3, 6.2, -0.6, 1.6], [-0.4, 4.3, 1.5, 1.6], [0.6, 4.4, -1.5, 1.5]];
    crowns.forEach(([x, y, z, r], i) => { b.ball(r * (LOD === 2 ? 1.0 : 0.72), 0, [x, y, z], C.leaf, { jitter: 0.1 }); foliage(b, x, y, z, r, C.leaf, Math.round(10 + r * 7), { size: 1.5, seed: 3 + i }); });
  }, { col: [circ(0.6, 0, 0, 6)], tree: true, monkeyPerch: [[0, 4.4, 0]] });
  def('tree_birch', 'Birch tree', 'Trees', b => {
    b.cyl(0.11, 0.2, 6.2, 7, [0, 0, 0], C.birch);
    for (const [y, a] of [[3.2, 0.8], [3.8, -0.9], [4.5, 0.6]]) b.cyl(0.04, 0.07, 1.4, 5, [0, y, 0], C.birch, { rz: a, ry: y * 2 });
    [[0, 5.6, 0, 1.4], [0.6, 4.6, 0.3, 1.1], [-0.5, 4.7, -0.3, 1.1], [0.1, 6.5, 0.2, 0.9]].forEach(([x, y, z, r], i) => { b.ball(r * (LOD === 2 ? 0.95 : 0.6), 0, [x, y, z], C.leaf2, { jitter: 0.1 }); foliage(b, x, y, z, r, C.leaf2, Math.round(9 + r * 7), { size: 1.0, seed: 17 + i, flat: 1.2 }); });
  }, { col: [circ(0.3, 0, 0, 6)], tree: true });
  def('bush', 'Bush', 'Nature', b => {
    b.ball(0.75, 1, [0, 0.55, 0], C.leaf, { jitter: 0.12 }); b.ball(0.55, 1, [0.7, 0.45, 0.2], C.leaf2, { jitter: 0.12 });
    foliage(b, 0, 0.65, 0, 0.9, C.leaf, 12, { size: 0.9, seed: 41 }); foliage(b, 0.7, 0.5, 0.2, 0.65, C.leaf2, 8, { size: 0.8, seed: 43 });
  }, {});
  def('rock', 'Rock', 'Rocks', b => { b.rock(1, [0, 0.45, 0], C.rock, { s: [1.3, 0.8, 1], jitter: 0.12 }); }, { col: [circ(1.1, 0, 0, 0.9)] });
  def('boulder', 'Boulder', 'Rocks', b => { b.rock(2.4, [0, 1.3, 0], C.rock2, { s: [1.2, 0.85, 1], jitter: 0.12 }); b.rock(1.2, [1.9, 0.6, 0.8], C.rock, { jitter: 0.12 }); }, { col: [circ(2.6, 0, 0, 2.6)] });
  def('cliff_rock', 'Cliff rock', 'Mountains', b => { b.rock(5, [0, 3.5, 0], C.rock2, { s: [1.3, 1, 1], jitter: 0.12 }); b.rock(3.2, [4, 2, 2], C.rock, { jitter: 0.12 }); b.rock(2.6, [-4, 1.6, -1], C.rock, { jitter: 0.12 }); }, { col: [circ(6, 0, 0, 8)] });
  def('log', 'Fallen log', 'Nature', b => { b.cyl(0.4, 0.45, 5, 7, [0, 0.4, -2.5], C.trunk, { rx: Math.PI / 2 }); }, { col: [box(1, 5, 0, 0, 0.9)] });

  // --- bridges (deck runs along local x; length scales with obj.scale.x)
  def('bridge_stone', 'Stone bridge', 'Bridges', b => {
    b.box(24, 0.7, 7, [0, -0.4, 0], C.stone); for (const s of [-1, 1]) { b.box(24, 1.1, 0.5, [0, 0.3, s * 3.25], C.lightstone); for (let x = -11; x <= 11; x += 5.5) b.box(0.7, 1.5, 0.7, [x, 0.3, s * 3.25], C.stone2); }
    for (const x of [-6, 6]) b.box(2.4, 7, 7.4, [x, -7.4, 0], C.stone2);
    for (const x of [-12, 12]) b.box(2.4, 6.5, 7.4, [x, -6.9, 0], C.stone2);
  }, { col: [box(24, 0.6, 0, 3.25, 1.4), box(24, 0.6, 0, -3.25, 1.4)], deck: [{ w: 24, d: 6.4, x: 0, z: 0, y: 0.3 }], bridge: true });
  def('bridge_wood', 'Wooden bridge', 'Bridges', b => {
    b.box(14, 0.35, 4.2, [0, -0.2, 0], C.wood); for (let x = -6.5; x <= 6.5; x += 1.3) b.box(0.25, 0.06, 4.2, [x, 0.15, 0], C.darkwood);
    for (const s of [-1, 1]) { b.box(14, 0.14, 0.14, [0, 1.0, s * 2], C.wood); for (let x = -6.8; x <= 6.8; x += 2.27) b.box(0.18, 1.1, 0.18, [x, 0, s * 2], C.wood); }
    for (const x of [-4, 4]) for (const s of [-1, 1]) b.cyl(0.25, 0.25, 6, 6, [x, -6, s * 1.6], C.darkwood);
  }, { col: [box(14, 0.4, 0, 2, 1.2), box(14, 0.4, 0, -2, 1.2)], deck: [{ w: 14, d: 3.8, x: 0, z: 0, y: 0.15 }], bridge: true });

  // --- gameplay placeholders
  def('treasure_chest', 'Treasure chest', 'Treasure', b => { b.box(1.2, 0.6, 0.8, [0, 0, 0], C.wood); b.add(new b.T.CylinderGeometry(0.4, 0.4, 1.2, 8, 1, false, 0, Math.PI), C.wood, [0, 0.6, 0], { rz: Math.PI / 2 }); for (const x of [-0.45, 0.45]) b.box(0.1, 0.95, 0.84, [x, 0, 0], C.gold); b.box(0.2, 0.25, 0.06, [0, 0.45, 0.42], C.gold); }, { col: [box(1.3, 0.9, 0, 0, 1)], marker: 'treasure' });
  def('save_point', 'Save point', 'Save Points', b => { b.cyl(1.6, 1.8, 0.5, 8, [0, 0, 0], C.lightstone); b.cyl(0.9, 1.1, 0.8, 8, [0, 0.5, 0], C.stone); b.add(new b.T.OctahedronGeometry(0.7, 0), C.crystal, [0, 2.4, 0], { s: [1, 1.7, 1], part: 'glow', jitter: 0 }); }, { col: [circ(1.2, 0, 0, 1.3)], marker: 'save', light: true });
  def('portal', 'Portal', 'Portals', b => { b.box(5, 0.5, 2, [0, 0, 0], C.stone2); b.add(new b.T.TorusGeometry(2.4, 0.42, 6, 18), C.lightstone, [0, 3, 0]); b.cyl(2.05, 2.05, 0.12, 18, [0, 3, -0.06], C.portal, { rx: Math.PI / 2, part: 'glow', jitter: 0 }); }, { col: [circ(0.6, -2.4, 0, 5), circ(0.6, 2.4, 0, 5)], marker: 'portal', light: true });
  def('enemy_spawn', 'Enemy spawn', 'Enemies', b => { b.cyl(0.06, 0.06, 2.2, 5, [0, 0, 0], C.darkwood); b.box(0.9, 0.6, 0.04, [0.45, 1.5, 0], C.red); b.cyl(1.6, 1.6, 0.04, 12, [0, 0.03, 0], C.red, { jitter: 0 }); }, { marker: 'enemy' });
  def('npc_villager', 'Villager', 'NPCs', b => figure(b, C.cloth3, { hat: C.roofBrown }), { col: [circ(0.35, 0, 0, 1.8)], marker: 'npc' });
  def('npc_merchant', 'Merchant', 'NPCs', b => figure(b, C.cloth1, { hat: C.gold }), { col: [circ(0.35, 0, 0, 1.8)], marker: 'npc' });
  def('npc_guard', 'Guard', 'NPCs', b => figure(b, C.royal, { spear: true, hat: C.iron }), { col: [circ(0.35, 0, 0, 1.8)], marker: 'npc' });
  def('npc_farmer', 'Farmer', 'NPCs', b => figure(b, C.veg, { hat: C.hay }), { col: [circ(0.35, 0, 0, 1.8)], marker: 'npc' });
  def('training_dummy', 'Training dummy', 'Quest Areas', b => { b.cyl(0.1, 0.12, 2.2, 5, [0, 0, 0], C.wood); b.cyl(0.32, 0.36, 0.9, 7, [0, 1.0, 0], C.hay); b.ball(0.24, 0, [0, 2.2, 0], C.hay); b.cyl(0.07, 0.07, 1.4, 5, [0, 1.6, 0], C.wood, { rz: Math.PI / 2 }); }, { col: [circ(0.4, 0, 0, 2)] });
  def('story_marker', 'Story event', 'Quest Areas', b => { b.cyl(0.5, 0.7, 2.6, 6, [0, 0, 0], C.lightstone); b.add(new b.T.OctahedronGeometry(0.35, 0), C.lantern, [0, 3.0, 0], { part: 'glow', jitter: 0 }); }, { col: [circ(0.7, 0, 0, 2.6)], marker: 'story' });
  def('quest_area', 'Quest area', 'Quest Areas', b => { b.cyl(0.05, 0.05, 2, 4, [0, 0, 0], C.wood); b.box(0.7, 0.45, 0.04, [0.35, 1.5, 0], C.gold); b.cyl(3, 3, 0.03, 16, [0, 0.03, 0], C.gold, { jitter: 0 }); }, { marker: 'quest' });

  // ---------------------------------------------------------------- cache
  const cache = new Map();
  function get(THREE, id) {
    if (!T[id]) throw new Error('Unknown world object type: ' + id);
    if (!cache.has(id)) { const b = new MB(THREE); T[id].build(b); const parts = b.finish(); lightCache.set(id, b.lights); cache.set(id, parts); }
    return cache.get(id);
  }
  const lightCache = new Map();
  /* lantern / fire points of a type in local space ([{x,y,z,kind}]) */
  function lightsOf(THREE, id) { get(THREE, id); return lightCache.get(id) || []; }
  /* lighter versions of trees for distance (level 1: fewer, bigger leaf/needle cards; level 2: core shapes only) */
  function getLod(THREE, id, level) {
    if (!level || !T[id] || !T[id].tree) return get(THREE, id);
    const k = id + '#lod' + level;
    if (!cache.has(k)) { LOD = level; try { const b = new MB(THREE); T[id].build(b); cache.set(k, b.finish()); } finally { LOD = 0; } }
    return cache.get(k);
  }
  A.Models = { TYPES: T, get, getLod, lightsOf, MATS, C, CATEGORIES: ['City', 'Houses', 'Roads', 'Palace', 'Noble Houses', 'Farms', 'Forest', 'Mountains', 'Rivers', 'Bridges', 'Nature', 'Trees', 'Rocks', 'Shops', 'Restaurants', 'Adventure Guild', 'Enemies', 'NPCs', 'Stores', 'Portals', 'Decorations', 'Quest Areas', 'Boss Areas', 'Save Points', 'Treasure', 'Wildlife', 'River Life', 'Farm Animals', 'City Animals', 'Forest Wildlife', 'Dangerous Wildlife', 'Monster Wildlife'] };
})();
