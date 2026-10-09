/* Red Birds: the weakest enemy of Aethelos (one hit kills them), met in flocks of 6-18.
   - Flying flocks roam their patch of sky 8-13 m up. When they see the hero (40 m) they hunt him: the flock circles
     above him and sends birds in PAIRS. A pair takes up a formation on his left and right, hovers and locks on
     (a red aura grows on them, they screech, a red ring marks the locked spot), then both dash in a straight line.
       hit  -> 10% of the hero's health, the bird bounces off and rejoins the flock
       miss (dodge roll, or he simply moved) -> the bird cannot pull out: it slams into the ground and dies
   - Ground flocks peck at the grass in their meadow and ignore the hero. Strike one of them (sword or sonic boom) and
     the whole group takes off and hunts him like a flying flock. They settle back on their meadow when the hunt ends.
   - At night the flying flocks roost on the ground (they wake at dawn).
   - They never enter the city, the palace, the noble houses or Dawnmeadow (guards there): a hunt breaks off at
     their edge.
   - A dead bird comes back to its flock after one game day (24 game hours = 24 real minutes).
   createRedBirds(ctx) -> { load(), update(dt), dispose(), flocks, birds, killCount, debug } */
(() => {
  const A = window.Aethelos ||= {};
  // ---------------------------------------------------------------- where they live
  // air: roam radius r around (x, z); ground: a meadow patch of radius r
  const SITES = [
    { id: 'meadow-west', kind: 'air', x: -95, z: 425, r: 45, n: 6 },        // first flock, just west of Dawnmeadow
    { id: 'meadow-pickers', kind: 'ground', x: 95, z: 300, r: 7, n: 6 },     // first pecking group, east of the King's Way
    { id: 'farm-north', kind: 'air', x: -225, z: 135, r: 70, n: 12 },
    { id: 'farm-fields', kind: 'ground', x: -305, z: 265, r: 8, n: 8 },
    { id: 'riverside', kind: 'ground', x: -112, z: 238, r: 7, n: 6 },
    { id: 'silver-banks', kind: 'air', x: -160, z: 330, r: 55, n: 10 },
    { id: 'east-plains', kind: 'air', x: 205, z: 95, r: 60, n: 8 },
    { id: 'pine-clearing', kind: 'air', x: 310, z: 265, r: 60, n: 9 },
    { id: 'pine-meadow', kind: 'ground', x: 405, z: 118, r: 8, n: 7 },
    { id: 'south-wilds', kind: 'air', x: 255, z: 455, r: 55, n: 6 },
    { id: 'south-pickers', kind: 'ground', x: 160, z: 470, r: 7, n: 6 },
    { id: 'west-moors', kind: 'air', x: -300, z: -205, r: 70, n: 18 },
    { id: 'pass-foothills', kind: 'air', x: 135, z: -330, r: 60, n: 14 },
    { id: 'pass-meadow', kind: 'ground', x: 185, z: -205, r: 8, n: 9 }
  ];
  const SAFE = ['dawnmeadow', 'palace', 'city', 'aldmere', 'brenmoor', 'varkhold'];
  const SEE = 40, LEASH = 120, ACTIVE_R = 175, DASH_SPEED = 21, DAMAGE = 0.10, RESPAWN_H = 24;

  function createRedBirds(ctx) {
    const { THREE, scene, world, player, camera, sfx, showToast } = ctx;
    const L = A.Layout, ground = (x, z) => world.terrain.heightAt(x, z);
    const safeZones = L.REGIONS.filter(r => SAFE.includes(r.id)).map(r => ({ x: r.x, z: r.z, r: r.r + 18 }));
    const inSafe = (x, z, pad = 0) => safeZones.some(s => Math.hypot(x - s.x, z - s.z) < s.r + pad);
    const gameHours = () => world.sky ? world.sky.day * 24 + world.sky.hour : performance.now() / 60000;
    const isNight = () => { const h = world.sky ? world.sky.hour : 12; return h >= 20.5 || h < 5.5; };
    const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const rand = (a, b) => a + Math.random() * (b - a);
    let asset = null, loading = null, kills = 0, frame = 0;

    // ---------------------------------------------------------------- shared FX: aura sprite, lock ring, feathers
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,60,40,1)'); gr.addColorStop(0.35, 'rgba(255,20,10,.55)'); gr.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const auraMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const starMat = new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.translate(16, 16); g.fillStyle = '#ffe36a'; g.strokeStyle = '#8a5a00'; g.lineWidth = 2;
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6 : 14; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), transparent: true, depthWrite: false });
    const ringGeo = new THREE.RingGeometry(0.62, 0.8, 40); ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    // feathers: one Points cloud, recycled
    const FN = 360, fPos = new Float32Array(FN * 3), fCol = new Float32Array(FN * 3), fVel = new Float32Array(FN * 3), fLife = new Float32Array(FN);
    const fGeo = new THREE.BufferGeometry(); fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3)); fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
    const featherTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.translate(16, 16); g.rotate(0.6);
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, 5, 13, 0, 0, Math.PI * 2); g.fill(); const t = new THREE.CanvasTexture(c); return t; })();
    const fMat = new THREE.PointsMaterial({ size: 0.22, map: featherTex, vertexColors: true, transparent: true, alphaTest: 0.3, depthWrite: true });
    const feathers = new THREE.Points(fGeo, fMat); feathers.frustumCulled = false; scene.add(feathers);
    for (let i = 0; i < FN; i++) fPos[i * 3 + 1] = -999;
    let fNext = 0;
    function puff(p, n = 18, speed = 2.5) {
      for (let k = 0; k < n; k++) { const i = fNext; fNext = (fNext + 1) % FN;
        fPos[i * 3] = p.x; fPos[i * 3 + 1] = p.y; fPos[i * 3 + 2] = p.z;
        fVel[i * 3] = rand(-1, 1) * speed; fVel[i * 3 + 1] = rand(0.2, 1.4) * speed; fVel[i * 3 + 2] = rand(-1, 1) * speed; fLife[i] = rand(1.6, 2.8);
        const w = Math.random(); fCol[i * 3] = 0.85 + 0.15 * w; fCol[i * 3 + 1] = 0.12 + 0.35 * w * w; fCol[i * 3 + 2] = 0.06 + 0.1 * w; }
      fGeo.attributes.color.needsUpdate = true;
    }
    function updateFeathers(dt) {
      let any = false;
      for (let i = 0; i < FN; i++) { if (fLife[i] <= 0) continue; any = true; fLife[i] -= dt;
        fVel[i * 3] *= 1 - 2.2 * dt; fVel[i * 3 + 2] *= 1 - 2.2 * dt; fVel[i * 3 + 1] = Math.max(-0.7, fVel[i * 3 + 1] - 6 * dt);     // feathers drift down slowly
        fPos[i * 3] += (fVel[i * 3] + Math.sin(fLife[i] * 5 + i) * 0.4) * dt; fPos[i * 3 + 1] += fVel[i * 3 + 1] * dt; fPos[i * 3 + 2] += fVel[i * 3 + 2] * dt;
        const g = ground(fPos[i * 3], fPos[i * 3 + 2]) + 0.03; if (fPos[i * 3 + 1] < g) { fPos[i * 3 + 1] = g; fVel[i * 3] = fVel[i * 3 + 2] = 0; }
        if (fLife[i] <= 0) fPos[i * 3 + 1] = -999; }
      if (any) fGeo.attributes.position.needsUpdate = true;
    }

    // ---------------------------------------------------------------- HUD: popups, red feathers, warnings for attacks from off-screen
    const root = ctx.root;
    if (root && !document.getElementById('birdHudCss')) { const st = document.createElement('style'); st.id = 'birdHudCss'; st.textContent = `
      #battlePop { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%) scale(.6); z-index: 33; pointer-events: none; opacity: 0;
        font: 800 34px/1 'Fredoka', 'Nunito', system-ui, sans-serif; letter-spacing: .06em; color: #fff3d0; text-shadow: 0 0 14px rgba(255, 120, 40, .9), 0 2px 3px #000; transition: opacity .25s, transform .25s; }
      #battlePop.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      #battlePop.counter { color: #ffffff; text-shadow: 0 0 18px #6fd0ff, 0 0 4px #2a8cff, 0 2px 3px #000; font-size: 40px; }
      #featherCount { position: absolute; left: 18px; bottom: 46px; z-index: 31; display: flex; align-items: center; gap: 6px; pointer-events: none;
        font: 700 13px 'Fredoka', 'Nunito', system-ui, sans-serif; color: #ffe2c8; text-shadow: 0 1px 2px #000; transition: transform .2s; }
      #featherCount.bump { transform: scale(1.25); }
      #featherCount svg { width: 20px; height: 20px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
      body.touch-ui #featherCount { left: calc(12px + var(--sl, 0px)); top: calc(76px + var(--st, 0px)); bottom: auto; }
      .birdWarn { position: absolute; width: 0; height: 0; z-index: 32; pointer-events: none; display: none; }
      .birdWarn i { position: absolute; left: -16px; top: -16px; width: 32px; height: 32px; border-radius: 50%; background: radial-gradient(circle, rgba(255, 40, 20, .85), rgba(255, 40, 20, 0) 70%); animation: bwPulse .35s ease-in-out infinite alternate; }
      .birdWarn b { position: absolute; left: 6px; top: -9px; width: 0; height: 0; border-left: 16px solid #ff3a22; border-top: 9px solid transparent; border-bottom: 9px solid transparent; filter: drop-shadow(0 0 4px #ff2a10); }
      @keyframes bwPulse { to { transform: scale(1.35); } }`; document.head.appendChild(st); }
    const popEl = root ? Object.assign(document.createElement('div'), { id: 'battlePop' }) : null; popEl && root.appendChild(popEl);
    function pop(text, kind) { if (!popEl) return; popEl.textContent = text; popEl.className = kind; void popEl.offsetWidth; popEl.classList.add('show'); clearTimeout(pop.t); pop.t = setTimeout(() => popEl.classList.remove('show'), kind === 'counter' ? 900 : 650); }
    const FEATHER_KEY = 'aethelos.redFeathers.v1';
    let featherTotal = 0; try { featherTotal = +localStorage.getItem(FEATHER_KEY) || 0; } catch (_) {}
    const fcEl = root ? document.createElement('div') : null;
    if (fcEl) { fcEl.id = 'featherCount'; fcEl.innerHTML = '<svg viewBox="0 0 32 32"><path d="M26 3C14 5 7 13 6 24l-2 5 2 1 3-5c9-1 16-8 17-22z" fill="#e8402a" stroke="#ffd9b0" stroke-width="1.4"/><path d="M8 26C12 18 17 11 24 6" stroke="#7a1608" stroke-width="1.4" fill="none"/></svg><span></span>';
      root.appendChild(fcEl); const draw = () => { fcEl.querySelector('span').textContent = featherTotal; fcEl.style.display = featherTotal ? 'flex' : 'none'; }; draw(); fcEl.draw = draw; }
    // dropped feathers: a slowly spinning glowing feather, picked up by walking over it (kept for future quests / crafting)
    const pickTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,210,120,.9)'); gr.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      g.translate(32, 32); g.rotate(0.7); g.fillStyle = '#e8402a'; g.beginPath(); g.ellipse(0, 0, 7, 20, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#ffe1b0'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 20); g.lineTo(0, -18); g.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const pickups = [];
    function dropFeather(at) {
      if (Math.random() > 0.6 || pickups.length > 30) return;                         // most birds drop one
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pickTex, transparent: true, depthWrite: false }));
      sp.scale.setScalar(0.6); const g = ground(at.x, at.z); sp.position.set(at.x + rand(-0.4, 0.4), g + 0.55, at.z + rand(-0.4, 0.4)); scene.add(sp);
      pickups.push({ sp, t: 0, base: g + 0.55, delay: 0.8 });
    }
    function updatePickups(dt) {
      const hp = heroPos();
      for (let i = pickups.length - 1; i >= 0; i--) {
        const P = pickups[i]; P.t += dt; P.sp.position.y = P.base + Math.sin(P.t * 2.5) * 0.08; P.sp.material.rotation = Math.sin(P.t * 1.7) * 0.4;
        const life = 45; P.sp.material.opacity = P.t > life - 5 ? Math.max(0, (life - P.t) / 5) : 1;
        const take = P.t > P.delay && Math.hypot(hp.x - P.sp.position.x, hp.z - P.sp.position.z) < 1.6 && Math.abs(hp.y + 0.5 - P.sp.position.y) < 2;
        if (take || P.t > life) {
          if (take) { featherTotal++; try { localStorage.setItem(FEATHER_KEY, String(featherTotal)); } catch (_) {} sfx && sfx('pickup', { at: P.sp.position.clone() });
            if (fcEl) { fcEl.draw(); fcEl.classList.add('bump'); setTimeout(() => fcEl.classList.remove('bump'), 200); } }
          scene.remove(P.sp); P.sp.material.dispose(); pickups.splice(i, 1);
        }
      }
    }
    const warns = root ? [0, 1, 2, 3].map(() => { const w = document.createElement('div'); w.className = 'birdWarn'; w.innerHTML = '<i></i><b></b>'; root.appendChild(w); return w; }) : [];
    const pv = new THREE.Vector3();
    function updateWarnings() {
      if (!root) return; let k = 0; const W = root.clientWidth, H = root.clientHeight;
      for (const b of birds) {
        if (k >= warns.length) break;
        if (!(b.state === 'dash' || (b.state === 'lock' && b.lock && b.lock.aimed))) continue;
        pv.copy(b.pos).project(camera); const behind = pv.z > 1; let x = pv.x, y = pv.y;
        if (!behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.85) continue;            // on screen: the aura says it all
        if (behind) { x = -x; y = -y; }
        const a = Math.atan2(y, x), m = Math.max(Math.abs(Math.cos(a)) / 0.88, Math.abs(Math.sin(a)) / 0.8);
        const w = warns[k++]; w.style.display = 'block'; w.style.left = ((Math.cos(a) / m) * 0.5 + 0.5) * W + 'px'; w.style.top = ((-Math.sin(a) / m) * 0.5 + 0.5) * H + 'px';
        w.style.transform = `rotate(${-a}rad)`;
      }
      for (; k < warns.length; k++) warns[k].style.display = 'none';
    }

    // ---------------------------------------------------------------- flocks and birds
    const flocks = [], birds = [];
    for (const site of SITES) {
      const F = { site, home: new THREE.Vector3(site.x, ground(site.x, site.z), site.z), center: new THREE.Vector3(site.x, ground(site.x, site.z) + 10, site.z),
        cvel: new THREE.Vector3(), roamTo: new THREE.Vector3(site.x, 0, site.z), mode: site.kind === 'air' ? 'roam' : 'grounded', active: false, birds: [],
        spin: Math.random() < 0.5 ? 1 : -1, pairCD: 2, calm: 0, attackers: [], lastSeen: 0, roost: false, chirpT: rand(1, 4) };
      F.patch = site.kind === 'ground' ? F.home.clone() : findPatch(site.x, site.z, site.r * 0.6);
      for (let i = 0; i < site.n; i++) {
        const b = { F, i, rig: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: Math.random() * 6.28, state: 'fly', t: 0, alive: true, respawnAt: 0,
          phase: Math.random(), rate: rand(3.6, 4.4), amp: 1, glide: 0, pitch: 1.25, roll: 0, fold: 0, sweep: 0, tuck: 1, peck: 0, jaw: 0, headYaw: 0, tail: 0, lean: 0.15, limp: 0,
          orbit: { a: (i / site.n) * Math.PI * 2 + rand(-0.3, 0.3), r: rand(3.5, 8.5), h: rand(-1.6, 1.6), w: rand(0.45, 0.75), bob: Math.random() * 6 },
          spot: new THREE.Vector3(), aura: 0, lock: null, dash: null, hitDone: false, target: null, deadT: 0, spinV: new THREE.Vector3(), hopT: rand(1, 4), peckT: rand(0, 3), lookT: 0, hop: null };
        b.combat = { position: b.pos, radius: 0.6, dead: true, onHit: (dmg, dir, src) => kill(b, dir, src) };
        b.unreg = A.Combat ? A.Combat.register(b.combat) : () => {};
        F.birds.push(b); birds.push(b);
      }
      placeFlock(F, true);
      flocks.push(F);
    }
    function findPatch(x, z, r) {                     // a dry, flat spot near (x, z) for landing / roosting
      for (let k = 0; k < 40; k++) { const a = Math.random() * 6.28, d = k === 0 ? 0 : Math.random() * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        const w = world.terrain.waterAt(px, pz); if ((w && w.depth > 0) || world.terrain.roadAt(px, pz) || world.terrain.slopeAt(px, pz) > 0.45 || inSafe(px, pz)) continue;
        return new THREE.Vector3(px, ground(px, pz), pz); }
      return new THREE.Vector3(x, ground(x, z), z);
    }
    function spotFor(F, b) {                          // each bird's own place on the meadow
      for (let k = 0; k < 20; k++) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * F.site.r, x = F.patch.x + Math.cos(a) * d, z = F.patch.z + Math.sin(a) * d;
        const w = world.terrain.waterAt(x, z); if (w && w.depth > 0) continue; if (world.collide && world.collide.resolve(x, z, 0.3, ground(x, z), 1)[2]) continue;
        return b.spot.set(x, ground(x, z), z); }
      return b.spot.copy(F.patch);
    }
    function placeFlock(F, fresh) {
      for (const b of F.birds) { if (!b.alive) continue; if (F.mode === 'grounded') toGround(b, true); else { orbitPos(F, b, v1); b.pos.copy(v1); b.state = 'fly'; b.vel.set(0, 0, 0); } }
    }
    function toGround(b, snap) {
      spotFor(b.F, b); b.state = 'ground'; b.t = 0; b.amp = 0; b.fold = 1; b.pitch = 0; b.tuck = 0; b.vel.set(0, 0, 0); b.aura = 0;
      if (snap) b.pos.copy(b.spot);
    }
    function orbitPos(F, b, out) {
      const o = b.orbit, hunt = F.mode === 'hunt';
      const r = o.r * (hunt ? 1.05 : 1), h = o.h + Math.sin(o.bob) * 0.6;
      return out.set(F.center.x + Math.cos(o.a) * r, F.center.y + h, F.center.z + Math.sin(o.a) * r);
    }

    // ---------------------------------------------------------------- model instances (made when a flock first comes near)
    function ensureRig(b) {
      if (b.rig || !asset) return b.rig;
      const r = A.RedBird.makeBird(THREE, asset); r.root.visible = false; scene.add(r.root);
      const aura = new THREE.Sprite(auraMat.clone()); aura.scale.setScalar(1.9); aura.position.set(0, 0.33, 0); r.root.add(aura); r.aura = aura;
      const ring = new THREE.Mesh(ringGeo, ringMat.clone()); ring.visible = false; scene.add(ring); r.ring = ring;
      const stars = new THREE.Group(); for (let i = 0; i < 3; i++) { const sp = new THREE.Sprite(starMat); sp.scale.setScalar(0.16); const a = i / 3 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22); stars.add(sp); }
      stars.visible = false; scene.add(stars); r.stars = stars;
      b.rig = r; return r;
    }
    async function load() {
      if (loading) return loading;
      loading = (async () => { asset = A.RedBird.createBirdAsset(THREE, await A.RedBird.loadBirdBytes()); await asset.textureReady; return asset; })().catch(e => { loading = null; throw e; });
      return loading;
    }

    // ---------------------------------------------------------------- hero helpers
    const heroFeet = new THREE.Vector3();
    function heroPos() { const r = ctx.hero && ctx.hero(); if (r && r.root) { r.root.updateWorldMatrix(true, false); r.root.getWorldPosition(heroFeet); return heroFeet; } return heroFeet.copy(player.position); }
    const heroDead = () => !!(ctx.health && ctx.health.dead);
    const heroInvulnerable = () => { const c = ctx.controller && ctx.controller(); return !!(c && c.dodging) || heroDead(); };

    // ---------------------------------------------------------------- deaths
    let streak = 0, streakT = 0;
    function kill(b, dir, src) {
      if (!b.alive || b.state === 'dead') return false;
      const counter = src === 'sword' && (b.state === 'dash' || (b.state === 'lock' && b.lock && b.lock.aimed));
      const wasStunned = b.state === 'stunned' || b.state === 'getup';
      const F = b.F; b.state = 'dead'; b.deadT = 0; b.aura = 0; b.lock = b.dash = null; b.combat.dead = true; kills++;
      F.attackers = F.attackers.filter(x => x !== b);
      const d = dir ? v1.copy(dir).setY(0).normalize() : v1.set(Math.sin(b.yaw), 0, Math.cos(b.yaw)).negate();
      b.vel.set(d.x * 5.5, src === 'crash' ? 1.2 : 3.2, d.z * 5.5);
      b.spinV.set(rand(-9, 9), rand(-6, 6), rand(-9, 9));
      if (b.rig) b.rig.ring.visible = false;
      puff(v2.copy(b.pos), src === 'crash' ? 14 : 22, src === 'crash' ? 1.8 : 3);
      sfx && sfx(src === 'crash' ? 'birdCrash' : 'birdHit', { at: b.pos.clone() });
      dropFeather(b.pos);
      streak = streakT > 0 ? streak + 1 : 1; streakT = 4;
      if (counter) { pop('COUNTER!', 'counter'); sfx && sfx('counter', { at: b.pos.clone() }); }
      else if (streak >= 2) pop('x' + streak, 'streak');
      ctx.onKill && ctx.onKill({ counter, stunned: wasStunned, src, streak, at: b.pos.clone() });
      provoke(F);                                      // the whole group turns on him
      return true;
    }
    // missed dash: it hits the ground hard and lies dazed, then gets up and flies back (finish it off meanwhile)
    const STUN = 3.4;
    function stun(b, dir) {
      const F = b.F; F.attackers = F.attackers.filter(x => x !== b);
      b.state = 'stunned'; b.t = 0; b.aura = 0; b.lock = b.dash = null; b.limp = 0;
      b.vel.set(dir.x * 3.2, 2.4, dir.z * 3.2); b.spinV.set(rand(-8, 8), rand(-4, 4), rand(-8, 8));
      if (b.rig) b.rig.ring.visible = false;
      puff(v2.copy(b.pos), 12, 1.6); sfx && sfx('birdCrash', { at: b.pos.clone() });
      setTimeout(() => sfx && b.state === 'stunned' && sfx('dizzy', { at: b.pos.clone() }), 500);
    }
    function provoke(F) {
      if (F.mode === 'hunt' || heroDead()) return;
      F.calm = 0; F.lastSeen = 0;
      if (F.mode === 'grounded' || F.mode === 'land') { F.mode = 'hunt'; for (const b of F.birds) if (b.alive && (b.state === 'ground' || b.state === 'land')) startTakeoff(b); }
      else F.mode = 'hunt';
      F.pairCD = Math.min(F.pairCD, 1.4);
      F.center.y = Math.max(F.center.y, ground(F.center.x, F.center.z) + 7);
    }
    function startTakeoff(b) { b.state = 'takeoff'; b.t = -Math.random() * 0.5; b.vel.set(rand(-1, 1), 0, rand(-1, 1)); sfx && Math.random() < 0.4 && sfx('squawk', { at: b.pos.clone(), arg: 0.7 }); }

    // ---------------------------------------------------------------- sword hits (the hero controller's hit frames)
    function swordHit(d) {
      const c = ctx.controller && ctx.controller(); const hp = heroPos(), fy = player.rotation.y, fx = Math.sin(fy), fz = Math.cos(fy);
      const upStab = d && d.kind === 'up', reach = upStab ? 3.0 : 2.7, top = upStab ? 4.3 : 2.9;
      let n = 0;
      for (const b of birds) {
        if (!b.alive || b.state === 'dead' || b.state === 'gone') continue;
        const dx = b.pos.x - hp.x, dz = b.pos.z - hp.z, dist = Math.hypot(dx, dz), dy = b.pos.y - hp.y;
        const dashing = b.state === 'dash';
        if (dist > reach + (dashing ? 0.7 : 0) || dy < -0.6 || dy > top + (dashing ? 0.4 : 0)) continue;
        if (dist > 1.1 && (dx * fx + dz * fz) / dist < Math.cos((dashing ? 88 : 75) * Math.PI / 180)) continue;
        kill(b, v1.set(dx, 0, dz), 'sword'); n++;
      }
      return n;
    }

    /* the bird the sword should swing at: a diving one first (counter), then dazed / ground ones and low fliers in reach,
       preferring what is in front of him. Returns the bird or null. */
    function aimTarget(from, yaw, range = 6.5) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw); let best = null, bs = Infinity;
      for (const b of birds) {
        if (!b.alive || b.state === 'dead' || b.state === 'gone') continue;
        const dx = b.pos.x - from.x, dz = b.pos.z - from.z, d = Math.hypot(dx, dz), dy = b.pos.y - from.y;
        const dashing = b.state === 'dash' || (b.state === 'lock' && b.lock && b.lock.aimed);
        if (d > (dashing ? 11 : range) || dy > (dashing ? 6 : 3.2) || dy < -1.5) continue;
        const cos = d > 0.01 ? (dx * fx + dz * fz) / d : 1, score = d * (1.6 - 0.6 * cos) * (dashing ? 0.35 : b.state === 'stunned' ? 0.7 : 1);
        if (score < bs) { bs = score; best = b; }
      }
      return best;
    }

    // ---------------------------------------------------------------- flock brain
    function updateFlock(F, dt) {
      const hp = heroPos(), dH = Math.hypot(hp.x - F.center.x, hp.z - F.center.z), heroSafe = inSafe(hp.x, hp.z, -4);
      const alive = F.birds.filter(b => b.alive && b.state !== 'dead' && b.state !== 'gone');
      // respawns (one game day after death), only while nobody is looking closely
      const now = gameHours();
      for (const b of F.birds) if (b.state === 'gone' && now >= b.respawnAt) revive(b);
      const night = isNight();
      // ---- mode changes
      if (F.mode === 'roam' && F.site.kind === 'air' && night) { F.mode = 'land'; F.roost = true; }
      if (F.mode === 'land' && F.roost && !night) { F.mode = 'roam'; F.roost = false; for (const b of F.birds) if (b.state === 'land') b.state = 'fly'; }
      if (F.mode === 'grounded' && F.roost && !night) { F.mode = 'roam'; F.roost = false; for (const b of F.birds) if (b.alive && b.state === 'ground') startTakeoff(b); }
      if ((F.mode === 'roam') && !heroDead() && !heroSafe && alive.length && dH < SEE && Math.abs(hp.y - F.center.y) < 30) { F.mode = 'hunt'; F.pairCD = 1.2; sfx && sfx('squawk', { at: F.center.clone() }); }
      if (F.mode === 'hunt') {
        const away = Math.hypot(hp.x - F.home.x, hp.z - F.home.z) > F.site.r + LEASH;
        if (heroDead() || heroSafe || away || !alive.length) { F.mode = 'return'; F.attackers.forEach(b => endAttack(b)); F.attackers = []; }
      }
      if (F.mode === 'return') {
        v1.set(F.home.x, 0, F.home.z); const dd = Math.hypot(F.center.x - v1.x, F.center.z - v1.z);
        if (dd < 12) { if (F.site.kind === 'ground' || night) { F.mode = 'land'; F.roost = F.site.kind === 'air'; } else F.mode = 'roam'; }
      }
      if (F.mode === 'land' && alive.length && alive.every(b => b.state === 'ground')) F.mode = 'grounded';
      // ---- where the flock centre wants to be
      let tx, tz, ty, speed;
      if (F.mode === 'hunt') { tx = hp.x; tz = hp.z; ty = hp.y + 7.5; speed = 12; }
      else if (F.mode === 'return' || F.mode === 'land' || F.mode === 'grounded') { tx = F.patch.x; tz = F.patch.z; ty = ground(tx, tz) + 8; speed = 8; }
      else {                                            // roam: wander between random points of its patch of sky
        if (Math.hypot(F.center.x - F.roamTo.x, F.center.z - F.roamTo.z) < 6) { for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28, d = Math.random() * F.site.r;
          F.roamTo.set(F.site.x + Math.cos(a) * d, 0, F.site.z + Math.sin(a) * d); if (!inSafe(F.roamTo.x, F.roamTo.z, 10)) break; } }
        tx = F.roamTo.x; tz = F.roamTo.z; ty = ground(tx, tz) + 10.5 + Math.sin(performance.now() / 5000 + F.site.x) * 2; speed = 4.5;
      }
      // never into the guarded areas
      for (const s of safeZones) { const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz); if (d < s.r + 6) { tx = s.x + dx / (d || 1) * (s.r + 6); tz = s.z + dz / (d || 1) * (s.r + 6); } }
      ty = Math.max(ty, ground(F.center.x, F.center.z) + 6);
      v1.set(tx - F.center.x, ty - F.center.y, tz - F.center.z); const dl = v1.length();
      if (dl > 0.01) v1.multiplyScalar(Math.min(speed, dl * 1.2) / dl);
      F.cvel.lerp(v1, Math.min(1, dt * 1.5)); F.center.addScaledVector(F.cvel, dt);
      // ---- attacks: one pair at a time, in formation
      if (F.mode === 'hunt') {
        F.pairCD -= dt; F.attackers = F.attackers.filter(b => b.alive && (b.state === 'lock' || b.state === 'dash'));
        if (F.pairCD <= 0 && !F.attackers.length && !heroDead()) {
          const ready = alive.filter(b => b.state === 'fly').sort((a, b2) => a.pos.distanceToSquared(hp) - b2.pos.distanceToSquared(hp));
          if (ready.length >= 1) {
            const base = Math.atan2(F.center.x - hp.x, F.center.z - hp.z), pair = ready.slice(0, ready.length >= 2 ? 2 : 1), shared = { t: 0, armed: false };
            pair.forEach((b, k) => startLock(b, base + (k === 0 ? 0.95 : -0.95) * (pair.length > 1 ? 1 : 0), shared, k));
            F.attackers = pair; F.pairCD = rand(2.2, 3.6) + (alive.length < 4 ? 1 : 0);
          }
        }
      }
      // ---- chirps from pecking groups
      if (F.mode === 'grounded' && dH < 30 && (F.chirpT -= dt) < 0) { F.chirpT = rand(1.5, 4.5); const b = alive[(Math.random() * alive.length) | 0]; b && sfx && sfx('chirp', { at: b.pos.clone(), vol: 0.7 }); }
    }
    function revive(b) {
      const F = b.F; b.alive = true; b.limp = 0; b.state = 'fly'; b.aura = 0;
      if (F.mode === 'grounded' || F.mode === 'land') toGround(b, true); else { orbitPos(F, b, b.pos); b.vel.set(0, 0, 0); }
      if (b.rig) { b.rig.root.scale.setScalar(1); b.rig.root.visible = false; }
    }

    // ---------------------------------------------------------------- the attack
    function startLock(b, ang, shared, k) {
      b.state = 'lock'; b.t = 0; b.hitDone = false; b.lock = { ang, shared, k, aimed: false, point: new THREE.Vector3(), from: new THREE.Vector3() };
    }
    function endAttack(b) { if (b.state === 'lock' || b.state === 'dash') { b.state = 'fly'; b.lock = b.dash = null; } if (b.rig) b.rig.ring.visible = false; }
    function updateAttack(b, dt) {
      const hp = heroPos(), Lk = b.lock;
      if (b.state === 'lock') {
        b.t += dt; const sh = Lk.shared;
        // formation spot: 9 m out on his left / right, 4.2 m up
        const px = hp.x + Math.sin(Lk.ang) * 9, pz = hp.z + Math.cos(Lk.ang) * 9, py = Math.max(hp.y + 4.2, ground(px, pz) + 2.5);
        v1.set(px - b.pos.x, py - b.pos.y, pz - b.pos.z); const d = v1.length();
        if (!Lk.aimed) {
          steer(b, v1, Math.min(15, d * 2.2), dt, 3.5);
          if (d < 1.2 || b.t > 1.7) { Lk.aimed = true; b.t = 0; if (Lk.k === 0) sfx && sfx('screech', { at: b.pos.clone() }); }
          b.aura = Math.max(0, b.aura - dt);
        } else {
          steer(b, v1, Math.min(6, d * 3), dt, 6);          // hover in place
          b.aura = Math.min(1, b.aura + dt * 1.5);
          if (b.t < 0.6) Lk.point.set(hp.x, hp.y + 1.05, hp.z);   // tracks him, then the lock freezes
          if (b.rig) { const R = b.rig.ring; R.visible = b.t >= 0.6; R.position.set(Lk.point.x, ground(Lk.point.x, Lk.point.z) + 0.06, Lk.point.z);
            R.scale.setScalar(1.4 - 0.4 * Math.min(1, (b.t - 0.6) / 0.35)); R.material.opacity = 0.5 + 0.2 * Math.sin(b.t * 30); }
          if (b.t >= 0.95 + Lk.k * 0.12) {                  // both dash, the second a beat later: a crossing formation
            b.state = 'dash'; b.t = 0; b.dash = { dir: v2.copy(Lk.point).sub(b.pos).normalize().clone(), start: b.pos.clone(), len: b.pos.distanceTo(Lk.point) };
            b.vel.copy(b.dash.dir).multiplyScalar(DASH_SPEED); sfx && sfx('dash', { at: b.pos.clone() });
          }
        }
        return;
      }
      if (b.state === 'dash') {
        const D = b.dash; b.t += dt; b.aura = 1;
        b.pos.addScaledVector(b.vel, dt);
        // hit test: the hero is a capsule from his knees to his head
        const top = v3.copy(hp).setY(hp.y + 1.7), dist = segDist(b.pos, v2.copy(hp).setY(hp.y + 0.35), top);
        if (!b.hitDone && dist < 0.85 && !heroInvulnerable()) {
          b.hitDone = true; ctx.onHeroHit && ctx.onHeroHit(DAMAGE, b.vel.clone().setY(0).normalize(), b.pos.clone());
          sfx && sfx('squawk', { at: b.pos.clone(), arg: 1.2 });
          b.state = 'recover'; b.t = 0; b.vel.set(-D.dir.x * 4, 7, -D.dir.z * 4); b.aura = 0; if (b.rig) b.rig.ring.visible = false; return;
        }
        const g = ground(b.pos.x, b.pos.z), travelled = b.pos.distanceTo(D.start);
        const wall = world.collide && travelled > 1 && world.collide.resolve(b.pos.x, b.pos.z, 0.25, b.pos.y - 0.3, 0.6)[2];
        if (b.pos.y <= g + 0.3 || wall) { b.pos.y = Math.max(b.pos.y, g + 0.3); if (b.rig) b.rig.ring.visible = false; stun(b, D.dir); return; }   // missed: it slams into the ground
        if (travelled > D.len + 14) { b.state = 'recover'; b.t = 0; b.vel.set(D.dir.x * 6, 6, D.dir.z * 6); b.aura = 0; if (b.rig) b.rig.ring.visible = false; }
      }
    }
    function segDist(p, a, b) { const ab = v3.copy(b).sub(a), t = Math.max(0, Math.min(1, v1.copy(p).sub(a).dot(ab) / ab.lengthSq())); return v1.copy(a).addScaledVector(ab, t).distanceTo(p); }
    function steer(b, toward, speed, dt, k = 2.5) {
      const l = toward.length(); v2.copy(toward); if (l > 1e-4) v2.multiplyScalar(speed / l); else v2.set(0, 0, 0);
      b.vel.lerp(v2, Math.min(1, dt * k)); b.pos.addScaledVector(b.vel, dt);
    }

    // ---------------------------------------------------------------- one bird
    function updateBird(b, dt, near) {
      const F = b.F;
      if (b.state === 'gone') return;
      if (b.state === 'dead') {                           // tumble, hit the ground, lie still, then vanish in a puff
        b.deadT += dt; const g = ground(b.pos.x, b.pos.z) + 0.17;
        if (b.pos.y > g + 0.01 || b.vel.y > 0) { b.vel.y -= 16 * dt; b.pos.addScaledVector(b.vel, dt);
          if (b.pos.y <= g) { b.pos.y = g; if (Math.abs(b.vel.y) > 3) { b.vel.y *= -0.3; b.vel.x *= 0.5; b.vel.z *= 0.5; } else b.vel.set(0, 0, 0); } }
        b.limp = Math.min(1, b.limp + dt * 3); b.amp = 0; b.aura = 0;
        if (b.deadT > 3.2) { if (b.rig && b.rig.root.visible) puff(v1.copy(b.pos).setY(b.pos.y + 0.2), 10, 1.2); b.state = 'gone'; b.alive = false; b.respawnAt = gameHours() + RESPAWN_H; if (b.rig) b.rig.root.visible = false; }
        return;
      }
      if (b.state === 'stunned') {                       // tumbles, settles on its side, dazed (stars), then gets up
        b.t += dt; const g = ground(b.pos.x, b.pos.z) + 0.17;
        if (b.pos.y > g + 0.01 || b.vel.y > 0) { b.vel.y -= 16 * dt; b.pos.addScaledVector(b.vel, dt);
          if (b.pos.y <= g) { b.pos.y = g; if (Math.abs(b.vel.y) > 3) { b.vel.y *= -0.3; b.vel.x *= 0.5; b.vel.z *= 0.5; } else b.vel.set(0, 0, 0); } }
        b.limp = Math.min(0.75, b.limp + dt * 3);
        if (b.t > STUN) { b.state = 'getup'; b.t = 0; b.limp = 0; b.pos.y = ground(b.pos.x, b.pos.z); b.vel.set(0, 0, 0); sfx && near && sfx('squawk', { at: b.pos.clone(), arg: 0.6 }); }
        return;
      }
      if (b.state === 'getup') { b.t += dt; if (b.t > 0.75) startTakeoff(b); return; }
      if (b.state === 'lock' || b.state === 'dash') { updateAttack(b, dt); if (b.state === 'lock' || b.state === 'dash') { faceAlong(b, dt, b.state === 'lock'); return; } }
      if (b.state === 'recover') {                       // bounced off: climb back to the flock
        b.t += dt; b.vel.y -= 4 * dt; b.pos.addScaledVector(b.vel, dt); b.vel.multiplyScalar(1 - 0.8 * dt);
        if (b.t > 0.9) b.state = 'fly'; faceAlong(b, dt); return;
      }
      if (b.state === 'takeoff') {
        b.t += dt; if (b.t < 0) return;
        b.vel.y = Math.min(6, b.vel.y + 14 * dt); b.vel.x *= 1 - dt; b.vel.z *= 1 - dt; b.pos.addScaledVector(b.vel, dt);
        if (b.t > 1.0) b.state = 'fly'; return;
      }
      if (b.state === 'ground') { updateGround(b, dt, near); return; }
      if (b.state === 'land') {                          // glide down to its own spot, flare, touch down
        b.t += dt; if (b.t > 7) b.pos.copy(b.spot);       // never circle a spot forever
        v1.copy(b.spot).sub(b.pos); const d = v1.length(); steer(b, v1, Math.min(7, 0.8 + d * 1.2), dt, 3);
        if (d < 0.25 || (b.pos.y < b.spot.y + 0.05 && Math.hypot(v1.x, v1.z) < 0.6)) { b.pos.copy(b.spot); b.state = 'ground'; b.t = 0; b.vel.set(0, 0, 0); sfx && near && Math.random() < 0.3 && sfx('chirp', { at: b.pos.clone(), vol: 0.6 }); }
        faceAlong(b, dt); return;
      }
      // fly: follow its orbit around the flock centre
      if (F.mode === 'land' || (F.mode === 'grounded')) { if (b.state === 'fly') { spotFor(F, b); b.state = 'land'; b.t = 0; return; } }
      const o = b.orbit; o.a += o.w * F.spin * dt * (F.mode === 'hunt' ? 1.25 : 1); o.bob += dt * 0.9;
      orbitPos(F, b, v1).sub(b.pos);
      const g = ground(b.pos.x, b.pos.z); if (b.pos.y < g + 2.5) v1.y += (g + 2.5 - b.pos.y) * 2;
      steer(b, v1, Math.min(F.mode === 'hunt' ? 14 : 9.5, v1.length() * 1.6 + 2), dt, 2.2);
      faceAlong(b, dt);
    }
    function faceAlong(b, dt, atHero = false) {
      let tx = b.vel.x, tz = b.vel.z;
      if (atHero) { const hp = heroPos(); tx = hp.x - b.pos.x; tz = hp.z - b.pos.z; }
      if (tx * tx + tz * tz > 0.01) { const want = Math.atan2(tx, tz); let d = want - b.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); b.yaw += d * Math.min(1, dt * 6); b.roll += (-d * 1.4 - b.roll) * Math.min(1, dt * 4); }
    }
    function updateGround(b, dt, near) {
      b.t += dt; const hp = heroPos(), dH = Math.hypot(hp.x - b.pos.x, hp.z - b.pos.z);
      // hop away from someone walking right up (but never fight back unless struck)
      if (!b.hop && dH < (ctx.horseFast && ctx.horseFast() ? 6 : 1.5)) { const a = Math.atan2(b.pos.x - hp.x, b.pos.z - hp.z) + rand(-0.6, 0.6); startHop(b, b.pos.x + Math.sin(a) * rand(0.8, 1.3), b.pos.z + Math.cos(a) * rand(0.8, 1.3), true); }
      if (b.hop) {
        const H = b.hop; H.t += dt; const u = Math.min(1, H.t / H.dur);
        b.pos.lerpVectors(H.from, H.to, u); b.pos.y += Math.sin(Math.PI * u) * H.h;
        b.yaw += Math.atan2(Math.sin(H.yaw - b.yaw), Math.cos(H.yaw - b.yaw)) * Math.min(1, dt * 12);
        if (u >= 1) { b.hop = null; b.pos.copy(H.to); }
        return;
      }
      b.hopT -= dt; b.peckT -= dt; b.lookT -= dt;
      if (b.hopT < 0) { b.hopT = rand(2, 6); const a = b.yaw + rand(-1.4, 1.4), d = rand(0.3, 0.8); let x = b.pos.x + Math.sin(a) * d, z = b.pos.z + Math.cos(a) * d;
        if (Math.hypot(x - b.F.patch.x, z - b.F.patch.z) > b.F.site.r) { const ba = Math.atan2(b.F.patch.x - b.pos.x, b.F.patch.z - b.pos.z); x = b.pos.x + Math.sin(ba) * d; z = b.pos.z + Math.cos(ba) * d; }
        startHop(b, x, z, false); }
      if (b.lookT < 0) { b.lookT = rand(0.8, 2.5); b.lookTo = rand(-0.9, 0.9); }
    }
    function startHop(b, x, z, scared) {
      const w = world.terrain.waterAt(x, z); if (w && w.depth > 0) return;
      const to = new THREE.Vector3(x, ground(x, z), z), d = to.distanceTo(b.pos);
      b.hop = { from: b.pos.clone(), to, t: 0, dur: scared ? 0.45 : 0.22 + d * 0.15, h: scared ? 0.45 : 0.08 + d * 0.06, yaw: Math.atan2(x - b.pos.x, z - b.pos.z), scared };
      if (scared && sfx && Math.random() < 0.5) sfx('flap', { at: b.pos.clone() });
    }

    // ---------------------------------------------------------------- pose + render state
    function drawBird(b, dt, dCam) {
      const r = ensureRig(b); if (!r) return;
      const show = b.state !== 'gone';
      r.root.visible = show; if (!show) return;
      const st = b.state, k = Math.min(1, dt * 6);
      // target pose per state, eased
      let T;
      if (st === 'ground') {
        const pk = b.hop ? 0 : Math.max(0, Math.sin(b.t * 6.5 + b.i)) ** 3 * (Math.sin(b.t * 0.7 + b.i * 1.3) > 0 ? 1 : 0);
        T = { pitch: 0, amp: b.hop && b.hop.scared ? 1 : 0, fold: b.hop && b.hop.scared ? 0.35 : 1, tuck: 0, lean: 0.18, peck: pk, headYaw: b.hop ? 0 : (b.lookTo || 0) * (1 - pk), tail: 0, jaw: 0, rate: 5 };
      } else if (st === 'dead') T = { pitch: 1.4, amp: 0, fold: 0.45, tuck: 0.4, limp: b.limp, tail: 0.6, jaw: 0.6 };
      else if (st === 'stunned') T = { pitch: 1.4, amp: 0.25 * Math.max(0, Math.sin(b.t * 7)), fold: 0.5, tuck: 0.4, limp: b.limp, tail: 0.6, jaw: 0.5, headYaw: Math.sin(b.t * 9) * 0.4, rate: 9 };
      else if (st === 'getup') T = { pitch: 0, amp: b.t > 0.35 ? 0.7 : 0, fold: b.t > 0.35 ? 0.3 : 1, tuck: 0, lean: 0.1, headYaw: Math.sin(b.t * 26) * 0.55, tail: 0.5, rate: 7 };
      else if (st === 'dash') T = { pitch: 1.5, amp: 0, fold: 0.15, sweep: 1, tuck: 1, tail: -0.5, jaw: 0.25 };
      else if (st === 'lock') T = b.lock && b.lock.aimed ? { pitch: 0.55, amp: 1, fold: 0, tuck: 0.7, tail: 1, jaw: 0.4 + 0.6 * Math.max(0, Math.sin(b.t * 9)), rate: 6.5 }
        : { pitch: 1.3, amp: 1, fold: 0, tuck: 1, tail: 0.2, rate: 5 };
      else if (st === 'takeoff') T = { pitch: 0.55, amp: 1, fold: 0, tuck: 0.6, tail: 0.8, rate: 6 };
      else if (st === 'land') T = { pitch: 0.4 + Math.min(0.8, b.pos.y - b.spot.y) * 0.5, amp: b.pos.y - b.spot.y < 1.2 ? 1 : 0.35, fold: 0, tuck: Math.min(1, (b.pos.y - b.spot.y) * 0.6), tail: 1, rate: 5.5 };
      else {                                            // fly / recover: beats, with glides when level or sinking
        const climb = b.vel.y; b.glide += ((climb < -0.4 || (Math.sin(b.orbit.bob * 0.7 + b.i) > 0.55 && climb < 0.6)) ? 1 : -1) * dt * 1.5; b.glide = Math.max(0, Math.min(1, b.glide));
        T = { pitch: 1.2 - Math.max(-0.3, Math.min(0.3, climb * 0.08)), amp: 1 - 0.8 * b.glide, fold: 0, tuck: 1, tail: 0.25 + 0.3 * b.glide, rate: 4 + Math.min(2, Math.max(0, climb)) };
      }
      b.pitch += ((T.pitch ?? 1.2) - b.pitch) * k; b.amp += ((T.amp ?? 1) - b.amp) * k; b.fold += ((T.fold ?? 0) - b.fold) * k; b.sweep += ((T.sweep || 0) - b.sweep) * Math.min(1, dt * 10);
      b.tuck += ((T.tuck ?? 1) - b.tuck) * k; b.peck += ((T.peck || 0) - b.peck) * Math.min(1, dt * 14); b.jaw += ((T.jaw || 0) - b.jaw) * Math.min(1, dt * 10);
      b.tail += ((T.tail || 0) - b.tail) * k; b.headYaw += ((T.headYaw || 0) - b.headYaw) * Math.min(1, dt * 5); b.lean += ((T.lean ?? 0.15) - b.lean) * k;
      if (st !== 'dead' && st !== 'stunned') b.limp = 0;
      b.rate += ((T.rate || 4) - b.rate) * k; b.phase = (b.phase + dt * b.rate * (0.4 + 0.6 * Math.min(1, b.amp * 1.5))) % 1;
      // wingbeat sound for birds close by
      if (dCam < 14 && b.amp > 0.5) { const ph = b.phase; if (b.lastPh !== undefined && ph < b.lastPh && Math.random() < 0.5) sfx && sfx('flap', { at: b.pos.clone(), arg: 0.5 + b.amp * 0.4 }); b.lastPh = ph; }
      // orientation: yaw + (dash/dead) dive and tumble
      const down = st === 'dead' || st === 'stunned';
      if (down && b.vel.lengthSq() > 0.01) r.root.rotation.set(r.root.rotation.x + b.spinV.x * dt, b.yaw += b.spinV.y * dt * 0.3, r.root.rotation.z + b.spinV.z * dt);
      else if (down) { r.root.rotation.x += (0 - r.root.rotation.x) * k; r.root.rotation.z += (1.45 - r.root.rotation.z) * k; r.root.rotation.y = b.yaw; }   // lies on its side
      else { const dive = st === 'dash' ? Math.atan2(-b.vel.y, Math.hypot(b.vel.x, b.vel.z)) : 0; r.root.rotation.set(0, 0, 0); r.root.rotation.y = b.yaw; r.root.rotateX(dive); }
      // place it: on the ground the feet are the pivot, otherwise the body centre (0.33 m up the model)
      if (st === 'ground' || st === 'getup') r.root.position.copy(b.pos);
      else r.root.position.copy(b.pos).sub(v1.set(0, 0.33, 0).applyQuaternion(r.root.quaternion));
      if (st === 'dead' && b.deadT > 2.6) r.root.scale.setScalar(Math.max(0.01, 1 - (b.deadT - 2.6) / 0.6));
      // pose (far birds are re-posed less often)
      const every = dCam < 45 ? 1 : dCam < 90 ? 2 : 4;
      if ((frame + b.i) % every === 0) {
        r.pose({ pitch: b.pitch, roll: st === 'ground' || down || st === 'getup' ? 0 : Math.max(-0.7, Math.min(0.7, b.roll)), flap: b.phase, amp: b.amp, fold: b.fold, sweep: b.sweep, tuck: b.tuck,
          lean: st === 'ground' || st === 'getup' ? b.lean : 0, peck: b.peck, jaw: b.jaw, headYaw: b.headYaw, tail: b.tail, tailLift: st === 'ground' ? 0.1 : 0, limp: b.limp });
      }
      // the red aura when it is about to strike
      const a = b.aura; r.aura.visible = a > 0.02; if (a > 0.02) { const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 70); r.aura.material.opacity = a * 0.85 * pulse; r.aura.scale.setScalar(1.6 + 0.5 * a); }
      r.material.emissive.setRGB(0.55 * a, 0.02 * a, 0);
      r.mesh.castShadow = dCam < 38;
      r.stars.visible = st === 'stunned' && b.t > 0.35;
      if (r.stars.visible) { r.stars.position.copy(b.pos).y += 0.42; r.stars.rotation.y += dt * 5; r.stars.children.forEach((c, i) => c.position.y = Math.sin(b.t * 6 + i * 2.1) * 0.04); }
      // sonic boom target only when low enough for the boom to reach
      b.combat.dead = !(b.alive && st !== 'dead' && st !== 'gone' && b.pos.y - ground(b.pos.x, b.pos.z) < 4.5);
    }

    // ---------------------------------------------------------------- main update
    function update(dt) {
      frame++; dt = Math.min(dt, 0.05);
      const hp = heroPos(), cam = camera.position;
      for (const F of flocks) {
        const d = Math.hypot(hp.x - F.center.x, hp.z - F.center.z);
        const wasActive = F.active; F.active = d < ACTIVE_R || F.mode === 'hunt';
        updateFlock(F, dt);
        if (!F.active) {
          if (wasActive) for (const b of F.birds) if (b.rig) b.rig.root.visible = false;
          // far away: keep it simple, the birds just follow the centre (or sit on their spots)
          for (const b of F.birds) {
            if (b.state === 'dead') { b.state = 'gone'; b.alive = false; b.respawnAt = gameHours() + RESPAWN_H; continue; }
            if (!b.alive || b.state === 'gone' || b.state === 'ground') continue;
            if (b.rig) b.rig.stars.visible = false;
            if (F.mode === 'grounded' || F.mode === 'land') toGround(b, true); else { orbitPos(F, b, b.pos); b.state = 'fly'; b.lock = b.dash = null; b.aura = 0; }
          }
          if (F.mode === 'grounded' && F.roost === false && F.site.kind === 'air' && !isNight()) F.mode = 'roam';
          continue;
        }
        if (asset) for (const b of F.birds) { updateBird(b, dt, d < 30); drawBird(b, dt, b.pos.distanceTo(cam)); }
      }
      updateFeathers(dt); updatePickups(dt); updateWarnings(); streakT -= dt;
    }
    function dispose() {
      for (const b of birds) { b.unreg && b.unreg(); if (b.rig) { scene.remove(b.rig.root); scene.remove(b.rig.ring); b.rig.material.dispose(); b.rig.aura.material.dispose(); b.rig.ring.material.dispose(); } }
      for (const b of birds) if (b.rig) scene.remove(b.rig.stars);
      for (const P of pickups) { scene.remove(P.sp); P.sp.material.dispose(); } pickTex.dispose(); starMat.map.dispose(); starMat.dispose();
      popEl && popEl.remove(); fcEl && fcEl.remove(); warns.forEach(w => w.remove());
      scene.remove(feathers); fGeo.dispose(); fMat.dispose(); featherTex.dispose(); glowTex.dispose(); ringGeo.dispose();
    }
    return {
      load, update, dispose, swordHit, aimTarget, flocks, birds, SITES, get feathers() { return featherTotal; }, get pickups() { return pickups; }, get killCount() { return kills; }, get ready() { return !!asset; },
      provoke, kill: (b, src = 'debug') => kill(b, null, src),
      resetHunts() { for (const F of flocks) if (F.mode === 'hunt') { F.attackers.forEach(endAttack); F.attackers = []; F.mode = 'return'; } },
      respawnAll() { for (const b of birds) if (!b.alive || b.state === 'gone') b.respawnAt = 0; }
    };
  }
  A.createRedBirds = createRedBirds; A.RED_BIRD_SITES = SITES;
})();
