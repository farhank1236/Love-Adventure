/* Aethelos materials: the 11 Poly Haven material sets (packed by tools/textures/build_textures.py) loaded into two
   texture arrays, plus the shaders that use them:
   - terrain: height-blended splat of meadow grass, farm soil, river pebbles and three rock types (biplanar on slopes), snow
   - roads: cobblestone / royal flagstones / dirt ribbons with soft edges
   - world objects: triplanar stone, marble, plaster, planks, studded doors, bark, metal, slate, soil, procedural roof tiles,
     leaves (with wind), glass (lit windows at night), straw, water; dirt and wear near the ground.
   Before the textures arrive every layer is a 1x1 texel of its mean colour, so the world renders at once. */
(() => {
  const A = window.Aethelos ||= {};
  // layer order in the arrays (index = layer)
  const LAYERS = ['rocky_terrain_02', 'farm_soil', 'aerial_rocks_02', 'dark_rock', 'dry_river_pebbles', 'grassy_cobblestone',
    'marble_cliff_05', 'stone_wall_04', 'wooden_garage_door', 'eucalyptus_bark', 'metal_plate_02'];
  // linear mean albedo and mean roughness of each layer (tools/textures -> assets/world/tex/materials.json)
  const MEAN = [[0.0774, 0.072, 0.0101], [0.093, 0.0459, 0.0167], [0.1657, 0.1159, 0.0475], [0.0112, 0.0079, 0.0053], [0.2253, 0.1582, 0.0938],
    [0.1852, 0.1284, 0.0783], [0.2968, 0.2688, 0.2336], [0.1719, 0.148, 0.128], [0.0676, 0.0295, 0.0223], [0.0844, 0.0548, 0.0258], [0.0868, 0.0632, 0.0443]];
  const ROUGH = [0.88, 0.903, 0.817, 0.666, 0.649, 0.764, 0.543, 0.783, 0.581, 0.861, 0.447];
  const L = { GRASS: 0, SOIL: 1, MOSS: 2, SLATE: 3, PEBBLE: 4, COBBLE: 5, MARBLE: 6, STONE: 7, DOOR: 8, BARK: 9, METAL: 10 };
  // object material ids (vertex attribute "mat".x); "mat".y = the primitive's long axis (0 x, 1 y, 2 z) for wood grain
  const M = { PLAIN: 0, STONE: 1, MARBLE: 2, PLASTER: 3, WOOD: 4, DOOR: 5, BARK: 6, METAL: 7, ROCK: 8, SLATE: 9, SOIL: 10, ROOF: 11, LEAF: 12, GLASS: 13,
    STRAW: 14, COBBLE: 15, WATER: 16, GOLD: 17, CLOTH: 18, BIRCH: 19 };

  // shared uniforms (sky / day-night drives them)
  const U = {
    uAlb: { value: null }, uNrm: { value: null }, uTexReady: { value: 0 }, uTime: { value: 0 }, uNight: { value: 0 }, uDay: { value: 1 },
    uWind: { value: null }, uCloudOff: { value: null }, uCloudCover: { value: 0.45 }, uCloudShadow: { value: 0.35 },
    uPlayer: { value: null }
  };

  const toSrgb = v => Math.round(255 * Math.min(1, Math.pow(Math.max(0, v), 1 / 2.2)));
  function placeholder(THREE, kind) {
    const n = LAYERS.length, d = new Uint8Array(4 * n);
    for (let i = 0; i < n; i++) {
      if (kind === 'alb') { d.set([toSrgb(MEAN[i][0]), toSrgb(MEAN[i][1]), toSrgb(MEAN[i][2]), 255], i * 4); }
      else d.set([128, 128, Math.round(ROUGH[i] * 255), 255], i * 4);
    }
    const t = new THREE.DataArrayTexture(d, 1, 1, n); t.format = THREE.RGBAFormat; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; if (kind === 'alb') t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
  }
  function init(THREE) {
    if (!U.uWind.value) { U.uWind.value = new THREE.Vector3(0.8, 0, 0.6).normalize(); U.uCloudOff.value = new THREE.Vector2(); U.uPlayer.value = new THREE.Vector3(); }
    if (!U.uAlb.value) { U.uAlb.value = placeholder(THREE, 'alb'); U.uNrm.value = placeholder(THREE, 'nrm'); }
  }
  /* fetch every layer, decode, and upload two DataArrayTextures (size px, mipmapped, anisotropic) */
  async function load(THREE, renderer, { size = 1024, base = 'assets/world/tex/', onProgress } = {}) {
    init(THREE);
    const n = LAYERS.length, alb = new Uint8Array(size * size * 4 * n), nrm = new Uint8Array(size * size * 4 * n);
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const ctx = cv.getContext('2d', { willReadFrequently: true });
    let done = 0;
    const one = async (name, suffix) => {
      const r = await fetch(base + name + suffix + '.jpg?v=tex-1'); if (!r.ok) throw new Error('texture ' + name + suffix + ' ' + r.status);
      const blob = await r.blob();
      let img;
      if (window.createImageBitmap) img = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      else img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(blob); });
      return img;
    };
    const jobs = [];
    LAYERS.forEach((name, i) => {
      for (const [suffix, dst] of [['_c', alb], ['_n', nrm]]) jobs.push(one(name, suffix).then(img => {
        ctx.drawImage(img, 0, 0, size, size); dst.set(ctx.getImageData(0, 0, size, size).data, i * size * size * 4);
        img.close && img.close(); done++; onProgress && onProgress(done / (n * 2));
      }));
    });
    await Promise.all(jobs);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);
    const make = (data, srgb) => {
      const t = new THREE.DataArrayTexture(data, size, size, n); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = aniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
    };
    const oldA = U.uAlb.value, oldN = U.uNrm.value;
    U.uAlb.value = make(alb, true); U.uNrm.value = make(nrm, false); U.uTexReady.value = 1;
    oldA && oldA.dispose(); oldN && oldN.dispose();
    return true;
  }

  // ---------------------------------------------------------------- GLSL
  const NOISE = /* glsl */`
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }
    float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
    float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  `;
  const LEAF = /* glsl */`
    // a few elongated leaves scattered over a card (uv 0..1); seed per card
    float leafMask(vec2 uv, float seed){
      if (uv.y > 1.5) {                                   // conifer: needle sprays along a twig
        uv.y -= 2.0; vec2 q = uv - 0.5; float env = 1.0 - smoothstep(0.3, 0.5, length(q * vec2(1.7, 1.0)));
        float side = abs(q.x), k = abs(fract((uv.y + side * 1.15) * 15.0 + seed * 0.37) - 0.5);
        float needles = (1.0 - smoothstep(0.1, 0.22, k)) * step(0.015, side) * step(side, 0.34 - 0.25 * abs(q.y));
        float twig = 1.0 - smoothstep(0.01, 0.025, side);
        return max(needles, twig) * env;
      }
      float a = 0.0;
      for (int i = 0; i < 16; i++){ float fi = float(i);
        vec2 c = (vec2(mod(fi, 4.0), floor(fi / 4.0)) + 0.5) / 4.0 + (vec2(h12(vec2(fi, seed)), h12(vec2(seed, fi + 3.0))) - 0.5) * 0.2;
        float ang = h12(vec2(fi * 1.7, seed + 9.0)) * 6.283; vec2 d = uv - c; d = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d; d.x *= 1.9;
        float l = length(d) / (0.085 + 0.03 * h12(vec2(seed + fi, 2.0))); a = max(a, 1.0 - smoothstep(0.7, 1.0, l)); }
      return a * smoothstep(0.52, 0.44, length(uv - 0.5) * 0.85);
    }
    vec3 leafSway(vec3 position, float id, vec4 inst){
      if (id < 11.5 || (id > 12.5 && id < 19.5)) return vec3(0.0);
      float hgt = max(0.0, position.y - 1.0), ph = inst.z * 6.283;
      float gust = 0.55 + 0.45 * sin(uTime * 0.7 + inst.x * 0.02 + inst.y * 0.017);
      vec3 sway = vec3(uWind.x, 0.0, uWind.z) * (sin(uTime * 1.3 + ph + position.y * 0.4) * 0.5 + 0.6) * gust * 0.03 * hgt;
      sway += vec3(sin(uTime * 3.1 + ph + position.x * 2.0), sin(uTime * 2.7 + position.z * 2.0) * 0.5, cos(uTime * 3.4 + ph + position.y)) * (id > 19.5 ? 0.045 : 0.02) * min(hgt, 3.0);
      return sway;
    }
  `;
  const UNIF = /* glsl */`
    uniform float uTexReady; uniform float uTime; uniform float uNight; uniform float uDay;
    uniform vec3 uWind; uniform vec2 uCloudOff; uniform float uCloudCover; uniform float uCloudShadow; uniform vec3 uPlayer;
  `;
  const CLOUDF = `
    float cloudShade(vec2 xz){ // moving cloud shadows (same field as the sky's cloud layer, projected straight down)
      float c = fbm2((xz + uCloudOff) * 0.0016) ; return 1.0 - uCloudShadow * uDay * smoothstep(1.0 - uCloudCover, 1.25 - uCloudCover, c); }
  `;
  const VCOMMON = UNIF + NOISE + CLOUDF + LEAF;
  const COMMON = UNIF + NOISE + CLOUDF + LEAF + /* glsl */`
    uniform highp sampler2DArray uAlb; uniform highp sampler2DArray uNrm;
    vec4 sA(float l, vec2 uv, vec2 dx, vec2 dy){ return textureGrad(uAlb, vec3(uv, l), dx, dy); }
    vec4 sN(float l, vec2 uv, vec2 dx, vec2 dy){ return textureGrad(uNrm, vec3(uv, l), dx, dy); }
    vec2 tN(vec4 n){ return (n.xy * 2.0 - 1.0) * uTexReady; }
  `;

  const MEAN_GLSL = `const vec3 LMEAN[${LAYERS.length}] = vec3[](${MEAN.map(m => `vec3(${m.map(v => v.toFixed(4)).join(',')})`).join(',')});`;

  function addUniforms(sh) { for (const k in U) sh.uniforms[k] = U[k]; }

  // ---------------------------------------------------------------- terrain
  function terrainMaterial(THREE) {
    init(THREE);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    m.onBeforeCompile = sh => {
      addUniforms(sh);
      sh.vertexShader = 'attribute vec4 aGround; attribute vec4 aRock; attribute float aWet;\nvarying vec4 vGround; varying vec4 vRock; varying float vWet; varying vec3 vWP; varying vec3 vWN;\n' +
        sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
          vGround = aGround; vRock = aRock; vWet = aWet; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = COMMON + MEAN_GLSL + 'varying vec4 vGround; varying vec4 vRock; varying float vWet; varying vec3 vWP; varying vec3 vWN;\n' +
        sh.fragmentShader
          .replace('#include <color_fragment>', /* glsl */`
            vec3 Ng = normalize(vWN); vec2 P = vWP.xz; vec2 dx = dFdx(P), dy = dFdy(P);
            float camD = length(vWP - cameraPosition), nearK = 1.0 - smoothstep(90.0, 220.0, camD);
            // ---- flat ground layers (grass meadow, farm soil, river pebbles), two scales each against tiling
            float macro = fbm2(P * 0.013);
            vec2 r2 = mat2(0.8, -0.6, 0.6, 0.8) * P;
            vec4 gA = mix(sA(0.0, P / 3.6, dx / 3.6, dy / 3.6), sA(0.0, r2 / 9.5, dx / 9.5, dy / 9.5), 0.3 + 0.3 * macro);
            vec4 gN = sN(0.0, P / 3.6, dx / 3.6, dy / 3.6);
            vec4 oA = vec4(0.0), oN = vec4(0.5, 0.5, 0.9, 1.0), pA = vec4(0.0), pN = vec4(0.5, 0.5, 0.7, 1.0);
            if (vGround.y > 0.01) { oA = mix(sA(1.0, P / 3.2, dx / 3.2, dy / 3.2), sA(1.0, r2 / 8.0, dx / 8.0, dy / 8.0), 0.35); oN = sN(1.0, P / 3.2, dx / 3.2, dy / 3.2); }
            if (vGround.z > 0.01) { pA = sA(4.0, P / 2.4, dx / 2.4, dy / 2.4); pN = sN(4.0, P / 2.4, dx / 2.4, dy / 2.4); }
            // ---- rock: steep slopes and rocky ground; biplanar (top + dominant side)
            float rockAmt = max(vGround.w, smoothstep(0.86, 0.66, Ng.y));
            vec4 rA = vec4(0.0), rN = vec4(0.5, 0.5, 0.8, 1.0); vec3 rWN = vec3(0.0);
            if (rockAmt > 0.01) {
              vec3 w = pow(abs(Ng), vec3(5.0)); w /= (w.x + w.y + w.z);
              vec3 rm = vRock.xyz / max(1e-3, vRock.x + vRock.y + vRock.z);
              float sc[3] = float[](7.0, 4.5, 6.0); float ly[3] = float[](2.0, 3.0, 6.0);
              for (int i = 0; i < 3; i++) {
                if (rm[i] < 0.02) continue;
                float s = sc[i], l = ly[i]; vec4 a = vec4(0.0), n4 = vec4(0.0); vec3 wn = vec3(0.0);
                if (w.y > 0.02) { vec4 aa = sA(l, P / s, dx / s, dy / s), nn = sN(l, P / s, dx / s, dy / s); vec2 t = tN(nn); a += aa * w.y; n4 += nn * w.y; wn += vec3(t.x, 0.0, t.y) * w.y; }
                if (w.x > 0.02) { vec2 q = vWP.zy, qx = dFdx(q), qy = dFdy(q); vec4 aa = sA(l, q / s, qx / s, qy / s), nn = sN(l, q / s, qx / s, qy / s); vec2 t = tN(nn); a += aa * w.x; n4 += nn * w.x; wn += vec3(0.0, t.y, t.x) * w.x; }
                if (w.z > 0.02) { vec2 q = vWP.xy, qx = dFdx(q), qy = dFdy(q); vec4 aa = sA(l, q / s, qx / s, qy / s), nn = sN(l, q / s, qx / s, qy / s); vec2 t = tN(nn); a += aa * w.z; n4 += nn * w.z; wn += vec3(t.x, t.y, 0.0) * w.z; }
                // slate is near-black: lift it to a weathered grey-brown; marble cliffs a touch warmer
                if (i == 1) a.rgb = a.rgb * vec3(5.2, 5.0, 4.8) + vec3(0.012);
                rA += a * rm[i]; rN += (n4 - vec4(0.5, 0.5, 0.8, 1.0)) * rm[i]; rWN += wn * rm[i];
              }
            }
            // ---- height-aware blend (pebbles and rocks poke through soil, grass fills the gaps)
            float wg = vGround.x, ws = vGround.y, wp = vGround.z;
            float tot = max(1e-3, wg + ws + wp); wg /= tot; ws /= tot; wp /= tot;
            wg *= 1.0 - rockAmt; ws *= 1.0 - rockAmt; wp *= 1.0 - rockAmt;
            float hg = luma(gA.rgb) / ${(0.2126 * MEAN[0][0] + 0.7152 * MEAN[0][1] + 0.0722 * MEAN[0][2]).toFixed(4)} * 0.5;
            float hs = luma(oA.rgb) / ${(0.2126 * MEAN[1][0] + 0.7152 * MEAN[1][1] + 0.0722 * MEAN[1][2]).toFixed(4)} * 0.5;
            float hp = luma(pA.rgb) / ${(0.2126 * MEAN[4][0] + 0.7152 * MEAN[4][1] + 0.0722 * MEAN[4][2]).toFixed(4)} * 0.5;
            float hr = luma(rA.rgb) / max(0.02, luma(rA.rgb) + 0.05) + 0.4;
            vec4 hb = vec4(wg + hg * 0.35 * wg, ws + hs * 0.35 * ws, wp + hp * 0.45 * wp, rockAmt + hr * 0.3 * rockAmt);
            float mx = max(max(hb.x, hb.y), max(hb.z, hb.w)) - 0.18;
            hb = max(hb - mx, 0.0); hb /= max(1e-4, hb.x + hb.y + hb.z + hb.w);
            vec3 alb = gA.rgb * hb.x + oA.rgb * hb.y + pA.rgb * hb.z + rA.rgb * hb.w;
            vec4 nrm = gN * hb.x + oN * hb.y + pN * hb.z + (vec4(0.5, 0.5, 0.8, 1.0) + rN) * hb.w;
            vec2 tg = tN(nrm);
            vec3 wn = vec3(tg.x, 0.0, tg.y) * (1.0 - hb.w) + rWN * hb.w;
            float rough = nrm.b;
            // ---- snow on high, gentle ground
            float snow = vRock.w * smoothstep(0.55, 0.8, Ng.y) * smoothstep(0.25, 0.6, vRock.w + 0.3 * (fbm2(P * 0.08) - 0.5));
            if (snow > 0.0) { alb = mix(alb, vec3(0.82, 0.85, 0.9) * (0.92 + 0.08 * fbm2(P * 0.7)), snow); rough = mix(rough, 0.55, snow); wn *= 1.0 - 0.6 * snow; }
            // ---- tint (meadow dryness, forest floor), wet banks, cloud shadows
            alb *= vColor.rgb;
            float wet = clamp(vWet, 0.0, 1.0); alb *= 1.0 - 0.45 * wet; rough = mix(rough, 0.25, wet * 0.8);
            alb *= cloudShade(P);
            diffuseColor.rgb = alb;
            vec3 tWN = normalize(Ng + wn * 1.15 * nearK);
          `)
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(rough, 0.04, 1.0);')
          .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tWN, 0.0)).xyz);');
    };
    m.customProgramCacheKey = () => 'aeth-terrain-1';
    return m;
  }

  // ---------------------------------------------------------------- roads (u across 0..1, v along in metres, aSurf 0 cobble / 1 royal / 2 dirt)
  function roadMaterial(THREE) {
    init(THREE);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      addUniforms(sh);
      sh.vertexShader = 'attribute vec2 aRoad; attribute float aSurf; attribute float aWidth;\nvarying vec2 vRoad; varying float vSurf; varying float vWidth; varying vec3 vWP;\n' +
        sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vRoad = aRoad; vSurf = aSurf; vWidth = aWidth; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = COMMON + 'varying vec2 vRoad; varying float vSurf; varying float vWidth; varying vec3 vWP;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', /* glsl */`
          vec2 uv = vec2(vRoad.x * vWidth, vRoad.y); vec2 dx = dFdx(uv), dy = dFdy(uv);
          vec4 a, n; float edgeN = fbm2(vWP.xz * 0.9);
          if (vSurf < 1.5) { float s = vSurf < 0.5 ? 2.6 : 3.2; a = sA(5.0, uv / s, dx / s, dy / s); n = sN(5.0, uv / s, dx / s, dy / s);
            if (vSurf > 0.5) a.rgb = mix(a.rgb, vec3(luma(a.rgb)) * vec3(1.35, 1.28, 1.15), 0.55) * 1.25; }        // royal road: pale, worn flagstones
          else { a = mix(sA(1.0, uv / 3.0, dx / 3.0, dy / 3.0), sA(4.0, uv / 2.2, dx / 2.2, dy / 2.2), 0.35 + 0.3 * fbm2(vWP.xz * 0.2)); n = sN(1.0, uv / 3.0, dx / 3.0, dy / 3.0);
            float rut = smoothstep(0.08, 0.0, abs(abs(vRoad.x - 0.5) - 0.2)); a.rgb *= 1.0 - 0.18 * rut; }      // dirt tracks with cart ruts
          diffuseColor.rgb = a.rgb * vColor.rgb * cloudShade(vWP.xz);
          float edge = min(vRoad.x, 1.0 - vRoad.x) * vWidth;              // metres from the road edge
          diffuseColor.a = smoothstep(0.0, 0.9 + 0.8 * edgeN, edge);
          float rough = n.b; vec2 t = tN(n);
          vec3 tWN = normalize(vec3(0.0, 1.0, 0.0) + vec3(t.x, 0.0, t.y) * 1.2);
        `)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rough;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tWN, 0.0)).xyz);');
    };
    m.customProgramCacheKey = () => 'aeth-road-1';
    return m;
  }

  // ---------------------------------------------------------------- world objects (instanced, triplanar in object space)
  function objectMaterial(THREE) {
    init(THREE);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, alphaToCoverage: true });
    m.onBeforeCompile = sh => {
      addUniforms(sh);
      sh.vertexShader = 'attribute vec2 mat; attribute vec2 luv;\nvarying vec3 vLP; varying vec3 vLN; varying vec2 vMat; varying vec4 vInst; varying mat3 vL2V; varying vec3 vWPo; varying vec2 vLUV;\n' + VCOMMON +
        sh.vertexShader
          .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
            #ifdef USE_INSTANCING
              mat4 iM = instanceMatrix;
            #else
              mat4 iM = mat4(1.0);
            #endif
            vInst = vec4(iM[3].x, iM[3].z, h12(iM[3].xz * 0.37), iM[3].y);
            transformed += leafSway(position, mat.x, vInst);
            vLP = position; vLN = normal; vMat = mat; vLUV = luv;`)
          .replace('#include <project_vertex>', /* glsl */`#include <project_vertex>
            mat3 l2w = mat3(modelMatrix) * mat3(iM);
            vL2V = mat3(viewMatrix) * mat3(normalize(l2w[0]), normalize(l2w[1]), normalize(l2w[2]));
            vWPo = (modelMatrix * iM * vec4(transformed, 1.0)).xyz;`);
      sh.fragmentShader = COMMON + MEAN_GLSL + 'varying vec3 vLP; varying vec3 vLN; varying vec2 vMat; varying vec4 vInst; varying mat3 vL2V; varying vec3 vWPo; varying vec2 vLUV;\n' + /* glsl */`
        // triplanar sample of one layer in object space; returns albedo, packed normal and the perturbed object-space normal
        void tri(float l, float s, vec3 p, vec3 N, out vec4 a, out vec4 n, out vec3 pn) {
          vec3 w = pow(abs(N), vec3(6.0)); w /= (w.x + w.y + w.z);
          a = vec4(0.0); n = vec4(0.0); vec3 d = vec3(0.0);
          if (w.x > 0.02) { vec2 q = p.zy / s; vec2 qx = dFdx(q), qy = dFdy(q); vec4 aa = sA(l, q, qx, qy), nn = sN(l, q, qx, qy); vec2 t = tN(nn); a += aa * w.x; n += nn * w.x; d += vec3(0.0, t.y, t.x * sign(N.x)) * w.x; }
          if (w.y > 0.02) { vec2 q = p.xz / s; vec2 qx = dFdx(q), qy = dFdy(q); vec4 aa = sA(l, q, qx, qy), nn = sN(l, q, qx, qy); vec2 t = tN(nn); a += aa * w.y; n += nn * w.y; d += vec3(t.x, 0.0, t.y) * w.y; }
          if (w.z > 0.02) { vec2 q = p.xy / s; vec2 qx = dFdx(q), qy = dFdy(q); vec4 aa = sA(l, q, qx, qy), nn = sN(l, q, qx, qy); vec2 t = tN(nn); a += aa * w.z; n += nn * w.z; d += vec3(t.x * sign(N.z), t.y, 0.0) * w.z; }
          pn = normalize(N + d);
        }
      ` + sh.fragmentShader
        .replace('#include <color_fragment>', /* glsl */`
          vec3 col = vColor.rgb; float id = floor(vMat.x + 0.5), axis = vMat.y, leafA = 1.0;
          vec3 N = normalize(vLN); vec3 p = vLP + vec3(vInst.x, 0.0, vInst.y) * 0.37;    // per-instance offset: no two buildings share a pattern
          vec3 pn = N; float rough = 0.85, metal = 0.0; vec3 emis = vec3(0.0);
          vec4 a, n;
          float lumC = luma(col);
          if (id < 0.5 || id > 17.5 && id < 18.5) {                                  // plain / cloth: woven, slightly faded
            float w = vn2(p.xy * 40.0 + p.z * 13.0) * 0.5 + vn2(p.zy * 40.0) * 0.5;
            col *= 0.86 + 0.18 * w; rough = 0.9;
          } else if (id < 1.5) {                                                      // dressed stone
            tri(7.0, 3.0, p, N, a, n, pn); col = a.rgb * (lumC / luma(LMEAN[7])) * mix(vec3(1.0), col / max(lumC, 1e-3), 0.25); rough = n.b;
          } else if (id < 2.5) {                                                      // marble (palace, statues, columns)
            tri(6.0, 3.0, p, N, a, n, pn); pn = normalize(mix(N, pn, 0.45)); col *= 0.8 * (0.82 + 0.18 * luma(a.rgb) / luma(LMEAN[6])); rough = 0.45 + 0.3 * n.b;   // dressed limestone / marble: soft veining
          } else if (id < 3.5) {                                                      // lime plaster: marble grain at low contrast, stains, rising damp
            tri(6.0, 2.5, p, N, a, n, pn); pn = normalize(mix(N, pn, 0.3));
            float blot = fbm2(p.xy * 0.7 + p.z * 0.6 + 3.0), streak = vn2(vec2(p.x * 3.0 + p.z * 3.0, p.y * 0.35));
            col *= 0.72 * (0.84 + 0.16 * luma(a.rgb) / luma(LMEAN[6])) * (0.86 + 0.2 * blot) * (0.93 + 0.07 * streak);
            col *= mix(vec3(0.78, 0.74, 0.66), vec3(1.0), smoothstep(0.2, 1.3, vLP.y + 0.3 * blot));
            rough = 0.93;
          } else if (id < 4.5) {                                                      // planks: grain along the long axis, seams across
            vec3 q = axis < 0.5 ? p.xyz : axis < 1.5 ? p.yxz : p.zxy;                 // q.x = along the grain
            vec3 qn = axis < 0.5 ? N.xyz : axis < 1.5 ? N.yxz : N.zxy;
            float across = abs(qn.y) > abs(qn.z) ? q.z : q.y;
            float plank = floor(across / 0.22), fr = fract(across / 0.22);
            float grain = fbm2(vec2(q.x * 1.3 + plank * 7.3, across * 38.0)) * 0.6 + vn2(vec2(q.x * 0.25 + plank * 3.1, 2.0)) * 0.4;
            col *= (0.72 + 0.42 * grain) * (0.86 + 0.24 * h12(vec2(plank, floor(q.x / 2.4)))) * (1.0 - 0.45 * smoothstep(0.08, 0.0, min(fr, 1.0 - fr)));
            vec3 dn = vec3(0.0); float sd = (smoothstep(0.0, 0.08, fr) - smoothstep(0.92, 1.0, fr)) * 0.0;
            pn = normalize(N + (vec3(vn2(p.zy * 30.0), vn2(p.xz * 30.0), vn2(p.xy * 30.0)) - 0.5) * 0.12); rough = 0.78;
          } else if (id < 5.5) {                                                      // studded door / gate panels
            tri(8.0, 2.4, p, N, a, n, pn); col = a.rgb * (lumC / luma(LMEAN[8])) * mix(vec3(1.0), col / max(lumC, 1e-3), 0.3); rough = n.b;
          } else if (id < 6.5 || (id > 18.5 && id < 19.5)) {                                       // bark (birch: pale, dark lenticels)
            tri(9.0, 1.6, p, N, a, n, pn);
            if (id > 18.5 && id < 19.5) { col = mix(vec3(0.62, 0.6, 0.55), a.rgb * 4.0, 0.25) * (1.0 - 0.75 * smoothstep(0.55, 0.75, vn2(vec2(atan(p.x, p.z) * 3.0, p.y * 6.0)))); }
            else col = a.rgb * (lumC / luma(LMEAN[9])) * mix(vec3(1.0), col / max(lumC, 1e-3), 0.3);
            rough = n.b;
          } else if (id < 7.5) {                                                      // iron: rusty plate; bare metal where unrusted
            tri(10.0, 1.4, p, N, a, n, pn); float sat = (max(a.r, max(a.g, a.b)) - min(a.r, min(a.g, a.b))) / max(1e-3, max(a.r, max(a.g, a.b)));
            float rust = smoothstep(0.25, 0.5, sat); col = mix(vec3(0.32, 0.33, 0.35), a.rgb * 1.6, rust); metal = 0.85 * (1.0 - rust); rough = mix(0.42, 0.9, rust);
          } else if (id < 8.5) {                                                      // mossy rock
            tri(2.0, 3.5, p, N, a, n, pn); col = a.rgb * 1.1; rough = n.b;
          } else if (id < 9.5) {                                                      // dark slate rock
            tri(3.0, 3.0, p, N, a, n, pn); col = a.rgb * 5.0 + vec3(0.01); rough = n.b;
          } else if (id < 10.5) {                                                     // tilled soil
            tri(1.0, 3.0, p, N, a, n, pn); col = a.rgb; rough = n.b;
          } else if (id < 11.5) {                                                     // roof: overlapping tiles / shingles in rows down the slope
            vec3 hz = vec3(N.x, 0.0, N.z); float hl = length(hz);
            vec3 along = hl > 0.05 ? normalize(cross(vec3(0.0, 1.0, 0.0), hz)) : vec3(1.0, 0.0, 0.0);
            float u = dot(p, along), v = p.y / max(0.25, hl);
            float row = floor(v / 0.3), fv = fract(v / 0.3), tu = u / 0.42 + row * 0.5, tile = floor(tu), fu = fract(tu);
            float tvar = h12(vec2(tile, row) + vInst.xy * 0.1);
            col *= (0.78 + 0.34 * tvar) * (0.62 + 0.38 * smoothstep(0.0, 0.35, fv)) * (1.0 - 0.35 * smoothstep(0.07, 0.0, min(fu, 1.0 - fu)));
            col *= 0.85 + 0.25 * vn2(p.xz * 1.7 + p.y);                                  // moss / soot weathering
            vec3 down = hl > 0.05 ? -normalize(cross(along, N)) : vec3(0.0);
            pn = normalize(N - down * (0.35 * (1.0 - fv) - 0.1) + along * (fu - 0.5) * 0.12 * step(0.06, min(fu, 1.0 - fu)));
            rough = 0.82;
          } else if (id < 12.5) {                                                     // leaves: clumped foliage
            float c1 = fbm2(p.xy * 3.1 + p.z * 1.7), c2 = vn2(p.zy * 9.0 + p.x * 4.0);
            col *= (0.4 + 0.55 * c1) * (0.85 + 0.3 * c2);
            col = mix(col, col * vec3(1.15, 1.08, 0.7), smoothstep(0.6, 0.9, c1) * 0.6);   // sunlit tips
            pn = normalize(N + (vec3(vn2(p.yz * 7.0), vn2(p.xz * 7.0), vn2(p.xy * 7.0)) - 0.5) * 1.1); rough = 0.75;
          } else if (id < 13.5) {                                                     // glass: leaded panes, glossy; warm candle-lit windows at night
            vec2 wq = abs(N.z) > abs(N.x) ? vLP.xy : vLP.zy;
            vec2 fr = abs(fract(wq * vec2(2.6, 2.2)) - 0.5);
            float lead = 1.0 - smoothstep(0.42, 0.47, max(fr.x, fr.y));
            col = mix(vec3(0.05, 0.045, 0.035), vec3(0.025, 0.035, 0.045), lead); rough = mix(0.6, 0.06, lead); metal = 0.0;
            float wid = h12(floor(vLP.xz * 1.3 + vLP.y * 0.4) + vInst.xy), on = step(0.35, wid);
            vec3 warm = mix(vec3(1.0, 0.5, 0.18), vec3(1.0, 0.68, 0.36), h12(vec2(wid, 4.0)));
            float inner = 0.55 + 0.45 * smoothstep(0.5, 0.0, length((fract(wq * 0.5) - 0.5) * vec2(1.0, 0.7)));
            emis = warm * 1.9 * uNight * on * lead * inner * (0.85 + 0.15 * sin(uTime * 2.3 + wid * 40.0)) * (0.6 + 0.4 * wid);
          } else if (id > 19.5) {                                                     // leaf cards: individual leaves, cut out
            float seed = floor(vLUV.x * 0.5); vec2 luv = vec2(vLUV.x - seed * 2.0, vLUV.y); bool conifer = vLUV.y > 1.5;
            float lm = leafMask(luv, seed);
            if (lm < 0.35) discard;
            leafA = smoothstep(0.35, 0.65, lm);
            float var = h12(vec2(seed, vInst.z * 13.0));
            col *= (0.62 + 0.55 * var) * (0.85 + 0.3 * vn2(luv * 6.0 + seed)) * (conifer ? 0.8 : 1.0);
            if (!conifer) col = mix(col, col * vec3(1.25, 1.12, 0.55), smoothstep(0.7, 1.0, var) * 0.5);               // a few yellowing leaves
            pn = normalize(N + (vec3(h12(vec2(seed, 1.0)), h12(vec2(seed, 2.0)), h12(vec2(seed, 3.0))) - 0.5) * 0.7); rough = 0.6;
            emis = col * 0.06 * uDay;                                                    // light through the leaves
          } else if (id < 14.5) {                                                     // straw, hay, wheat
            float s = vn2(vec2(p.x * 3.0 + p.z * 3.0, p.y * 40.0)) * 0.6 + vn2(p.xz * 50.0) * 0.4;
            col *= 0.75 + 0.45 * s; rough = 0.9;
          } else if (id < 15.5) {                                                     // plaza flagstones
            vec2 q = p.xz; vec2 qx = dFdx(q), qy = dFdy(q); a = sA(5.0, q / 3.0, qx / 3.0, qy / 3.0); n = sN(5.0, q / 3.0, qx / 3.0, qy / 3.0);
            col = a.rgb * (lumC / luma(LMEAN[5])) * 0.95; vec2 t = tN(n); pn = normalize(N + vec3(t.x, 0.0, t.y)); rough = n.b;
          } else if (id < 16.5) {                                                     // still water (fountain, well, trough)
            col = vec3(0.02, 0.05, 0.06); rough = 0.04; pn = normalize(N + vec3(sin(vLP.x * 6.0 + uTime * 2.0), 0.0, cos(vLP.z * 7.0 + uTime * 1.7)) * 0.03);
          } else {                                                                    // gold leaf / brass
            tri(10.0, 1.2, p, N, a, n, pn); pn = normalize(mix(N, pn, 0.4));
            col = vec3(0.95, 0.68, 0.26) * (0.75 + 0.35 * luma(a.rgb) / luma(LMEAN[10])); metal = 1.0; rough = 0.32;
          }
          // grime: darker and dirtier towards the ground for walls, wood, stone
          if (id > 0.5 && id < 7.5) col *= mix(0.6, 1.0, smoothstep(0.0, 1.6, vLP.y)) * (0.92 + 0.08 * vn2(p.xy * 0.6 + p.z));
          col *= cloudShade(vWPo.xz);
          diffuseColor.rgb = col; diffuseColor.a = leafA;
          vec3 objN = pn; float fdir = id > 19.5 ? 1.0 : (gl_FrontFacing ? 1.0 : -1.0);
        `)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(rough, 0.04, 1.0);')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metal;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize(vL2V * objN) * fdir;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += emis;');
    };
    m.customProgramCacheKey = () => 'aeth-object-1';
    return m;
  }
  /* shadow caster for world objects: leaf cards cut out, leaves sway like the visible ones */
  function objectDepthMaterial(THREE) {
    init(THREE);
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      addUniforms(sh);
      sh.vertexShader = 'attribute vec2 mat; attribute vec2 luv; varying vec2 vMatD; varying vec2 vLUVD;\n' + VCOMMON + '\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 instD = vec4(instanceMatrix[3].x, instanceMatrix[3].z, h12(instanceMatrix[3].xz * 0.37), 0.0);
        #else
          vec4 instD = vec4(0.0);
        #endif
        transformed += leafSway(position, mat.x, instD); vMatD = mat; vLUVD = luv;`);
      sh.fragmentShader = 'varying vec2 vMatD; varying vec2 vLUVD;\n' + VCOMMON + '\n' + sh.fragmentShader.replace('void main() {', `void main() {
        if (vMatD.x > 19.5) { float seed = floor(vLUVD.x * 0.5); if (leafMask(vec2(vLUVD.x - seed * 2.0, vLUVD.y), seed) < 0.45) discard; }`);
    };
    m.customProgramCacheKey = () => 'aeth-object-depth-1';
    return m;
  }
  /* emissive parts (lanterns, crystals, portals): brighter at night so they bloom */
  function glowMaterial(THREE) {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    m.onBeforeCompile = sh => { addUniforms(sh); sh.fragmentShader = 'uniform float uNight; uniform float uTime;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= (1.4 + 4.0 * uNight) * (diffuseColor.r > diffuseColor.b * 1.6 ? 1.0 + 0.8 * uNight : 0.55);   // warm lanterns brighten most at night; crystals and portals stay calm'); };
    m.customProgramCacheKey = () => 'aeth-glow-1';
    return m;
  }
  A.Mat = { LAYERS, MEAN, L, M, U, NOISE, COMMON, VCOMMON, UNIF, init, load, terrainMaterial, roadMaterial, objectMaterial, objectDepthMaterial, glowMaterial, addUniforms };
})();
