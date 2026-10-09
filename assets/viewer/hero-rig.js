/* Hero warrior: GLB loader (no external loaders needed) + animation/sword-state controller.
   Model: assets/models/hero-NN.js chunks (base64 GLB) pushed into window.AethelosModelParts.hero.
   Built by tools/hero/export_glb.py. 30 fps clips, all in place:
     Idle Walk Run (sword stored) | SwordIdle CombatWalk BattleRun (sword out) | Summon Dismiss |
     Attack1..5 Combo | Jump JumpStart JumpAir JumpLand
   Sword visibility, blue aura, ghost trail and the pocket-dimension portal are animated joints in the clips. */
(() => {
  const HERO_PARTS = 8, CACHE = 'hero-v3-1';
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

  function createHeroAsset(THREE, bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset), jl = dv.getUint32(12, true);
    const g = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jl))), start = bytes.byteOffset + 28 + jl;
    const W = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array };
    const acc = i => { const a = g.accessors[i], v = g.bufferViews[a.bufferView];
      return new CT[a.componentType](bytes.buffer, start + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * W[a.type]); };
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
      const tex = new THREE.Texture(); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; textures[k] = tex;
      texReady.push(new Promise((ok, fail) => { const im = new Image(); im.onload = () => { tex.image = im; tex.needsUpdate = true; URL.revokeObjectURL(url); ok(); };
        im.onerror = e => { URL.revokeObjectURL(url); fail(e); }; im.src = url; }));
    });
    const materials = g.materials.map(m => {
      const pbr = m.pbrMetallicRoughness || {}, fx = m.extras?.fx;
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
        if (a[k] !== undefined) geo.setAttribute(n, new THREE.BufferAttribute(acc(a[k]), s));
      geo.setIndex(new THREE.BufferAttribute(acc(prim.indices), 1));
      if (prim.targets) { geo.morphAttributes.position = prim.targets.map(t => new THREE.BufferAttribute(acc(t.POSITION), 3)); geo.morphTargetsRelative = true; }
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
        if (n.extras?.opacity !== undefined) { m = mat.clone(); m.opacity = n.extras.opacity; }
        const mesh = new THREE.Mesh(geom(prim), m); mesh.name = n.name; mesh.frustumCulled = false;
        if (n.name === 'HeroSword') mesh.castShadow = true; else mesh.renderOrder = 2;
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
    const tip = new THREE.Object3D(); tip.position.set(0, 0, 0); byName.Sword_Grip.add(tip);
    return { root, bones, byName, body, skeleton, clips, fxMeshes, extras: g.extras, textureReady: Promise.all(texReady) };
  }

  /* -------- state machine: sword stored / summoned / out, attacks, 5 s auto-dismiss, layered blending -------- */
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
    const S = { swordOut: false, mode: 'free', modeAction: null, modeUpperOnly: false, timer: 0, combo: -1, queued: 0,
      lastAttackEnd: -9, now: 0, airborne: false, wasAirborne: false, landing: 0, pendingAttack: false };
    const SWORD_TIMEOUT = 5, COMBO_GAP = 1.0, ATTACK_SPEED = 1.15, SUMMON_SPEED = 1.9, DISMISS_SPEED = 1.6;
    function startAttack(i) {
      S.mode = 'attack'; S.combo = i; S.timer = SWORD_TIMEOUT;
      S.modeAction = playFull('Attack' + (i + 1), { once: true, timeScale: ATTACK_SPEED, fade: i === 0 ? .12 : .06, restart: true });
      S.modeUpperOnly = false;
    }
    function attack() {
      S.timer = SWORD_TIMEOUT;
      if (S.mode === 'summon') { S.pendingAttack = true; return; }
      if (S.mode === 'dismiss' || !S.swordOut) {
        S.mode = 'summon'; S.pendingAttack = true; S.modeUpperOnly = S.moving || S.airborne;
        S.modeAction = S.modeUpperOnly ? play('upper', 'Summon', { once: true, timeScale: SUMMON_SPEED, restart: true })
                                       : playFull('Summon', { once: true, timeScale: SUMMON_SPEED, restart: true });
        return;
      }
      if (S.mode === 'attack') { if (S.combo + S.queued < 4) S.queued++; return; }
      const next = (S.now - S.lastAttackEnd < COMBO_GAP && S.combo >= 0 && S.combo < 4) ? S.combo + 1 : 0;
      startAttack(next);
    }
    function locomotion(speed, running) {
      const out = S.swordOut, sp = X.speeds;
      let name, ts = 1;
      if (S.airborne) name = 'JumpAir';
      else if (S.landing > 0 && !S.moving) name = 'JumpLand';
      else if (S.moving) {
        if (running) { name = out ? 'BattleRun' : 'Run'; ts = speed / sp[name]; }
        else { name = out ? 'CombatWalk' : 'Walk'; ts = speed / sp[name]; }
        ts = Math.min(1.9, Math.max(.7, ts));
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
          if (done) { S.swordOut = true; S.mode = 'free'; if (S.pendingAttack) { S.pendingAttack = false; startAttack(0); } }
        } else if (S.mode === 'attack') {
          if (done) {
            if (S.queued > 0) { S.queued--; startAttack(S.combo + 1); }
            else { S.mode = 'free'; S.lastAttackEnd = S.now; if (S.combo >= 4) S.combo = -1; }
          }
        } else if (S.mode === 'dismiss') {
          if (done) { S.swordOut = false; S.mode = 'free'; }
        }
      }
      if (S.mode === 'free' && S.swordOut) {
        S.timer -= dt;
        if (S.timer <= 0) {
          S.mode = 'dismiss'; S.modeUpperOnly = moving || airborne;
          S.modeAction = S.modeUpperOnly ? play('upper', 'Dismiss', { once: true, timeScale: DISMISS_SPEED, restart: true })
                                         : playFull('Dismiss', { once: true, timeScale: DISMISS_SPEED, restart: true });
        }
      }
      if (S.mode === 'free' || S.modeUpperOnly) locomotion(speed, running);
      mixer.update(dt);
    }
    const speedFor = (moving, running) => !moving ? 0 : running ? (S.swordOut ? 5.0 : 5.4) : (S.swordOut ? 1.25 : 1.7);
    playFull('Idle', { fade: 0 });
    return { mixer, update, attack, speedFor, state: S, get attacking() { return S.mode === 'attack'; },
             get busy() { return S.mode === 'attack' || (S.mode !== 'free' && !S.modeUpperOnly); } };
  }

  async function loadHero(THREE) {
    const rig = createHeroAsset(THREE, await loadHeroBytes());
    await rig.textureReady;
    if (rig.extras?.revision !== 'HERO_V3_SWORD') throw new Error('Unexpected hero model revision');
    rig.controller = createHeroController(THREE, rig);
    return rig;
  }
  window.HeroRig = Object.freeze({ loadHero, createHeroAsset, createHeroController, loadHeroBytes, HERO_PARTS });
})();
