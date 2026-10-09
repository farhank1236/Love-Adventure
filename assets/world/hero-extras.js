/* Male Warrior extras (needs portal.js):
   - the blue pocket-dimension portal at his LEFT hip that the sword is drawn out of (right hand) and pushed back into.
     It follows the Sword_Portal track of the Summon / Dismiss clips; the blade is clipped by the portal plane so it really
     comes out of (and goes into) the hole.
   - the 30 s idle: a leather ball drops out of a small portal above him, he plays keepy-uppy, heads it back up into a
     second portal (ball + portals follow the IdleBall clip's extras track).
   - a speech bubble over his head (idle lines, horse lines).
   createHeroExtras({THREE, scene, rig, camera, root}) -> { update(dt), say(kind | text), dispose() } */
(() => {
  const A = window.Aethelos ||= {};
  const LINES = {
    bored: ['Hmm… nobody to fight today?', '*yawn* Even the dragons are napping.', 'I could polish my armour… again.', 'Hello? Anyone need a hero?'],
    watch: ['Pocket dimension, a ball please!', 'Watch this!', 'Bet you can\'t do this!', 'Time for some training…'],
    proud: ['Still got it.', 'Ha! Not a single drop!', 'The kingdom\'s finest… at keepy-uppy.', 'Back you go, little ball.'],
    arrived: ['There you are, old friend!', 'Good boy! Ready to ride?', 'Right on time.'],
    mounted: ['Let\'s ride!', 'Onward!', 'Hyah!'],
    dismounted: ['Wait here, boy.', 'Good run.', 'Rest a while.']
  };
  const pick = a => a[(Math.random() * a.length) | 0];

  function leatherTexture(THREE) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#9a5b2c'; g.fillRect(0, 0, 512, 256);
    const img = g.getImageData(0, 0, 512, 256), d = img.data;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4, n = (Math.random() - 0.5) * 18 + 10 * Math.sin(x * 0.09 + Math.sin(y * 0.13) * 2) * Math.sin(y * 0.07);
      d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.7)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.4));
    }
    g.putImageData(img, 0, 0);
    // stitched panels: six lobes around, a cap at each pole
    g.strokeStyle = '#3a1d0b'; g.lineWidth = 5;
    for (let k = 0; k < 6; k++) { const x0 = k * 512 / 6; g.beginPath(); g.moveTo(x0, 40); g.bezierCurveTo(x0 + 30, 100, x0 - 30, 156, x0, 216); g.stroke(); }
    for (const y of [40, 216]) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    g.strokeStyle = '#e8d6b0'; g.lineWidth = 1.6; g.setLineDash([4, 5]);
    for (let k = 0; k < 6; k++) { const x0 = k * 512 / 6 + 7; g.beginPath(); g.moveTo(x0, 40); g.bezierCurveTo(x0 + 30, 100, x0 - 30, 156, x0, 216); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }

  function createHeroExtras({ THREE, scene, rig, camera, root, sfx }) {
    const ctl = rig.controller, X = rig.extras, IB = X.idleBall;
    const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion();
    // ---------------------------------------------------------------- sword portal (left hip)
    for (const n of ['Portal_Ring', 'Portal_Swirl', 'Portal_Core']) if (rig.fxMeshes[n]) rig.fxMeshes[n].visible = false;
    const spBone = rig.byName.Sword_Portal, holder = new THREE.Group(); holder.name = 'SwordPortalHolder';
    const sp = A.createPortalFX(THREE, scene, { radius: 0.25, aspect: 1.75, sparks: 60, light: false });   // no extra light: every light costs every pixel
    sp.group.rotation.x = -Math.PI / 2;                     // portal faces the bone's -Z (towards the right hand), tall along +Y
    holder.add(sp.group); (spBone ? spBone.parent : rig.root).add(holder);
    const swordPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
    const sword = rig.fxMeshes.HeroSword;
    if (sword) { sword.material.clippingPlanes = [swordPlane]; sword.material.needsUpdate = true; }

    // ---------------------------------------------------------------- idle ball + its two little portals
    const ballPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(IB ? IB.radius : 0.11, 32, 20),
      new THREE.MeshStandardMaterial({ map: leatherTexture(THREE), roughness: 0.62, metalness: 0, clippingPlanes: [ballPlane] }));
    ball.castShadow = true; ball.visible = false; ball.name = 'IdleBall'; rig.root.add(ball);
    const ballPortals = (IB ? IB.portals : []).map(p => {
      const fx = A.createPortalFX(THREE, scene, { radius: 0.2, aspect: 1.0, sparks: 30, light: false });
      fx.group.position.fromArray(p.center);
      fx.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v1.fromArray(p.normal).normalize());
      rig.root.add(fx.group); return { fx, p };
    });
    const interp = (pairs, t) => { if (!pairs.length) return 0; if (t <= pairs[0][0]) return pairs[0][1];
      for (let i = 1; i < pairs.length; i++) if (t <= pairs[i][0]) { const [t0, a] = pairs[i - 1], [t1, b] = pairs[i], u = (t - t0) / Math.max(1e-6, t1 - t0); const s = u * u * (3 - 2 * u); return a + (b - a) * s; }
      return pairs[pairs.length - 1][1]; };
    let lastIdleT = -1, spin = new THREE.Vector3();

    // ---------------------------------------------------------------- speech bubble
    if (!document.getElementById('heroSayCss')) { const st = document.createElement('style'); st.id = 'heroSayCss'; st.textContent = `
      .heroSay { position: absolute; left: 0; top: 0; z-index: 12; pointer-events: none; max-width: 230px; padding: 9px 14px 10px; border-radius: 16px;
        background: #fffaf0; color: #2a2033; font: 700 15px/1.3 'Fredoka', 'Nunito', system-ui, sans-serif; letter-spacing: .01em;
        box-shadow: 0 6px 18px rgba(10, 14, 30, .35), 0 0 0 2px rgba(42, 32, 51, .85); opacity: 0; transform: translate(-50%, -100%) scale(.85);
        transition: opacity .18s ease, transform .22s cubic-bezier(.3, 1.6, .5, 1); white-space: normal; text-align: center; }
      .heroSay::after { content: ''; position: absolute; left: 50%; bottom: -9px; width: 16px; height: 16px; margin-left: -8px; background: #fffaf0;
        transform: rotate(45deg); box-shadow: 2px 2px 0 0 rgba(42, 32, 51, .85); border-radius: 0 0 4px 0; }
      .heroSay.show { opacity: 1; transform: translate(-50%, -100%) scale(1); }`; document.head.appendChild(st); }
    const bubble = document.createElement('div'); bubble.className = 'heroSay'; bubble.setAttribute('role', 'status'); (root || document.body).appendChild(bubble);
    let sayT = 0;
    function say(kind) {
      const text = LINES[kind] ? pick(LINES[kind]) : String(kind || ''); if (!text) return;
      bubble.textContent = text; bubble.classList.add('show'); sayT = Math.max(2.4, 1.2 + text.length * 0.06);
    }
    const head = rig.byName.Head;
    function placeBubble() {
      if (!head || sayT <= 0) return;
      head.getWorldPosition(v1); v1.y += 0.55; v1.project(camera);
      const host = bubble.parentElement, w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
      if (v1.z > 1) { bubble.style.visibility = 'hidden'; return; }
      bubble.style.visibility = '';
      bubble.style.left = ((v1.x * 0.5 + 0.5) * w).toFixed(1) + 'px'; bubble.style.top = ((-v1.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
    }

    const grip = rig.byName.Sword_Grip, snd = { portal: false, grip: false, vy: 0 };
    function update(dt) {
      if (sword && grip) sword.visible = grip.scale.y > 0.02;          // a stored sword is not drawn at all
      // sounds: the left-hip portal opening, the blade drawn out / pushed back in
      if (sfx) { const op = spBone ? spBone.scale.x > 0.3 : false, gv = grip ? grip.scale.y > 0.5 : false;
        if (op && !snd.portal) sfx('portal', null, { vol: 0.45 }); if (gv && !snd.grip && op) sfx('shing'); if (!gv && snd.grip && op) sfx('swordIn');
        snd.portal = op; snd.grip = gv; }
      // sword portal: follow the clip's portal track, open amount = its scale
      if (spBone) {
        holder.position.copy(spBone.position); holder.quaternion.copy(spBone.quaternion);
        const open = spBone.scale.x > 0.01 ? Math.min(1, spBone.scale.x) : 0;
        sp.setOpen(open); sp.update(dt);
        if (open > 0.02) { spBone.updateWorldMatrix(true, false); spBone.getWorldPosition(v1); spBone.getWorldQuaternion(q1);
          swordPlane.setFromNormalAndCoplanarPoint(v2.set(0, 0, -1).applyQuaternion(q1), v1); }
        else { swordPlane.normal.set(0, 1, 0); swordPlane.constant = 1e6; }
      }
      // idle ball
      const t = ctl.idleFunTime;
      if (IB && t >= 0) {
        const f = t * IB.fps, i = Math.min(IB.ball.length - 2, Math.floor(f)), u = Math.min(1, f - i);
        const a = IB.ball[i], b = IB.ball[i + 1];
        const prev = v2.copy(ball.position);
        ball.position.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
        ball.visible = !!IB.vis[Math.round(f) < IB.vis.length ? Math.round(f) : IB.vis.length - 1];
        { const vy = (b[1] - a[1]); if (sfx && ball.visible && snd.vy < -1e-4 && vy > 1e-4) sfx('kick', null, { vol: 0.8 }); snd.vy = vy; }
        // roll / spin with the motion
        if (lastIdleT >= 0 && dt > 0) { const vel = prev.sub(ball.position).multiplyScalar(-1 / dt), sp_ = vel.length();
          if (sp_ > 0.05) { spin.set(vel.z, 0, -vel.x).normalize(); ball.rotateOnWorldAxis(spin.lengthSq() ? spin : v1.set(1, 0, 0), sp_ * dt / IB.radius * 0.35); } }
        // talk cues
        for (const [ct, kind] of IB.talk) if (lastIdleT < ct && t >= ct) say(kind);
        lastIdleT = t;
        let clipAt = null;
        for (const bp of ballPortals) { const o = interp(bp.p.opens, t); bp.fx.setOpen(o); bp.fx.update(dt); if (o > 0.05) clipAt = bp; }
        if (clipAt) { rig.root.updateWorldMatrix(true, false); v1.fromArray(clipAt.p.center).applyMatrix4(rig.root.matrixWorld);
          rig.root.getWorldQuaternion(q1); ballPlane.setFromNormalAndCoplanarPoint(v2.fromArray(clipAt.p.normal).applyQuaternion(q1).normalize(), v1); }
        else { ballPlane.normal.set(0, 1, 0); ballPlane.constant = 1e6; }
      } else if (lastIdleT >= 0 || ball.visible) { lastIdleT = -1; ball.visible = false; for (const bp of ballPortals) bp.fx.setOpen(0); }
      // bubble
      if (sayT > 0) { sayT -= dt; if (sayT <= 0) bubble.classList.remove('show'); placeBubble(); }
    }
    function dispose() { sp.dispose(); holder.parent && holder.parent.remove(holder); ballPortals.forEach(b => b.fx.dispose()); ball.parent && ball.parent.remove(ball); ball.geometry.dispose(); ball.material.map.dispose(); ball.material.dispose(); bubble.remove(); }
    return { update, say, dispose, ball, swordPortal: sp };
  }
  A.createHeroExtras = createHeroExtras; A.HeroLines = LINES;
})();
