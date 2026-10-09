/* Aethelos terrain: heightfield built from the kingdom layout (hills, Ironpeak massifs, flattened sites, carved rivers,
   levelled roads), split into chunks for culling, with height / water / road queries used by the player and placement. */
(() => {
  const A = window.Aethelos ||= {};

  // ---------------------------------------------------------------- noise
  function hash(ix, iz) { let h = (ix * 374761393 + iz * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function vnoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function fbm(x, z, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
  function ridged(x, z, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(vnoise(x * f + 13.1 * i, z * f - 7.7 * i))); n += a; a *= 0.5; f *= 2.1; } return s / n; }
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  A.Noise = { vnoise, fbm, ridged, hash, smooth };

  // ---------------------------------------------------------------- polylines with a spatial index
  function densify(pts, step, loop) {
    const src = loop ? [...pts, pts[0]] : pts, out = [];
    for (let i = 0; i < src.length - 1; i++) {
      const [x0, z0] = src[i], [x1, z1] = src[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
      for (let k = 0; k < n; k++) out.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n]);
    }
    out.push(src[src.length - 1].slice());
    return out;
  }
  class LineIndex {
    constructor(lines, cell = 24) {          // lines: [{pts:[[x,z]..], reach}]
      this.lines = lines; this.cell = cell; this.grid = new Map();
      lines.forEach((L, li) => {
        for (let s = 0; s < L.pts.length - 1; s++) {
          const [x0, z0] = L.pts[s], [x1, z1] = L.pts[s + 1], r = L.reach;
          const cx0 = Math.floor((Math.min(x0, x1) - r) / cell), cx1 = Math.floor((Math.max(x0, x1) + r) / cell);
          const cz0 = Math.floor((Math.min(z0, z1) - r) / cell), cz1 = Math.floor((Math.max(z0, z1) + r) / cell);
          for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
            const k = cx + ',' + cz; let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(li, s);
          }
        }
      });
    }
    /* nearest segment among lines within their reach: {d, li, s, t} or null */
    nearest(x, z, filter) {
      const a = this.grid.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell)); if (!a) return null;
      let best = null;
      for (let i = 0; i < a.length; i += 2) {
        const li = a[i], s = a[i + 1]; if (filter && !filter(this.lines[li])) continue;
        const P = this.lines[li].pts, [x0, z0] = P[s], [x1, z1] = P[s + 1], dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
        const t = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / L2)), px = x0 + dx * t, pz = z0 + dz * t, d = Math.hypot(x - px, z - pz);
        if (d <= this.lines[li].reach && (!best || d < best.d)) best = { d, li, s, t };
      }
      return best;
    }
  }

  // ---------------------------------------------------------------- terrain
  class Terrain {
    constructor(layout, { cell = 3 } = {}) {
      this.L = layout; this.size = layout.SIZE; this.cell = cell; this.n = Math.round(this.size / cell) + 1; this.half = this.size / 2;
      // rivers: dense centre lines + monotonic water levels
      this.rivers = layout.RIVERS.map(R => ({ ...R, pts: densify(R.pts, 4), reach: R.width / 2 + 16 }));
      for (const R of this.rivers) {
        // water sits ~1.1 m under the LOCAL low bank (min over +-120 m), smoothed: no canyon through flat land,
        // and it still steps down through the mountains
        const raw = R.pts.map(([x, z]) => this.shaped(x, z) - 1.1), W = 30;
        R.level = boxSmooth(raw.map((_, i) => { let m = Infinity; for (let k = Math.max(0, i - W); k <= Math.min(raw.length - 1, i + W); k++) m = Math.min(m, raw[k]); return m; }), 12);
      }
      // join tributaries to the river they flow into (level continuity at the mouth)
      for (const R of this.rivers) {
        const end = R.pts[R.pts.length - 1];
        for (const O of this.rivers) if (O !== R) {
          let bi = -1, bd = 1e9; O.pts.forEach(([x, z], i) => { const d = Math.hypot(x - end[0], z - end[1]); if (d < bd) { bd = d; bi = i; } });
          if (bd < O.width + R.width) { const lv = O.level[bi], n = R.level.length; for (let i = Math.max(0, n - 25); i < n; i++) { const t = (i - (n - 25)) / 25; R.level[i] = Math.max(lv, R.level[i] * (1 - t) + lv * t); } }
        }
      }
      this.riverIndex = new LineIndex(this.rivers);
      // roads: dense centre lines + smoothed levels from the shaped (pre-road) terrain
      this.roads = layout.ROADS.map(R => ({ ...R, pts: densify(R.pts, 4, R.loop), reach: R.width / 2 + (R.shoulder || 9) }));
      for (const R of this.roads) R.level = boxSmooth(R.pts.map(([x, z]) => this.shaped(x, z)), R.grade || 5);   // grade: smoothing window (mountain roads use long, gentle grades)
      for (const R of this.roads) {
        const n = R.pts.length;
        // 'ramp' roads (the Royal Road up to the palace) climb steadily from end to end: no dips and humps on the way
        if (R.profile === 'ramp') { const a = this.shaped(...R.pts[0]), b = this.shaped(...R.pts[n - 1]);
          for (let i = 0; i < n; i++) { const t = i / (n - 1), e = t * t * (3 - 2 * t); R.level[i] = a + (b - a) * (0.45 * t + 0.55 * e); } }
        // river crossings: the road comes down to the bridge deck (water + 1.6 m) over 40 m on each side, so it never floats over the bank
        const deck = R.pts.map(([x, z]) => { const w = this.riverIndex.nearest(x, z); if (!w) return null; const V = this.rivers[w.li];
          return w.d < V.width / 2 + 1.5 ? V.level[w.s] + (V.level[w.s + 1] - V.level[w.s]) * w.t + 1.6 : null; });
        const RAMP = 10;
        for (let i = 0; i < n; i++) {
          if (deck[i] === null || (i > 0 && deck[i - 1] !== null)) continue;
          let j = i; while (j + 1 < n && deck[j + 1] !== null) j++;
          let D = -Infinity; for (let k = i; k <= j; k++) D = Math.max(D, deck[k]);
          for (let k = i; k <= j; k++) R.level[k] = D;
          for (let k = 1; k <= RAMP; k++) { const t = k / RAMP, e = t * t * (3 - 2 * t);
            if (i - k >= 0 && deck[i - k] === null) R.level[i - k] = D + (R.level[i - k] - D) * e;
            if (j + k < n && deck[j + k] === null) R.level[j + k] = D + (R.level[j + k] - D) * e; }
        }
      }
      this.roadIndex = new LineIndex(this.roads);
      this.build();
    }
    /* base terrain before roads and rivers */
    shaped(x, z) {
      const L = this.L;
      let h = 4 + 9 * fbm(x / 230 + 11, z / 230 - 4) + 2.2 * fbm(x / 55, z / 55, 3);
      for (const M of L.MASSIFS) {
        const e = Math.hypot((x - M.x) / M.rx, (z - M.z) / M.rz), m = 1 - smooth(0.25, 1.05, e);
        if (m > 0) h += Math.pow(m, 1.35) * M.h * (0.45 + 0.55 * ridged(x / 95 + M.x, z / 95 + M.z, 5));
      }
      const edge = Math.max(Math.abs(x), Math.abs(z));                          // the realm's edge rises into hills
      h += smooth(this.half - 70, this.half, edge) * (40 + 25 * fbm(x / 40, z / 40));
      for (const F of L.FLATS) {
        const t = 1 - smooth(F.r, F.r + F.edge, Math.hypot(x - F.x, z - F.z));
        if (t > 0) h = h + (F.h + 0.35 * fbm(x / 18, z / 18, 2) - h) * t;
      }
      return h;
    }
    /* final height: shaped terrain, roads levelled into it, rivers carved */
    heightRaw(x, z) {
      let h = this.shaped(x, z), inChannel = false;
      const w = this.riverIndex.nearest(x, z);
      if (w) {
        const R = this.rivers[w.li], lv = R.level[w.s] + (R.level[w.s + 1] - R.level[w.s]) * w.t, hw = R.width / 2, depth = 0.9 + R.width * 0.09;
        const bed = lv - depth * (1 - Math.pow(Math.min(1, w.d / hw), 2) * 0.75);
        if (w.d < hw) { h = Math.min(h, bed); inChannel = true; }
        else h = Math.min(h, lv - 0.25 + (h - (lv - 0.25)) * smooth(hw, hw + 14, w.d));
      }
      // roads are levelled after the rivers are carved, so a road keeps its embankment right up to the water (bridges span the channel)
      const r = this.roadIndex.nearest(x, z);
      if (r && !inChannel) {
        const R = this.roads[r.li], lv = R.level[r.s] + (R.level[r.s + 1] - R.level[r.s]) * r.t, rw = R.width / 2;
        h += (lv - h) * (1 - smooth(rw + 0.5, rw + (R.shoulder || 9), r.d));      // wide shoulders on mountain roads: a pass, not a trench
      }
      return h;
    }
    build() {
      const n = this.n, H = this.h = new Float32Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = this.heightRaw(i * this.cell - this.half, j * this.cell - this.half);
    }
    heightAt(x, z) {
      const n = this.n, fx = Math.min(n - 1.001, Math.max(0, (x + this.half) / this.cell)), fz = Math.min(n - 1.001, Math.max(0, (z + this.half) / this.cell));
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, H = this.h;
      const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
      return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);   // matches the mesh triangles
    }
    slopeAt(x, z) { const e = 1.2; return Math.hypot(this.heightAt(x + e, z) - this.heightAt(x - e, z), this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e); }
    /* water surface where (x,z) is inside a river channel: {level, depth, river} */
    waterAt(x, z) {
      const w = this.riverIndex.nearest(x, z); if (!w) return null;
      const R = this.rivers[w.li]; if (w.d > R.width / 2 + 1) return null;
      const lv = R.level[w.s] + (R.level[w.s + 1] - R.level[w.s]) * w.t;
      return { level: lv, depth: lv - this.heightAt(x, z), river: R, d: w.d };
    }
    roadAt(x, z) { const r = this.roadIndex.nearest(x, z); if (!r) return null; const R = this.roads[r.li]; return r.d < R.width / 2 + 0.5 ? { road: R, d: r.d } : null; }
    riverDist(x, z) { const w = this.riverIndex.nearest(x, z); return w ? w.d - this.rivers[w.li].width / 2 : 99; }
    roadDist(x, z) { const r = this.roadIndex.nearest(x, z); return r ? r.d - this.roads[r.li].width / 2 : 99; }

    // ---------------------------------------------------------------- surface (what the ground is made of)
    /* weights for the splat shader at (x,z):
       ground = [meadow grass, soil, river pebbles, rocky ground]; rock = [mossy rock, slate, marble, snow]; tint = linear multiplier ~1; wet 0..1 */
    surfaceAt(x, z, h, slope, o) {
      const N = A.Noise, L = this.L;
      const g1 = 0.5 + 0.5 * N.fbm(x / 34, z / 34, 3), dry = 0.5 + 0.5 * N.fbm(x / 140 + 40, z / 140, 3), q = 0.5 + 0.5 * N.vnoise(x / 6, z / 6);
      let grass = 1, soil = 0, peb = 0, rocky = 0;
      const forest = 1 - smooth(150, 240, Math.hypot(x - 330, z - 190));
      const farm = (1 - smooth(110, 150, Math.hypot(x + 265, z - 235))) * (z > 120 ? 1 : 0);
      const city = 1 - smooth(110, 140, Math.hypot(x, z));
      soil += farm * (0.35 + 0.5 * smooth(0.45, 0.7, N.fbm(x / 22 + 3, z / 22, 3) * 0.5 + 0.5));      // ploughed patches between the fields
      soil += forest * (0.45 + 0.4 * q);                                                                // forest floor: soil and needles
      soil += 0.55 * smooth(0.62, 0.78, 0.5 + 0.5 * N.fbm(x / 18 - 9, z / 18 + 4, 3));                  // worn dirt patches in the meadows
      soil += city * 0.25 * smooth(0.4, 0.7, q);
      const rd = this.roadIndex.nearest(x, z);
      if (rd) { const R = this.roads[rd.li], e = rd.d - R.width / 2; soil += (1 - smooth(-0.5, R.surface === 'dirt' ? 3.5 : 1.8, e)) * 0.9; }    // trodden shoulders
      const w = this.riverIndex.nearest(x, z); let wet = 0;
      if (w) { const R = this.rivers[w.li], e = w.d - R.width / 2; peb = 1 - smooth(0.5, 4 + 2 * q, e); wet = 1 - smooth(-1.5, 1.2, e); }
      // mountains: rocky ground climbs with altitude; rock type by height and region
      const varkhold = 1 - smooth(140, 230, Math.hypot(x - 318, z + 318));
      rocky = smooth(48, 90, h + 14 * N.vnoise(x / 30, z / 30)) * 0.9;
      const marble = smooth(85, 120, h + 10 * N.vnoise(x / 25, z / 25));
      const slate = Math.max(varkhold, smooth(55, 80, h) * (1 - marble)) * (0.6 + 0.4 * q);
      const moss = Math.max(0.05, 1 - slate - marble);
      const snow = smooth(112, 138, h + 8 * N.vnoise(x / 20, z / 20));
      grass = Math.max(0, 1 - soil * 0.85 - peb);
      o.ground[0] = grass; o.ground[1] = Math.min(1, soil); o.ground[2] = peb; o.ground[3] = rocky;
      o.rock[0] = moss; o.rock[1] = slate; o.rock[2] = marble; o.rock[3] = snow;
      // tint: lush vs dry meadow, darker forest, greener near water
      let tr = 1.0 + 0.16 * (dry - 0.5) + 0.06 * (g1 - 0.5), tg = 1.04 + 0.05 * (g1 - 0.5) - 0.04 * (dry - 0.5), tb = 1.0 + 0.25 * (0.5 - dry);
      tr -= 0.28 * forest; tg -= 0.2 * forest; tb -= 0.12 * forest;
      const near = w ? 1 - smooth(4, 26, w.d - this.rivers[w.li].width / 2) : 0; tr -= 0.08 * near; tb += 0.05 * near;
      o.tint[0] = tr; o.tint[1] = tg; o.tint[2] = tb; o.wet = wet;
      o.grassDensity = grass * (1 - rocky) * (1 - 0.65 * forest) * (1 - peb) * (1 - snow) * (1 - smooth(0.55, 0.9, slope));
      o.flowers = o.grassDensity * smooth(0.55, 0.8, 0.5 + 0.5 * N.fbm(x / 40 + 77, z / 40 - 31, 2)) * (1 - city);
      return o;
    }
    computeSurface() {
      if (this.surf) return this.surf;
      const n = this.n, S = this.surf = { ground: new Float32Array(n * n * 4), rock: new Float32Array(n * n * 4), tint: new Float32Array(n * n * 3), wet: new Float32Array(n * n), grass: new Float32Array(n * n), flowers: new Float32Array(n * n) };
      const o = { ground: [0, 0, 0, 0], rock: [0, 0, 0, 0], tint: [1, 1, 1], wet: 0 };
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, x = i * this.cell - this.half, z = j * this.cell - this.half;
        this.surfaceAt(x, z, this.h[k], this.slopeAt(x, z), o);
        S.ground.set(o.ground, k * 4); S.rock.set(o.rock, k * 4); S.tint.set(o.tint, k * 3); S.wet[k] = o.wet; S.grass[k] = o.grassDensity; S.flowers[k] = o.flowers;
      }
      return S;
    }
    /* RGBA float grid texture: height, grass density, flower density, water level (or -999) — read by grass and water shaders */
    dataTexture(THREE) {
      if (this.dataTex) return this.dataTex;
      const S = this.computeSurface(), n = this.n, d = new Float32Array(n * n * 4);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, x = i * this.cell - this.half, z = j * this.cell - this.half, wa = this.waterAt(x, z);
        d[k * 4] = this.h[k]; d[k * 4 + 1] = S.grass[k]; d[k * 4 + 2] = S.flowers[k]; d[k * 4 + 3] = wa ? wa.level : -999;
      }
      const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat, THREE.FloatType); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
      t.userData = { n, cell: this.cell, half: this.half };
      return this.dataTex = t;
    }
    buildMeshes(THREE, material, chunks = 8) {
      const n = this.n, per = (n - 1) / chunks, group = new THREE.Group(); group.name = 'Terrain';
      const S = this.computeSurface();
      for (let cj = 0; cj < chunks; cj++) for (let ci = 0; ci < chunks; ci++) {
        const i0 = Math.round(ci * per), i1 = Math.round((ci + 1) * per), j0 = Math.round(cj * per), j1 = Math.round((cj + 1) * per);
        const w = i1 - i0 + 1, d = j1 - j0 + 1, cnt = w * d, pos = new Float32Array(cnt * 3), clr = new Float32Array(cnt * 3), gr = new Float32Array(cnt * 4), rk = new Float32Array(cnt * 4), wt = new Float32Array(cnt), idx = [];
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = (j - j0) * w + (i - i0), x = i * this.cell - this.half, z = j * this.cell - this.half, g = j * n + i;
          pos[k * 3] = x; pos[k * 3 + 1] = this.h[g]; pos[k * 3 + 2] = z;
          clr.set(S.tint.subarray(g * 3, g * 3 + 3), k * 3); gr.set(S.ground.subarray(g * 4, g * 4 + 4), k * 4); rk.set(S.rock.subarray(g * 4, g * 4 + 4), k * 4); wt[k] = S.wet[g];
        }
        for (let j = 0; j < d - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i, b = a + 1, c = a + w, e = c + 1; idx.push(a, c, b, b, c, e); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(clr, 3));
        g.setAttribute('aGround', new THREE.BufferAttribute(gr, 4)); g.setAttribute('aRock', new THREE.BufferAttribute(rk, 4)); g.setAttribute('aWet', new THREE.BufferAttribute(wt, 1));
        g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, material); m.receiveShadow = true; m.name = `TerrainChunk_${ci}_${cj}`; group.add(m);
      }
      return group;
    }
    /* road surfaces: ribbons that follow the ground, a few cm above it; aRoad = (across 0..1, along metres) */
    buildRoads(THREE, material) {
      const group = new THREE.Group(); group.name = 'Roads';
      const SURF = { cobble: 0, royal: 1, dirt: 2 };
      for (const R of this.roads) {
        const P = R.pts, n = P.length, pos = [], clr = [], rd = [], sf = [], wd = [], idx = [], across = 6, W = R.width + 1.6; let dist = 0;
        for (let i = 0; i < n; i++) {
          if (i) dist += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
          const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
          for (let k = 0; k <= across; k++) {
            const s = (k / across - 0.5) * W, x = P[i][0] + nx * s, z = P[i][1] + nz * s;
            pos.push(x, Math.max(R.level[i], this.heightAt(x, z) - 0.04) + 0.07, z);
            const q = 0.94 + 0.06 * A.Noise.vnoise(x / 4, z / 4); clr.push(q, q, q);
            rd.push(k / across, dist); sf.push(SURF[R.surface] ?? 2); wd.push(W);
          }
          if (i < n - 1 && !this.waterAt(P[i][0], P[i][1]) && !this.waterAt(P[i + 1][0], P[i + 1][1]))     // bridges carry the road over rivers
            for (let k = 0; k < across; k++) { const a0 = i * (across + 1) + k, b0 = a0 + 1, c0 = a0 + across + 1, d0 = c0 + 1; idx.push(a0, c0, b0, b0, c0, d0); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(clr, 3));
        g.setAttribute('aRoad', new THREE.Float32BufferAttribute(rd, 2)); g.setAttribute('aSurf', new THREE.Float32BufferAttribute(sf, 1)); g.setAttribute('aWidth', new THREE.Float32BufferAttribute(wd, 1));
        g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, material); m.receiveShadow = true; m.name = 'Road_' + R.id; m.renderOrder = 1; group.add(m);
      }
      return group;
    }
    /* river surfaces: ribbons at the water level with flow coordinates for the animated shader */
    buildWater(THREE, material) {
      const group = new THREE.Group(); group.name = 'Rivers';
      for (const R of this.rivers) {
        const P = R.pts, n = P.length, pos = [], uv = [], fd = [], idx = [], across = 6, W = R.width + 4; let dist = 0;
        for (let i = 0; i < n; i++) {
          if (i) dist += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
          const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
          for (let k = 0; k <= across; k++) { const s = (k / across - 0.5) * W; pos.push(P[i][0] + nx * s, R.level[i], P[i][1] + nz * s); uv.push(k / across, dist); fd.push(dx / l, dz / l, W); }
          if (i < n - 1) for (let k = 0; k < across; k++) { const a0 = i * (across + 1) + k, b0 = a0 + 1, c0 = a0 + across + 1, d0 = c0 + 1; idx.push(a0, c0, b0, b0, c0, d0); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('flowUv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('flowDir', new THREE.Float32BufferAttribute(fd, 3));
        g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, material); m.name = 'River_' + R.id; m.renderOrder = 2; group.add(m);
      }
      return group;
    }
  }
  function boxSmooth(a, r) { return a.map((_, i) => { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const j = i + k; if (j >= 0 && j < a.length) { s += a[j]; c++; } } return s / c; }); }
  A.Terrain = Terrain; A.LineIndex = LineIndex; A.densify = densify;
})();
