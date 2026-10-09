/* Hero warrior: GLB loader (no external loaders needed) + animation/sword-state controller.
   Model: assets/models/hero-NN.js chunks (base64 GLB) pushed into window.AethelosModelParts.hero.
   Built by tools/hero/export_glb.py. 30 fps clips, all in place:
     Idle Walk Run (sword stored) | SwordIdle CombatWalk BattleRun (sword out) | Summon Dismiss |
     Attack1..5 Combo | AttackLow (Down+attack) AttackUp (Up+attack) | Dodge DodgeSword (C, forward roll) |
     Jump JumpStart JumpAir JumpLand
   Sword visibility, blue aura, ghost trail and the pocket-dimension portal are animated joints in the clips. */
(() => {
  const HERO_PARTS = 2, CACHE = 'hero-v8';
  const parts = () => (window.AethelosModelParts ||= {}).hero ||= [];

  function loadHeroBytes() {
    if (loadHeroBytes.p) return loadHeroBytes.p;
    loadHeroBytes.p = (async () => {
      window.AethelosModelParts.hero = [];
      for (let i = 1; i <= HERO_PARTS; i++) await new Promise((ok, fail) => {
        const s = document.createElement('script');
        s.src = `assets/models/hero-${String(i).padStart(2, '0')}.js?v=${CACHE}`;
        s.onload = () => { s.remove(); ok(); };
        s.onerror = () => { s.remove(); fail(new Error('Hero model could not load. Please reload.')); };
        document.head.appendChild(s);
      });
      const b64 = parts().join(''); window.AethelosModelParts.hero = [];
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    })().catch(e => { loadHeroBytes.p = null; throw e; });
    return loadHeroBytes.p;
  }

  /* Sword aura: white-hot core (additive) inside a wide deep-blue glow (normal-blended, so it keeps its contrast on
     bright ground). View-angle falloff gives a soft volumetric edge; energy flows up the blade and flickers slightly. */
  const AURA_KINDS = { aura: 0, ghost: 0, glow: 1, ghostglow: 1 };
  const AURA_VS = `varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
      vY = -position.z; gl_Position = projectionMatrix * mv; }`;
  const AURA_FS = `uniform vec3 uCore; uniform vec3 uEdge; uniform vec3 uDeep; uniform float uOpacity; uniform float uTime; uniform vec2 uBlade; uniform float uKind;
    varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){
      float f = abs(dot(normalize(vN), normalize(vV)));
      float t = clamp((vY - uBlade.x) / max(uBlade.y - uBlade.x, 1e-3), 0.0, 1.3);
      float flow = 0.70 + 0.30 * sin(vY * 31.0 - uTime * 15.0) * sin(vY * 12.0 + uTime * 6.5 + f * 2.5);
      float flick = 0.90 + 0.10 * sin(uTime * 47.0) * sin(uTime * 29.0 + 1.3);
      vec3 col; float a;
      if (uKind < 0.5) { col = mix(uEdge, uCore, pow(f, 2.2)); a = (0.30 + 0.70 * pow(f, 1.4)) * (0.85 + 0.15 * flow); }
      else { col = mix(uDeep, uEdge, pow(f, 2.5)); a = pow(f, 1.7) * flow * smoothstep(1.10, 0.90, t) * smoothstep(-0.02, 0.06, t); }
      gl_FragColor = vec4(col, clamp(a * uOpacity * flick, 0.0, 1.0));
    }`;
  function auraMaterial(THREE, kind) {
    const glow = AURA_KINDS[kind] === 1;
    return new THREE.ShaderMaterial({ vertexShader: AURA_VS, fragmentShader: AURA_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: glow ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uCore: { value: new THREE.Color(0.92, 0.98, 1.0) }, uEdge: { value: new THREE.Color(0.22, 0.62, 1.0) },
        uDeep: { value: new THREE.Color(0.02, 0.18, 0.85) }, uOpacity: { value: glow ? 0.8 : 0.9 }, uTime: { value: 0 },
        uBlade: { value: new THREE.Vector2(0.17, 1.13) }, uKind: { value: glow ? 1 : 0 } } });
  }

  function createHeroAsset(THREE, bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset), jl = dv.getUint32(12, true);
    const g = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jl))), start = bytes.byteOffset + 28 + jl;
    const W = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 },
      CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5122: Int16Array, 5121: Uint8Array, 5120: Int8Array };
    // plain typed view of an accessor (tightly packed) — with sparse overrides applied (KHR_mesh_quantization-ready)
    const acc = i => { const a = g.accessors[i], T = CT[a.componentType], w = W[a.type];
      let out;
      if (a.bufferView === undefined) out = new T(a.count * w);
      else { const v = g.bufferViews[a.bufferView], o = start + (v.byteOffset || 0) + (a.byteOffset || 0), st = v.byteStride || 0;
        if (!st || st === T.BYTES_PER_ELEMENT * w) out = new T(bytes.buffer, o, a.count * w);
        else { const src = new T(bytes.buffer, o, (a.count - 1) * st / T.BYTES_PER_ELEMENT + w), k = st / T.BYTES_PER_ELEMENT; out = new T(a.count * w);
          for (let n = 0; n < a.count; n++) for (let c = 0; c < w; c++) out[n * w + c] = src[n * k + c]; } }
      if (a.sparse) { const sp = a.sparse, iv = g.bufferViews[sp.indices.bufferView], vv = g.bufferViews[sp.values.bufferView];
        const idx = new CT[sp.indices.componentType](bytes.buffer, start + (iv.byteOffset || 0) + (sp.indices.byteOffset || 0), sp.count);
        const val = new T(bytes.buffer, start + (vv.byteOffset || 0) + (sp.values.byteOffset || 0), sp.count * w);
        if (a.bufferView !== undefined) out = out.slice();
        for (let n = 0; n < sp.count; n++) for (let c = 0; c < w; c++) out[idx[n] * w + c] = val[n * w + c]; }
      return out; };
    const attr = (i, size) => new THREE.BufferAttribute(acc(i), size, !!g.accessors[i].normalized);
    const skin = g.skins[0], J = skin.joints.length;
    const bones = skin.joints.map(i => { const b = new THREE.Bone(); b.name = g.nodes[i].name; b.position.fromArray(g.nodes[i].translation || [0, 0, 0]); return b; });
    const parent = {};
    g.nodes.forEach((n, i) => (n.children || []).forEach(c => parent[c] = i));
    for (let i = 0; i < J; i++) if (parent[i] !== undefined) bones[parent[i]].add(bones[i]);
    const root = new THREE.Group(); root.name = 'HeroRoot'; root.add(bones[0]);
    const ib = acc(skin.inverseBindMatrices);
    const skeleton = new THREE.Skeleton(bones, bones.map((_, i) => new THREE.Matrix4().fromArray(ib, i * 16)));
    const textures = [], texReady = [];
    (g.textures || []).forEach((t, k) => {
      const img = g.images[t.source], view = g.bufferViews[img.bufferView];
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes.buffer, start + view.byteOffset, view.byteLength)], { type: img.mimeType }));
      const tex = new THREE.Texture(); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; textures[k] = tex;
      texReady.push(new Promise((ok, fail) => { const im = new Image(); im.onload = () => { tex.image = im; tex.needsUpdate = true; URL.revokeObjectURL(url); ok(); };
        im.onerror = e => { URL.revokeObjectURL(url); fail(e); }; im.src = url; }));
    });
    const materials = g.materials.map(m => {
      const pbr = m.pbrMetallicRoughness || {}, fx = m.extras?.fx;
      if (AURA_KINDS[fx] !== undefined) return auraMaterial(THREE, fx);
      if (fx) {
        const c = pbr.baseColorFactor || [1, 1, 1, 1], core = fx === 'Portal_Core';
        return new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), transparent: true, opacity: c[3], side: THREE.DoubleSide,
          depthWrite: false, blending: core ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false });
      }
      return new THREE.MeshStandardMaterial({ map: pbr.baseColorTexture ? textures[pbr.baseColorTexture.index] : null,
        metalness: pbr.metallicFactor ?? 0, roughness: pbr.roughnessFactor ?? .8, side: THREE.DoubleSide });
    });
    const geom = prim => { const geo = new THREE.BufferGeometry(), a = prim.attributes;
      for (const [n, k, s] of [['position', 'POSITION', 3], ['normal', 'NORMAL', 3], ['uv', 'TEXCOORD_0', 2], ['skinIndex', 'JOINTS_0', 4], ['skinWeight', 'WEIGHTS_0', 4]])
        if (a[k] !== undefined) geo.setAttribute(n, attr(a[k], s));
      geo.setIndex(new THREE.BufferAttribute(acc(prim.indices), 1));
      if (prim.targets) { geo.morphAttributes.position = prim.targets.map(t => attr(t.POSITION, 3)); geo.morphTargetsRelative = true; }
      if (!a.NORMAL) geo.computeVertexNormals();
      return geo; };
    let body = null; const fxMeshes = {}, byName = {};
    bones.forEach(b => byName[b.name] = b);
    g.nodes.forEach((n, i) => {
      if (i < J || n.mesh === undefined) return;
      const mdef = g.meshes[n.mesh], prim = mdef.primitives[0], mat = materials[prim.material];
      if (n.skin !== undefined) {
        body = new THREE.SkinnedMesh(geom(prim), mat); body.name = n.name;
        body.morphTargetInfluences = (mdef.weights || []).slice();
        body.bind(skeleton, new THREE.Matrix4()); body.frustumCulled = false; body.castShadow = true; root.add(body);
      } else {
        let m = mat;
        if (n.extras?.opacity !== undefined) { m = mat.clone();
          if (m.uniforms) { m.uniforms.uOpacity.value = n.extras.opacity; if (n.extras.blade) m.uniforms.uBlade.value.fromArray(n.extras.blade); }
          else m.opacity = n.extras.opacity; }
        const mesh = new THREE.Mesh(geom(prim), m); mesh.name = n.name; mesh.frustumCulled = false;
        if (n.name === 'HeroSword') mesh.castShadow = true; else mesh.renderOrder = m.uniforms ? (m.uniforms.uKind.value > .5 ? 2 : 3) : 2;
        if (m.uniforms) mesh.onBeforeRender = () => { m.uniforms.uTime.value = performance.now() / 1000; };
        bones[parent[i]].add(mesh); fxMeshes[n.name] = mesh;
      }
    });
    // ---- clips (+ upper/lower body masks for layering)
    const upper = new Set();
    const markUpper = b => { upper.add(b.name); b.children.forEach(c => c.isBone && markUpper(c)); };
    markUpper(byName[g.extras.upperFrom || 'Spine']);
    ['Sword_Aura', 'Sword_Ghost1', 'Sword_Ghost2', 'Sword_Ghost3', 'Sword_Ghost4', 'Sword_Portal'].forEach(n => upper.add(n));
    const clips = {};
    for (const a of g.animations) {
      const tracks = { all: [], upper: [], lower: [] };
      for (const c of a.channels) {
        const s = a.samplers[c.sampler], times = acc(s.input), vals = acc(s.output), node = g.nodes[c.target.node], p = c.target.path;
        let tr;
        if (p === 'rotation') tr = new THREE.QuaternionKeyframeTrack(node.name + '.quaternion', times, vals);
        else if (p === 'translation') tr = new THREE.VectorKeyframeTrack(node.name + '.position', times, vals);
        else if (p === 'scale') tr = new THREE.VectorKeyframeTrack(node.name + '.scale', times, vals);
        else if (p === 'weights') tr = new THREE.NumberKeyframeTrack(node.name + '.morphTargetInfluences', times, vals);
        if (!tr) continue;
        tracks.all.push(tr);
        (p === 'weights' || upper.has(node.name) ? tracks.upper : tracks.lower).push(tr);
      }
      const dur = (g.extras.clips[a.name].frames - 1) / g.extras.fps;
      clips[a.name] = { duration: dur, loop: g.extras.clips[a.name].loop,
        upper: new THREE.AnimationClip(a.name + '_upper', dur, tracks.upper), lower: new THREE.AnimationClip(a.name + '_lower', dur, tracks.lower) };
    }
    // blue light carried by the blade: lights the warrior and the ground while the aura is up (strength = aura amount)
    const auraBone = byName.Sword_Aura, glowMesh = fxMeshes.SwordAuraGlow;
    if (auraBone && glowMesh) {
      const light = new THREE.PointLight(0x3d9bff, 0, 5.5, 1.6); light.position.set(0, 0, -0.65); glowMesh.add(light); fxMeshes.AuraLight = light;
      const prev = glowMesh.onBeforeRender;
      glowMesh.onBeforeRender = (...args) => { prev(...args); const a = Math.max(0, Math.min(1, auraBone.scale.x)), v = byName.Sword_Grip.scale.y;
        light.intensity = a > .02 && v > .5 ? 7 * a : 0; };
    }
    return { root, bones, byName, body, skeleton, clips, fxMeshes, extras: g.extras, textureReady: Promise.all(texReady) };
  }

  /* -------- state machine: sword stored / summoned / out, attacks (combo + Up/Down directional), dodge roll,
     5 s auto-dismiss, layered blending (upper body can summon/dismiss while the legs keep walking/running) -------- */
  function createHeroController(THREE, rig) {
    const mixer = new THREE.AnimationMixer(rig.root), X = rig.extras, L = { upper: null, lower: null }, cur = { upper: '', lower: '' };
    const actions = {};
    const act = (name, layer) => { const k = name + '|' + layer;
      if (!actions[k]) { const a = mixer.clipAction(rig.clips[name][layer]); actions[k] = a; }
      return actions[k]; };
    function play(layer, name, { fade = .18, once = false, timeScale = 1, restart = false } = {}) {
      if (!rig.clips[name]) return null;
      const a = act(name, layer);
      if (cur[layer] === name && !restart) { a.timeScale = timeScale; return a; }
      const prev = L[layer];
      a.reset(); a.timeScale = timeScale; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
      a.setEffectiveWeight(1); a.play();
      if (prev && prev !== a) prev.crossFadeTo(a, fade, false); else a.fadeIn(fade);
      L[layer] = a; cur[layer] = name; return a;
    }
    const playFull = (name, o) => { play('lower', name, o); return play('upper', name, o); };
    /* switch both layers at once with no blend (used when the rig is re-parented: horse saddle <-> ground) */
    function hardPlay(name, { once = false, timeScale = 1 } = {}) {
      if (!rig.clips[name]) return null;
      for (const layer of ['lower', 'upper']) {
        for (const k in actions) if (k.endsWith('|' + layer)) actions[k].stop();          // also finished (clamped) and paused ones
        const a = act(name, layer); a.reset(); a.timeScale = timeScale; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
        a.setEffectiveWeight(1); a.play(); L[layer] = a; cur[layer] = name;
      }
      mixer.update(0); return L.upper;
    }
    const RIDE_CLIP = { idle: 'RideIdle', walk: 'RideWalk', gallop: 'RideGallop' }, RIDING = new Set(['mount', 'ride', 'dismount']);
    const S = { swordOut: false, mode: 'free', modeAction: null, modeUpperOnly: false, timer: 0, combo: -1, queued: 0, queuedDir: null,
      lastAttackEnd: -9, now: 0, airborne: false, wasAirborne: false, landing: 0, pendingAttack: false, pendingDir: null,
      attackKind: '', attackStart: -9, dodgeT: 0, dodgeClip: '', hitIdx: 0, attackClip: '', pendingPower: false, burstFired: false, holdSword: false,
      onDone: null, rideKind: '', stowReq: false };
    const listeners = [], emit = (type, data = {}) => { for (const f of listeners) try { f(type, data); } catch (e) { console.error(e); } };
    const SWORD_TIMEOUT = 5, COMBO_GAP = 1.0, ATTACK_SPEED = 1.5, SUMMON_SPEED = 1.9, DISMISS_SPEED = 1.6, DIR_WINDOW = .16, DODGE_SPEED = 1.0;
    const DIR_CLIP = { up: 'AttackUp', down: 'AttackLow' };
    const curve = (X.dodge && X.dodge.curve) || [0];
    function startAttack(i) {
      S.mode = 'attack'; S.combo = i; S.timer = SWORD_TIMEOUT; S.attackKind = 'combo'; S.attackStart = S.now;
      S.modeAction = playFull('Attack' + (i + 1), { once: true, timeScale: ATTACK_SPEED, fade: i === 0 ? .12 : .06, restart: true });
      S.modeUpperOnly = false; S.hitIdx = 0; S.attackClip = 'Attack' + (i + 1); emit('attackStart', { kind: 'combo', index: i, clip: S.attackClip });
    }
    function startDirAttack(dir) {
      S.mode = 'attack'; S.combo = -1; S.queued = 0; S.queuedDir = null; S.timer = SWORD_TIMEOUT; S.attackKind = dir; S.attackStart = S.now;
      S.modeAction = playFull(DIR_CLIP[dir], { once: true, timeScale: ATTACK_SPEED, fade: .1, restart: true });
      S.modeUpperOnly = false; S.hitIdx = 0; S.attackClip = DIR_CLIP[dir]; emit('attackStart', { kind: dir, index: -1, clip: S.attackClip });
    }
    /* V skill: the power-up pose (summons the sword first if it is stored). 'powerBurst' fires at the pose's burst frame. */
    function startPower() {
      S.mode = 'power'; S.queued = 0; S.queuedDir = null; S.combo = -1; S.timer = SWORD_TIMEOUT; S.modeUpperOnly = false; S.burstFired = false; S.pendingPower = false;
      S.modeAction = playFull('PowerUp', { once: true, timeScale: 1, fade: .14, restart: true }); emit('powerStart');
    }
    function power() {
      if (RIDING.has(S.mode)) return false;
      if (S.mode === 'idlefun') cancelIdleFun();
      if (!rig.clips.PowerUp || S.airborne || S.mode === 'dodge' || S.mode === 'power' || S.mode === 'attack') return false;
      S.pendingAttack = false; S.pendingDir = null;
      if (S.mode === 'summon' && !S.modeUpperOnly) { S.pendingPower = true; return true; }
      if (!S.swordOut || S.mode === 'dismiss' || S.mode === 'summon') {
        S.mode = 'summon'; S.pendingPower = true; S.modeUpperOnly = false;
        S.modeAction = playFull('Summon', { once: true, timeScale: SUMMON_SPEED, restart: true }); return true;
      }
      startPower(); return true;
    }
    /* attack(dir): dir = 'up' | 'down' | undefined.  Up+attack = rising vertical stab, Down+attack = low horizontal slash. */
    function attack(dir) {
      if (RIDING.has(S.mode)) return;
      if (S.mode === 'idlefun') cancelIdleFun();
      S.timer = SWORD_TIMEOUT; S.stowReq = false;
      if (S.mode === 'dodge') return;
      if (S.mode === 'power') {                                     // after the burst an attack cuts the settle-back short; earlier it is queued
        const burstT = (X.power && X.power.burst) || .67;
        if (S.burstFired && S.modeAction && S.modeAction.time > burstT + .12) { emit('powerEnd'); S.mode = 'free'; startAttack(0); }
        else S.pendingAttack = true;
        return;
      }
      if (S.mode === 'summon') { S.pendingAttack = true; S.pendingDir = dir || S.pendingDir; return; }
      if (S.mode === 'dismiss' || !S.swordOut) {
        S.mode = 'summon'; S.pendingAttack = true; S.pendingDir = dir || null; S.modeUpperOnly = S.moving || S.airborne;
        S.modeAction = S.modeUpperOnly ? play('upper', 'Summon', { once: true, timeScale: SUMMON_SPEED, restart: true })
                                       : playFull('Summon', { once: true, timeScale: SUMMON_SPEED, restart: true });
        return;
      }
      if (S.mode === 'attack') {
        if (dir) S.queuedDir = dir; else if (!S.queuedDir && S.combo >= 0 && S.combo + S.queued < 4) S.queued++;
        return;
      }
      if (dir) { startDirAttack(dir); return; }
      const next = (S.now - S.lastAttackEnd < COMBO_GAP && S.combo >= 0 && S.combo < 4) ? S.combo + 1 : 0;
      startAttack(next);
    }
    /* direction pressed just after attack ("attack then up"): upgrade the attack that just started */
    function direction(dir) {
      if (S.mode === 'summon' && S.pendingAttack && !S.pendingDir) { S.pendingDir = dir; return; }
      if (S.mode === 'attack' && S.attackKind === 'combo' && S.now - S.attackStart < DIR_WINDOW) startDirAttack(dir);
    }
    function dodge() {
      if (RIDING.has(S.mode)) return false;
      if (S.mode === 'idlefun') cancelIdleFun();
      if (S.airborne || S.mode === 'dodge' || S.mode === 'power' || S.mode === 'summon' && !S.modeUpperOnly || S.mode === 'dismiss' && !S.modeUpperOnly) return false;
      if (S.mode === 'summon' || S.mode === 'dismiss') { S.swordOut = S.mode === 'summon' ? S.swordOut : false; }
      S.pendingAttack = false; S.pendingDir = null; S.queued = 0; S.queuedDir = null; if (S.mode === 'attack') { S.combo = -1; S.lastAttackEnd = S.now; }
      S.mode = 'dodge'; S.modeUpperOnly = false; S.dodgeT = 0; S.dodgeClip = S.swordOut ? 'DodgeSword' : 'Dodge';
      S.modeAction = playFull(S.dodgeClip, { once: true, timeScale: DODGE_SPEED, fade: .08, restart: true });
      return true;
    }
    /* ---- horse: Mount (left stirrup -> swing over -> seated), Ride* (synced to the horse's gait), Dismount */
    function mount(cb) {
      if (!rig.clips.Mount || S.swordOut || (S.mode !== 'free' && S.mode !== 'idlefun')) return false;
      if (S.mode === 'idlefun') emit('idleFunEnd');
      S.mode = 'mount'; S.modeUpperOnly = false; S.onDone = cb; S.rideKind = ''; S.pendingAttack = false; S.queued = 0;
      S.modeAction = hardPlay('Mount', { once: true }); emit('mountStart'); return true;
    }
    function dismount(cb) {
      if (S.mode !== 'ride' && S.mode !== 'mount') return false;
      S.mode = 'dismount'; S.onDone = cb; S.rideKind = '';
      S.modeAction = playFull('Dismount', { once: true, fade: .25, restart: true }); emit('dismountStart'); return true;
    }
    /* kind: 'idle' | 'walk' | 'gallop'; horseAction = the horse's current gait action (the rider's clip is phase-locked to it) */
    function ride(kind, horseAction) {
      if (S.mode !== 'ride') return;
      const name = RIDE_CLIP[kind]; if (!rig.clips[name]) return;
      const sync = kind !== 'idle' && horseAction;
      playFull(name, { fade: S.rideKind ? .3 : .35, timeScale: sync ? 0 : 1 });
      if (sync) {
        const hd = horseAction.getClip().duration, f = ((horseAction.time % hd) + hd) % hd / hd, d = rig.clips[name].duration;
        const t = (kind === 'gallop' ? f * 0.5 : f) * d;                // RideGallop holds two strides
        act(name, 'upper').time = t; act(name, 'lower').time = t;
      }
      S.rideKind = kind;
    }
    /* put the sword away now (before walking to the horse) */
    function stow() { if (S.swordOut) S.stowReq = true; }
    /* 30 s of nothing: a ball drops out of a pocket portal and he plays keepy-uppy */
    function idleFun() {
      if (!rig.clips.IdleBall || S.mode !== 'free' || S.swordOut || S.airborne || S.moving) return false;
      S.mode = 'idlefun'; S.modeUpperOnly = false; S.modeAction = playFull('IdleBall', { once: true, fade: .35, restart: true }); emit('idleFunStart'); return true;
    }
    function cancelIdleFun() { if (S.mode !== 'idlefun') return; S.mode = 'free'; S.modeAction = null; emit('idleFunEnd'); }
    /* current dodge travel speed (m/s) from the roll's ground-contact curve, so the planted feet never slide */
    function dodgeSpeed() {
      if (S.mode !== 'dodge' || !S.modeAction) return 0;
      const f = S.modeAction.time * (X.fps || 30), i = Math.min(curve.length - 2, Math.max(0, Math.floor(f)));
      return curve.length > 1 ? (curve[i + 1] - curve[i]) * (X.fps || 30) * DODGE_SPEED : 0;
    }
    function locomotion(speed, running) {
      const out = S.swordOut, sp = X.speeds;
      let name, ts = 1;
      if (S.airborne) name = 'JumpAir';
      else if (S.landing > 0 && !S.moving) name = 'JumpLand';
      else if (S.moving) {
        if (running) { name = out ? 'BattleRun' : 'Run'; ts = speed / sp[name]; }
        else { name = out ? 'CombatWalk' : 'Walk'; ts = speed / sp[name]; }
        ts = Math.min(1.6, Math.max(.7, ts));
      } else name = out ? 'SwordIdle' : 'Idle';
      const once = name === 'JumpLand';
      play('lower', name, { timeScale: once ? 1.3 : ts, once, fade: S.airborne ? .1 : .22 });
      if (!(S.mode !== 'free' && S.modeUpperOnly)) {
        const up = (out && (name === 'JumpAir' || name === 'JumpLand')) ? 'SwordIdle' : name;
        play('upper', up, { timeScale: up === name ? (once ? 1.3 : ts) : 1, once: once && up === name, fade: .22 });
      }
    }
    function update(dt, { moving, running, airborne, speed }) {
      S.now += dt; S.moving = moving;
      if (S.wasAirborne && !airborne) S.landing = .45; S.wasAirborne = airborne; S.airborne = airborne;
      S.landing = Math.max(0, S.landing - dt);
      if (S.mode !== 'free' && S.modeAction) {
        const a = S.modeAction, done = a.time >= a.getClip().duration - 1e-3 || !a.isRunning();
        if (S.mode === 'summon') {
          if (done) { S.swordOut = true; S.mode = 'free';
            if (S.pendingPower) startPower();
            else if (S.pendingAttack) { S.pendingAttack = false; const d = S.pendingDir; S.pendingDir = null; d ? startDirAttack(d) : startAttack(0); } }
        } else if (S.mode === 'attack') {
          const hits = (X.hits && X.hits[S.attackClip]) || [];
          while (S.hitIdx < hits.length && (a.time >= hits[S.hitIdx] || done)) emit('hit', { clip: S.attackClip, kind: S.attackKind, index: S.combo, hit: S.hitIdx++, of: hits.length });
          if (done) {
            if (S.queuedDir) { const d = S.queuedDir; S.queuedDir = null; startDirAttack(d); }
            else if (S.queued > 0 && S.combo >= 0) { S.queued--; startAttack(S.combo + 1); }
            else { S.mode = 'free'; S.lastAttackEnd = S.now; if (S.combo >= 4 || S.attackKind !== 'combo') S.combo = -1; S.queued = 0; }
          }
        } else if (S.mode === 'dismiss') {
          if (done) { S.swordOut = false; S.mode = 'free'; S.stowReq = false; }
        } else if (S.mode === 'dodge') {
          if (done) { S.mode = 'free'; }
        } else if (S.mode === 'mount') {
          if (done) { S.mode = 'ride'; const f = S.onDone; S.onDone = null; f && f(); }
        } else if (S.mode === 'dismount') {
          if (done) { S.mode = 'free'; const f = S.onDone; S.onDone = null; hardPlay('Idle'); f && f(); emit('dismountEnd'); }
        } else if (S.mode === 'idlefun') {
          if (done) { S.mode = 'free'; emit('idleFunEnd'); }
        } else if (S.mode === 'power') {
          if (!S.burstFired && a.time >= ((X.power && X.power.burst) || .67)) { S.burstFired = true; emit('powerBurst'); }
          if (done) { S.mode = 'free'; S.timer = SWORD_TIMEOUT; emit('powerEnd'); if (S.pendingAttack) { S.pendingAttack = false; startAttack(0); } }
        }
      }
      if (S.mode === 'free' && S.swordOut) {
        S.timer = S.holdSword ? SWORD_TIMEOUT : S.stowReq ? 0 : S.timer - dt;     // an active skill keeps the sword out
        if (S.timer <= 0) {
          S.mode = 'dismiss'; S.modeUpperOnly = moving || airborne;
          S.modeAction = S.modeUpperOnly ? play('upper', 'Dismiss', { once: true, timeScale: DISMISS_SPEED, restart: true })
                                         : playFull('Dismiss', { once: true, timeScale: DISMISS_SPEED, restart: true });
        }
      }
      if (S.mode === 'free' || S.modeUpperOnly) locomotion(speed, running);
      mixer.update(dt);
    }
    const speedFor = (moving, running) => !moving ? 0 : running ? X.speeds.Run : (S.swordOut ? 1.25 : 1.7);
    playFull('Idle', { fade: 0 });
    return { mixer, update, attack, direction, dodge, dodgeSpeed, speedFor, power, mount, dismount, ride, stow, idleFun, cancelIdleFun, state: S,
             get riding() { return RIDING.has(S.mode); }, get idleFunTime() { return S.mode === 'idlefun' && S.modeAction ? S.modeAction.time : -1; }, on: fn => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
             get attacking() { return S.mode === 'attack'; }, get dodging() { return S.mode === 'dodge'; },
             get powering() { return S.mode === 'power' || (S.mode === 'summon' && S.pendingPower); },
             get busy() { return S.mode === 'attack' || S.mode === 'dodge' || S.mode === 'power' || (S.mode !== 'free' && S.mode !== 'idlefun' && !S.modeUpperOnly); } };
  }

  async function loadHero(THREE) {
    const rig = createHeroAsset(THREE, await loadHeroBytes());
    await rig.textureReady;
    if (!/^HERO_V[46]$/.test(rig.extras?.revision || '')) throw new Error('Unexpected hero model revision');
    rig.controller = createHeroController(THREE, rig);
    return rig;
  }
  window.HeroRig = Object.freeze({ loadHero, createHeroAsset, createHeroController, loadHeroBytes, HERO_PARTS });
})();
