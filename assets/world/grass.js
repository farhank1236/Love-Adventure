/* Aethelos grass and wild flowers: GPU-instanced blades on a grid that follows the camera (no per-frame CPU work).
   Blade placement reads the terrain data texture (height, grass density, flower density) and an exclusion mask
   (roads, rivers, buildings, walls, fields, plazas), so grass only grows on open ground. Two rings: dense near the
   camera, sparser further out, cross-faded so there is no visible edge. Blades bend in gusts of wind and lean away
   from the hero. createGrass({THREE, scene, terrain, world, quality}) -> { update(camera, player), rebuildMask(), setQuality(q), dispose() } */
(() => {
  const A = window.Aethelos ||= {};
  const QUAL = {
    high: { near: [0.17, 15], far: [0.45, 40], flowers: [1.0, 36] },
    medium: { near: [0.23, 12], far: [0.56, 34], flowers: [1.3, 28] },
    low: { near: [0.34, 9], far: null, flowers: [1.8, 18] }
  };
  function bladeGeometry(THREE, blades, segs) {
    const pos = [], b = [], idx = [];
    for (let k = 0; k < blades; k++) {
      const base = pos.length / 3;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        if (s < segs) { pos.push(-1, t, k, 1, t, k); b.push(-1, t, k, 0, 1, t, k, 0); }
        else { pos.push(0, 1, k); b.push(0, 1, k, 0); }
      }
      for (let s = 0; s < segs - 1; s++) { const a = base + s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const a = base + (segs - 1) * 2; idx.push(a, a + 1, a + 2);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aB', new THREE.Float32BufferAttribute(b, 4)); g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }
  function flowerGeometry(THREE) {
    // stem: two crossed thin quads; head: 6 petals as a flat star, slightly cupped
    const pos = [], b = [], idx = [];
    for (const r of [0, Math.PI / 2]) { const c = Math.cos(r), s = Math.sin(r), o = pos.length / 3;
      pos.push(-c, 0, -s, c, 0, -s, -c, 1, -s, c, 1, -s); b.push(-1, 0, 0, r, 1, 0, 0, r, -1, 1, 0, r, 1, 1, 0, r); idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    const o = pos.length / 3; pos.push(0, 1, 0); b.push(0, 0, 2, 0);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = i % 2 ? 0.45 : 1; pos.push(Math.cos(a) * rr, 1, Math.sin(a) * rr); b.push(Math.cos(a) * rr, Math.sin(a) * rr, 1, 0); }
    for (let i = 0; i < 12; i++) idx.push(o, o + 1 + i, o + 1 + (i + 1) % 12);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aB', new THREE.Float32BufferAttribute(b, 4)); g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }
  const PLACE = /* glsl */`
    uniform sampler2D uData; uniform sampler2D uMask; uniform float uN; uniform float uCell; uniform float uHalf; uniform float uMaskRes;
    uniform vec2 uCenter; uniform float uSpacing; uniform float uG; uniform float uRadius; uniform float uFadeIn; uniform float uFadeOut;
    vec4 dataAt(vec2 xz){ vec2 f = (xz + uHalf) / uCell; ivec2 i = ivec2(floor(f)); vec2 t = fract(f); int n = int(uN) - 1;
      vec4 a = texelFetch(uData, clamp(i, ivec2(0), ivec2(n)), 0), b = texelFetch(uData, clamp(i + ivec2(1, 0), ivec2(0), ivec2(n)), 0);
      vec4 c = texelFetch(uData, clamp(i + ivec2(0, 1), ivec2(0), ivec2(n)), 0), d = texelFetch(uData, clamp(i + ivec2(1, 1), ivec2(0), ivec2(n)), 0);
      // height: same split as the terrain triangles; the rest bilinear
      float h = t.x + t.y <= 1.0 ? a.x + (b.x - a.x) * t.x + (c.x - a.x) * t.y : d.x + (c.x - d.x) * (1.0 - t.x) + (b.x - d.x) * (1.0 - t.y);
      vec4 r = mix(mix(a, b, t.x), mix(c, d, t.x), t.y); r.x = h; return r; }
    float maskAt(vec2 xz){ return texture2D(uMask, (xz + uHalf) / (uHalf * 2.0)).r; }
    // returns the clump root (xz), with w = keep (0 = culled) and z = per-clump random
    vec4 clump(out float density, out vec4 dat){
      float id = float(gl_InstanceID); vec2 c = vec2(mod(id, uG), floor(id / uG));
      vec2 cell = uCenter + (c - uG * 0.5) * uSpacing; vec2 key = floor(cell / uSpacing + 0.5);
      vec2 rnd = vec2(h12(key), h12(key + 17.3)); vec2 p = cell + (rnd - 0.5) * uSpacing;
      float r = distance(p, cameraPosition.xz);
      float keep = smoothstep(uFadeIn - 2.0, uFadeIn, r) * (1.0 - smoothstep(uFadeOut, uRadius, r));
      density = 0.0; dat = vec4(0.0);
      if (keep > 0.0) { dat = dataAt(p); density = dat.y * maskAt(p); if (dat.w > dat.x - 0.05) density = 0.0; }
      float h3 = h12(key + 41.7);
      return vec4(p, h3, step(h3, density * 1.1) * keep);
    }`;
  function makeMaterial(THREE, uniforms, kind) {
    const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: kind === 'flower' ? 0.6 : 0.75, metalness: 0 });
    m.onBeforeCompile = sh => {
      A.Mat.addUniforms(sh); Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = 'attribute vec4 aB; varying vec3 vGC; varying float vT;\n' + A.Mat.VCOMMON + PLACE + '\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', kind === 'flower' ? /* glsl */`
          float dens; vec4 dat; vec4 cl = clump(dens, dat); vec3 gPos, gNrm; vT = aB.y;
          float keepF = step(cl.z, dat.z * maskAt(cl.xy) * 1.2) * cl.w;
          vec2 rr = vec2(h12(cl.xy * 3.1), h12(cl.xy * 5.7));
          float hgt = (0.22 + 0.28 * rr.x) * min(1.0, cl.w * 2.0);
          float gust = sin(uTime * 1.9 + dot(cl.xy, uWind.xz) * 0.3) * 0.5 + 0.5;
          vec3 lean = vec3(uWind.x, 0.0, uWind.z) * gust * 0.06;
          vec3 root = vec3(cl.x, dat.x - 0.02, cl.y);
          if (aB.z < 0.5) { vec3 side = vec3(cos(aB.w), 0.0, sin(aB.w)); gPos = root + side * aB.x * 0.008 + vec3(0.0, hgt * aB.y, 0.0) + lean * aB.y; gNrm = vec3(0.0, 0.3, 0.0) + vec3(-side.z, 0.0, side.x); }
          else { float s = 0.045 + 0.03 * rr.y; gPos = root + vec3(aB.x * s, hgt + 0.012 * (1.0 - dot(aB.xy, aB.xy)), aB.y * s) + lean; gNrm = vec3(0.0, 1.0, 0.0); }
          float pick = h12(cl.xy * 9.1);
          vec3 pc = pick < 0.3 ? vec3(0.75, 0.08, 0.1) : pick < 0.55 ? vec3(0.92, 0.75, 0.12) : pick < 0.75 ? vec3(0.85, 0.85, 0.9) : pick < 0.9 ? vec3(0.42, 0.25, 0.75) : vec3(0.95, 0.45, 0.65);
          vGC = aB.z < 0.5 ? vec3(0.06, 0.12, 0.03) : (aB.z > 1.5 ? vec3(0.9, 0.7, 0.1) : pc * pc);
          if (keepF < 0.5) gPos = vec3(cl.x, -9999.0, cl.y);
          vec3 objectNormal = normalize(gNrm);` : /* glsl */`
          float dens; vec4 dat; vec4 cl = clump(dens, dat); vec3 gPos, gNrm; vT = aB.y;
          float a0 = cl.z * 6.2831853 + aB.z * 2.094, rr = h12(cl.xy + aB.z * 3.7);
          vec2 off = vec2(cos(a0 * 1.7), sin(a0 * 1.7)) * 0.07 * (0.3 + rr);
          vec3 root = vec3(cl.x + off.x, dat.x - 0.03, cl.y + off.y);
          float pch = vn2(cl.xy * 0.35) * 0.6 + vn2(cl.xy * 0.07) * 0.4;
          float hgt = (0.16 + 0.2 * rr + 0.3 * pch * pch) * (0.55 + 0.45 * smoothstep(0.0, 0.6, dens)) * min(1.0, cl.w * 1.5);
          float wid = (0.016 + 0.012 * h12(cl.xy * 1.9 + aB.z)) * sqrt(uSpacing / 0.17);
          vec3 face = vec3(cos(a0), 0.0, sin(a0)), side = vec3(-face.z, 0.0, face.x);
          // wind: slow gusts rolling across the meadow + quick flutter; the hero pushes blades aside
          float gust = vn2(cl.xy * 0.045 - uWind.xz * uTime * 0.35) ;
          float wave = sin(uTime * 2.2 + dot(cl.xy, uWind.xz) * 0.45 + rr * 3.0) * 0.5 + 0.5;
          float bendAmt = 0.25 + rr * 0.35 + (0.25 + 0.9 * gust) * (0.3 + 0.7 * wave) * 0.9;
          vec3 bendDir = normalize(face * 0.5 + vec3(uWind.x, 0.0, uWind.z) * (0.4 + gust));
          vec2 away = cl.xy - uPlayer.xz; float pd = length(away);
          if (pd < 1.2 && abs(dat.x - uPlayer.y) < 1.5) { float k = 1.0 - pd / 1.2; bendDir = normalize(mix(bendDir, vec3(away.x, 0.0, away.y) / max(pd, 1e-3), k)); bendAmt += 1.4 * k; }
          float t = aB.y; vec3 up = vec3(0.0, 1.0, 0.0);
          float bt = min(1.2, bendAmt) * t * t;                                     // quadratic bend, roughly length-preserving
          gPos = root + up * hgt * t * (1.0 - 0.3 * bt) + bendDir * hgt * 0.55 * bt + side * aB.x * wid * (1.0 - t * 0.85);
          vec3 tng = normalize(up * (1.0 - 0.6 * bt) + bendDir * 1.1 * min(1.2, bendAmt) * t);
          gNrm = normalize(mix(cross(side, tng), up, 0.55));
          // colour: dark roots, lighter tips, dry straw patches, a little per-blade variation
          float dry = smoothstep(0.55, 0.85, vn2(cl.xy * 0.02 + 40.0) * 0.7 + vn2(cl.xy * 0.11) * 0.3);
          float hue = vn2(cl.xy * 0.06 + 7.0), hue2 = vn2(cl.xy * 0.5 - 3.0);
          vec3 lush = mix(vec3(0.075, 0.19, 0.035), vec3(0.15, 0.25, 0.045), hue);          // deep green .. yellow-green
          lush = mix(lush, vec3(0.06, 0.15, 0.07), smoothstep(0.6, 0.9, hue2) * 0.6);       // a few blue-green tufts
          vec3 tipC = mix(lush, vec3(0.33, 0.29, 0.11), dry * 0.8) * (0.78 + 0.45 * rr);
          vec3 rootC = mix(vec3(0.02, 0.04, 0.012), vec3(0.05, 0.045, 0.02), dry);
          vGC = mix(rootC, tipC, smoothstep(0.0, 0.95, t));
          if (cl.w <= 0.0) gPos = vec3(cl.x, -9999.0, cl.y);
          vec3 objectNormal = gNrm;`)
        .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
      sh.fragmentShader = 'varying vec3 vGC; varying float vT;\n' + A.Mat.VCOMMON + '\n' + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = vGC * cloudShade(vWorldPosG.xz);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vGC * 0.04 * uDay * vT;');     // light through the blade tips
      sh.vertexShader = 'varying vec3 vWorldPosG;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWorldPosG = transformed;');
      sh.fragmentShader = 'varying vec3 vWorldPosG;\n' + sh.fragmentShader;
    };
    m.customProgramCacheKey = () => 'aeth-grass-' + kind;
    return m;
  }
  function createGrass({ THREE, scene, terrain, world, quality = 'high' }) {
    const data = terrain.dataTexture(THREE), half = terrain.half, res = Math.round(half * 2);
    const maskData = new Uint8Array(res * res), mask = new THREE.DataTexture(maskData, res, res, THREE.RedFormat, THREE.UnsignedByteType);
    mask.magFilter = mask.minFilter = THREE.LinearFilter; mask.needsUpdate = true;
    const group = new THREE.Group(); group.name = 'Grass'; scene.add(group);
    let rings = [];
    function rebuildMask() {
      maskData.fill(255);
      const set0 = (x0, z0, x1, z1, test) => {
        const i0 = Math.max(0, Math.floor(x0 + half)), i1 = Math.min(res - 1, Math.ceil(x1 + half)), j0 = Math.max(0, Math.floor(z0 + half)), j1 = Math.min(res - 1, Math.ceil(z1 + half));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = i - half + 0.5, z = j - half + 0.5, v = test(x, z); if (v < 1) maskData[j * res + i] = Math.min(maskData[j * res + i], Math.round(255 * Math.max(0, v))); }
      };
      // roads (soft shoulders) and river channels
      for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
        const x = i - half + 0.5, z = j - half + 0.5, rd = terrain.roadDist(x, z), rv = terrain.riverDist(x, z);
        let v = Math.min(1, Math.max(0, (rd - 0.2) / 1.6)); v = Math.min(v, Math.max(0, Math.min(1, (rv + 0.3) / 1.5)));
        if (v < 1) maskData[j * res + i] = Math.round(255 * v);
      }
      // every collider footprint (houses, walls, rocks, trees …) plus the flat pieces (plazas, fields, flower beds, arenas)
      const seen = new Set();
      for (const list of world.collide.grid.values()) for (const s of list) {
        if (seen.has(s)) continue; seen.add(s);
        if (s.k === 'circ') { const r = s.r + 0.25; set0(s.cx - r, s.cz - r, s.cx + r, s.cz + r, (x, z) => (Math.hypot(x - s.cx, z - s.cz) - s.r) / 0.6); }
        else { const r = Math.hypot(s.hw, s.hd) + 0.5; set0(s.cx - r, s.cz - r, s.cx + r, s.cz + r, (x, z) => { const dx = x - s.cx, dz = z - s.cz, lx = Math.abs(dx * s.ux + dz * s.uz) - s.hw, lz = Math.abs(dx * s.vx + dz * s.vz) - s.hd; return Math.max(lx, lz) / 0.6; }); }
      }
      const FLAT = { plaza: [30, 'c'], field_wheat: [[10.4, 7.4], 'b'], field_veg: [[10.4, 7.4], 'b'], flower_bed: [[1.8, 1.2], 'b'], boss_arena: [19.8, 'c'], fountain: [4.6, 'c'], camp: [4.5, 'c'], gazebo: [3.2, 'c'], well: [1.6, 'c'], quest_area: [3.2, 'c'], enemy_spawn: [1.8, 'c'], save_point: [2, 'c'], portal: [[3, 1.5], 'b'] };
      for (const o of world.objects) {
        const f = FLAT[o.type]; if (!f) continue; const sc = Math.max(o.scale.x, o.scale.z);
        if (f[1] === 'c') { const r = f[0] * sc; set0(o.position.x - r, o.position.z - r, o.position.x + r, o.position.z + r, (x, z) => (Math.hypot(x - o.position.x, z - o.position.z) - r) / 0.8); }
        else { const c = Math.cos(o.rotation.y || 0), s = Math.sin(o.rotation.y || 0), hw = f[0][0] * o.scale.x, hd = f[0][1] * o.scale.z, r = Math.hypot(hw, hd) + 1;
          set0(o.position.x - r, o.position.z - r, o.position.x + r, o.position.z + r, (x, z) => { const dx = x - o.position.x, dz = z - o.position.z, lx = Math.abs(dx * c - dz * s) - hw, lz = Math.abs(dx * s + dz * c) - hd; return Math.max(lx, lz) / 0.8; }); }
      }
      mask.needsUpdate = true;
    }
    function build(q) {
      for (const r of rings) { group.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
      rings = [];
      const cfg = QUAL[q] || QUAL.high;
      const ring = (spacing, radius, fadeIn, kind, blades, segs) => {
        const G = Math.ceil(radius * 2 / spacing) + 1;
        const geo = kind === 'flower' ? flowerGeometry(THREE) : bladeGeometry(THREE, blades, segs); geo.instanceCount = G * G;
        const u = { uData: { value: data }, uMask: { value: mask }, uN: { value: data.userData.n }, uCell: { value: data.userData.cell }, uHalf: { value: half }, uMaskRes: { value: res },
          uCenter: { value: new THREE.Vector2() }, uSpacing: { value: spacing }, uG: { value: G }, uRadius: { value: radius }, uFadeIn: { value: fadeIn }, uFadeOut: { value: radius * 0.75 } };
        const mesh = new THREE.Mesh(geo, makeMaterial(THREE, u, kind)); mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'Grass_' + kind + '_' + spacing;
        group.add(mesh); rings.push({ mesh, u, spacing });
      };
      const [ns, nr] = cfg.near; ring(ns, nr, 0, 'blade', 3, 4);
      if (cfg.far) { const [fs, fr] = cfg.far; ring(fs, fr, nr * 0.85, 'blade', 4, 3); rings[0].u.uFadeOut.value = nr * 0.7; }
      else rings[0].u.uFadeOut.value = nr * 0.7;
      const [flS, flR] = cfg.flowers; ring(flS, flR, 0, 'flower');
    }
    rebuildMask(); build(quality);
    return {
      group, mask,
      update(camera, player) {
        A.Mat.U.uPlayer.value.copy(player);
        for (const r of rings) r.u.uCenter.value.set(Math.round(camera.position.x / r.spacing) * r.spacing, Math.round(camera.position.z / r.spacing) * r.spacing);
      },
      rebuildMask, setQuality: build,
      dispose() { for (const r of rings) { r.mesh.geometry.dispose(); r.mesh.material.dispose(); } scene.remove(group); mask.dispose(); }
    };
  }
  A.createGrass = createGrass;
})();
