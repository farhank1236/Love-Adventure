/* V skill for the Male Warrior: "Azure Tempest".
   Press V -> full power-up pose -> at the burst the hero ignites in blue fire for 6 s (body + sword). Every normal attack
   in that window also throws a sonic boom: a crescent of dark-cored blue flame shaped and tilted by the actual swing,
   flying where the hero faces (arrow keys aim it), bursting on walls / buildings / ground and damaging any registered
   target (Aethelos.Combat). Usable again 12 s after it ignites (6 s active + 6 s cooldown).
   Everything is procedural (shaders + particles), no textures needed. */
(() => {
  const A = window.Aethelos ||= {};
  const ACTIVE = 6, CYCLE = 12, BOOM_SPEED = 30, BOOM_RANGE = 32, MAX_LIGHTS = 3;

  // ---------------------------------------------------------------- combat hook (enemies register here later)
  A.Combat ||= {
    targets: [],                                   // {position: Vector3, radius, onHit(damage, dir, source)}
    register(t) { this.targets.push(t); return () => { const i = this.targets.indexOf(t); if (i >= 0) this.targets.splice(i, 1); }; },
    listeners: [], on(fn) { this.listeners.push(fn); },
    emit(e) { for (const f of this.listeners) try { f(e); } catch (err) { console.error(err); } }
  };

  // GLSL: 3D value noise + fbm
  const NOISE = `
    float h3(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }`;

  function createSonicSkill(ctx) {
    const { THREE, scene, rig, player, world, showToast } = ctx;
    const ctl = rig.controller, bone = n => rig.byName[n.replace(/\./g, '_')];
    const time = { value: 0 }, intensity = { value: 0 };
    const S = { state: 'ready', activeUntil: 0, readyAt: 0, now: 0, fade: 0, shake: 0, booms: [], tipHist: [], aimDir: null };
    const C = { deep: new THREE.Color(0.01, 0.05, 0.22), mid: new THREE.Color(0.07, 0.32, 1.0), hot: new THREE.Color(0.72, 0.93, 1.0) };

    // ============================================================ body fire (two shells on the skinned body)
    function fireShell({ push, additive, color, alpha, erode }) {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, { uTime: time, uI: intensity, uPush: { value: push }, uA: { value: alpha }, uErode: { value: erode }, uDeep: { value: C.deep }, uMid: { value: C.mid }, uHot: { value: C.hot } });
        sh.vertexShader = 'uniform float uTime; uniform float uPush; uniform float uI; varying vec3 vFN; varying vec3 vFV; varying vec3 vFW;\n' + sh.vertexShader
          .replace('#include <skinning_vertex>', `#include <skinning_vertex>
            float wob = 0.65 + 0.35 * sin(uTime * 9.0 + position.y * 23.0 + position.x * 11.0);
            transformed += normalize(objectNormal) * uPush * uI * wob;`)
          .replace('#include <project_vertex>', `#include <project_vertex>
            vFN = normalize(normalMatrix * objectNormal); vFV = -mvPosition.xyz; vFW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
        sh.fragmentShader = 'uniform float uTime; uniform float uI; uniform float uA; uniform float uErode; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uHot; varying vec3 vFN; varying vec3 vFV; varying vec3 vFW;\n' + NOISE + '\n' + sh.fragmentShader
          .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
            float fres = pow(1.0 - abs(dot(normalize(vFN), normalize(vFV))), 1.5);
            vec3 q = vFW * vec3(4.2, 2.2, 4.2) + vec3(0.0, -uTime * 4.2, 0.0);
            float n = fbm3(q) * 0.75 + 0.25 * fbm3(q * 2.7 + 5.0);
            float flame = smoothstep(uErode, uErode + 0.32, n + fres * 0.45);
            vec3 col = mix(uDeep, uMid, flame); col = mix(col, uHot, pow(flame, 4.0) * fres * 0.55);
            vec4 diffuseColor = vec4(col, flame * (0.25 + 0.75 * fres) * uA * uI);`);
      };
      const mesh = new THREE.SkinnedMesh(rig.body.geometry, m);
      mesh.bind(rig.body.skeleton, rig.body.bindMatrix); mesh.morphTargetInfluences = rig.body.morphTargetInfluences;
      mesh.frustumCulled = false; mesh.renderOrder = additive ? 4 : 3; mesh.visible = false; rig.body.parent.add(mesh);
      return mesh;
    }
    const shells = [fireShell({ push: 0.02, additive: false, color: 0x0a1a46, alpha: 0.6, erode: 0.36 }),       // dark smouldering skin
                    fireShell({ push: 0.095, additive: true, color: 0x2f7dff, alpha: 1.0, erode: 0.52 })];     // blazing outer flame tongues

    // ============================================================ particles (embers + dark wisps) — CPU sim, GPU sprites
    function particleSystem(n, { additive, size }) {
      const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 4), sz = new Float32Array(n);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('pcolor', new THREE.BufferAttribute(col, 4)); g.setAttribute('psize', new THREE.BufferAttribute(sz, 1));
      const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
        uniforms: { uScale: { value: size } },
        vertexShader: `attribute vec4 pcolor; attribute float psize; uniform float uScale; varying vec4 vC;
          void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = smoothstep(1.0, 0.0, r); a *= a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, vC.a * a); }` });
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 6 : 5; scene.add(pts);
      const P = Array.from({ length: n }, () => ({ life: 0, max: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, s: 0.2, kind: 0 })); let next = 0;
      return {
        emit(x, y, z, vx, vy, vz, life, s, kind = 0) { const p = P[next]; next = (next + 1) % n; Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, s, kind }); },
        update(dt, colorFn) {
          for (let i = 0; i < n; i++) {
            const p = P[i];
            if (p.life <= 0) { pos[i * 3 + 1] = -9999; col[i * 4 + 3] = 0; continue; }
            p.life -= dt; p.vy += (p.kind === 2 ? -3 : 1.8) * dt; p.vx *= 0.96; p.vz *= 0.96;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            const t = 1 - Math.max(0, p.life) / p.max; pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
            const c = colorFn(t, p); col[i * 4] = c[0]; col[i * 4 + 1] = c[1]; col[i * 4 + 2] = c[2]; col[i * 4 + 3] = c[3]; sz[i] = p.s * (1 - 0.5 * t) * (p.kind === 1 ? 1 + 1.5 * t : 1);
          }
          g.attributes.position.needsUpdate = g.attributes.pcolor.needsUpdate = g.attributes.psize.needsUpdate = true;
        },
        dispose() { scene.remove(pts); g.dispose(); mat.dispose(); }
      };
    }
    const embers = particleSystem(900, { additive: true, size: 380 });
    const smoke = particleSystem(260, { additive: false, size: 520 });
    const flames = particleSystem(420, { additive: true, size: 430 });
    const flameColor = t => [0.10 + 0.25 * (1 - t), 0.36 + 0.3 * (1 - t), 1.0, (1 - t) * (1 - t) * 0.55];
    const emberColor = t => { const h = Math.max(0, 1 - t * 1.6); return [0.25 + 0.6 * h, 0.55 + 0.4 * h, 1.0, (1 - t) * 0.95]; };
    const smokeColor = t => [0.02, 0.05, 0.16, (1 - t) * t * 2.2 * 0.5];
    const BODY_BONES = ['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head', 'UpperArm.L', 'UpperArm.R', 'Forearm.L', 'Forearm.R', 'Hand.L', 'Hand.R', 'Thigh.L', 'Thigh.R', 'Shin.L', 'Shin.R', 'Foot.L', 'Foot.R']
      .map(bone).filter(Boolean);
    const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();

    // ============================================================ sword: tip location + flame sleeve
    const grip = rig.byName.Sword_Grip, sw = rig.fxMeshes.HeroSword, tipLocal = new THREE.Vector3();
    { const p = sw.geometry.attributes.position; let best = 0; for (let i = 0; i < p.count; i += 7) { v3.fromBufferAttribute(p, i); const d = v3.lengthSq(); if (d > best) { best = d; tipLocal.copy(v3); } } }
    const swordTip = (out = new THREE.Vector3()) => out.copy(tipLocal).applyMatrix4(sw.matrixWorld);
    const swordBase = (out = new THREE.Vector3()) => out.copy(tipLocal).multiplyScalar(0.18).applyMatrix4(sw.matrixWorld);
    const glow = rig.fxMeshes.SwordAuraGlow, auraBone = rig.byName.Sword_Aura;
    const sleeveMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { uTime: time, uI: intensity, uMid: { value: C.mid }, uHot: { value: C.hot } },
      vertexShader: `varying vec3 vL; varying vec3 vN; varying vec3 vV; void main(){ vL = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform float uI; uniform vec3 uMid; uniform vec3 uHot; varying vec3 vL; varying vec3 vN; varying vec3 vV; ${NOISE}
        void main(){ float f = abs(dot(normalize(vN), normalize(vV)));
          float n = fbm3(vec3(vL.x * 9.0, vL.y * 9.0, vL.z * 3.0 + uTime * 5.5));
          float flame = smoothstep(0.42, 0.78, n + f * 0.35);
          vec3 c = mix(uMid, uHot, pow(f, 3.0) * flame);
          gl_FragColor = vec4(c, flame * pow(f, 1.2) * 0.95 * uI); }` });
    const sleeve = new THREE.Mesh(glow.geometry, sleeveMat); sleeve.scale.set(1.5, 1.5, 1.08); sleeve.visible = false; sleeve.frustumCulled = false; sleeve.renderOrder = 4;
    glow.parent.add(sleeve);

    // ============================================================ sonic boom
    const ARC = 1.25;                                                  // half-angle of the crescent (rad)
    function crescentGeometry(R = 2.4, width = 1.05, nu = 56, nv = 8) {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, a = (u - 0.5) * 2 * ARC, taper = Math.pow(Math.sin(Math.PI * u), 0.65), w = width * taper;
        for (let j = 0; j <= nv; j++) {
          // moon-shaped blade wave facing the viewer: chord along local x, bulging up (+y), wing tips swept back (-z)
          const v = j / nv, r = R - w * v, lens = Math.sin(Math.PI * v) * 0.12 * taper;
          pos.push(Math.sin(a) * r, Math.cos(a) * r - R * Math.cos(ARC) * 0.85, -(1 - Math.cos(a)) * R * 0.75 + lens); uv.push(u, v);
        }
      }
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    const crescent = crescentGeometry(), halo = crescentGeometry(2.7, 1.9, 40, 6);
    const boomVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    function boomMat(kind) {
      const fs = {
        // dark smouldering body of the wave: deep navy core, eaten away into flame tongues toward the trailing edge
        core: `float tip = smoothstep(0.0, 0.10, vUv.x) * smoothstep(1.0, 0.90, vUv.x);
               float n = fbm3(vec3(vUv.x * 7.0, vUv.y * 4.0 + uTime * 6.0, uSeed));
               float body = smoothstep(vUv.y * 1.05, vUv.y * 1.05 + 0.25, n + 0.22) * tip;
               vec3 c = mix(uDeep, uMid * 0.55, smoothstep(0.75, 0.2, vUv.y));
               gl_FragColor = vec4(c, body * 0.92 * uFade);`,
        // blazing leading edge + licking flames, additive
        fire: `float tip = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
               float n = fbm3(vec3(vUv.x * 9.0, vUv.y * 5.0 + uTime * 9.0, uSeed + 3.0));
               float edge = exp(-vUv.y * 9.0);
               float tongues = smoothstep(0.55, 0.95, n + 0.35 - vUv.y * 0.6);
               float a = (edge * 1.4 + tongues * 0.8) * tip;
               vec3 c = mix(uMid, uHot, clamp(edge * 1.3 + tongues * 0.3, 0.0, 1.0));
               gl_FragColor = vec4(c * a, a) * uFade;`,
        // wide soft halo (fakes the light bleeding into the air)
        halo: `float tip = sin(3.14159 * vUv.x); float a = tip * exp(-pow(vUv.y - 0.15, 2.0) * 9.0) * 0.32;
               gl_FragColor = vec4(uMid * a, a) * uFade;`
      }[kind];
      return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        blending: kind === 'core' ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: { uTime: time, uFade: { value: 1 }, uSeed: { value: Math.random() * 50 }, uDeep: { value: C.deep }, uMid: { value: C.mid }, uHot: { value: C.hot } },
        vertexShader: boomVS, fragmentShader: `uniform float uTime; uniform float uFade; uniform float uSeed; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uHot; varying vec2 vUv; ${NOISE}\nvoid main(){ ${fs} }` });
    }
    const lights = Array.from({ length: MAX_LIGHTS }, () => { const l = new THREE.PointLight(0x3d8cff, 0, 16, 1.6); scene.add(l); return { l, busy: false }; });
    const takeLight = () => { const s = lights.find(x => !x.busy); if (s) s.busy = true; return s; };

    function spawnBoom(origin, dir, roll, scale = 1) {
      const g = new THREE.Group(), core = boomMat('core'), fire = boomMat('fire'), haloM = boomMat('halo');
      const mCore = new THREE.Mesh(crescent, core), mFire = new THREE.Mesh(crescent, fire), mHalo = new THREE.Mesh(halo, haloM);
      mCore.renderOrder = 7; mFire.renderOrder = 8; mHalo.renderOrder = 6; mFire.position.y = 0.01;
      const streak = [0.55, 0.32, 0.16].map((k, i) => { const m = new THREE.Mesh(crescent, boomMat('fire')); m.material.uniforms.uSeed.value = i * 7.3; m.renderOrder = 6; m.userData.k = k; g.add(m); return m; });
      g.add(mHalo, mCore, mFire);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(dir.x, dir.z), 0));   // local +z = travel, local x = hero's left
      g.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
      g.position.copy(origin); g.scale.setScalar(0.7 * scale); scene.add(g);
      const b = { g, dir: dir.clone(), age: 0, dist: 0, scale, mats: [core, fire, haloM, ...streak.map(m => m.material)], streak, light: takeLight(), hit: new Set(), dead: false };
      S.booms.push(b); S.shake = Math.max(S.shake, 0.18);
      for (let i = 0; i < 24; i++) embers.emit(origin.x + (Math.random() - 0.5), origin.y + (Math.random() - 0.5), origin.z + (Math.random() - 0.5), dir.x * 6 + (Math.random() - 0.5) * 3, (Math.random() - 0.2) * 2, dir.z * 6 + (Math.random() - 0.5) * 3, 0.4 + Math.random() * 0.3, 0.25);
      A.Combat.emit({ type: 'sonicBoom', origin: origin.clone(), dir: dir.clone() });
      return b;
    }
    function burst(at, strength = 1) {
      for (let i = 0; i < 70 * strength; i++) { const a = Math.random() * 6.283, e = Math.random() * 1.2 - 0.2, s = 4 + Math.random() * 7;
        embers.emit(at.x, at.y, at.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s, 0.35 + Math.random() * 0.45, 0.3 + Math.random() * 0.25); }
      for (let i = 0; i < 16 * strength; i++) smoke.emit(at.x, at.y, at.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 3, 0.9 + Math.random() * 0.6, 0.9, 1);
      rings.push({ at: at.clone(), age: 0, life: 0.45, size: 6 * strength, mesh: makeRing() }); flash(at, 90 * strength, 0.25);
      S.shake = Math.max(S.shake, 0.3 * strength);
    }
    // expanding shock rings + light flashes
    const rings = [], flashes = [];
    const ringMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uFade: { value: 1 }, uMid: { value: C.mid }, uHot: { value: C.hot }, uTime: time },
      vertexShader: boomVS, fragmentShader: `uniform float uFade; uniform vec3 uMid; uniform vec3 uHot; uniform float uTime; varying vec2 vUv; ${NOISE}
        void main(){ float r = length(vUv - 0.5) * 2.0; float ring = exp(-pow((r - 0.82) * 9.0, 2.0)); float n = fbm3(vec3(vUv * 9.0, uTime * 4.0));
          float a = ring * (0.6 + 0.6 * n) * uFade; gl_FragColor = vec4(mix(uMid, uHot, ring * 0.6) * a, a); }` });
    const ringGeo = new THREE.PlaneGeometry(2, 2);
    function makeRing(horizontal = false) { const m = new THREE.Mesh(ringGeo, ringMat()); m.renderOrder = 9; if (horizontal) m.rotation.x = -Math.PI / 2; scene.add(m); return m; }
    function flash(at, power, life) { const s = takeLight(); if (!s) return; s.l.position.copy(at); s.l.intensity = power; s.l.distance = 26; flashes.push({ s, age: 0, life, power }); }

    // ============================================================ ignition column (power-up burst)
    const columnMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uTime: time, uFade: { value: 0 }, uMid: { value: C.mid }, uHot: { value: C.hot } },
      vertexShader: boomVS, fragmentShader: `uniform float uTime; uniform float uFade; uniform vec3 uMid; uniform vec3 uHot; varying vec2 vUv; ${NOISE}
        void main(){ float n = fbm3(vec3(vUv.x * 22.0, vUv.y * 2.2 - uTime * 7.0, uTime)); float a = smoothstep(0.5, 0.85, n + (1.0 - vUv.y) * 0.25) * (1.0 - vUv.y) * smoothstep(0.0, 0.18, vUv.y) * uFade;
          gl_FragColor = vec4(mix(uMid, uHot, (1.0 - vUv.y) * n * 0.45) * a * 0.75, a); }` });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.05, 7, 24, 1, true), columnMat); column.visible = false; column.renderOrder = 9; scene.add(column);
    let columnT = 9, groundRing = null;

    // ============================================================ state machine
    function activate() {
      if (S.state === 'active' || S.state === 'charging') return false;
      if (S.now < S.readyAt) { showToast?.(`Azure Tempest ready in ${Math.ceil(S.readyAt - S.now)} s`); return false; }
      if (!ctl.power()) { showToast?.('Cannot power up right now'); return false; }
      S.state = 'charging'; S.chargeT = 0; return true;
    }
    const off = ctl.on((type, d) => {
      if (type === 'powerBurst') ignite();
      else if (type === 'powerEnd' && S.state === 'charging') S.state = 'ready';
      else if (type === 'attackStart' && S.state === 'active' && S.aimDir) { const a = S.aimDir(); if (a) player.rotation.y = Math.atan2(a.x, a.z); }
      else if (type === 'hit' && S.state === 'active') launch(d);
    });
    function ignite() {
      S.state = 'active'; S.activeUntil = S.now + ACTIVE; S.readyAt = S.now + CYCLE; ctl.state.holdSword = true;
      const at = player.position.clone().add(v3.set(0, 1.0, 0));
      burst(at, 1.6); columnT = 0; column.visible = true;
      if (groundRing) { scene.remove(groundRing.mesh); }
      groundRing = { mesh: makeRing(true), age: 0, life: 0.7 }; groundRing.mesh.position.copy(player.position).add(v3.set(0, 0.15, 0));
      S.shake = 0.55; showToast?.('Azure Tempest: 6 s');
    }
    function launch(d) {
      // swing plane from the sword tip's motion over the last few frames -> crescent tilt (an X finisher throws an X)
      const H = S.tipHist, fwd = new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
      let roll = 0;
      if (H.length >= 3) {
        const v = H[H.length - 1].clone().sub(H[Math.max(0, H.length - 4)]); v.addScaledVector(fwd, -v.dot(fwd));
        if (v.length() > 0.05) { const right = new THREE.Vector3(-fwd.z, 0, fwd.x); roll = Math.atan2(v.y, v.dot(right)); }
      }
      if (Math.abs(roll) > Math.PI / 2) roll += roll > 0 ? -Math.PI : Math.PI;   // the crescent is symmetric: keep the bulge forward
      const tip = swordTip(v4), ground = world.terrain.heightAt(player.position.x, player.position.z);
      const h = Math.max(ground + 0.55, Math.min(ground + 2.3, (tip.y + player.position.y + 1.3) / 2));
      const origin = player.position.clone().addScaledVector(fwd, 1.6); origin.y = h;
      spawnBoom(origin, fwd, -roll, d.clip === 'Attack5' && d.hit === 1 ? 1.25 : 1);
    }

    // ============================================================ per frame
    function update(dt) {
      S.now += dt; time.value += dt;
      if (S.state === 'active' && S.now >= S.activeUntil) { S.state = 'cooldown'; ctl.state.holdSword = false; }
      if (S.state === 'cooldown' && S.now >= S.readyAt) S.state = 'ready';
      if (S.state === 'charging') S.chargeT += dt;
      const target = S.state === 'active' ? 1 : 0; S.fade += (target - S.fade) * Math.min(1, dt * (target ? 6 : 3)); intensity.value = S.fade;
      const on = S.fade > 0.01; for (const m of shells) m.visible = on; sleeve.visible = on && grip.scale.y > 0.5;
      if (on && auraBone) { const k = 1 + 0.45 * S.fade; auraBone.scale.x = Math.max(auraBone.scale.x, k); auraBone.scale.y = Math.max(auraBone.scale.y, k); auraBone.scale.z = Math.max(auraBone.scale.z, 1); }   // x edge, y flat, z blade
      // sword tip history (for the swing plane)
      player.updateMatrixWorld(true); S.tipHist.push(swordTip(new THREE.Vector3())); if (S.tipHist.length > 6) S.tipHist.shift();
      // body embers + dark wisps
      if (on) {
        const rate = 260 * S.fade * dt;
        for (let i = 0; i < rate; i++) {
          const b = BODY_BONES[(Math.random() * BODY_BONES.length) | 0]; b.getWorldPosition(v3);
          embers.emit(v3.x + (Math.random() - 0.5) * 0.45, v3.y + (Math.random() - 0.5) * 0.3, v3.z + (Math.random() - 0.5) * 0.45, (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 1.8, (Math.random() - 0.5) * 0.6, 0.45 + Math.random() * 0.5, 0.1 + Math.random() * 0.22);
        }
        for (let i = 0; i < 150 * S.fade * dt; i++) {                    // flame wisps: big, fast, short-lived
          const b = BODY_BONES[(Math.random() * BODY_BONES.length) | 0]; b.getWorldPosition(v3);
          flames.emit(v3.x + (Math.random() - 0.5) * 0.35, v3.y + (Math.random() - 0.5) * 0.25, v3.z + (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.5, 2.4 + Math.random() * 1.8, (Math.random() - 0.5) * 0.5, 0.28 + Math.random() * 0.25, 0.45 + Math.random() * 0.45);
        }
        if (grip.scale.y > 0.5) for (let i = 0; i < 70 * S.fade * dt; i++) { const t = Math.random(); swordBase(v3); swordTip(v4); v3.lerp(v4, t);
          embers.emit(v3.x, v3.y, v3.z, (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.35, 0.12 + Math.random() * 0.16); }
        for (let i = 0; i < 26 * S.fade * dt; i++) { const b = BODY_BONES[(Math.random() * BODY_BONES.length) | 0]; b.getWorldPosition(v3);
          smoke.emit(v3.x, v3.y, v3.z, (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 0.6, 0.55, 1); }
      }
      if (S.state === 'charging') {                                     // energy gathering into the hero
        for (let i = 0; i < 90 * dt; i++) { const a = Math.random() * 6.283, r = 2.2 + Math.random() * 1.5; v3.copy(player.position).add(v4.set(Math.cos(a) * r, 0.2 + Math.random() * 2.2, Math.sin(a) * r));
          embers.emit(v3.x, v3.y, v3.z, -Math.cos(a) * r * 1.8, 0.4, -Math.sin(a) * r * 1.8, 0.45, 0.16); }
      }
      // ignition column + ground ring
      if (columnT < 0.9) { columnT += dt; column.position.copy(player.position).add(v3.set(0, 3.4, 0)); const t = columnT / 0.9; columnMat.uniforms.uFade.value = Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t * 0.6); column.scale.set(1 + t * 0.45, 0.6 + t * 0.7, 1 + t * 0.45); }
      else column.visible = false;
      if (groundRing) { groundRing.age += dt; const t = groundRing.age / groundRing.life; groundRing.mesh.scale.setScalar(1 + t * 9); groundRing.mesh.material.uniforms.uFade.value = 1 - t; if (t >= 1) { scene.remove(groundRing.mesh); groundRing.mesh.material.dispose(); groundRing = null; } }
      // booms
      const cam = ctx.camera;
      for (const b of S.booms) {
        if (b.dead) continue;
        b.age += dt; const step = BOOM_SPEED * dt; b.dist += step;
        const prev = b.g.position.clone(); b.g.position.addScaledVector(b.dir, step);
        const grow = 0.7 + 0.6 * Math.min(1, b.dist / BOOM_RANGE); b.g.scale.setScalar(grow * b.scale);
        const fade = Math.min(1, b.age / 0.05) * (1 - Math.max(0, (b.dist - BOOM_RANGE * 0.7) / (BOOM_RANGE * 0.3)));
        for (const m of b.mats) m.uniforms.uFade.value = fade;
        b.streak.forEach((m, i) => { m.position.set(0, 0, -(i + 1) * 0.55 / b.g.scale.x); m.material.uniforms.uFade.value = fade * m.userData.k; });
        if (b.light) { b.light.l.position.copy(b.g.position); b.light.l.intensity = 38 * fade; b.light.l.distance = 16; }
        for (let i = 0; i < 40 * dt * 30 / 30; i++) { const a = (Math.random() - 0.5) * 2 * ARC, r = 2.4 * grow * b.scale; v3.set(Math.sin(a) * r, Math.cos(a) * r - r * Math.cos(ARC) * 0.85, -(1 - Math.cos(a)) * r * 0.75).applyQuaternion(b.g.quaternion).add(b.g.position);
          embers.emit(v3.x, v3.y, v3.z, -b.dir.x * 3 + (Math.random() - 0.5), (Math.random() - 0.3) * 1.5, -b.dir.z * 3 + (Math.random() - 0.5), 0.25 + Math.random() * 0.3, 0.14 + Math.random() * 0.12); }
        // damage: any registered target within reach of the crescent
        for (const t of A.Combat.targets) { if (b.hit.has(t) || !t.position) continue; if (t.position.distanceTo(b.g.position) < (t.radius || 1) + 2.2 * grow * b.scale) { b.hit.add(t); try { t.onHit && t.onHit(40, b.dir.clone(), 'sonicBoom'); } catch (e) { console.error(e); } burst(t.position.clone(), 0.6); } }
        // walls, buildings, rocks, trees and the ground stop it
        const p = b.g.position, gy = world.terrain.heightAt(p.x, p.z), hit = world.collide && world.collide.resolve(p.x, p.z, 0.55 * grow, p.y - 0.9, 1.8)[2];
        if (hit || p.y < gy + 0.15 || b.dist >= BOOM_RANGE) { if (hit || p.y < gy + 0.15) burst(prev, 0.8); kill(b); }
      }
      S.booms = S.booms.filter(b => !b.dead);
      for (const r of rings) { r.age += dt; const t = r.age / r.life; r.mesh.position.copy(r.at); r.mesh.quaternion.copy(cam.quaternion); r.mesh.scale.setScalar(0.5 + t * r.size); r.mesh.material.uniforms.uFade.value = 1 - t; if (t >= 1) { scene.remove(r.mesh); r.mesh.material.dispose(); r.done = true; } }
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].done) rings.splice(i, 1);
      for (const f of flashes) { f.age += dt; f.s.l.intensity = f.power * Math.max(0, 1 - f.age / f.life); if (f.age >= f.life) { f.s.l.intensity = 0; f.s.busy = false; f.done = true; } }
      for (let i = flashes.length - 1; i >= 0; i--) if (flashes[i].done) flashes.splice(i, 1);
      embers.update(dt, emberColor); smoke.update(dt, smokeColor); flames.update(dt, flameColor);
      S.shake *= Math.exp(-dt * 7);
      hud();
    }
    function kill(b) { b.dead = true; scene.remove(b.g); for (const m of b.mats) m.dispose(); if (b.light) { b.light.l.intensity = 0; b.light.busy = false; } }

    // ============================================================ HUD: skill icon with countdown ring
    const root = ctx.root, icon = document.createElement('div');
    icon.id = 'skillV'; icon.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" class="bg"/><circle cx="32" cy="32" r="28" class="ring" pathLength="100"/></svg><b>V</b><span></span>`;
    icon.title = 'Azure Tempest (V): 6 s of blue fire, attacks throw sonic booms (arrow keys aim)';
    if (!document.getElementById('skillVCss')) { const st = document.createElement('style'); st.id = 'skillVCss'; st.textContent = `
      #skillV { position: fixed; right: 22px; bottom: 86px; width: 74px; height: 74px; z-index: 30; pointer-events: none; display: grid; place-items: center; font-family: 'Fredoka', 'Nunito', sans-serif; }
      #skillV svg { position: absolute; inset: 0; transform: rotate(-90deg); }
      #skillV .bg { fill: rgba(8, 18, 40, .78); stroke: rgba(120, 170, 255, .25); stroke-width: 4; }
      #skillV .ring { fill: none; stroke: #4aa8ff; stroke-width: 5; stroke-linecap: round; stroke-dasharray: 100 100; transition: stroke .2s; filter: drop-shadow(0 0 4px #4aa8ff); }
      #skillV b { position: relative; font-size: 22px; color: #e6f2ff; text-shadow: 0 0 10px #3d8cff; line-height: 1; margin-top: -10px; }
      #skillV span { position: absolute; bottom: 12px; font: 700 11px 'Nunito', sans-serif; letter-spacing: .06em; color: #bcd8ff; }
      #skillV.ready .ring { stroke: #7cc4ff; } #skillV.active .ring { stroke: #ffffff; filter: drop-shadow(0 0 8px #4aa8ff); } #skillV.cooldown { opacity: .78; } #skillV.cooldown .ring { stroke: #3a5f8f; filter: none; }`;
      document.head.appendChild(st); }
    root.appendChild(icon);
    const ringEl = icon.querySelector('.ring'), label = icon.querySelector('span');
    let lastHud = '';
    function hud() {
      let frac = 1, txt = 'READY', cls = 'ready';
      if (S.state === 'charging') { cls = 'active'; txt = '…'; frac = 1; }
      else if (S.state === 'active') { cls = 'active'; frac = (S.activeUntil - S.now) / ACTIVE; txt = Math.ceil(S.activeUntil - S.now) + 's'; }
      else if (S.now < S.readyAt) { cls = 'cooldown'; frac = 1 - (S.readyAt - S.now) / (CYCLE - ACTIVE); txt = Math.ceil(S.readyAt - S.now) + 's'; }
      const key = cls + txt + frac.toFixed(2); if (key === lastHud) return; lastHud = key;
      icon.className = cls; label.textContent = txt; ringEl.style.strokeDasharray = `${Math.max(0, Math.min(100, frac * 100))} 100`;
    }
    hud();

    function dispose() {
      off(); for (const m of shells) { m.parent && m.parent.remove(m); m.material.dispose(); } sleeve.parent && sleeve.parent.remove(sleeve); sleeveMat.dispose();
      for (const b of S.booms) kill(b); embers.dispose(); smoke.dispose(); flames.dispose(); for (const s of lights) scene.remove(s.l); scene.remove(column); icon.remove(); ctl.state.holdSword = false;
    }
    return { activate, update, dispose, state: S, get shake() { return S.shake; }, setAim(fn) { S.aimDir = fn; }, spawnBoom, burst };
  }
  A.createSonicSkill = createSonicSkill;
})();
