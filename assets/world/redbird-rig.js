/* Red Bird: model loader + procedural poser (no baked clips: every pose is computed from a few parameters, so states
   blend continuously and nothing extra is downloaded).
   Model: assets/models/redbird-01.js (tools/bird: 3,000 triangles baked from the 500k sculpt, 88 bones, 1 unit = 1 m).
   Rest frame: Y up, the bird faces +Z, its left wing is +X. Rests are translation-only, so a bone's local rotation
   is expressed in the armature axes (turned by its parents).

   pose(P) parameters (all optional):
     pitch    body pitch (rad, + = nose down / forward; ~1.25 = level flight)   roll   bank (rad)
     flap     wing-beat phase 0..1        amp     beat amplitude 0..1         fold   wings folded 0..1
     sweep    wings swept back (dash) 0..1            tuck   legs tucked 0..1
     lean     standing lean forward (rad)             peck   0..1 beak to the ground
     headYaw / headPitch (rad)                        jaw    beak open 0..1
     tail     tail fan spread -1..1                   tailLift (rad)       limp  0..1 dead / tumbling */
(() => {
  const A = window.Aethelos ||= {};
  const PARTS = 1, CACHE = 'redbird-v2';
  function loadBirdBytes() {
    if (loadBirdBytes.p) return loadBirdBytes.p;
    loadBirdBytes.p = (async () => {
      const MP = (window.AethelosModelParts ||= {}); MP.redbird = [];
      for (let i = 1; i <= PARTS; i++) await new Promise((ok, fail) => {
        const s = document.createElement('script'); s.src = `assets/models/redbird-${String(i).padStart(2, '0')}.js?v=${CACHE}`;
        s.onload = () => { s.remove(); ok(); }; s.onerror = () => { s.remove(); fail(new Error('Red bird model could not load')); }; document.head.appendChild(s);
      });
      const bin = atob(MP.redbird.join('')); MP.redbird = [];
      const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    })().catch(e => { loadBirdBytes.p = null; throw e; });
    return loadBirdBytes.p;
  }

  function createBirdAsset(THREE, bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset), jl = dv.getUint32(12, true);
    const g = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jl))), start = bytes.byteOffset + 28 + jl;
    const CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }, W = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const acc = i => { const a = g.accessors[i], v = g.bufferViews[a.bufferView], T = CT[a.componentType], o = start + (v.byteOffset || 0) + (a.byteOffset || 0);
      return new T(bytes.buffer.slice(o, o + a.count * W[a.type] * T.BYTES_PER_ELEMENT)); };
    const pr = g.meshes[0].primitives[0], at = pr.attributes, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(acc(at.POSITION), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(acc(at.NORMAL), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(acc(at.TEXCOORD_0), 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(acc(at.JOINTS_0), 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(acc(at.WEIGHTS_0), 4));
    geo.setIndex(new THREE.BufferAttribute(acc(pr.indices), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 0.9);
    const joints = g.skins[0].joints, ib = acc(g.skins[0].inverseBindMatrices);
    const bones = joints.map(i => ({ name: g.nodes[i].name, t: g.nodes[i].translation || [0, 0, 0], parent: -1 }));
    g.nodes.forEach((n, i) => (n.children || []).forEach(c => { const ci = joints.indexOf(c), pi = joints.indexOf(i); if (ci >= 0 && pi >= 0) bones[ci].parent = pi; }));
    const img = g.images[0], iv = g.bufferViews[img.bufferView];
    const url = URL.createObjectURL(new Blob([bytes.slice(start - bytes.byteOffset + iv.byteOffset, start - bytes.byteOffset + iv.byteOffset + iv.byteLength)], { type: img.mimeType }));
    const tex = new THREE.Texture(); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const textureReady = new Promise((ok, fail) => { const im = new Image(); im.onload = () => { tex.image = im; tex.needsUpdate = true; URL.revokeObjectURL(url); ok(); }; im.onerror = fail; im.src = url; });
    const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0, emissive: new THREE.Color(0, 0, 0) });
    const ibm = bones.map((_, k) => new THREE.Matrix4().fromArray(ib, k * 16));
    return { geometry: geo, material, texture: tex, bones, ibm, extras: g.extras || {}, textureReady };
  }

  // ------------------------------------------------------------------------------------------------ one bird
  function makeBird(THREE, asset, { ownMaterial = true, poser = true } = {}) {
    const B = asset.bones.map(b => { const o = new THREE.Bone(); o.name = b.name; o.position.fromArray(b.t); return o; });
    asset.bones.forEach((b, i) => { if (b.parent >= 0) B[b.parent].add(B[i]); });
    const by = {}; B.forEach(b => by[b.name] = b);
    const root = new THREE.Group(); root.name = 'RedBird'; root.add(B[0]);
    const mat = ownMaterial ? asset.material.clone() : asset.material;
    const mesh = new THREE.SkinnedMesh(asset.geometry, mat); mesh.frustumCulled = false;
    root.add(mesh); mesh.bind(new THREE.Skeleton(B, asset.ibm), new THREE.Matrix4());
    const rig = { root, mesh, bones: B, by, material: mat };
    rig.pose = poser ? makePoser(THREE, rig) : null;
    return rig;
  }

  // ------------------------------------------------------------------------------------------------ poser
  function makePoser(THREE, rig) {
    const by = rig.by, V = (x, y, z) => new THREE.Vector3(x, y, z);
    const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
    const rest = {}; for (const b of rig.bones) rest[b.name] = b.position.clone();
    const dirOf = (a, child) => rest[child].clone().normalize();       // a bone's rest direction = its child's offset
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qi = new THREE.Quaternion();
    const qa = (axis, ang) => q2.setFromAxisAngle(axis, ang);
    const S = { L: 1, R: -1 };
    // wing data per side
    const wing = {};
    for (const s of ['L', 'R']) {
      const sg = S[s];
      const span = rest[`Wing_Upper.${s}`].clone().add(rest[`Wing_Forearm.${s}`]).add(rest[`Wing_Hand.${s}`]).normalize();
      // folded: the wing lies along the flank, pointing down and back to the tail, flat against the body
      const foldDir = V(0.16 * sg, -0.62, -0.77).normalize();
      const qFold = new THREE.Quaternion().setFromUnitVectors(span, foldDir);
      const n0 = Z.clone().applyQuaternion(qFold);                         // where the wing's plane normal went
      const want = V(sg, 0, 0); want.sub(foldDir.clone().multiplyScalar(want.dot(foldDir))).normalize();
      const nP = n0.sub(foldDir.clone().multiplyScalar(n0.dot(foldDir))).normalize();
      let tw = Math.acos(Math.max(-1, Math.min(1, nP.dot(want)))); if (nP.clone().cross(want).dot(foldDir) < 0) tw = -tw;
      qFold.premultiply(new THREE.Quaternion().setFromAxisAngle(foldDir, tw));
      const handDir = dirOf(`Wing_Hand.${s}`, `FlightFeather_02_Base.${s}`);
      const feathers = [];
      for (let i = 1; i <= 8; i++) { const n = `FlightFeather_0${i}_Base.${s}`; const d = rest[`FlightFeather_0${i}_Tip.${s}`].clone().normalize();
        feathers.push({ b: by[n], qc: new THREE.Quaternion().setFromUnitVectors(d, handDir.clone().lerp(d, 0.18).normalize()) }); }
      wing[s] = { sg, qFold, feathers, sh: by[`Wing_Shoulder.${s}`], up: by[`Wing_Upper.${s}`], fa: by[`Wing_Forearm.${s}`], ha: by[`Wing_Hand.${s}`] };
    }
    // tail fan: spread / close each feather about the tail plane normal
    const tailC = rest.TailFeather_03_Tip.clone().normalize();
    const tailF = [1, 2, 3, 4, 5].map(i => { const d = rest[`TailFeather_0${i}_Tip`].clone().normalize(); const n = tailC.clone().cross(d);
      const ang = Math.asin(Math.min(1, n.length())); return { b: by[`TailFeather_0${i}_Base`], axis: n.lengthSq() > 1e-8 ? n.normalize() : Z.clone(), ang }; });
    const toes = []; for (const s of ['L', 'R']) for (let i = 1; i <= 4; i++) toes.push({ b: by[`Toe_0${i}_Base.${s}`], t: by[`Toe_0${i}_Tip.${s}`], back: i === 4 });
    const crest = [1, 2, 3, 4].map(i => by[`Crest_0${i}_Base`]);
    const CENTER = V(0, 0.33, 0), rootRest = rest.Root.clone();
    const tmp = V(0, 0, 0);

    return function pose(P = {}) {
      const pitch = P.pitch || 0, roll = P.roll || 0, amp = P.amp || 0, fold = P.fold ?? 1, sweep = P.sweep || 0, tuck = P.tuck || 0, limp = P.limp || 0;
      const ph = (P.flap || 0) * Math.PI * 2, beat = Math.sin(ph), up = Math.cos(ph);          // up > 0: the wing is rising
      for (const b of rig.bones) b.quaternion.copy(qi);
      // body: pitch / roll about the body centre (the Root bone sits at the feet)
      const R = by.Root; R.quaternion.setFromAxisAngle(X, pitch); if (roll) R.quaternion.multiply(qa(Y, roll));
      R.position.copy(rootRest).add(CENTER).sub(tmp.copy(CENTER).applyQuaternion(R.quaternion));
      // standing lean / peck pivot at the pelvis, legs counter-rotated so the feet stay down
      const lean = (P.lean || 0) + 0.6 * (P.peck || 0);
      by.Pelvis.quaternion.setFromAxisAngle(X, lean);
      // head: undo the body pitch, then look
      const hp = -pitch * 0.92 + (P.headPitch || 0) + 1.1 * (P.peck || 0) - lean * 0.35 + limp * 0.9;
      by.Neck.quaternion.setFromAxisAngle(X, hp * 0.5); by.Head.quaternion.setFromAxisAngle(X, hp * 0.5);
      if (P.headYaw) by.Head.quaternion.premultiply(qa(Y, P.headYaw));
      by.Jaw.quaternion.setFromAxisAngle(X, 0.42 * (P.jaw || 0));
      const crestK = 0.12 * beat * amp - 0.35 * sweep;
      crest.forEach((c, i) => c.quaternion.setFromAxisAngle(X, crestK * (1 - i * 0.15)));
      // wings
      const fl = Math.min(1, fold + limp * 0.3), flapW = 1 - fl;
      for (const s of ['L', 'R']) {
        const w = wing[s], sg = w.sg;
        const th = amp * flapW * (0.95 * beat + 0.12);                        // + = up (toward the back, rest -Z)
        const lag = k => amp * flapW * Math.sin(ph - k);
        const upFold = amp * flapW * Math.max(0, up) * 0.35;                   // upstroke: the hand folds a little
        const sw = sweep * 0.9 + upFold * 0.5 + limp * 0.3;
        w.sh.quaternion.slerpQuaternions(qi, w.qFold, fl);
        w.sh.quaternion.multiply(qa(Y, sg * th)).multiply(qa(Z, -sg * sw * 0.55));
        w.up.quaternion.setFromAxisAngle(Y, sg * (0.18 * lag(0.5) - 0.25 * sweep));
        w.fa.quaternion.setFromAxisAngle(Y, sg * (0.28 * lag(0.9) - 0.3 * sweep)).multiply(qa(Z, -sg * (upFold * 0.6 + sweep * 0.5)));
        w.ha.quaternion.setFromAxisAngle(Y, sg * (0.32 * lag(1.3) - 0.2 * sweep)).multiply(qa(Z, -sg * (upFold * 0.9 + sweep * 0.6)));
        const collapse = Math.min(1, fl * 0.92 + upFold * 0.6 + sweep * 0.55);
        for (const f of w.feathers) f.b.quaternion.slerpQuaternions(qi, f.qc, collapse);
        if (limp) w.sh.quaternion.multiply(qa(Y, sg * limp * 0.4 * Math.sin(ph * 0.5)));
      }
      // tail: lift and fan
      by.Tail_Base.quaternion.setFromAxisAngle(X, (P.tailLift || 0) - 0.25 * (P.peck || 0) - 0.15 * amp * beat * 0.3);
      const spread = (P.tail || 0);
      for (const t of tailF) t.b.quaternion.setFromAxisAngle(t.axis, t.ang * spread * 0.9);
      // legs: standing counter-lean; in flight tucked under the belly
      for (const s of ['L', 'R']) {
        const th = by[`Thigh.${s}`], sh = by[`Shin.${s}`], ft = by[`Foot.${s}`];
        th.quaternion.setFromAxisAngle(X, -lean + tuck * (P.legT ?? -1.2));            // flight: legs trail back under the tail,
        sh.quaternion.setFromAxisAngle(X, tuck * (P.legS ?? 1.4)); ft.quaternion.setFromAxisAngle(X, tuck * (P.legF ?? 0.3));   // toes balled up
      }
      for (const t of toes) { const c = tuck * (t.back ? -0.9 : 1.2); t.b.quaternion.setFromAxisAngle(X, c); t.t.quaternion.setFromAxisAngle(X, c * 0.8); }
    };
  }

  A.RedBird = { loadBirdBytes, createBirdAsset, makeBird, CACHE };
})();
