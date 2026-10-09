/* Aethelos kingdom runtime: renderer, sky, terrain, rivers, instanced objects (tiled for culling), collision world,
   player movement on terrain (bridges, water, slopes), third-person camera, location banner, both warriors.
   Entry: Aethelos.createKingdom(hero, dom) -> { start(), stop(), resetCamera() }. */
(() => {
  const A = window.Aethelos ||= {};
  const MAP_KEY = 'aethelos.kingdom.map.v1';

  // ---------------------------------------------------------------- map storage (editor saves here; part B)
  const MapStore = {
    load() { try { const raw = localStorage.getItem(MAP_KEY); if (!raw) return null; const d = JSON.parse(raw); return Array.isArray(d.objects) ? d : null; } catch (_) { return null; } },
    save(objects) { try { localStorage.setItem(MAP_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), objects })); return true; } catch (_) { return false; } },
    clear() { try { localStorage.removeItem(MAP_KEY); } catch (_) {} }
  };
  A.MapStore = MapStore;

  // ---------------------------------------------------------------- instanced object layer, split into spatial tiles
  class ObjectLayer {
    constructor(THREE, scene, objects, { tile = 160 } = {}) {
      this.T = THREE; this.scene = scene; this.tile = tile; this.objects = objects; this.group = new THREE.Group(); this.group.name = 'WorldObjects'; scene.add(this.group);
      this.mat = { std: A.Mat.objectMaterial(THREE), glow: A.Mat.glowMaterial(THREE) }; this.depthMat = A.Mat.objectDepthMaterial(THREE);
      this.meshes = []; this.extras = []; this.lodScale = 1; this.build();
    }
    matrixOf(o, m = new this.T.Matrix4()) {
      const T = this.T, q = new T.Quaternion().setFromEuler(new T.Euler(o.rotation.x || 0, o.rotation.y || 0, o.rotation.z || 0));
      return m.compose(new T.Vector3(o.position.x, o.position.y, o.position.z), q, new T.Vector3(o.scale.x, o.scale.y, o.scale.z));
    }
    build() {
      const T = this.T, groups = new Map();
      for (const o of this.objects) {
        if (!A.Models.TYPES[o.type]) continue;
        const ts = A.Models.TYPES[o.type].tree ? 96 : this.tile;              // trees use smaller tiles so their detail level can switch by distance
        const k = o.type + '|' + Math.floor(o.position.x / ts) + ',' + Math.floor(o.position.z / ts);
        (groups.get(k) || groups.set(k, []).get(k)).push(o);
      }
      const m = new T.Matrix4(); this.where = new Map(); this.lights = [];
      for (const [k, list] of groups) {
        const type = k.split('|')[0], def = A.Models.TYPES[type], parts = A.Models.get(T, type);
        for (const [part, geo] of Object.entries(parts)) {
          const mesh = new T.InstancedMesh(geo, this.mat[part], list.length);
          list.forEach((o, i) => { mesh.setMatrixAt(i, this.matrixOf(o, m)); (this.where.get(o.id) || this.where.set(o.id, []).get(o.id)).push([mesh, i]); });
          mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
          mesh.receiveShadow = part === 'std'; mesh.castShadow = false; if (part === 'std') mesh.customDepthMaterial = this.depthMat; mesh.name = `${type}@${k.split('|')[1]}:${part}`;
          geo.boundingSphere || geo.computeBoundingSphere();
          const r = geo.boundingSphere.radius, cull = r < 1.6 ? 150 : r < 4 ? 280 : r < 10 ? 520 : 1e9;      // distance detail: small props fade out first
          mesh.userData = { type, ids: list.map(o => o.id), part, flat: !!def.flat, center: mesh.boundingSphere.center.clone(), extent: mesh.boundingSphere.radius, cull, lamp: !!def.lamp,
            lods: def.tree ? [0, 1, 2].map(l => A.Models.getLod(T, type, l)[part] || geo) : null, lod: 0 };
          this.group.add(mesh); this.meshes.push(mesh);
        }
        if (type === 'windmill') for (const o of list) this.addSails(o);
        const pts = A.Models.lightsOf(T, type);
        if (pts.length) for (const o of list) { const om = this.matrixOf(o, m); for (const l of pts) { const v = new T.Vector3(l.x, l.y, l.z).applyMatrix4(om); this.lights.push({ x: v.x, y: v.y, z: v.z, kind: l.kind, id: o.id }); } }
        for (const mesh of this.meshes.slice(-Object.keys(parts).length)) mesh.userData.tileKey = k;
      }
    }
    addSails(o) {
      const T = this.T, pivot = new T.Group(), mat = this.mat.std;
      const blade = new T.BoxGeometry(0.3, 8.4, 0.18), cloth = new T.BoxGeometry(1.7, 6.6, 0.06);
      const paint = (g, hex, id) => { const c = new T.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3), ma = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a.set([c.r, c.g, c.b], i * 3); ma.set([id, 1], i * 2); } g.setAttribute('color', new T.BufferAttribute(a, 3)); g.setAttribute('mat', new T.BufferAttribute(ma, 2)); return g; };
      paint(blade, 0x8a6239, A.Models.MATS.WOOD); paint(cloth, 0xf0e6d0, A.Models.MATS.CLOTH);
      for (let i = 0; i < 4; i++) { const arm = new T.Group(); arm.rotation.z = i * Math.PI / 2; const b = new T.Mesh(blade, mat); b.position.y = 4.2; const c = new T.Mesh(cloth, mat); c.position.set(0.95, 4.6, 0.08); arm.add(b, c); pivot.add(arm); }
      const root = new T.Group(); this.matrixOf(o, root.matrix); root.matrixAutoUpdate = false; pivot.position.set(0, 11.0, 3.5); root.add(pivot);
      pivot.traverse(n => { if (n.isMesh) n.castShadow = true; });
      this.group.add(root); this.extras.push({ pivot, spin: 0.6, root, id: o.id });
    }
    update(dt, px, pz) {
      for (const e of this.extras) e.pivot.rotation.z += e.spin * dt;
      for (const m of this.meshes) {
        const u = m.userData, c = u.center, d = Math.hypot(c.x - px, c.z - pz);
        m.visible = d - u.extent < u.cull * this.lodScale;
        if (u.lods && m.visible) { const near = d - u.extent, lvl = near > 180 * this.lodScale ? 2 : near > 45 * this.lodScale ? 1 : 0;
          if (lvl !== u.lod) { u.lod = lvl; m.geometry = u.lods[lvl]; } }
        m.castShadow = u.part === 'std' && !u.flat && d - u.extent < 110;
      }
    }
    /* live move while dragging in the editor (no regrouping); call rebuild() when the edit is finished */
    updateObject(o) {
      const m = this.matrixOf(o);
      for (const [mesh, i] of this.where.get(o.id) || []) { mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
      for (const e of this.extras) if (e.id === o.id) e.root.matrix.copy(m);
    }
    rebuild(objects = this.objects) {
      this.group.traverse(n => { if (n.isInstancedMesh) n.dispose(); });
      this.group.clear(); this.meshes = []; this.extras = []; this.objects = objects; this.build();
    }
    /* world-space bounding box of one object (from its model's geometry) */
    boundsOf(o, box = new this.T.Box3()) {
      box.makeEmpty(); const parts = A.Models.get(this.T, o.type), m = this.matrixOf(o);
      for (const g of Object.values(parts)) { if (!g.boundingBox) g.computeBoundingBox(); box.union(g.boundingBox.clone().applyMatrix4(m)); }
      return box;
    }
    dispose() { this.group.traverse(n => { if (n.isInstancedMesh) n.dispose(); }); this.scene.remove(this.group); }
  }

  // ---------------------------------------------------------------- colliders + walkable decks in a spatial hash
  class CollisionWorld {
    constructor(objects, cell = 16) {
      this.cell = cell; this.grid = new Map(); this.decks = [];
      for (const o of objects) {
        const def = A.Models.TYPES[o.type]; if (!def) continue;
        const c = Math.cos(o.rotation.y || 0), s = Math.sin(o.rotation.y || 0), sx = o.scale.x, sz = o.scale.z, sy = o.scale.y;
        const toW = (x, z) => [o.position.x + x * sx * c + z * sz * s, o.position.z - x * sx * s + z * sz * c];
        for (const k of def.col) {
          const [cx, cz] = toW(k.x || 0, k.z || 0), y0 = o.position.y - 1, y1 = o.position.y + (k.h || 4) * sy;
          const sh = k.k === 'box' ? { k: 'box', cx, cz, ux: c, uz: -s, vx: s, vz: c, hw: k.w / 2 * sx, hd: k.d / 2 * sz, y0, y1, id: o.id }
                                   : { k: 'circ', cx, cz, r: k.r * Math.max(sx, sz), y0, y1, id: o.id };
          this.insert(sh, k.k === 'box' ? Math.hypot(sh.hw, sh.hd) : sh.r);
        }
        for (const d of def.deck) {
          const [cx, cz] = toW(d.x || 0, d.z || 0);
          this.decks.push({ cx, cz, ux: c, uz: -s, vx: s, vz: c, hw: d.w / 2 * sx, hd: d.d / 2 * sz, top: o.position.y + d.y * sy, id: o.id });
        }
      }
    }
    insert(sh, r) {
      const c = this.cell, i0 = Math.floor((sh.cx - r) / c), i1 = Math.floor((sh.cx + r) / c), j0 = Math.floor((sh.cz - r) / c), j1 = Math.floor((sh.cz + r) / c);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i + ',' + j; (this.grid.get(k) || this.grid.set(k, []).get(k)).push(sh); }
    }
    deckAt(x, z) {
      let best = null;
      for (const d of this.decks) { const dx = x - d.cx, dz = z - d.cz, lx = dx * d.ux + dz * d.uz, lz = dx * d.vx + dz * d.vz; if (Math.abs(lx) <= d.hw && Math.abs(lz) <= d.hd && (!best || d.top > best.top)) best = d; }
      return best;
    }
    /* push a circle (x,z,r) at height range [y, y+hgt] out of every collider; returns [x, z, hit] */
    resolve(x, z, r, y, hgt = 1.8) {
      let hit = false;
      for (let pass = 0; pass < 3; pass++) {
        const k = Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell), list = this.grid.get(k); if (!list) break;
        let moved = false;
        for (const s of list) {
          if (y > s.y1 - 0.05 || y + hgt < s.y0) continue;
          if (s.k === 'circ') {
            const dx = x - s.cx, dz = z - s.cz, d = Math.hypot(dx, dz), m = s.r + r;
            if (d < m) { const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0; x = s.cx + nx * m; z = s.cz + nz * m; hit = moved = true; }
          } else {
            const dx = x - s.cx, dz = z - s.cz, lx = dx * s.ux + dz * s.uz, lz = dx * s.vx + dz * s.vz;
            const qx = Math.max(-s.hw, Math.min(s.hw, lx)), qz = Math.max(-s.hd, Math.min(s.hd, lz)), ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
            if (d < r) {
              let nlx, nlz;
              if (d > 1e-6) { nlx = qx + ex / d * r; nlz = qz + ez / d * r; }
              else { const px = s.hw - Math.abs(lx), pz = s.hd - Math.abs(lz); if (px < pz) { nlx = Math.sign(lx || 1) * (s.hw + r); nlz = lz; } else { nlx = lx; nlz = Math.sign(lz || 1) * (s.hd + r); } }
              x = s.cx + nlx * s.ux + nlz * s.vx; z = s.cz + nlx * s.uz + nlz * s.vz; hit = moved = true;
            }
          }
        }
        if (!moved) break;
      }
      return [x, z, hit];
    }
  }

  // ---------------------------------------------------------------- graphics quality: low (software / weak GPUs), medium, high
  const GFX_KEY = 'aethelos.gfx.v1';
  function pickQuality(renderer) {
    try { const q = new URLSearchParams(location.search).get('gfx'); if (q && /^(low|medium|high)$/.test(q)) return q; } catch (_) {}
    try { const q = localStorage.getItem(GFX_KEY); if (q && /^(low|medium|high)$/.test(q)) return q; } catch (_) {}
    try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'), name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      if (/swiftshader|llvmpipe|software|basic render/i.test(String(name))) return 'low';
      if (/intel|mali|adreno|powervr|apple gpu/i.test(String(name)) && !/apple m\d (pro|max|ultra)/i.test(String(name))) return 'medium';
    } catch (_) {}
    return (window.innerWidth < 700 || /Android|iPhone|iPad/i.test(navigator.userAgent)) ? 'medium' : 'high';
  }

  // ---------------------------------------------------------------- the kingdom
  function createKingdom(hero, dom) {
    const THREE = window.THREE, L = A.Layout;
    const { canvas, loading, loadingText, toast, heroLabel, stateLabel, speedLabel, banner } = dom;
    let running = true;
    const say = t => { if (loadingText) loadingText.textContent = t; };
    const showToast = text => { if (!toast) return; toast.textContent = text; toast.classList.add('show'); clearTimeout(showToast.t); showToast.t = setTimeout(() => toast.classList.remove('show'), 1700); };

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
    renderer.localClippingEnabled = true;                 // portals hide what is still inside the pocket dimension
    let quality = pickQuality(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.25 : 1));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.15, 3000);
    const clock = new THREE.Clock(), MU = A.Mat.U, timeU = MU.uTime; A.Mat.init(THREE);
    const texturesReady = A.Mat.load(THREE, renderer, { size: quality === 'low' ? 512 : 1024 }).catch(e => { console.warn('Aethelos textures:', e); return false; });
    const player = new THREE.Group(); player.name = 'Player Root'; scene.add(player);
    const heroMount = new THREE.Group(); player.add(heroMount);
    const world = { dynamic: {} };                       // dynamic: moving blockers (the horse) as circle lists
    const state = { keys: Object.create(null), camYaw: L.SPAWN.yaw, camPitch: 0.30, camZoom: 1, camDistance: 6, cameraTarget: new THREE.Vector3(), cameraVelocity: new THREE.Vector3(),
      velocity: new THREE.Vector3(), grounded: true, jumpVelocity: 0, jumpLatch: false, pointerDown: false, lastPointerX: 0, lastPointerY: 0, currentSpeed: 0,
      heroClip: 'Idle', heroTime: 0, rig: null, heroRig: null, attackTimer: 0, region: null, regionTimer: 0, onDeck: false, idleT: 0 };

    // ------------------------------------------------ world build
    function setupLighting() {
      world.sky = A.createSky({ THREE, renderer, scene, quality }); world.sun = world.sky.sun;
      world.post = A.createPost({ THREE, renderer, sky: world.sky, quality });
      // lamp, lantern and campfire lights: a small pool moved to the nearest lights after dusk
      // ONE fixed pool of point lights for the whole game (each light costs every lit pixel, and a fixed count never recompiles
      // shaders): effects borrow one while they glow (sword aura, sonic boom, horse portal), lamps use the rest after dusk
      world.lampPool = Array.from({ length: quality === 'low' ? 4 : quality === 'medium' ? 5 : 6 }, () => { const l = new THREE.PointLight(0xffa860, 0, 22, 2); l.castShadow = false; l.userData = { fx: false, src: null }; scene.add(l); return l; });
      world.lightPool = {
        take() { const free = world.lampPool.filter(l => !l.userData.fx); if (!free.length) return null;
          const l = free.find(x => !x.userData.src) || free[free.length - 1]; l.userData.fx = true; l.userData.src = null; l.intensity = 0; return l; },
        give(l) { if (!l) return; l.userData.fx = false; l.intensity = 0; l.color.setRGB(1, 0.66, 0.38); l.distance = 22; l.decay = 2; }
      };
      // HUD clock
      const host = canvas.parentElement; if (host && !host.querySelector('#kClock')) {
        const el = document.createElement('div'); el.id = 'kClock';
        el.style.cssText = 'position:absolute;top:58px;right:16px;z-index:6;padding:5px 12px;border-radius:999px;background:rgba(14,22,34,.62);color:#f2ead8;font:600 13px/1.3 system-ui,sans-serif;letter-spacing:.04em;pointer-events:none;backdrop-filter:blur(4px)';
        host.appendChild(el); world.clockEl = el;
      } else world.clockEl = host && host.querySelector('#kClock');
    }
    function updateLamps(dt) {
      const k = MU.uNight.value, pool = world.lampPool, lights = world.layer.lights;
      world.lampTimer = (world.lampTimer || 0) - dt;
      if (world.lampTimer <= 0) {
        world.lampTimer = 0.3; const p = camera.position;
        const free = pool.filter(l => !l.userData.fx);
        const near = k > 0.02 ? lights.map(l => [l, (l.x - p.x) ** 2 + (l.z - p.z) ** 2]).filter(a => a[1] < 90 * 90).sort((a, b) => a[1] - b[1]).slice(0, free.length) : [];
        free.forEach((pl, i) => { const a = near[i]; pl.userData.src = a ? a[0] : null; if (a) pl.position.set(a[0].x, a[0].y, a[0].z); });
      }
      const t = timeU.value;
      pool.forEach((pl, i) => { if (pl.userData.fx) return; const src = pl.userData.src; pl.intensity = src ? k * (src.kind === 'fire' ? 26 : 16) * (0.92 + 0.08 * Math.sin(t * (src.kind === 'fire' ? 13 : 3) + i * 1.7)) : 0; if (src && src.kind === 'fire') pl.color.setRGB(1, 0.55, 0.22); else pl.color.setRGB(1, 0.66, 0.38); });
    }
    function buildWorld() {
      say('Shaping the kingdom: hills, rivers and Ironpeak…');
      const terrain = world.terrain = new A.Terrain(L);
      world.terrainGroup = terrain.buildMeshes(THREE, A.Mat.terrainMaterial(THREE)); scene.add(world.terrainGroup);
      scene.add(terrain.buildRoads(THREE, A.Mat.roadMaterial(THREE)));
      world.water = A.createWater({ THREE, renderer, scene, terrain, sky: world.sky, quality });
      world.waterGroup = terrain.buildWater(THREE, world.water.material); scene.add(world.waterGroup);
      say('Raising the city, the palace and the noble houses…');
      const saved = MapStore.load();
      world.objects = saved ? saved.objects : A.KingdomObjects.generate(terrain);
      world.fromSave = !!saved;
      world.layer = new ObjectLayer(THREE, scene, world.objects);
      world.collide = new CollisionWorld(world.objects);
      say('Planting the meadows…');
      world.grass = A.createGrass({ THREE, scene, terrain, world, quality });
    }
    /* the 3D world uses a lighter copy of the Female Warrior (47k triangles, tools/lod; the approved 490k model in
       assets/models/female-NN.js stays untouched for the menus and its integrity checks) */
    const FEMALE_WORLD_PARTS = 2;
    async function loadWorldFemale() {
      const MP = (window.AethelosModelParts ||= {}); MP.femaleworld = [];
      for (let i = 1; i <= FEMALE_WORLD_PARTS; i++) await new Promise((ok, fail) => { const sc = document.createElement('script');
        sc.src = `assets/models/femaleworld-${String(i).padStart(2, '0')}.js?v=lod-1`; sc.onload = () => { sc.remove(); ok(); }; sc.onerror = () => { sc.remove(); fail(new Error('femaleworld part ' + i)); }; document.head.appendChild(sc); });
      const encoded = MP.femaleworld.join(''); MP.femaleworld = [];
      const rig = createWarriorAsset(THREE, encoded); if (rig.revision !== 'BODY_AND_SWORD_V14') throw new Error('unexpected revision ' + rig.revision);
      return rig;
    }
    async function loadHero() {
      heroLabel && (heroLabel.textContent = hero.name);
      say('Calling your warrior…');
      if (hero.gender === 'male' && window.HeroRig) {
        const rig = await HeroRig.loadHero(THREE);
        rig.root.traverse(o => { if (o.isMesh) o.castShadow = !o.material.transparent; });   // body 44k + sword 5k triangles (tools/lod)
        state.heroRig = rig; heroMount.add(rig.root);
        if (A.createSonicSkill) { world.skill = A.createSonicSkill({ THREE, scene, rig, player, world, camera, root: canvas.parentElement, showToast, lightPool: world.lightPool }); world.skill.setAim(() => inputDir()); }
        // the sword aura's own light is replaced by a pooled one that follows the blade while it glows
        const auraL = rig.fxMeshes.AuraLight; if (auraL && auraL.parent) { auraL.parent.remove(auraL); world.auraLight = { src: auraL, mesh: rig.fxMeshes.SwordAuraGlow, pooled: null }; }
        if (A.createHeroExtras) world.extras = A.createHeroExtras({ THREE, scene, rig, camera, root: canvas.parentElement });
        if (A.createHorse) world.horse = A.createHorse({ THREE, scene, world, player, camera, showToast, heroMount, hero: () => state.heroRig,
          say: k => world.extras && world.extras.say(k), onMount: on => { state.idleT = 0; if (!on) world.extras && setTimeout(() => world.extras.say('dismounted'), 250); } });
      } else {
        let rig = null;
        try { rig = await loadWorldFemale(); } catch (e) { console.warn('Light Female Warrior model missing, using the full one:', e); }
        if (!rig) rig = await HeroSystem.createRig(THREE, hero);
        await rig.textureReady;
        rig.root.scale.setScalar(1.75); rig.root.rotation.y = Math.PI; rig.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
        state.rig = rig; heroMount.add(rig.root);
      }
    }
    function spawn() {
      const t = world.terrain; player.position.set(L.SPAWN.x, t.heightAt(L.SPAWN.x, L.SPAWN.z), L.SPAWN.z); player.rotation.y = L.SPAWN.yaw;
      state.camYaw = L.SPAWN.yaw; state.cameraVelocity.copy(player.position).add(new THREE.Vector3(0, 4, 6)); state.cameraTarget.copy(player.position);
    }

    // ------------------------------------------------ ground / movement
    function groundAt(x, z, y) {
      let h = world.terrain.heightAt(x, z), deck = null;
      const d = world.collide.deckAt(x, z);
      if (d && d.top <= y + 1.4 && d.top > h) { h = d.top; deck = d; }
      return { h, deck };
    }
    world.groundAt = groundAt;
    function blockedAt(x, z, fromY) {
      const g = groundAt(x, z, fromY);
      if (!g.deck) {
        const w = world.terrain.waterAt(x, z); if (w && w.depth > 0.6) return 'water';
        if (g.h > fromY + 0.45 && world.terrain.slopeAt(x, z) > 1.05) return 'cliff';
      }
      return null;
    }
    function moveTo(dx, dz, dt) {
      const p = player.position, y = p.y;
      let nx = p.x + dx, nz = p.z + dz;
      if (blockedAt(nx, nz, y)) {                         // slide along whichever axis is still open
        if (!blockedAt(p.x + dx, p.z, y)) { nz = p.z; } else if (!blockedAt(p.x, p.z + dz, y)) { nx = p.x; } else { nx = p.x; nz = p.z; }
      }
      let [rx, rz] = world.collide.resolve(nx, nz, 0.42, y);
      for (const k in world.dynamic) for (const c of world.dynamic[k] || []) {            // the horse standing around
        const ex = rx - c.x, ez = rz - c.z, d = Math.hypot(ex, ez), m = c.r + 0.42; if (d < m && d > 1e-5) { rx = c.x + ex / d * m; rz = c.z + ez / d * m; } }
      if (!blockedAt(rx, rz, y)) { nx = rx; nz = rz; } else { nx = p.x; nz = p.z; }
      const lim = L.SIZE / 2 - 25; p.x = Math.max(-lim, Math.min(lim, nx)); p.z = Math.max(-lim, Math.min(lim, nz));
    }
    function verticalStep(dt, jumpSpeed, gravity) {
      const p = player.position, g = groundAt(p.x, p.z, p.y); state.onDeck = !!g.deck;
      if (state.grounded) {
        if (g.h < p.y - 0.7) { state.grounded = false; state.jumpVelocity = 0; }      // walked off a ledge
        else p.y += (g.h - p.y) * Math.min(1, dt * 18);                               // follow the ground smoothly
      }
      if (!state.grounded) {
        state.jumpVelocity -= gravity * dt; p.y += state.jumpVelocity * dt;
        if (p.y <= g.h && state.jumpVelocity <= 0) { p.y = g.h; state.jumpVelocity = 0; state.grounded = true; }
      }
    }
    function inputDir() {
      const k = state.keys, ix = Number(!!k.ArrowRight) - Number(!!k.ArrowLeft), iz = Number(!!k.ArrowDown) - Number(!!k.ArrowUp);   // arrows move the hero; WASD is the camera
      if (!ix && !iz) return null;
      const sin = Math.sin(state.camYaw), cos = Math.cos(state.camYaw), l = Math.hypot(ix, iz);
      // camera looks along (sin yaw, cos yaw); screen-right is (-cos yaw, sin yaw)
      return new THREE.Vector3(-(ix * cos + iz * sin) / l, 0, -(iz * cos - ix * sin) / l);
    }
    function turnTo(dir, rate) { const t = Math.atan2(dir.x, dir.z); player.rotation.y += Math.atan2(Math.sin(t - player.rotation.y), Math.cos(t - player.rotation.y)) * rate; }

    function updateRiding(dt, ctl, horse) {
      state.velocity.set(0, 0, 0); state.grounded = true; state.jumpVelocity = 0; state.currentSpeed = horse.speed; state.idleT = 0;
      ctl.update(dt, { moving: false, running: false, airborne: false, speed: 0 });
      world.skill && world.skill.update(dt); world.extras && world.extras.update(dt); updateAuraLight();
      const st = horse.state.state;
      stateLabel && (stateLabel.textContent = st === 'mounting' ? 'Mounting' : st === 'dismounting' || horse.state.slowToDismount ? 'Dismounting'
        : horse.speed > 4.5 ? 'Galloping' : horse.speed > 0.15 ? 'Riding' : 'On horseback');
    }
    function updateAuraLight() {
      const a = world.auraLight; if (!a) return;
      const want = a.src.intensity;                           // set by the glow mesh each frame it renders (0 when the aura is off)
      if (want > 0.05) { if (!a.pooled) a.pooled = world.lightPool.take();
        if (a.pooled) { a.mesh.getWorldPosition(a.pooled.position); a.pooled.color.copy(a.src.color); a.pooled.distance = a.src.distance; a.pooled.decay = a.src.decay; a.pooled.intensity = want; } }
      else if (a.pooled) { world.lightPool.give(a.pooled); a.pooled = null; }
    }
    function updateWarriorV4(dt) {
      const k = state.keys, ctl = state.heroRig.controller, horse = world.horse, running = !!(k.KeyX || k.ShiftLeft || k.ShiftRight);
      if (horse) {
        horse.update(dt, { dir: inputDir(), run: running });
        if (horse.riding) { updateRiding(dt, ctl, horse); return; }
        if (horse.approaching) {
          if (inputDir() || ctl.attacking || ctl.dodging) horse.cancel();          // the player took over: stop walking to the horse
          else {
            const mv = horse.heroMoving; state.velocity.set(0, 0, 0); state.currentSpeed = mv ? 1.7 : 0; state.idleT = 0;
            ctl.update(dt, { moving: mv, running: false, airborne: false, speed: state.currentSpeed });
            world.skill && world.skill.update(dt); world.extras && world.extras.update(dt);
            stateLabel && (stateLabel.textContent = 'Going to the horse'); return;
          }
        }
      }
      const dir = ctl.powering ? null : inputDir(), moving = !!dir;   // the power-up pose roots him in place
      if (ctl.dodging) { const v = ctl.dodgeSpeed(); state.velocity.set(Math.sin(player.rotation.y) * v, 0, Math.cos(player.rotation.y) * v); }
      else if (moving) {
        const target = ctl.speedFor(true, running) * (ctl.attacking ? 0.15 : 1);
        state.velocity.x += (dir.x * target - state.velocity.x) * 0.18; state.velocity.z += (dir.z * target - state.velocity.z) * 0.18; turnTo(dir, 0.22);
      } else { state.velocity.x *= 0.78; state.velocity.z *= 0.78; }
      const wantsJump = !!k.KeyZ;
      if (wantsJump && !state.jumpLatch && state.grounded && !ctl.busy) { state.jumpVelocity = 6.8; state.grounded = false; }
      state.jumpLatch = wantsJump;
      const before = player.position.clone();
      moveTo(state.velocity.x * dt, state.velocity.z * dt, dt);
      verticalStep(dt, 6.8, 24);
      const moved = Math.hypot(player.position.x - before.x, player.position.z - before.z) / Math.max(dt, 1e-4);
      state.currentSpeed = Math.min(Math.hypot(state.velocity.x, state.velocity.z), moved + 0.05);
      if (moving && moved < 0.3 && !ctl.dodging) { state.velocity.x *= 0.5; state.velocity.z *= 0.5; }   // pressing into a wall: stop the run cycle
      // 30 s without doing anything: the pocket-dimension ball comes out (any move / action ends it)
      const S0 = ctl.state;
      if (moving && S0.mode === 'idlefun') ctl.cancelIdleFun();
      if (!moving && S0.mode === 'free' && !S0.swordOut && state.grounded && !state.editing) { state.idleT += dt; if (state.idleT >= 30) { state.idleT = 0; ctl.idleFun(); } }
      else if (S0.mode !== 'idlefun') state.idleT = 0;
      ctl.update(dt, { moving: moving && moved > 0.25, running, airborne: !state.grounded, speed: state.currentSpeed });
      world.skill && world.skill.update(dt);                 // after the mixer: the skill overrides the sword aura
      world.extras && world.extras.update(dt);               // sword portal, idle ball, speech bubble
      updateAuraLight();
      const S = ctl.state;
      stateLabel && (stateLabel.textContent = S.mode === 'dodge' ? 'Dodge roll' : S.mode === 'attack' ? (S.attackKind === 'up' ? 'Rising stab' : S.attackKind === 'down' ? 'Low slash' : 'Attack ' + (S.combo + 1))
        : S.mode === 'summon' ? 'Summoning sword' : S.mode === 'dismiss' ? 'Sword vanishing' : S.mode === 'idlefun' ? 'Playing' : !state.grounded ? 'Jumping' : moving ? (running ? 'Running' : 'Walking') : S.swordOut ? 'Guard' : 'Idle');
    }
    function updateWarriorV14(dt) {                       // Female Warrior (V14 clips, sampled)
      const k = state.keys, dir = inputDir(), moving = !!dir, sprint = !!(k.KeyX || k.ShiftLeft || k.ShiftRight);
      const target = moving ? (sprint ? 9 : 4.5) : 0;
      if (moving) { state.velocity.x += (dir.x * target - state.velocity.x) * 0.18; state.velocity.z += (dir.z * target - state.velocity.z) * 0.18; turnTo(dir, 0.22); }
      else { state.velocity.x *= 0.78; state.velocity.z *= 0.78; }
      const wantsJump = !!k.KeyZ; if (wantsJump && !state.jumpLatch && state.grounded) { state.jumpVelocity = 7.5; state.grounded = false; } state.jumpLatch = wantsJump;
      moveTo(state.velocity.x * dt, state.velocity.z * dt, dt); verticalStep(dt, 7.5, 24);
      state.currentSpeed = Math.hypot(state.velocity.x, state.velocity.z);
      state.attackTimer = Math.max(0, state.attackTimer - dt);
      const clip = state.attackTimer > 0 ? 'Combo' : !state.grounded ? 'Jump' : state.currentSpeed > 0.4 ? (sprint ? 'Run' : 'Walk') : 'Idle', rig = state.rig;
      if (rig) {
        if (clip !== state.heroClip) { state.heroClip = clip; state.heroTime = 0; } else state.heroTime += dt * (clip === 'Combo' ? 1.7 : 1);
        const ch = rig.channels[clip] || rig.channels.Idle; rig.sample(rig.channels[clip] ? clip : 'Idle', state.heroTime % ch.duration);
        rig.root.updateMatrixWorld(true); rig.skeleton.update();
      }
      stateLabel && (stateLabel.textContent = state.attackTimer > 0 ? 'Attacking' : !state.grounded ? 'Jumping' : moving ? (sprint ? 'Running' : 'Walking') : 'Idle');
    }
    function updateMovement(dt) {
      if (state.heroRig) updateWarriorV4(dt); else updateWarriorV14(dt);
      speedLabel && (speedLabel.textContent = state.currentSpeed.toFixed(1));
    }

    // ------------------------------------------------ camera
    function updateCamera(dt = 1 / 60) {
      // WASD camera: A / D swing around the hero, W moves in closer and levels out (look straight ahead), S pulls back and up
      const k = state.keys, turn = Number(!!k.KeyD) - Number(!!k.KeyA), push = Number(!!k.KeyW) - Number(!!k.KeyS);
      if (turn) state.camYaw -= turn * 1.9 * dt;
      if (push) {
        state.camZoom = Math.max(0.55, Math.min(1.9, state.camZoom * Math.exp(-push * 1.1 * dt)));
        state.camPitch = Math.max(0.06, Math.min(0.95, state.camPitch - push * 0.45 * dt));
      }
      const fast = state.currentSpeed > (state.heroRig ? 4.2 : 7), riding = !!(world.horse && world.horse.riding);
      const want = riding ? (state.currentSpeed > 6 ? 10.5 : 8.6) : fast ? 6.8 : 5.8;
      state.camDistance += (want * state.camZoom - state.camDistance) * 0.08;
      const horizontal = Math.cos(state.camPitch) * state.camDistance;
      const desired = player.position.clone().add(new THREE.Vector3(-Math.sin(state.camYaw) * horizontal, Math.sin(state.camPitch) * state.camDistance + 0.9, -Math.cos(state.camYaw) * horizontal));
      const floor = world.terrain.heightAt(desired.x, desired.z) + 0.6; if (desired.y < floor) desired.y = floor;
      state.cameraVelocity.lerp(desired, riding ? 0.22 : 0.14); camera.position.copy(state.cameraVelocity);
      const shake = world.skill ? world.skill.shake : 0;
      if (shake > 0.002) camera.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(shake * 0.35));
      state.cameraTarget.lerp(player.position.clone().add(new THREE.Vector3(0, riding ? 2.45 : state.heroRig ? 1.45 : 1.3, 0)), 0.2);
      camera.lookAt(state.cameraTarget);
    }
    // ------------------------------------------------ location banner
    function regionAt(x, z) {
      for (const g of L.REGIONS) {
        if (g.river) { const w = world.terrain.waterAt(x, z); if (w && w.river.id === g.river) return g; continue; }
        if (Math.hypot(x - g.x, z - g.z) < g.r) return g;
      }
      return { id: 'wilds', name: 'The Kingdom of Aethelos', sub: 'Open country' };
    }
    function updateRegion(dt) {
      state.regionTimer -= dt; if (state.regionTimer > 0) return; state.regionTimer = 0.3;
      const g = regionAt(player.position.x, player.position.z);
      if (!state.region || g.id !== state.region.id) {
        const first = !state.region; state.region = g;
        if (banner && (first || g.id !== 'river')) {
          banner.querySelector('b').textContent = g.name; banner.querySelector('span').textContent = g.sub || '';
          banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
          clearTimeout(updateRegion.t); updateRegion.t = setTimeout(() => banner.classList.remove('show'), 3600);
        }
      }
    }

    // ------------------------------------------------ input
    const dbSize = new THREE.Vector2();
    function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.getDrawingBufferSize(dbSize); world.post && world.post.setSize(dbSize.x, dbSize.y); }
    function setQuality(q) {
      quality = q; try { localStorage.setItem(GFX_KEY, q); } catch (_) {}
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 1.25 : 1)); resize();
      world.post.setQuality(q); world.grass.setQuality(q); world.water.setQuality(q); world.layer.lodScale = q === 'low' ? 0.6 : q === 'medium' ? 0.8 : 1;
      showToast('Graphics: ' + q[0].toUpperCase() + q.slice(1));
    }
    function renderFrame() {
      world.water.beforeRender(camera, [world.grass.group, world.waterGroup], dbSize.clone().multiplyScalar(world.post.scale));
      world.post.render(scene, camera);
    }
    const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    const HERO_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyF', 'KeyC', 'KeyZ', 'KeyX', 'KeyV', 'KeyH', 'ShiftLeft', 'ShiftRight']);
    const onKeyDown = e => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;           // typing in the editor panel
      if (e.code === 'KeyE' && !e.repeat && world.editor) { world.editor.toggle(); return; }
      if (e.code === 'KeyV' && !e.repeat && !state.editing) { state.idleT = 0; state.heroRig?.controller.cancelIdleFun(); if (world.horse && world.horse.riding) { showToast('Dismount first (H) to use Azure Tempest'); return; } if (world.skill) world.skill.activate(); else showToast('Azure Tempest is the Male Warrior\'s skill'); return; }
      if (e.code === 'KeyT') { world.sky && world.sky.fastForward(true); if (!e.repeat) showToast('Time passes quickly…'); return; }
      if (e.code === 'KeyG' && !e.repeat) { const order = ['low', 'medium', 'high']; setQuality(order[(order.indexOf(quality) + 1) % 3]); return; }
      if (state.editing) return;
      if (HERO_KEYS.has(e.code)) { state.idleT = 0; state.heroRig?.controller.cancelIdleFun(); }
      if (e.code === 'KeyH') { if (!e.repeat) { if (world.horse) world.horse.pressH(); else showToast('The war horse rides with the Male Warrior'); } return; }
      if (GAME_KEYS.has(e.code) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) e.preventDefault();
      state.keys[e.code] = true; if (e.repeat) return;
      const ctl = state.heroRig?.controller;
      if (ctl) {
        const k = state.keys, dir = (k.ArrowDown && !k.ArrowUp) ? 'down' : undefined;          // Down+attack = low slash (no up attack)
        if (e.code === 'Space' || e.code === 'KeyF') ctl.attack(dir);
        else if (e.code === 'ArrowDown') ctl.direction('down');
        else if (e.code === 'KeyC' && state.grounded && ctl.dodge()) showToast('Dodge roll');
        return;
      }
      if (e.code === 'Space' || e.code === 'KeyF') state.attackTimer = 0.95;
    };
    const onKeyUp = e => { state.keys[e.code] = false; if (e.code === 'KeyT') world.sky && world.sky.fastForward(false); };
    const onBlur = () => { for (const k in state.keys) state.keys[k] = false; };
    const onPointerDown = e => {
      if (state.editing) return;
      state.pointerDown = true; state.lastPointerX = e.clientX; state.lastPointerY = e.clientY;
      if (e.pointerType === 'mouse' && document.pointerLockElement !== canvas) { try { const p = canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
      else canvas.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = e => {
      if (state.editing) return;
      const locked = document.pointerLockElement === canvas; let dx, dy;
      if (e.pointerType === 'mouse' || locked) { if (!locked && e.target !== canvas) return; dx = e.movementX || 0; dy = e.movementY || 0; }
      else { if (!state.pointerDown) return; dx = e.clientX - state.lastPointerX; dy = e.clientY - state.lastPointerY; state.lastPointerX = e.clientX; state.lastPointerY = e.clientY; }
      state.camYaw -= dx * 0.0045; state.camPitch = Math.max(0.06, Math.min(0.95, state.camPitch + dy * 0.003));
    };
    const onPointerUp = () => { state.pointerDown = false; };
    const onWheel = e => { if (state.editing) return; e.preventDefault(); state.camZoom = Math.max(0.55, Math.min(1.9, state.camZoom * Math.exp(e.deltaY * 0.001))); };
    function bindInput() {
      addEventListener('resize', resize); addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp); addEventListener('blur', onBlur);
      canvas.addEventListener('pointerdown', onPointerDown); canvas.addEventListener('wheel', onWheel, { passive: false });
      addEventListener('pointermove', onPointerMove); addEventListener('pointerup', onPointerUp); addEventListener('pointercancel', onPointerUp);
    }
    function unbindInput() {
      removeEventListener('resize', resize); removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp); removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown); canvas.removeEventListener('wheel', onWheel);
      removeEventListener('pointermove', onPointerMove); removeEventListener('pointerup', onPointerUp); removeEventListener('pointercancel', onPointerUp);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    }

    // ------------------------------------------------ loop
    function step(dt) {
      timeU.value += dt;
      if (state.editing && world.editor) {                 // gameplay paused: hero idles, editor drives the camera
        state.heroRig?.controller.update(dt, { moving: false, running: false, airborne: false, speed: 0 }); world.skill && world.skill.update(dt); world.extras && world.extras.update(dt);
        world.editor.update(dt);
      } else { updateMovement(dt); updateCamera(dt); updateRegion(dt); }
      world.layer.update(dt, camera.position.x, camera.position.z);
      world.sky.update(dt, camera, state.editing && world.editor ? world.editor.cam.focus : player.position);   // shadows follow whatever we look at
      world.grass.update(camera, player.position);
      updateLamps(dt);
      if (world.clockEl) { const t = world.sky.clockText(); if (world.clockEl.textContent !== t) world.clockEl.textContent = t; }
    }
    const debug = { state, player, camera, world, renderer, paused: false, get editor() { return world.editor; }, get skill() { return world.skill; }, get horse() { return world.horse; }, get extras() { return world.extras; }, get rig() { return state.heroRig || state.rig; },
      tick: dt => step(dt), render: () => renderFrame(), setHour: h => world.sky.setHour(h), setQuality: q => setQuality(q), get quality() { return quality; }, texturesReady,
      teleport(x, z, yaw = player.rotation.y) { player.position.set(x, groundAt(x, z, 999).h, z); player.rotation.y = yaw; state.camYaw = yaw; state.cameraVelocity.copy(player.position).add(new THREE.Vector3(-Math.sin(yaw) * 5, 3, -Math.cos(yaw) * 5)); state.cameraTarget.copy(player.position); state.region = null; state.regionTimer = 0; } };
    window.Phase1Debug = debug; window.KingdomDebug = debug;
    function tick() {
      if (!running) return; requestAnimationFrame(tick);
      const dt = Math.min(0.033, clock.getDelta()); if (debug.paused) return;
      step(dt); renderFrame(); world.post.adapt(dt);
    }
    const nextFrame = () => new Promise(r => setTimeout(r, 0));
    return {
      async start() {
        loading && loading.classList.remove('hidden'); setupLighting(); resize(); bindInput();
        await nextFrame(); buildWorld(); await nextFrame();
        await loadHero(); spawn(); updateCamera(); updateRegion(0);
        say('Painting stone, soil and bark…'); await texturesReady;
        step(0); renderFrame();                          // compile every shader before the loading screen lifts
        if (A.createEditor) world.editor = A.createEditor({ THREE, scene, camera, renderer, canvas, world, player, state, showToast, root: canvas.parentElement,
          rebuildCollision: () => { world.collide = new CollisionWorld(world.objects); world.grass && world.grass.rebuildMask(); },
          resumeCamera: () => { state.cameraVelocity.copy(camera.position); updateCamera(); } });
        loading && loading.classList.add('hidden'); showToast(world.fromSave ? 'Saved kingdom loaded' : 'Welcome to Aethelos'); tick();
        if (world.horse) setTimeout(() => running && world.horse.load().catch(e => console.warn('Horse:', e)), 2500);   // stream the horse in the background
      },
      stop() { running = false; unbindInput(); world.editor && world.editor.dispose(); world.skill && world.skill.dispose(); world.horse && world.horse.dispose(); world.extras && world.extras.dispose(); world.layer && world.layer.dispose();
        world.grass && world.grass.dispose(); world.water && world.water.dispose(); world.post && world.post.dispose(); world.sky && world.sky.dispose(); world.clockEl && world.clockEl.remove(); renderer.dispose(); if (window.Phase1Debug === debug) { delete window.Phase1Debug; delete window.KingdomDebug; } },
      toggleEditor() { world.editor && world.editor.toggle(); },
      resetCamera() { state.camYaw = player.rotation.y; state.camPitch = 0.30; state.camZoom = 1; showToast('Camera reset'); }
    };
  }
  A.createKingdom = createKingdom; A.ObjectLayer = ObjectLayer; A.CollisionWorld = CollisionWorld;
})();
