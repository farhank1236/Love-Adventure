/* The Male Warrior's armored war horse.
   Model: assets/models/horse-NN.js (base64 GLB chunks, built by tools/horse/export_horse.py): the user's horse mesh at
   full resolution, rigged (spine, neck, head, tail, four legs with shoulder blades), a fitted war saddle with stirrups,
   and the clips Idle, Walk (1.8 m/s), Gallop (15 m/s = 3x the hero's run) and Rear.
   Controls (wired in world.js):  H x3 within 3 s  -> a blue portal tears open ahead and the horse gallops out of it.
                                  H              -> walk to the horse and mount (left side, foot in the stirrup),
                                                    or dismount while riding (slows down first).
   Riding: arrow keys steer (camera-relative), X / Shift gallops, otherwise it walks. */
(() => {
  const A = window.Aethelos ||= {};
  const PARTS = 1, CACHE = 'horse-v2';
  function loadHorseBytes() {
    if (loadHorseBytes.p) return loadHorseBytes.p;
    loadHorseBytes.p = (async () => {
      const MP = (window.AethelosModelParts ||= {}); MP.horse = [];
      for (let i = 1; i <= PARTS; i++) await new Promise((ok, fail) => {
        const s = document.createElement('script'); s.src = `assets/models/horse-${String(i).padStart(2, '0')}.js?v=${CACHE}`;
        s.onload = () => { s.remove(); ok(); }; s.onerror = () => { s.remove(); fail(new Error('Horse model could not load')); }; document.head.appendChild(s);
      });
      const b64 = MP.horse.join(''); MP.horse = [];
      const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    })().catch(e => { loadHorseBytes.p = null; throw e; });
    return loadHorseBytes.p;
  }
  /* minimal glTF reader for the horse GLB (quantized, multi-primitive, two skins) */
  function createHorseAsset(THREE, bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset), jl = dv.getUint32(12, true);
    const g = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jl))), start = bytes.byteOffset + 28 + jl;
    const W = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5122: Int16Array, 5121: Uint8Array, 5120: Int8Array };
    const acc = i => { const a = g.accessors[i], T = CT[a.componentType], w = W[a.type], v = g.bufferViews[a.bufferView], o = start + (v.byteOffset || 0) + (a.byteOffset || 0), st = v.byteStride || 0;
      if (!st || st === T.BYTES_PER_ELEMENT * w) return new T(bytes.buffer.slice(o, o + a.count * w * T.BYTES_PER_ELEMENT));
      const k = st / T.BYTES_PER_ELEMENT, src = new T(bytes.buffer, o, (a.count - 1) * k + w), out = new T(a.count * w);
      for (let n = 0; n < a.count; n++) for (let c = 0; c < w; c++) out[n * w + c] = src[n * k + c];
      return out; };
    const attr = (i, size) => new THREE.BufferAttribute(acc(i), size, !!g.accessors[i].normalized);
    const J = g.skins[0].joints.length;
    const bones = g.skins[0].joints.map(i => { const b = new THREE.Bone(); b.name = g.nodes[i].name; b.position.fromArray(g.nodes[i].translation || [0, 0, 0]); return b; });
    const parent = {}; g.nodes.forEach((n, i) => (n.children || []).forEach(c => parent[c] = i));
    for (let i = 0; i < J; i++) if (parent[i] !== undefined) bones[parent[i]].add(bones[i]);
    const root = new THREE.Group(); root.name = 'HorseRoot'; root.add(bones[0]);
    const byName = {}; bones.forEach(b => byName[b.name] = b);
    const skeletons = g.skins.map(s => { const ib = acc(s.inverseBindMatrices); return new THREE.Skeleton(s.joints.map(i => bones[i]), s.joints.map((_, k) => new THREE.Matrix4().fromArray(ib, k * 16))); });
    const texReady = [], textures = (g.textures || []).map(t => {
      const img = g.images[t.source], view = g.bufferViews[img.bufferView];
      const url = URL.createObjectURL(new Blob([bytes.slice(view.byteOffset + start - bytes.byteOffset, view.byteOffset + start - bytes.byteOffset + view.byteLength)], { type: img.mimeType }));
      const tex = new THREE.Texture(); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      texReady.push(new Promise((ok, fail) => { const im = new Image(); im.onload = () => { tex.image = im; tex.needsUpdate = true; URL.revokeObjectURL(url); ok(); }; im.onerror = e => { URL.revokeObjectURL(url); fail(e); }; im.src = url; }));
      return tex; });
    const materials = g.materials.map(m => { const p = m.pbrMetallicRoughness || {}, c = p.baseColorFactor || [1, 1, 1, 1];
      return new THREE.MeshStandardMaterial({ name: m.name, map: p.baseColorTexture ? textures[p.baseColorTexture.index] : null, color: new THREE.Color(c[0], c[1], c[2]),
        metalness: p.metallicFactor ?? 0, roughness: p.roughnessFactor ?? 0.8, side: THREE.DoubleSide, envMapIntensity: m.name === 'Horse' ? 0.55 : 1.0 }); });
    const meshes = [], full = new THREE.Group(); full.name = 'HorseMeshes'; root.add(full);
    g.nodes.forEach(n => {
      if (n.mesh === undefined) return;
      for (const prim of g.meshes[n.mesh].primitives) {
        const geo = new THREE.BufferGeometry(), a = prim.attributes;
        for (const [nm, k, s] of [['position', 'POSITION', 3], ['normal', 'NORMAL', 3], ['uv', 'TEXCOORD_0', 2], ['skinIndex', 'JOINTS_0', 4], ['skinWeight', 'WEIGHTS_0', 4]])
          if (a[k] !== undefined) geo.setAttribute(nm, attr(a[k], s));
        geo.setIndex(new THREE.BufferAttribute(acc(prim.indices), 1));
        // the model is already light (about 48k triangles in all, see tools/lod), so it draws and casts its shadow directly
        const m = new THREE.SkinnedMesh(geo, materials[prim.material]); m.name = g.meshes[n.mesh].name;
        m.bind(skeletons[n.skin], new THREE.Matrix4()); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; full.add(m); meshes.push(m);
      }
    });
    const clips = {};
    for (const an of g.animations) {
      const tracks = [];
      for (const ch of an.channels) {
        const s = an.samplers[ch.sampler], node = g.nodes[ch.target.node], t = acc(s.input), v = acc(s.output);
        if (ch.target.path === 'rotation') tracks.push(new THREE.QuaternionKeyframeTrack(node.name + '.quaternion', t, v));
        else if (ch.target.path === 'translation') tracks.push(new THREE.VectorKeyframeTrack(node.name + '.position', t, v));
      }
      clips[an.name] = new THREE.AnimationClip(an.name, g.extras.clips[an.name].duration, tracks);
    }
    return { root, bones, byName, meshes, full, materials, clips, extras: g.extras, textureReady: Promise.all(texReady) };
  }

  const WALK = 1.8, GALLOP = 15.0;
  function createHorse(ctx) {
    const { THREE, scene, world, player, camera, showToast, say } = ctx;
    const H = { state: 'absent', asset: null, mixer: null, actions: {}, cur: '', speed: 0, yaw: 0, presses: [], pendingH: null, rider: null,
      portal: null, portalT: 0, emerge: null, target: null, approach: null, slowToDismount: false, phase: 0, loading: null, lastClip: '' };
    const root = new THREE.Group(); root.name = 'Horse'; root.visible = false; scene.add(root);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e6);
    const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion(), v1m = new THREE.Matrix4();
    // the summoning portal exists from the start (its light is always in the scene: no shader recompiles on first summon)
    H.portal = A.createPortalFX(THREE, scene, { radius: 1.75, aspect: 1.22, sparks: 140, light: false });   // its light is borrowed from the shared pool while open scene.add(H.portal.group); H.portalT = 99;
    function load() {
      if (H.loading) return H.loading;
      H.loading = loadHorseBytes().then(async bytes => {
        const a = createHorseAsset(THREE, bytes); await a.textureReady;
        H.asset = a; root.add(a.root); H.mixer = new THREE.AnimationMixer(a.root);
        for (const m of a.materials) { m.clippingPlanes = [clipPlane]; m.clipShadows = true; }

        // the rider anchor: rides on the saddle bone; its origin = the hero model origin while seated
        const saddle = a.byName.Saddle; const anchor = new THREE.Group(); anchor.name = 'RiderAnchor';
        anchor.position.set(0, -1.62, -0.59 + 0.25); saddle.add(anchor); H.anchor = anchor;
        buildReins(a);
        play('Idle', 0);
        return a;
      }).catch(e => { H.loading = null; throw e; });                                  // a failed download can be retried
      return H.loading;
    }
    function play(name, fade = 0.25, { once = false, timeScale = 1 } = {}) {
      if (!H.asset || !H.asset.clips[name]) return null;
      let act = H.actions[name]; if (!act) act = H.actions[name] = H.mixer.clipAction(H.asset.clips[name]);
      act.timeScale = timeScale;
      if (H.cur === name) return act;
      const prev = H.actions[H.cur];
      act.reset(); act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); act.clampWhenFinished = once; act.play();
      if (prev) prev.crossFadeTo(act, fade, false); else act.fadeIn(fade);
      H.cur = name; return act;
    }
    // ---------------------------------------------------------------- reins: bit -> rider's hands (or the pommel)
    const reinMat = new THREE.MeshStandardMaterial({ color: 0x2a170c, roughness: 0.7, clippingPlanes: [clipPlane] });
    const reinSegs = [];
    function buildReins(a) {
      const geo = new THREE.CylinderGeometry(0.009, 0.009, 1, 5, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);
      for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(geo, reinMat); m.castShadow = true; m.frustumCulled = false; scene.add(m); reinSegs.push(m); }
    }
    const BIT = [new THREE.Vector3(0.075, 1.74, 1.24), new THREE.Vector3(-0.075, 1.74, 1.24)];   // horse space (head bone carries them)
    const POM = new THREE.Vector3(0, 1.86, -0.04);
    function seg(m, a, b) { m.position.copy(a); m.lookAt(b); m.scale.set(1, 1, Math.max(0.01, a.distanceTo(b))); m.visible = true; }
    function updateReins() {
      if (!H.asset || !root.visible) { reinSegs.forEach(m => m.visible = false); return; }
      const head = H.asset.byName.Head, sp = H.asset.byName.Spine;
      head.updateWorldMatrix(true, false);
      const restHead = new THREE.Vector3(0, 2.10, 0.98), restSpine = new THREE.Vector3(0, 1.42, -0.30);
      for (let s = 0; s < 2; s++) {
        const bit = v1.copy(BIT[s]).sub(restHead).applyMatrix4(head.matrixWorld);
        let hand;
        if (H.rider && H.rider.rig) { const hb = H.rider.rig.byName[s === 0 ? 'Hand_L' : 'Hand_R']; hand = hb.getWorldPosition(new THREE.Vector3()); }
        else hand = v2.copy(POM).add(new THREE.Vector3(s ? -0.06 : 0.06, -0.02, 0.05)).sub(restSpine).applyMatrix4(sp.matrixWorld);
        const mid = bit.clone().lerp(hand, 0.5); mid.y -= 0.12 + 0.04 * Math.sin(performance.now() / 300 + s);
        seg(reinSegs[s * 3], bit, mid); seg(reinSegs[s * 3 + 1], mid, hand); reinSegs[s * 3 + 2].visible = false;
      }
    }
    // ---------------------------------------------------------------- placement on the ground (pitch from front / back hooves)
    function ground(x, z, y) { return world.groundAt ? world.groundAt(x, z, y).h : world.terrain.heightAt(x, z); }
    function settle(dt, snap = false) {
      const f = v1.set(Math.sin(H.yaw), 0, Math.cos(H.yaw));
      const p = root.position, hf = ground(p.x + f.x * 0.6, p.z + f.z * 0.6, p.y + 1), hb = ground(p.x - f.x * 0.75, p.z - f.z * 0.75, p.y + 1);
      const y = (hf + hb) / 2, pitch = Math.atan2(hb - hf, 1.35);
      if (H.jump) p.y = y + H.jump.y; else p.y = snap ? y : p.y + (y - p.y) * Math.min(1, dt * 14);
      root.rotation.set(0, 0, 0); root.rotation.order = 'YXZ'; root.rotation.y = H.yaw;
      H.basePitch = snap || H.basePitch === undefined ? pitch : H.basePitch + (pitch - H.basePitch) * Math.min(1, dt * 8);
      root.rotation.x = H.basePitch + (H.jump ? H.jump.pitch : 0);
      root.rotation.z = H.lean || 0;
    }
    function blocked(x, z, y) {
      const w = world.terrain.waterAt(x, z); if (w && w.depth > 1.25 && !(world.collide && world.collide.deckAt(x, z))) return true;
      if (ground(x, z, y + 1) > y + 0.8 && world.terrain.slopeAt(x, z) > 0.95) return true;
      return false;
    }
    function moveHorse(dist) {
      const p = root.position, f = v1.set(Math.sin(H.yaw), 0, Math.cos(H.yaw));
      let nx = p.x + f.x * dist, nz = p.z + f.z * dist;
      if (blocked(nx + f.x * 1.1, nz + f.z * 1.1, p.y)) { H.speed *= 0.3; return false; }
      if (world.collide) {
        // two body circles (chest and quarters) pushed out of buildings, walls, trees, rocks
        for (const off of [0.75, -0.7]) {
          const cx = nx + f.x * off, cz = nz + f.z * off, [rx, rz, hit] = world.collide.resolve(cx, cz, 0.55, p.y, 2.2);
          if (hit) { nx += rx - cx; nz += rz - cz; H.speed *= 0.85; }
        }
      }
      const lim = world.terrain.size / 2 - 26; nx = Math.max(-lim, Math.min(lim, nx)); nz = Math.max(-lim, Math.min(lim, nz));
      const moved = Math.hypot(nx - p.x, nz - p.z); p.x = nx; p.z = nz; return moved;
    }
    function moveHorseFree(dist) { const f = v1.set(Math.sin(H.yaw), 0, Math.cos(H.yaw)); root.position.x += f.x * dist; root.position.z += f.z * dist; }
    // ---------------------------------------------------------------- sounds: hooves on the beat of the gait, snorts, neighs
    let lastPh = 0, snortT = 6;
    const BEATS = { Walk: [0.0, 0.25, 0.5, 0.75], Gallop: [0.0, 0.1, 0.22, 0.32] };
    const at = () => root.position;
    function hoofSounds(dt) {
      if (!ctx.sfx || !root.visible || !H.asset) return;
      const act = H.actions[H.cur], beats = BEATS[H.cur];
      if (act && beats && !H.jump) {
        const d = act.getClip().duration, ph = ((act.time % d) + d) % d / d;
        const hard = !!(world.terrain.roadAt(root.position.x, root.position.z) || (world.collide && world.collide.deckAt(root.position.x, root.position.z)));
        for (const b of beats) if ((lastPh <= ph && b > lastPh && b <= ph) || (lastPh > ph && (b > lastPh || b <= ph))) ctx.sfx('hoof', { at: at(), vol: H.cur === 'Gallop' ? 0.9 : 0.6, arg: { hard, heavy: H.cur === 'Gallop' ? 1.2 : 0.9 } });
        lastPh = ph;
      }
      if (H.state === 'idle' || H.state === 'ridden' && H.speed < 0.2) { snortT -= dt; if (snortT <= 0) { snortT = 7 + Math.random() * 9; ctx.sfx('snort', { at: at(), vol: 0.6 }); } }
    }
    // ---------------------------------------------------------------- animation by speed
    let stride = 0;
    function animate(dt) {
      const s = H.speed;
      if (H.state === 'rear') return;
      if (s < 0.15) play('Idle', 0.35);
      else if (s < 4.5) play('Walk', 0.3, { timeScale: Math.max(0.6, Math.min(1.7, s / WALK)) });
      else play('Gallop', 0.25, { timeScale: Math.max(0.55, Math.min(1.15, s / GALLOP)) });
    }
    // ---------------------------------------------------------------- portal summon
    function summon() {
      if (!ctx.hero() || H.state === 'ridden' || H.state === 'mounting' || H.state === 'dismounting') return;
      if (H.calling) return; H.calling = true;
      showToast && showToast('Calling your horse…');
      const keepTelling = setInterval(() => showToast && showToast('Calling your horse…'), 1500);   // a slow phone may still be downloading it
      load().then(() => {
        clearInterval(keepTelling); H.calling = false;
        if (H.state !== 'absent' && root.visible) return;
        // the portal tears open ahead and to one side; the horse gallops out of it and pulls up beside the hero
        const hp = player.position, fy = player.rotation.y, f = new THREE.Vector3(Math.sin(fy), 0, Math.cos(fy)), r = new THREE.Vector3(-f.z, 0, f.x);
        let best = null;
        for (const [fw, sd] of [[9, 5], [9, -5], [10, 2.5], [10, -2.5], [6, 8], [6, -8], [-9, 5], [-9, -5]]) {
          const px = hp.x + f.x * fw + r.x * sd, pz = hp.z + f.z * fw + r.z * sd, gy = ground(px, pz, hp.y + 2);
          const sx = hp.x + r.x * Math.sign(sd) * 2.7 + f.x * 0.6, sz = hp.z + r.z * Math.sign(sd) * 2.7 + f.z * 0.6, sy = ground(sx, sz, hp.y + 2);
          let ok = Math.abs(gy - hp.y) < 3 && !blocked(px, pz, gy) && !blocked(sx, sz, sy);
          for (let k = 0; ok && k <= 6; k++) { const x = px + (sx - px) * k / 6, z = pz + (sz - pz) * k / 6; if (world.collide && world.collide.resolve(x, z, 1.0, ground(x, z, hp.y + 2), 2.5)[2]) ok = false; }
          if (ok) { best = { x: px, z: pz, y: gy, sx, sz }; break; }
        }
        if (!best) { const px = hp.x + f.x * 9 + r.x * 5, pz = hp.z + f.z * 9 + r.z * 5; best = { x: px, z: pz, y: ground(px, pz, hp.y + 2), sx: hp.x + r.x * 2.7, sz: hp.z + r.z * 2.7 }; }
        // portal stands upright, facing the stopping point
        const toHero = v1.set(best.sx - best.x, 0, best.sz - best.z).normalize();
        H.stopAt = new THREE.Vector3(best.sx, 0, best.sz);
        H.portal.group.position.set(best.x, best.y + 1.95, best.z);
        H.portal.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toHero);
        // the tear runs vertically: rotate about the normal so local Z is world up
        const up = new THREE.Vector3(0, 0, 1).applyQuaternion(H.portal.group.quaternion);
        const ang = Math.atan2(up.clone().cross(new THREE.Vector3(0, 1, 0)).dot(toHero), up.dot(new THREE.Vector3(0, 1, 0)));
        H.portal.group.quaternion.premultiply(q1.setFromAxisAngle(toHero, ang));
        H.portalT = 0; H.portal.setOpen(0);
        // the horse waits inside, behind the portal, facing the hero
        H.yaw = Math.atan2(toHero.x, toHero.z);
        root.position.set(best.x - toHero.x * 4.2, best.y, best.z - toHero.z * 4.2); settle(0, true);
        clipPlane.setFromNormalAndCoplanarPoint(toHero, H.portal.group.position);
        root.visible = false; H.state = 'summoning'; H.speed = 0; H.portalHold = true; ctx.sfx && ctx.sfx('portal', { at: H.portal.group.position, arg: 1.3 });
        H.emerge = { normal: toHero.clone(), center: H.portal.group.position.clone() };
      }).catch(e => { clearInterval(keepTelling); H.calling = false; console.error(e); showToast && showToast('Your horse could not come (' + (e && e.message || 'download failed') + '). Try again.'); });
    }
    // ---------------------------------------------------------------- jump (Z while riding): arc, nose up then down, legs tucked
    const JUMP_BONES = { Forearm_L: -0.75, Forearm_R: -0.8, FCannon_L: 1.75, FCannon_R: 1.7, Humerus_L: 0.25, Humerus_R: 0.25,
      Thigh_L: -0.35, Thigh_R: -0.3, Gaskin_L: 0.55, Gaskin_R: 0.5, HCannon_L: -1.0, HCannon_R: -0.95 };
    const qj = new THREE.Quaternion(), XA = new THREE.Vector3(1, 0, 0);
    function jump() {
      if (H.state !== 'ridden' || H.jump || H.slowToDismount) return false;
      const fast = H.speed > 6, dur = fast ? 0.9 : 0.75, h = fast ? 1.35 : 0.9;
      H.jump = { t: 0, dur, h, y: 0, pitch: 0, tuck: 0 }; H.speed = Math.max(H.speed, fast ? H.speed : 3.2);
      ctx.sfx && ctx.sfx('horseJump', { at: root.position }); return true;
    }
    function updateJump(dt) {
      const J = H.jump; if (!J) return;
      J.t += dt; const u = Math.min(1, J.t / J.dur);
      J.y = 4 * J.h * u * (1 - u); J.pitch = -0.26 * Math.sin(2 * Math.PI * u); J.tuck = Math.pow(Math.sin(Math.PI * u), 0.6);
      if (u >= 1) { H.jump = null; ctx.sfx && ctx.sfx('horseLand', { at: root.position }); }
    }
    function applyJumpPose() {
      const J = H.jump; if (!J || !H.asset) return;
      for (const [n, a] of Object.entries(JUMP_BONES)) { const b = H.asset.byName[n]; if (b) b.quaternion.multiply(qj.setFromAxisAngle(XA, a * J.tuck)); }
    }
    // ---------------------------------------------------------------- H x3 while the horse is out: back into the pocket dimension
    function leave() {
      if (!H.asset || !root.visible || H.state === 'leaving' || H.state === 'summoning' || H.state === 'mounting' || H.state === 'dismounting') return;
      const hp = root.position;
      // the portal it came from, if that is still close; otherwise a new one ahead of it
      let c = null;
      if (H.emerge && H.emerge.center.distanceTo(hp) < 40) c = H.emerge.center.clone();
      else { const f = v1.set(Math.sin(H.yaw), 0, Math.cos(H.yaw));
        for (const [fw, sd] of [[10, 0], [9, 4], [9, -4], [-10, 0]]) { const x = hp.x + f.x * fw - f.z * sd, z = hp.z + f.z * fw + f.x * sd, y = ground(x, z, hp.y + 2);
          if (!blocked(x, z, y) && !(world.collide && world.collide.resolve(x, z, 1.0, y, 2.5)[2])) { c = new THREE.Vector3(x, y + 1.95, z); break; } }
        if (!c) c = new THREE.Vector3(hp.x + f.x * 10, ground(hp.x + f.x * 10, hp.z + f.z * 10, hp.y + 2) + 1.95, hp.z + f.z * 10); }
      const n = v2.set(hp.x - c.x, 0, hp.z - c.z).normalize().clone();               // portal faces the horse
      H.portal.group.position.copy(c); H.portal.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const up = new THREE.Vector3(0, 0, 1).applyQuaternion(H.portal.group.quaternion);
      H.portal.group.quaternion.premultiply(q1.setFromAxisAngle(n, Math.atan2(up.clone().cross(new THREE.Vector3(0, 1, 0)).dot(n), up.dot(new THREE.Vector3(0, 1, 0)))));
      H.portalT = 0; H.portalHold = true; H.leaving = { center: c, normal: n }; H.state = 'leaving'; H.speed = Math.max(H.speed, 1);
      clipPlane.setFromNormalAndCoplanarPoint(n, c);                                  // keeps the near side: what has gone through vanishes
      ctx.sfx && (ctx.sfx('portal', { at: c, arg: 1.3 }), ctx.sfx('neigh', { at: root.position, vol: 0.8 }));
      showToast && showToast('Your horse returns to the pocket dimension');
    }
    // ---------------------------------------------------------------- H key
    function pressH() {
      const now = performance.now() / 1000;
      H.presses = H.presses.filter(t => now - t < 3); H.presses.push(now);
      if (H.presses.length >= 3) { H.presses = []; clearTimeout(H.pendingH); H.pendingH = null;
        if (H.state === 'absent' || !root.visible) summon();
        else if (H.state === 'ridden') { H.slowToDismount = true; H.leaveAfterDismount = true; }   // get off first, then it goes
        else leave();
        return; }
      clearTimeout(H.pendingH);
      const away = H.state === 'absent' || !root.visible;
      if (away) {                                // nothing to mount yet: every press counts towards the summon (slow taps on a phone too)
        if (!H.calling) showToast && showToast(`Summoning… ${H.presses.length}/3`);
        return;
      }
      // a single press acts after a short pause (so H-H-H isn't read as mount + dismount)
      H.pendingH = setTimeout(() => { H.pendingH = null; if (H.presses.length) { H.presses = []; single(); } }, 650);
    }
    function single() {
      if (H.state === 'ridden') { H.slowToDismount = true; return; }
      if (H.state === 'mounting' || H.state === 'dismounting' || H.state === 'summoning') return;
      if (H.state === 'absent' || !root.visible) { showToast && showToast((A.isTouchDevice && A.isTouchDevice() ? 'Tap Summon three times quickly to call your horse' : 'Press H three times quickly to summon your horse')); return; }
      const d = root.position.distanceTo(player.position);
      if (d > 70) { showToast && showToast((A.isTouchDevice && A.isTouchDevice() ? 'Your horse is far away. Tap Summon three times to call it through a portal.' : 'Your horse is far away. Press H three times to call it through a portal.')); return; }
      if (d > 7) { H.state = 'coming'; showToast && showToast('Your horse is coming'); return; }
      startApproach();
    }
    // ---------------------------------------------------------------- mounting
    function mountSpot() {      // where the hero's model origin must stand: horse (0.97, 0, -0.12), facing the horse (-x)
      root.updateMatrixWorld(true);
      const p = new THREE.Vector3(0.97, 0, -0.12).applyMatrix4(root.matrixWorld); p.y = ground(p.x, p.z, p.y + 1);
      const dir = new THREE.Vector3(-1, 0, 0).applyQuaternion(root.quaternion); dir.y = 0; dir.normalize();
      return { p, yaw: Math.atan2(dir.x, dir.z) };
    }
    function startApproach() {
      const hero = ctx.hero(); if (!hero) return;
      if (hero.controller.state.swordOut) hero.controller.stow && hero.controller.stow();
      H.state = 'approach'; H.approach = mountSpot(); H.speed = 0; play('Idle', 0.3);
      // walk round the FRONT of the horse to its left side (never through it): waypoints in the horse's own frame (+x = its left, +z = forward)
      root.updateMatrixWorld(true); const loc = player.position.clone().applyMatrix4(v1m.copy(root.matrixWorld).invert());
      H.wp = [];
      if (loc.x < 0.75) {
        if (loc.z < -1.2 && loc.x > -0.4) H.wp = [[1.15, -2.1]];                                   // straight behind: round the back-left corner
        else { if (loc.x < 0.2) H.wp.push([-1.15, Math.max(2.5, Math.min(loc.z, 3.5))]); H.wp.push([1.15, 2.5]); }
      }
    }
    function beginMount() {
      const hero = ctx.hero(); const rig = hero; H.state = 'mounting';
      H.rider = { rig };
      H.anchor.add(rig.root); rig.root.position.set(0, 0, 0); rig.root.quaternion.identity();
      rig.controller.mount(() => { H.state = 'ridden'; say && say('mounted'); });
      ctx.onMount && ctx.onMount(true);
    }
    function beginDismount() {
      const hero = ctx.hero(); H.state = 'dismounting'; H.speed = 0; H.slowToDismount = false;
      hero.controller.dismount(() => {
        const s = mountSpot();
        ctx.heroMount.add(hero.root); hero.root.position.set(0, 0, 0); hero.root.quaternion.identity();
        player.position.copy(s.p); player.rotation.y = s.yaw; H.rider = null; H.state = 'idle';
        ctx.onMount && ctx.onMount(false);
        if (H.leaveAfterDismount) { H.leaveAfterDismount = false; setTimeout(leave, 400); }
      });
    }
    // ---------------------------------------------------------------- per frame
    function update(dt, input) {
      if (!H.asset) return;
      const hero = ctx.hero();
      if (H.portal) {
        H.portalT += dt; H.portal.update(dt);
        H.portalOpen = H.portalOpen || 0;
        H.portalOpen += Math.max(-dt / 0.6, Math.min(dt / 0.7, (H.portalHold ? 1 : 0) - H.portalOpen));
        const open = H.portalOpen; H.portal.setOpen(Math.max(0, open));
        const pool = world.lightPool;
        if (pool && open > 0.02) { if (!H.portalLight) H.portalLight = pool.take();
          if (H.portalLight) { const L = H.portalLight; L.color.set(0x3a8cff); L.distance = 24; L.decay = 1.8; L.position.copy(H.portal.group.position); L.intensity = 40 * open; } }
        else if (H.portalLight) { pool.give(H.portalLight); H.portalLight = null; }
      }
      if (H.state === 'summoning') {
        if (H.portalT > 0.75) {
          if (!root.visible) { root.visible = true; H.speed = 11; play('Gallop', 0.05, { timeScale: 0.8 }); ctx.sfx && ctx.sfx('neigh', { at: root.position, vol: 0.9 }); }
          moveHorse(H.speed * dt);
          // through the portal: stop clipping once the whole horse is out
          const out = v1.copy(root.position).sub(H.emerge.center).dot(H.emerge.normal);
          if (out > 2.6) { clipPlane.constant = 1e6; H.portalHold = false; }
          // stop beside the hero, then rear up
          const toStop = v2.set(H.stopAt.x - root.position.x, 0, H.stopAt.z - root.position.z), d = toStop.length();
          if (out > 1.0 && d < 3.4) H.speed = Math.max(0, H.speed - 19 * dt);
          if (H.speed <= 0.2 && out > 1) {
            H.speed = 0; H.state = 'rear'; play('Rear', 0.2, { once: true }); ctx.sfx && ctx.sfx('neigh', { at: root.position });
            say && say('arrived');
          }
          if (out > 14) { H.speed = 0; H.state = 'idle'; clipPlane.constant = 1e6; H.portalHold = false; }
        }
        animate(dt);
      } else if (H.state === 'rear') {
        const a = H.actions.Rear; if (!a || a.time >= a.getClip().duration - 0.05) { H.state = 'idle'; play('Idle', 0.4); }
      } else if (H.state === 'leaving') {
        const L = H.leaving, to = v2.set(L.center.x - root.position.x, 0, L.center.z - root.position.z);
        let through = -v1.copy(root.position).sub(L.center).dot(L.normal);            // metres past the portal plane
        if (through < -1.5) { const want = Math.atan2(to.x, to.z); H.yaw += Math.atan2(Math.sin(want - H.yaw), Math.cos(want - H.yaw)) * Math.min(1, dt * (H.portalT < 0.6 ? 2.5 : 5)); }
        if (H.portalT > 0.5) H.speed = Math.min(11, H.speed + 9 * dt);
        moveHorseFree(H.speed * dt);
        through = -v1.copy(root.position).sub(L.center).dot(L.normal);
        if (through > 3.4) { ctx.sfx && ctx.sfx('portalClose', { at: L.center }); root.visible = false; H.state = 'absent'; H.speed = 0; H.portalHold = false; clipPlane.constant = 1e6; play('Idle', 0); H.emerge = null; }
        animate(dt);
      } else if (H.state === 'coming') {
        const to = v2.set(player.position.x - root.position.x, 0, player.position.z - root.position.z), d = to.length();
        const want = Math.atan2(to.x, to.z); H.yaw += Math.atan2(Math.sin(want - H.yaw), Math.cos(want - H.yaw)) * Math.min(1, dt * 2.5);
        const target = d > 25 ? GALLOP * 0.7 : d > 6 ? 4.0 : 0; H.speed += (target - H.speed) * Math.min(1, dt * 1.5);
        moveHorse(H.speed * dt);
        if (d < 5 && H.speed < 0.6) { H.speed = 0; startApproach(); }
        animate(dt);
      } else if (H.state === 'approach') {
        // the hero walks to the stirrup on the horse's left side and turns to face it
        let s = H.approach = mountSpot(); const p = player.position;
        if (H.wp && H.wp.length) {                                                      // next waypoint round the front
          root.updateMatrixWorld(true); const w = new THREE.Vector3(H.wp[0][0], 0, H.wp[0][1]).applyMatrix4(root.matrixWorld); w.y = ground(w.x, w.z, p.y + 1);
          if (Math.hypot(w.x - p.x, w.z - p.z) < 0.3) H.wp.shift(); else s = { p: w, yaw: s.yaw, via: true };
        }
        const d = Math.hypot(s.p.x - p.x, s.p.z - p.z);
        if (d > 0.08 || s.via) {
          const step = Math.min(d, 1.7 * dt); p.x += (s.p.x - p.x) / d * step; p.z += (s.p.z - p.z) / d * step; p.y = s.p.y;
          const want = d > 0.4 ? Math.atan2(s.p.x - p.x, s.p.z - p.z) : s.yaw;
          player.rotation.y += Math.atan2(Math.sin(want - player.rotation.y), Math.cos(want - player.rotation.y)) * Math.min(1, dt * 8);
          H.heroMoving = true;
        } else {
          player.rotation.y += Math.atan2(Math.sin(s.yaw - player.rotation.y), Math.cos(s.yaw - player.rotation.y)) * Math.min(1, dt * 10);
          H.heroMoving = false;
          if (Math.abs(Math.atan2(Math.sin(s.yaw - player.rotation.y), Math.cos(s.yaw - player.rotation.y))) < 0.05 && hero && !hero.controller.state.swordOut && hero.controller.state.mode === 'free') {
            player.position.copy(s.p); player.rotation.y = s.yaw; beginMount();
          }
        }
        H.speed = 0; animate(dt);
      } else if (H.state === 'ridden') {
        // steering: camera-relative input; walk normally, gallop with the run key
        const dir = input.dir, run = input.run && !H.slowToDismount;
        let target = 0;
        if (dir && !H.slowToDismount) {
          const want = Math.atan2(dir.x, dir.z), err = Math.atan2(Math.sin(want - H.yaw), Math.cos(want - H.yaw));
          const rate = (H.speed > 6 ? 1.6 : 2.4) * dt; const turn = Math.max(-rate, Math.min(rate, err)); H.yaw += turn;
          H.lean += ((-turn / Math.max(dt, 1e-3)) * Math.min(1, H.speed / GALLOP) * 0.12 - H.lean) * Math.min(1, dt * 4);
          target = run ? GALLOP : WALK;
          if (Math.abs(err) > 2.2 && H.speed < 3) target = WALK * 0.6;
        } else H.lean *= Math.exp(-dt * 4);
        const accel = target > H.speed ? (target > 5 ? 7.5 : 3) : 10;
        H.speed += Math.sign(target - H.speed) * Math.min(Math.abs(target - H.speed), accel * dt);
        if (H.speed > 0.01) moveHorse(H.speed * dt);
        updateJump(dt);
        if (H.slowToDismount && H.speed < 0.4 && !H.jump) beginDismount();
        animate(dt);
        player.position.copy(root.position); player.rotation.y = H.yaw;
      } else if (H.state === 'mounting' || H.state === 'dismounting') {
        H.speed = 0; animate(dt); player.position.copy(root.position);
      } else if (H.state === 'idle') { H.speed = 0; animate(dt); }
      H.lean = H.lean || 0;
      settle(dt);
      H.mixer.update(dt);
      applyJumpPose();
      hoofSounds(dt);
      // rider clip follows the horse's gait
      if (hero && H.state === 'ridden') hero.controller.ride(H.speed < 0.15 ? 'idle' : H.speed < 4.5 ? 'walk' : 'gallop', H.actions[H.cur], H.cur);
      updateReins();
      // the unridden horse blocks the hero (two body circles)
      if (world.dynamic) { const f = v1.set(Math.sin(H.yaw), 0, Math.cos(H.yaw));
        world.dynamic.horse = (root.visible && H.state !== 'leaving' && H.state !== 'ridden' && H.state !== 'mounting' && H.state !== 'dismounting' && H.state !== 'approach')
          ? [{ x: root.position.x + f.x * 0.7, z: root.position.z + f.z * 0.7, r: 0.5 }, { x: root.position.x - f.x * 0.7, z: root.position.z - f.z * 0.7, r: 0.5 }] : null; }
    }
    return {
      root, load, summon, pressH, update, state: H, jump, leave,
      get jumping() { return !!H.jump; },
      cancel() { if (H.state === 'approach' || H.state === 'coming') { H.state = 'idle'; H.heroMoving = false; H.speed = 0; } },
      get riding() { return H.state === 'ridden' || H.state === 'mounting' || H.state === 'dismounting'; },
      get approaching() { return H.state === 'approach'; },
      get heroMoving() { return !!H.heroMoving; },
      get speed() { return H.speed; },
      dispose() { scene.remove(root); reinSegs.forEach(m => scene.remove(m)); H.portal && H.portal.dispose(); }
    };
  }
  A.createHorse = createHorse; A.loadHorseBytes = loadHorseBytes; A.createHorseAsset = createHorseAsset;
})();
