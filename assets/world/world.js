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
      this.mat = {
        std: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0.0, side: THREE.DoubleSide }),
        glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
      };
      this.meshes = []; this.extras = []; this.build();
    }
    matrixOf(o, m = new this.T.Matrix4()) {
      const T = this.T, q = new T.Quaternion().setFromEuler(new T.Euler(o.rotation.x || 0, o.rotation.y || 0, o.rotation.z || 0));
      return m.compose(new T.Vector3(o.position.x, o.position.y, o.position.z), q, new T.Vector3(o.scale.x, o.scale.y, o.scale.z));
    }
    build() {
      const T = this.T, groups = new Map();
      for (const o of this.objects) {
        if (!A.Models.TYPES[o.type]) continue;
        const k = o.type + '|' + Math.floor(o.position.x / this.tile) + ',' + Math.floor(o.position.z / this.tile);
        (groups.get(k) || groups.set(k, []).get(k)).push(o);
      }
      const m = new T.Matrix4();
      for (const [k, list] of groups) {
        const type = k.split('|')[0], def = A.Models.TYPES[type], parts = A.Models.get(T, type);
        for (const [part, geo] of Object.entries(parts)) {
          const mesh = new T.InstancedMesh(geo, this.mat[part], list.length);
          list.forEach((o, i) => mesh.setMatrixAt(i, this.matrixOf(o, m)));
          mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
          mesh.receiveShadow = part === 'std'; mesh.castShadow = false; mesh.name = `${type}@${k.split('|')[1]}:${part}`;
          mesh.userData = { type, ids: list.map(o => o.id), part, flat: !!def.flat, center: mesh.boundingSphere.center.clone(), lamp: !!def.lamp };
          this.group.add(mesh); this.meshes.push(mesh);
        }
        if (type === 'windmill') for (const o of list) this.addSails(o);
      }
    }
    addSails(o) {
      const T = this.T, pivot = new T.Group(), mat = this.mat.std;
      const blade = new T.BoxGeometry(0.3, 8.4, 0.18), cloth = new T.BoxGeometry(1.7, 6.6, 0.06);
      const paint = (g, hex) => { const c = new T.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new T.BufferAttribute(a, 3)); return g; };
      paint(blade, 0x8a6239); paint(cloth, 0xf0e6d0);
      for (let i = 0; i < 4; i++) { const arm = new T.Group(); arm.rotation.z = i * Math.PI / 2; const b = new T.Mesh(blade, mat); b.position.y = 4.2; const c = new T.Mesh(cloth, mat); c.position.set(0.95, 4.6, 0.08); arm.add(b, c); pivot.add(arm); }
      const root = new T.Group(); this.matrixOf(o, root.matrix); root.matrixAutoUpdate = false; pivot.position.set(0, 11.0, 3.5); root.add(pivot);
      pivot.traverse(n => { if (n.isMesh) n.castShadow = true; });
      this.group.add(root); this.extras.push({ pivot, spin: 0.6 });
    }
    update(dt, px, pz) {
      for (const e of this.extras) e.pivot.rotation.z += e.spin * dt;
      for (const m of this.meshes) { const c = m.userData.center; m.castShadow = m.userData.part === 'std' && !m.userData.flat && Math.hypot(c.x - px, c.z - pz) < 230; }
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

  // ---------------------------------------------------------------- sky dome (two suns / three moons arrive in part C)
  function skyDome(THREE) {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      uniforms: { top: { value: new THREE.Color(0x3f86d4) }, horizon: { value: new THREE.Color(0xcfe5f3) }, ground: { value: new THREE.Color(0x9fb7a8) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.62, h), 0.8)) : mix(horizon, ground, smoothstep(0.0, -0.2, h)); gl_FragColor = vec4(c, 1.0); }`
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), mat); m.name = 'SkyDome'; m.renderOrder = -10; m.frustumCulled = false; return m;
  }
  function waterMaterial(THREE, timeU) {
    const m = new THREE.MeshStandardMaterial({ color: 0x2f7fb3, roughness: 0.1, metalness: 0.08, transparent: true, opacity: 0.86, depthWrite: false, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader = 'attribute vec2 flowUv;\nvarying vec2 vFlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = flowUv;');
      sh.fragmentShader = 'uniform float uTime;\nvarying vec2 vFlow;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float w1 = sin(vFlow.y * 5.0 - uTime * 2.1 + sin(vFlow.x * 8.0 + vFlow.y) * 1.6);
        float w2 = sin(vFlow.y * 11.0 - uTime * 3.3 + vFlow.x * 15.0);
        float bank = 1.0 - smoothstep(0.0, 0.14, vFlow.x) * smoothstep(1.0, 0.86, vFlow.x);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.78, 0.86), bank * 0.55) + vec3(0.09) * pow(max(0.0, w1 * w2), 2.0);
        diffuseColor.a = mix(diffuseColor.a, 0.55, bank);`);
    };
    return m;
  }

  // ---------------------------------------------------------------- the kingdom
  function createKingdom(hero, dom) {
    const THREE = window.THREE, L = A.Layout;
    const { canvas, loading, loadingText, toast, heroLabel, stateLabel, speedLabel, banner } = dom;
    let running = true;
    const say = t => { if (loadingText) loadingText.textContent = t; };
    const showToast = text => { if (!toast) return; toast.textContent = text; toast.classList.add('show'); clearTimeout(showToast.t); showToast.t = setTimeout(() => toast.classList.remove('show'), 1700); };

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xc6dcea, 260, 950);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.15, 3000);
    const clock = new THREE.Clock(), timeU = { value: 0 };
    const player = new THREE.Group(); player.name = 'Player Root'; scene.add(player);
    const heroMount = new THREE.Group(); player.add(heroMount);
    const world = {};
    const state = { keys: Object.create(null), camYaw: L.SPAWN.yaw, camPitch: 0.30, camZoom: 1, camDistance: 6, cameraTarget: new THREE.Vector3(), cameraVelocity: new THREE.Vector3(),
      velocity: new THREE.Vector3(), grounded: true, jumpVelocity: 0, jumpLatch: false, pointerDown: false, lastPointerX: 0, lastPointerY: 0, currentSpeed: 0,
      heroClip: 'Idle', heroTime: 0, rig: null, heroRig: null, attackTimer: 0, region: null, regionTimer: 0, onDeck: false };

    // ------------------------------------------------ world build
    function setupLighting() {
      scene.add(skyDome(THREE));
      scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x4e5f46, 1.25));
      const sun = new THREE.DirectionalLight(0xfff0d4, 2.5); sun.name = 'Sun';
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const S = 75;
      Object.assign(sun.shadow.camera, { near: 10, far: 520, left: -S, right: S, top: S, bottom: -S }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;
      scene.add(sun, sun.target); world.sun = sun; world.sunDir = new THREE.Vector3(-0.45, 0.82, 0.36).normalize();
    }
    function buildWorld() {
      say('Shaping the kingdom: hills, rivers and Ironpeak…');
      const terrain = world.terrain = new A.Terrain(L);
      const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
      scene.add(terrain.buildMeshes(THREE, groundMat));
      const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
      scene.add(terrain.buildRoads(THREE, roadMat));
      scene.add(terrain.buildWater(THREE, waterMaterial(THREE, timeU)));
      say('Raising the city, the palace and the noble houses…');
      const saved = MapStore.load();
      world.objects = saved ? saved.objects : A.KingdomObjects.generate(terrain);
      world.fromSave = !!saved;
      world.layer = new ObjectLayer(THREE, scene, world.objects);
      world.collide = new CollisionWorld(world.objects);
    }
    async function loadHero() {
      heroLabel && (heroLabel.textContent = hero.name);
      say('Calling your warrior…');
      if (hero.gender === 'male' && window.HeroRig) {
        const rig = await HeroRig.loadHero(THREE);
        rig.root.traverse(o => { if (o.isMesh) o.castShadow = !o.material.transparent && o.name !== 'HeroSword'; });   // the 500k-tri sword skips the shadow pass
        state.heroRig = rig; heroMount.add(rig.root);
      } else {
        const rig = await HeroSystem.createRig(THREE, hero); await rig.textureReady;
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
      const [rx, rz] = world.collide.resolve(nx, nz, 0.42, y);
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
      const k = state.keys, ix = Number(!!(k.KeyD || k.ArrowRight)) - Number(!!(k.KeyA || k.ArrowLeft)), iz = Number(!!(k.KeyS || k.ArrowDown)) - Number(!!(k.KeyW || k.ArrowUp));
      if (!ix && !iz) return null;
      const sin = Math.sin(state.camYaw), cos = Math.cos(state.camYaw), l = Math.hypot(ix, iz);
      // camera looks along (sin yaw, cos yaw); screen-right is (-cos yaw, sin yaw)
      return new THREE.Vector3(-(ix * cos + iz * sin) / l, 0, -(iz * cos - ix * sin) / l);
    }
    function turnTo(dir, rate) { const t = Math.atan2(dir.x, dir.z); player.rotation.y += Math.atan2(Math.sin(t - player.rotation.y), Math.cos(t - player.rotation.y)) * rate; }

    function updateWarriorV4(dt) {
      const k = state.keys, ctl = state.heroRig.controller, dir = inputDir(), moving = !!dir, running = !!(k.KeyX || k.ShiftLeft || k.ShiftRight);
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
      ctl.update(dt, { moving: moving && moved > 0.25, running, airborne: !state.grounded, speed: state.currentSpeed });
      const S = ctl.state;
      stateLabel && (stateLabel.textContent = S.mode === 'dodge' ? 'Dodge roll' : S.mode === 'attack' ? (S.attackKind === 'up' ? 'Rising stab' : S.attackKind === 'down' ? 'Low slash' : 'Attack ' + (S.combo + 1))
        : S.mode === 'summon' ? 'Summoning sword' : S.mode === 'dismiss' ? 'Sword vanishing' : !state.grounded ? 'Jumping' : moving ? (running ? 'Running' : 'Walking') : S.swordOut ? 'Guard' : 'Idle');
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
      const fast = state.currentSpeed > (state.heroRig ? 4.2 : 7);
      state.camDistance += ((fast ? 6.8 : 5.8) * state.camZoom - state.camDistance) * 0.08;
      const horizontal = Math.cos(state.camPitch) * state.camDistance;
      const desired = player.position.clone().add(new THREE.Vector3(-Math.sin(state.camYaw) * horizontal, Math.sin(state.camPitch) * state.camDistance + 0.9, -Math.cos(state.camYaw) * horizontal));
      const floor = world.terrain.heightAt(desired.x, desired.z) + 0.6; if (desired.y < floor) desired.y = floor;
      state.cameraVelocity.lerp(desired, 0.14); camera.position.copy(state.cameraVelocity);
      state.cameraTarget.lerp(player.position.clone().add(new THREE.Vector3(0, state.heroRig ? 1.45 : 1.3, 0)), 0.2);
      camera.lookAt(state.cameraTarget);
      const s = world.sun, d = world.sunDir;
      s.position.copy(player.position).addScaledVector(d, 260); s.target.position.copy(player.position); s.target.updateMatrixWorld();
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
    function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    const onKeyDown = e => {
      if (GAME_KEYS.has(e.code) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) e.preventDefault();
      state.keys[e.code] = true; if (e.repeat) return;
      const ctl = state.heroRig?.controller;
      if (ctl) {
        const k = state.keys, dir = (k.ArrowUp && !k.ArrowDown) ? 'up' : (k.ArrowDown && !k.ArrowUp) ? 'down' : undefined;
        if (e.code === 'Space' || e.code === 'KeyF') ctl.attack(dir);
        else if (e.code === 'ArrowUp') ctl.direction('up'); else if (e.code === 'ArrowDown') ctl.direction('down');
        else if (e.code === 'KeyC' && state.grounded && ctl.dodge()) showToast('Dodge roll');
        return;
      }
      if (e.code === 'Space' || e.code === 'KeyF') state.attackTimer = 0.95;
    };
    const onKeyUp = e => { state.keys[e.code] = false; };
    const onBlur = () => { for (const k in state.keys) state.keys[k] = false; };
    const onPointerDown = e => {
      state.pointerDown = true; state.lastPointerX = e.clientX; state.lastPointerY = e.clientY;
      if (e.pointerType === 'mouse' && document.pointerLockElement !== canvas) { try { const p = canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
      else canvas.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = e => {
      const locked = document.pointerLockElement === canvas; let dx, dy;
      if (e.pointerType === 'mouse' || locked) { if (!locked && e.target !== canvas) return; dx = e.movementX || 0; dy = e.movementY || 0; }
      else { if (!state.pointerDown) return; dx = e.clientX - state.lastPointerX; dy = e.clientY - state.lastPointerY; state.lastPointerX = e.clientX; state.lastPointerY = e.clientY; }
      state.camYaw -= dx * 0.0045; state.camPitch = Math.max(0.06, Math.min(0.95, state.camPitch + dy * 0.003));
    };
    const onPointerUp = () => { state.pointerDown = false; };
    const onWheel = e => { e.preventDefault(); state.camZoom = Math.max(0.55, Math.min(1.9, state.camZoom * Math.exp(e.deltaY * 0.001))); };
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
      updateMovement(dt); updateCamera(dt); updateRegion(dt);
      world.layer.update(dt, player.position.x, player.position.z);
    }
    const debug = { state, player, camera, world, renderer, paused: false, get rig() { return state.heroRig || state.rig; },
      tick: dt => step(dt), render: () => renderer.render(scene, camera),
      teleport(x, z, yaw = player.rotation.y) { player.position.set(x, groundAt(x, z, 999).h, z); player.rotation.y = yaw; state.camYaw = yaw; state.cameraVelocity.copy(player.position).add(new THREE.Vector3(-Math.sin(yaw) * 5, 3, -Math.cos(yaw) * 5)); state.cameraTarget.copy(player.position); state.region = null; state.regionTimer = 0; } };
    window.Phase1Debug = debug; window.KingdomDebug = debug;
    function tick() {
      if (!running) return; requestAnimationFrame(tick);
      const dt = Math.min(0.033, clock.getDelta()); if (debug.paused) return;
      step(dt); renderer.render(scene, camera);
    }
    const nextFrame = () => new Promise(r => setTimeout(r, 0));
    return {
      async start() {
        loading && loading.classList.remove('hidden'); setupLighting(); resize(); bindInput();
        await nextFrame(); buildWorld(); await nextFrame();
        await loadHero(); spawn(); updateCamera(); updateRegion(0);
        loading && loading.classList.add('hidden'); showToast(world.fromSave ? 'Saved kingdom loaded' : 'Welcome to Aethelos'); tick();
      },
      stop() { running = false; unbindInput(); world.layer && world.layer.dispose(); renderer.dispose(); if (window.Phase1Debug === debug) { delete window.Phase1Debug; delete window.KingdomDebug; } },
      resetCamera() { state.camYaw = player.rotation.y; state.camPitch = 0.30; state.camZoom = 1; showToast('Camera reset'); }
    };
  }
  A.createKingdom = createKingdom; A.ObjectLayer = ObjectLayer; A.CollisionWorld = CollisionWorld;
})();
