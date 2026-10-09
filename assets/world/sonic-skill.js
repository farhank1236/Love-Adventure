/* V skill for the Male Warrior: "Azure Tempest".
   Press V -> full power-up pose -> at the burst the hero ignites in blue fire for 6 s (body + sword). Every normal attack
   in that window also throws a sonic boom: an upright 4 m crescent of dark-cored blue flame that flies dead straight along
   the line the hero faces (arrow keys aim it; an enemy in front within 45 m / 40 deg is locked on and hit head-on),
   skimming the ground, bursting on walls / buildings and damaging any registered target (Aethelos.Combat). Usable again 12 s after it ignites (6 s active + 6 s cooldown).
   Everything is procedural (shaders + particles), no textures needed. */
(() => {
  const A = window.Aethelos ||= {};
  const ACTIVE = 6, CYCLE = 12, BOOM_SPEED = 32, BOOM_RANGE = 42, MAX_LIGHTS = 2;

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
        // a thin glow over the whole body (it used to be heavy on the body and thin on the head; the thin look is kept everywhere)
        sh.vertexShader = 'uniform float uTime; uniform float uPush; uniform float uI; varying vec3 vFN; varying vec3 vFV; varying vec3 vFW; varying float vHead;\n' + sh.vertexShader
          .replace('#include <skinning_vertex>', `#include <skinning_vertex>
            vHead = 1.0;                                     // the whole body now wears the thin head-style flame the player liked
            float wob = 0.65 + 0.35 * sin(uTime * 9.0 + position.y * 23.0 + position.x * 11.0);
            transformed += normalize(objectNormal) * uPush * uI * wob * (1.0 - 0.8 * vHead);`)
          .replace('#include <project_vertex>', `#include <project_vertex>
            vFN = normalize(normalMatrix * objectNormal); vFV = -mvPosition.xyz; vFW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
        sh.fragmentShader = 'uniform float uTime; uniform float uI; uniform float uA; uniform float uErode; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uHot; varying vec3 vFN; varying vec3 vFV; varying vec3 vFW; varying float vHead;\n' + NOISE + '\n' + sh.fragmentShader
          .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
            float fres = pow(1.0 - abs(dot(normalize(vFN), normalize(vFV))), 1.5);
            vec3 q = vFW * vec3(4.2, 2.2, 4.2) + vec3(0.0, -uTime * 4.2, 0.0);
            float n = fbm3(q) * 0.75 + 0.25 * fbm3(q * 2.7 + 5.0);
            float flame = smoothstep(uErode, uErode + 0.32, n + fres * 0.45);
            vec3 col = mix(uDeep, uMid, flame); col = mix(col, uHot, pow(flame, 4.0) * fres * 0.55);
            vec4 diffuseColor = vec4(col, flame * (0.25 + 0.75 * fres) * uA * uI * (1.0 - 0.72 * vHead));`);
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
          // nothing alive: skip the loop and the buffer upload entirely (after one frame that cleared them)
          let alive = false; for (let i = 0; i < n; i++) if (P[i].life > 0) { alive = true; break; }
          if (!alive && this.idle) return; this.idle = !alive;
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
    const BODY_BONES = ['Hips', 'Spine', 'Chest', 'UpperChest', 'UpperArm.L', 'UpperArm.R', 'Forearm.L', 'Forearm.R', 'Hand.L', 'Hand.R', 'Thigh.L', 'Thigh.R', 'Shin.L', 'Shin.R', 'Foot.L', 'Foot.R']
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
    /* An upright crescent of blue fire (about 4.4 m tip to tip) that flies dead straight along the line the hero faces.
       Cross-section is a chevron: a white-hot leading edge in the middle, both flanks swept back into flame, so it reads
       as a vertical blade from behind and as a crescent moon from the side.  Local frame: +z = travel, +y = up. */
    const ARC = 0.98, BR = 2.6, BW = 0.8, BD = 1.0;
    function crescentGeometry(R = BR, W = BW, D = BD, nu = 64, nv = 12) {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, a = (u - 0.5) * 2 * ARC, taper = Math.pow(Math.sin(Math.PI * u), 0.6);
        for (let j = 0; j <= nv; j++) {
          const v = j / nv, sgn = 2 * v - 1, r = R - D * taper * sgn * sgn * 0.8 - D * 0.2 * Math.abs(sgn);
          pos.push(sgn * W * taper, Math.sin(a) * r, Math.cos(a) * r - R); uv.push(u, v);
        }
      }
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    // the side profile sheet (crescent seen from the side) and a wide soft halo card facing the camera direction of travel
    function profileGeometry(R = BR, D = BD * 1.25, nu = 64, nv = 8) {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, a = (u - 0.5) * 2 * ARC, taper = Math.pow(Math.sin(Math.PI * u), 0.6);
        for (let j = 0; j <= nv; j++) { const v = j / nv, r = R - D * taper * v; pos.push(0, Math.sin(a) * r, Math.cos(a) * r - R); uv.push(u, v); }
      }
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
    }
    const shockGeo = crescentGeometry(BR * 1.06, BW * 0.9, BD * 0.3, 32, 6), blade = crescentGeometry(), wing = crescentGeometry(BR * 1.04, BW * 2.2, BD * 1.8, 48, 10), profile = profileGeometry();
    const haloGeo = new THREE.PlaneGeometry(2.4, 6.4);
    const boomVS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
    function boomMat(kind) {
      const fs = {
        // dark smouldering body: deep navy core eaten into flame toward the swept-back flanks
        core: `float tip = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
               float s = abs(vUv.y * 2.0 - 1.0);
               float n = fbm3(vec3(vUv.x * 9.0, s * 4.0 - uTime * 7.0, uSeed));
               float body = smoothstep(s * 0.95, s * 0.95 + 0.28, n + 0.25) * tip;
               vec3 c = mix(uMid * 0.6, uDeep, smoothstep(0.1, 0.8, s));
               gl_FragColor = vec4(c, body * 0.88 * uFade);`,
        // blazing leading edge (white-hot) + licking tongues, additive
        fire: `float tip = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
               float s = abs(vUv.y * 2.0 - 1.0);
               float n = fbm3(vec3(vUv.x * 12.0 + uSeed, s * 5.0 - uTime * 11.0, uSeed + 3.0));
               float edge = exp(-s * 7.0);
               float tongues = smoothstep(0.5, 0.95, n + 0.42 - s * 0.55);
               float a = (edge * 1.3 + tongues * 1.0) * tip;
               vec3 c = mix(uMid, uHot, clamp(edge * 1.1 + tongues * 0.2, 0.0, 0.85)) * (1.0 + edge * 0.9);
               gl_FragColor = vec4(c * a, a) * uFade;`,
        // the side crescent sheet: thin bright rim, ragged flaming inner edge
        side: `float tip = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
               float n = fbm3(vec3(vUv.x * 10.0, vUv.y * 4.0 - uTime * 8.0, uSeed + 9.0));
               float rim = exp(-vUv.y * 10.0);
               float lick = smoothstep(0.45, 0.9, n + 0.5 - vUv.y * 0.9);
               float a = (rim * 1.3 + lick * 0.7) * tip;
               vec3 c = mix(uMid, uHot, clamp(rim * 1.2, 0.0, 1.0)) * (1.0 + rim);
               gl_FragColor = vec4(c * a, a) * uFade * 0.8;`,
        // soft halo: the light bleeding into the air around the blade
        halo: `vec2 d = (vUv - 0.5) * vec2(2.0, 2.0); float r = length(d * vec2(1.0, 0.85));
               float a = exp(-r * r * 3.2) * 0.42;
               gl_FragColor = vec4(uMid * a, a) * uFade;`,
        // the pressure wave: a faint pale shell in front of the edge (the air being pushed)
        shock: `float tip = sin(3.14159 * vUv.x); float s = abs(vUv.y * 2.0 - 1.0);
                float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
                float a = tip * f * (1.0 - s) * 0.35;
                gl_FragColor = vec4(vec3(0.55, 0.75, 1.0) * a, a) * uFade;`
      }[kind];
      return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        blending: kind === 'core' ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: { uTime: time, uFade: { value: 1 }, uSeed: { value: Math.random() * 50 }, uDeep: { value: C.deep }, uMid: { value: C.mid }, uHot: { value: C.hot } },
        vertexShader: boomVS, fragmentShader: `uniform float uTime; uniform float uFade; uniform float uSeed; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uHot; varying vec2 vUv; varying vec3 vN; varying vec3 vV; ${NOISE}\nvoid main(){ ${fs} }` });
    }
    // lights: borrowed from the game's shared pool when there is one (no extra always-on lights), else a small own set
    const pool = ctx.lightPool, own = pool ? [] : Array.from({ length: MAX_LIGHTS }, () => { const l = new THREE.PointLight(0x3d8cff, 0, 16, 1.6); scene.add(l); return { l, busy: false }; });
    const takeLight = () => {
      if (pool) { const l = pool.take(); if (!l) return null; l.color.set(0x3d8cff); l.distance = 16; l.decay = 1.6; return { l, busy: true, pooled: true }; }
      const s = own.find(x => !x.busy); if (s) s.busy = true; return s; };
    const releaseLight = s => { if (!s) return; s.l.intensity = 0; if (s.pooled) pool.give(s.l); else s.busy = false; };

    /* nearest registered enemy in front (within 45 m and +-40 deg of `fwd`): the boom flies straight at it */
    function aimAt(origin, fwd) {
      let best = null, bestScore = Infinity;
      for (const t of A.Combat.targets) {
        if (!t.position || t.dead) continue;
        const dx = t.position.x - origin.x, dz = t.position.z - origin.z, d = Math.hypot(dx, dz); if (d < 0.5 || d > 45) continue;
        const cos = (dx * fwd.x + dz * fwd.z) / d; if (cos < Math.cos(40 * Math.PI / 180)) continue;
        const score = d * (2 - cos); if (score < bestScore) { bestScore = score; best = t; }
      }
      return best;
    }
    const qInv = new THREE.Quaternion();
    const setBoomQ = (q, dir, roll) => q.setFromEuler(new THREE.Euler(0, Math.atan2(dir.x, dir.z), 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
    function spawnBoom(origin, dir, scale = 1, target = null, roll = 0) {
      const g = new THREE.Group(), mats = [];
      const add = (geo, kind, order, k = 1) => { const m = new THREE.Mesh(geo, boomMat(kind)); m.renderOrder = order; m.frustumCulled = false; m.userData.k = k; mats.push(m.material); g.add(m); return m; };
      const halo = add(haloGeo, 'halo', 5); halo.position.z = -0.6; halo.rotation.y = 0;
      const halo2 = add(haloGeo, 'halo', 5); halo2.rotation.y = Math.PI / 2; halo2.position.z = -0.6;
      add(wing, 'core', 6); add(blade, 'core', 7); add(blade, 'fire', 8); add(wing, 'fire', 8, 0.6); add(profile, 'side', 8);
      const shock = add(shockGeo, 'shock', 9); shock.position.z = 0.25;
      const streak = [0.55, 0.32, 0.16].map((k, i) => { const m = add(blade, 'fire', 6, k); m.material.uniforms.uSeed.value = i * 7.3; return m; });
      setBoomQ(g.quaternion, dir, roll);
      g.position.copy(origin); g.scale.setScalar(0.55 * scale); scene.add(g);
      const b = { g, dir: dir.clone(), age: 0, dist: 0, scale, mats, streak, shock, light: takeLight(), hit: new Set(), dead: false, target, roll, cr: Math.abs(Math.cos(roll)), h: origin.y - world.terrain.heightAt(origin.x, origin.z) };
      S.booms.push(b); S.shake = Math.max(S.shake, 0.22);
      for (let i = 0; i < 40; i++) { const a = (Math.random() - 0.5) * 2 * ARC; v3.set((Math.random() - 0.5) * 0.4, Math.sin(a) * BR * 0.55 * scale, 0).applyQuaternion(g.quaternion).add(origin);
        embers.emit(v3.x, v3.y, v3.z, dir.x * 7 + (Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, dir.z * 7 + (Math.random() - 0.5) * 3, 0.4 + Math.random() * 0.3, 0.28); }
      // the release kicks up a ring of dust at his feet
      for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283; smoke.emit(player.position.x + Math.cos(a) * 0.6, player.position.y + 0.15, player.position.z + Math.sin(a) * 0.6, Math.cos(a) * 2.5, 0.4 + Math.random() * 0.5, Math.sin(a) * 2.5, 0.8 + Math.random() * 0.5, 0.8, 1); }
      ctx.sfx && ctx.sfx('boom', origin, { arg: scale });
      A.Combat.emit({ type: 'sonicBoom', origin: origin.clone(), dir: dir.clone(), target });
      return b;
    }
    function burst(at, strength = 1) {
      for (let i = 0; i < 70 * strength; i++) { const a = Math.random() * 6.283, e = Math.random() * 1.2 - 0.2, s = 4 + Math.random() * 7;
        embers.emit(at.x, at.y, at.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s, 0.35 + Math.random() * 0.45, 0.3 + Math.random() * 0.25); }
      for (let i = 0; i < 16 * strength; i++) smoke.emit(at.x, at.y, at.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 3, 0.9 + Math.random() * 0.6, 0.9, 1);
      rings.push({ at: at.clone(), age: 0, life: 0.45, size: 6 * strength, mesh: makeRing() }); flash(at, 90 * strength, 0.25);
      ctx.sfx && ctx.sfx('impact', at, { vol: Math.min(1, strength) });
      S.shake = Math.max(S.shake, 0.3 * strength);
    }
    // expanding shock rings + light flashes
    const rings = [], flashes = [];
    const ringMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uFade: { value: 1 }, uMid: { value: C.mid }, uHot: { value: C.hot }, uTime: time },
      vertexShader: boomVS, fragmentShader: `uniform float uFade; uniform vec3 uMid; uniform vec3 uHot; uniform float uTime; varying vec2 vUv; ${NOISE}
        void main(){ float r = length(vUv - 0.5) * 2.0; float rd = (r - 0.82) * 9.0; float ring = exp(-rd * rd); float n = fbm3(vec3(vUv * 9.0, uTime * 4.0));
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
      // the boom flies straight along the facing line (or straight at the enemy in front)
      const fwd = new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
      const start = player.position.clone().addScaledVector(fwd, 1.4), target = aimAt(start, fwd);
      let dir = fwd;
      if (target) { dir = v4.set(target.position.x - start.x, 0, target.position.z - start.z).normalize().clone(); player.rotation.y = Math.atan2(dir.x, dir.z); }
      // the combo throws diagonal blades: 1 right, 2 left, 3 right, 4 left, 5 both at once as an X (the last hit bigger)
      const TILT = 0.72, ROLL = { Attack1: TILT, Attack2: -TILT, Attack3: TILT, Attack4: -TILT };
      const isX = d.clip === 'Attack5', scale = isX && d.hit === 1 ? 1.25 : 1;
      const ground = world.terrain.heightAt(start.x, start.z);
      const origin = start.clone(); origin.y = ground + 0.25 + BR * Math.sin(ARC) * scale * 0.55 * (isX || ROLL[d.clip] ? 0.75 : 1);
      if (isX) { spawnBoom(origin, dir, scale, target, TILT); spawnBoom(origin, dir, scale, target, -TILT); }
      else spawnBoom(origin, dir, scale, target, ROLL[d.clip] || 0);
    }

    // ============================================================ per frame
    function update(dt) {
      S.now += dt; time.value += dt;
      if (S.state === 'active' && S.now >= S.activeUntil) { S.state = 'cooldown'; ctl.state.holdSword = false; }
      if (S.state === 'cooldown' && S.now >= S.readyAt) S.state = 'ready';
      if (S.state === 'charging') S.chargeT += dt;
      const target = S.state === 'active' ? 1 : 0; S.fade += (target - S.fade) * Math.min(1, dt * (target ? 6 : 3)); intensity.value = S.fade;
      const on = S.fade > 0.01; for (const m of shells) m.visible = on;
      ctx.sfxLoop && ctx.sfxLoop('fire', S.fade > 0.05, { vol: 0.28 * S.fade }); sleeve.visible = on && grip.scale.y > 0.5;
      if (on && auraBone) { const k = 1 + 0.45 * S.fade; auraBone.scale.x = Math.max(auraBone.scale.x, k); auraBone.scale.y = Math.max(auraBone.scale.y, k); auraBone.scale.z = Math.max(auraBone.scale.z, 1); }   // x edge, y flat, z blade

      // body embers + dark wisps
      if (on) {
        const rate = 260 * S.fade * dt;
        for (let i = 0; i < rate; i++) {
          const b = BODY_BONES[(Math.random() * BODY_BONES.length) | 0]; b.getWorldPosition(v3);
          embers.emit(v3.x + (Math.random() - 0.5) * 0.45, v3.y + (Math.random() - 0.5) * 0.3, v3.z + (Math.random() - 0.5) * 0.45, (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 1.8, (Math.random() - 0.5) * 0.6, 0.45 + Math.random() * 0.5, 0.1 + Math.random() * 0.22);
        }
        for (let i = 0; i < 70 * S.fade * dt; i++) {                     // flame wisps: lighter, to match the thin body flame
          const b = BODY_BONES[(Math.random() * BODY_BONES.length) | 0]; b.getWorldPosition(v3);
          flames.emit(v3.x + (Math.random() - 0.5) * 0.35, v3.y + (Math.random() - 0.5) * 0.25, v3.z + (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.5, 1.6 + Math.random() * 1.3, (Math.random() - 0.5) * 0.5, 0.22 + Math.random() * 0.2, 0.38 + Math.random() * 0.35);
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
        // straight line; with a target it keeps its nose on the enemy (gentle correction, it never curls around)
        if (b.target && !b.target.dead && b.target.position) { v4.set(b.target.position.x - b.g.position.x, 0, b.target.position.z - b.g.position.z);
          if (v4.lengthSq() > 0.5) { v4.normalize(); b.dir.lerp(v4, Math.min(1, dt * 4)).normalize(); setBoomQ(b.g.quaternion, b.dir, b.roll); } }
        const prev = b.g.position.clone(); b.g.position.addScaledVector(b.dir, step);
        const grow = 0.55 + 0.45 * Math.min(1, b.age / 0.22) + 0.15 * Math.min(1, b.dist / BOOM_RANGE); b.g.scale.setScalar(grow * b.scale);
        // ride over the terrain at the same height (bottom tip skims the ground) instead of bursting on every hill
        const gy = world.terrain.heightAt(b.g.position.x, b.g.position.z), half = BR * Math.sin(ARC) * grow * b.scale * (0.35 + 0.65 * b.cr);   // a tilted blade sits lower
        b.g.position.y += ((gy + 0.25 + half) - b.g.position.y) * Math.min(1, dt * 10);
        const fade = Math.min(1, b.age / 0.05) * (1 - Math.max(0, (b.dist - BOOM_RANGE * 0.75) / (BOOM_RANGE * 0.25)));
        for (const m of b.mats) m.uniforms.uFade.value = fade;
        b.streak.forEach((m, i) => { m.position.set(0, 0, -(i + 1) * 0.7 / b.g.scale.x); m.scale.setScalar(1 - (i + 1) * 0.06); m.material.uniforms.uFade.value = fade * m.userData.k; });
        b.shock.scale.setScalar(1 + 0.04 * Math.sin(b.age * 40));
        if (b.light) { b.light.l.position.copy(b.g.position); b.light.l.intensity = 55 * fade; b.light.l.distance = 20; }
        // embers shed from the trailing flanks, a flame wake and dust/scorch along the ground under the lower tip
        const q = b.g.quaternion, sc = grow * b.scale;
        for (let i = 0; i < 90 * dt * 30 / 30 * 1.0; i++) { const a = (Math.random() - 0.5) * 2 * ARC, r = BR * sc, sd = (Math.random() < 0.5 ? -1 : 1) * BW * sc * Math.pow(Math.sin(Math.PI * (a / ARC * 0.5 + 0.5)), 0.6);
          v3.set(sd, Math.sin(a) * r, (Math.cos(a) - 1) * r - BD * sc * 0.6).applyQuaternion(q).add(b.g.position);
          embers.emit(v3.x, v3.y, v3.z, -b.dir.x * 4 + (Math.random() - 0.5) * 1.5, (Math.random() - 0.3) * 1.6, -b.dir.z * 4 + (Math.random() - 0.5) * 1.5, 0.25 + Math.random() * 0.35, 0.14 + Math.random() * 0.14); }
        for (let i = 0; i < 40 * dt; i++) { const a = (Math.random() - 0.5) * 1.6 * ARC; v3.set((Math.random() - 0.5) * BW * sc, Math.sin(a) * BR * sc, (Math.cos(a) - 1) * BR * sc - 0.8).applyQuaternion(q).add(b.g.position);
          flames.emit(v3.x, v3.y, v3.z, -b.dir.x * 6, 0.6 + Math.random(), -b.dir.z * 6, 0.18 + Math.random() * 0.15, 0.7 + Math.random() * 0.5); }
        const lowY = b.g.position.y - half;
        if (lowY - gy < 0.9) for (let i = 0; i < 30 * dt; i++) {
          smoke.emit(b.g.position.x + (Math.random() - 0.5) * 0.8, gy + 0.1, b.g.position.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 2.4 - b.dir.x, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 2.4 - b.dir.z, 0.7 + Math.random() * 0.5, 0.75, 1);
          embers.emit(b.g.position.x + (Math.random() - 0.5) * 0.6, gy + 0.08, b.g.position.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3, 0.3 + Math.random() * 0.3, 0.16, 2); }
        // damage: the blade slices through anything registered in its path (the whole height of the crescent)
        for (const t of A.Combat.targets) {
          if (b.hit.has(t) || !t.position || t.dead) continue;
          v4.copy(t.position).sub(b.g.position).applyQuaternion(qInv.copy(b.g.quaternion).invert());   // boom frame: x across, y along the blade, z travel
          const along = v4.z, side = Math.abs(v4.x), up = v4.y, bladeHalf = BR * Math.sin(ARC) * sc;
          if (Math.abs(along) < 1.2 + (t.radius || 1) * 0.5 && side < BW * sc + (t.radius || 1) && up > -bladeHalf - 1 && up < bladeHalf + 1) {
            b.hit.add(t); try { t.onHit && t.onHit(40, b.dir.clone(), 'sonicBoom'); } catch (e) { console.error(e); } burst(t.position.clone().add(v3.set(0, 1, 0)), 0.8);
            if (t === b.target) { kill(b); break; }
          }
        }
        if (b.dead) continue;
        // walls, buildings, rocks and trees stop it (checked at mid height)
        const p = b.g.position, hit = world.collide && world.collide.resolve(p.x, p.z, 0.5 * sc, gy + 0.3, half * 1.6)[2];
        if (hit || b.dist >= BOOM_RANGE) { if (hit) burst(prev, 0.9); kill(b); }
      }
      S.booms = S.booms.filter(b => !b.dead);
      for (const r of rings) { r.age += dt; const t = r.age / r.life; r.mesh.position.copy(r.at); r.mesh.quaternion.copy(cam.quaternion); r.mesh.scale.setScalar(0.5 + t * r.size); r.mesh.material.uniforms.uFade.value = 1 - t; if (t >= 1) { scene.remove(r.mesh); r.mesh.material.dispose(); r.done = true; } }
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].done) rings.splice(i, 1);
      for (const f of flashes) { f.age += dt; f.s.l.intensity = f.power * Math.max(0, 1 - f.age / f.life); if (f.age >= f.life) { releaseLight(f.s); f.done = true; } }
      for (let i = flashes.length - 1; i >= 0; i--) if (flashes[i].done) flashes.splice(i, 1);
      embers.update(dt, emberColor); smoke.update(dt, smokeColor); flames.update(dt, flameColor);
      S.shake *= Math.exp(-dt * 7);
      hud();
    }
    function kill(b) { b.dead = true; scene.remove(b.g); for (const m of b.mats) m.dispose(); if (b.light) { releaseLight(b.light); b.light = null; } }

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
      for (const b of S.booms) kill(b); embers.dispose(); smoke.dispose(); flames.dispose(); for (const s of own) scene.remove(s.l); for (const f of flashes) releaseLight(f.s); scene.remove(column); icon.remove(); ctl.state.holdSword = false;
    }
    return { activate, update, dispose, state: S, get shake() { return S.shake; }, setAim(fn) { S.aimDir = fn; }, spawnBoom, burst };
  }
  A.createSonicSkill = createSonicSkill;
})();
