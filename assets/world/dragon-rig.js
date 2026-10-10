/* Earth Dragon: model loader + procedural poser.
   Model: assets/models/dragon-01..02.js (tools/bird/build_bird.py: 8,000 triangles baked from the 500k sculpt; 211 bones).
   Rest frame: Y up, faces +Z, its left side is +X. Model units: the game scales it by SCALE (~11 m long).
   pose(P) — every field optional (radians unless noted):
     pitch   body pitch about the hind feet (- = rear up)      lift  body raise (model units)   roll / twist (body yaw)
     spine   spine arch (+ = hunch down)      spineYaw  sideways curve
     neck / neckYaw, head / headYaw (+head = nose down)       jaw 0..1
     armL / armR: [raise, out, sweep, elbow]   (raise + = claw forward/up, out + = away from the body, sweep + = toward its right)
     crouch  hind legs bend 0..1      walk {phase 0..1, amp 0..1}
     wings   0 = folded on the back, 1 = raised (as sculpted), 2 = spread for flight     flap {phase, amp}
     tailYaw / tailLift / tailStraight 0..1 / tailWave {phase, amp}                       claws 0..1 spread */
(() => {
  const A = window.Aethelos ||= {};
  const PARTS = 2, CACHE = 'dragon-v1', SCALE = 11;
  function loadDragonBytes() {
    if (loadDragonBytes.p) return loadDragonBytes.p;
    loadDragonBytes.p = (async () => {
      const MP = (window.AethelosModelParts ||= {}); MP.dragon = [];
      for (let i = 1; i <= PARTS; i++) await new Promise((ok, fail) => {
        const s = document.createElement('script'); s.src = `assets/models/dragon-${String(i).padStart(2, '0')}.js?v=${CACHE}`;
        s.onload = () => { s.remove(); ok(); }; s.onerror = () => { s.remove(); fail(new Error('Earth dragon model could not load')); }; document.head.appendChild(s);
      });
      const bin = atob(MP.dragon.join('')); MP.dragon = [];
      const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    })().catch(e => { loadDragonBytes.p = null; throw e; });
    return loadDragonBytes.p;
  }
  function makeDragon(THREE, asset) {
    const rig = A.RedBird.makeBird(THREE, asset, { poser: false });              // same light-model format (skinned mesh + translation-only rests)
    rig.root.name = 'EarthDragon';
    rig.mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, -0.2), 0.75);
    rig.pose = makeDragonPoser(THREE, rig);
    return rig;
  }

  function makeDragonPoser(THREE, rig) {
    const by = rig.by, X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    const q2 = new THREE.Quaternion(), qa = (axis, a) => q2.setFromAxisAngle(axis, a);
    const rest = {}; for (const b of rig.bones) rest[b.name] = b.position.clone();
    const B = n => by[n];
    const spine = ['Spine_01', 'Spine_02', 'Spine_03', 'Spine_04', 'Chest'].map(B), neck = ['Neck_01', 'Neck_02', 'Neck_03'].map(B);
    const tail = []; for (let i = 1; i <= 20; i++) tail.push(B('Tail_' + String(i).padStart(2, '0')));
    const curl = []; for (let i = 1; i <= 8; i++) curl.push(B('Tail_Curl_0' + i));
    const side = s => ({ s, sg: s === 'L' ? 1 : -1,
      sh: B(`Fore_Shoulder.${s}`), up: B(`Fore_UpperArm.${s}`), fa: B(`Fore_Forearm.${s}`), wr: B(`Fore_Wrist.${s}`),
      toes: [1, 2, 3].map(i => B(`Fore_Toe_0${i}.${s}_01`)),
      hip: B(`Hind_Hip.${s}`), th: B(`Hind_Thigh.${s}`), shin: B(`Hind_Shin.${s}`), hock: B(`Hind_Hock.${s}`),
      wSh: B(`Wing_Shoulder.${s}`), wUp: B(`Wing_Upper.${s}`), wFa: B(`Wing_Forearm.${s}`), wHa: B(`Wing_Hand.${s}`),
      fingers: [1, 2, 3, 4, 5].map(i => [1, 2, 3, 4].map(k => B(`Wing_Finger_0${i}.${s}_0${k}`))) });
    const S2 = { L: side('L'), R: side('R') };
    const rootRest = rest.Root.clone();
    const qi = new THREE.Quaternion();
    const qq = new THREE.Quaternion(), qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), qz = new THREE.Quaternion();
    const set = (b, ax, ay, az) => { qx.setFromAxisAngle(X, ax || 0); qy.setFromAxisAngle(Y, ay || 0); qz.setFromAxisAngle(Z, az || 0); b.quaternion.copy(qy).multiply(qz).multiply(qx); };

    return function pose(P = {}) {
      for (const b of rig.bones) b.quaternion.copy(qi);
      const pitch = P.pitch || 0, w = P.walk || null, wph = w ? w.phase * Math.PI * 2 : 0, wamp = w ? w.amp || 0 : 0;
      // body: pitch about the hind feet (Root sits there), bob while walking
      const R0 = by.Root; R0.quaternion.setFromAxisAngle(X, pitch);
      if (P.twist) R0.quaternion.premultiply(qa(Y, P.twist));
      if (P.roll) R0.quaternion.multiply(qa(Z, P.roll));
      R0.position.copy(rootRest); R0.position.y += (P.lift || 0) + Math.abs(Math.sin(wph)) * 0.006 * wamp;
      // spine arch + sideways curve
      const sp = P.spine || 0, sy = P.spineYaw || 0;
      spine.forEach((b, i) => set(b, sp / 5, sy / 5 + (w ? Math.sin(wph) * 0.02 * wamp : 0), 0));
      // neck and head (compensate the body pitch so he keeps looking at his target)
      const nk = (P.neck || 0) - pitch * 0.55, ny = P.neckYaw || 0;
      neck.forEach(b => set(b, nk / 3, ny / 3, 0));
      set(by.Head, (P.head || 0) - pitch * 0.35, P.headYaw || 0, 0);
      set(by.Jaw, 0.55 * (P.jaw || 0), 0, 0);
      // fore legs (arms)
      for (const s of ['L', 'R']) {
        const L = S2[s], sg = L.sg, arm = (s === 'L' ? P.armL : P.armR) || [0, 0, 0, 0];
        let [raise, out, sweep, elbow] = arm;
        // walking: swing fore and back, the diagonal pairs together
        const lp = wph + (s === 'L' ? 0 : Math.PI), swing = Math.sin(lp) * 0.38 * wamp, lift = Math.max(0, Math.cos(lp)) * 0.5 * wamp;
        raise += swing - pitch * 0.4; elbow += lift;
        L.sh.quaternion.copy(qa(Y, -sweep * sg * 0 + sweep)).multiply(qa(Z, sg * out)).multiply(qa(X, -raise));
        set(L.fa, elbow * 0.9, 0, 0); set(L.wr, -elbow * 0.5 - (raise > 0.6 ? 0.4 : 0), 0, 0);
        const cl = P.claws || 0; L.toes.forEach((t, i) => set(t, -0.3 * cl, (i - 1) * 0.25 * cl * sg, 0));
        // hind legs: walking + crouch, and they stay planted while he rears (counter the body pitch)
        const hp = wph + (s === 'L' ? Math.PI : 0), hs = Math.sin(hp) * 0.32 * wamp, hl = Math.max(0, Math.cos(hp)) * 0.45 * wamp, cr = P.crouch || 0;
        set(L.hip, -pitch - hs - 0.35 * cr, 0, 0); set(L.th, 0.6 * cr + hl, 0, 0); set(L.shin, -0.5 * cr - hl * 0.6, 0, 0); set(L.hock, 0.2 * cr, 0, 0);
        // wings: 0 folded along the back, 1 raised (sculpted), 2 spread out for flight; flap about the body axis
        const wg = P.wings ?? 0.15, f = P.flap || null, fl = f ? Math.sin(f.phase * Math.PI * 2) * (f.amp || 0) : 0;
        const foldK = Math.max(0, 1 - wg), spreadK = Math.max(0, wg - 1);
        set(L.wSh, -1.55 * foldK + 0.25 * spreadK, 0, sg * (0.55 * foldK - 1.25 * spreadK - fl * 0.55));
        set(L.wUp, -0.25 * foldK, 0, sg * (-0.15 * spreadK - fl * 0.2));
        set(L.wFa, 0.6 * foldK - 0.2 * spreadK, 0, sg * (0.5 * foldK - fl * 0.25));
        set(L.wHa, 0.3 * foldK, 0, 0);
        L.fingers.forEach((chain, i) => chain.forEach((b, k) => set(b, k === 0 ? -0.25 * foldK * (i + 1) / 3 + 0.15 * spreadK : 0, 0, k === 0 ? sg * 0.1 * foldK : 0)));
      }
      // tail: a curve to one side, lifted, straightened (curl undone), idle sway
      const ty = P.tailYaw || 0, tl = P.tailLift || 0, tw = P.tailWave || null;
      tail.forEach((b, i) => { const k = (i + 1) / 20, wave = tw ? Math.sin(tw.phase * Math.PI * 2 - k * 4) * 0.05 * (tw.amp || 0) : 0;
        set(b, -tl / 20 * (1.6 - k), ty / 20 * (0.6 + k) + wave, 0); });
      const st = P.tailStraight || 0; curl.forEach((b, i) => set(b, -0.38 * st, 0, 0));
    };
  }
  A.EarthDragon = { loadDragonBytes, makeDragon, SCALE, CACHE };
})();
