/* Gaiavor, the Earth Dragon — boss of the Heart of the Grove (a clearing in Moonpine Forest).
   Fight flow: he sleeps curled in the clearing -> the hero walks in -> he wakes and roars, thorn vines close the arena
   -> fight (health bar + 4:00 enrage timer) -> victory (he turns to moss and stone, the vines sink) or the hero falls
   (wakes in Dawnmeadow, the dragon sleeps again at full health). He returns one game day after being defeated.

   Attacks (damage in % of the hero's health; hero 100):
     Claw Swipes      both claws, one after the other, wide arcs in front            12 each     dodge back / roll
     Tail Slap        body twists, the tail sweeps everything behind and beside him   15          stay out of the arc / roll
     Seismic Stomp    rears up, slams the ground: a line of jagged rocks races at you   18 + launch  sidestep, roll or JUMP it
     Vine-Whip Tail   (phase 2) a green ring shows its reach (12 m): the vine-wrapped tail spins   20     roll, jump, or get out
     Stone Spears     10 spears rise and fly in pairs (2-2-2-2-2), aimed where you are going   7 each   keep moving, roll
     Blight Breath    (phase 2) a sweeping cone of purple spores; clouds linger 9 s     6/s + 4/s in a cloud
     ULTIMATE  Wrath of the Ancient Grove (at 65% and 30%): horns plunged into the earth, the arena shakes; roots and
              stone pillars erupt in waves (checkerboard, rings, tracking) with debris falling from the sky. Weave through
              the cells that are not marked. 22 per pillar, 10 per rock. He takes only 30% damage while his horns are down,
              and is EXHAUSTED afterwards (x1.5 damage).
     ENRAGE   after 4:00 he takes to the air: barrages of 20 stone spears, then a diving swoop (18) — when he crashes
              down he is exhausted on the ground for a few seconds: punish him then.
   Hero damage to him (2,400 health): sword combo 24 (finisher 42), low slash 28, rising stab 32, sonic boom 60;
   x1.5 while Azure Tempest burns or while he is exhausted.
   Three Moonpetal flowers at the edge of the clearing heal 25 (they regrow after 45 s). No natural regeneration in the fight.
   createEarthDragon(ctx) -> { load(), update(dt), swordHit(d), aimPoint(), dispose(), state, debug } */
(() => {
  const A = window.Aethelos ||= {};
  const ARENA = { x: 378, z: 232, r: 36 }, HP_MAX = 2400, ENRAGE_T = 240, SC = 11, NAME = 'Gaiavor, the Earth Dragon';
  const DMG = { claw: 0.12, tail: 0.15, stomp: 0.18, whip: 0.20, spear: 0.07, breath: 0.06, cloud: 0.04, pillar: 0.22, debris: 0.10, barrage: 0.06, swoop: 0.18 };
  const HURT = { combo: 24, finisher: 42, down: 28, up: 32, boom: 60 };
  const RESPAWN_H = 24;

  function createEarthDragon(ctx) {
    const { THREE, scene, world, player, camera, sfx, showToast } = ctx;
    const ground = (x, z) => world.terrain.heightAt(x, z);
    const V = () => new THREE.Vector3(), v1 = V(), v2 = V(), v3 = V(), v4 = V();
    const rand = (a, b) => a + Math.random() * (b - a), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const gameHours = () => world.sky ? world.sky.day * 24 + world.sky.hour : performance.now() / 60000;
    const center = new THREE.Vector3(ARENA.x, ground(ARENA.x, ARENA.z), ARENA.z);
    let rig = null, loading = null;
    const D = { state: 'dormant', hp: HP_MAX, pos: center.clone(), yaw: Math.PI * 0.85, alt: 0, t: 0, act: null, fightT: 0, phase: 1, enraged: false,
      ultDone: [false, false], cd: {}, exhausted: 0, flash: 0, deadT: 0, respawnAt: 0, walkPh: 0, idleT: 0, fly: null, cur: {}, combo: 0, lastHitT: 0, dmgTaken: 0 };
    const S = () => D.state;

    // ================================================================ materials / geometry for the effects
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a6b5a, roughness: 0.95, flatShading: true });
    const spearMat = new THREE.MeshStandardMaterial({ color: 0x8c7c64, roughness: 0.8, flatShading: true, emissive: new THREE.Color(0x3a8a24), emissiveIntensity: 0.22 });
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x4d3522, roughness: 0.9, flatShading: true });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x5f8a2c, roughness: 0.9, flatShading: true });
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x3f7f2a, roughness: 0.8, emissive: new THREE.Color(0x1f5a10), emissiveIntensity: 0.6 });
    const spikeGeo = new THREE.ConeGeometry(0.55, 2.3, 5); spikeGeo.translate(0, 1.15, 0);
    const spearGeo = new THREE.ConeGeometry(0.26, 2.8, 6); spearGeo.rotateX(Math.PI / 2);           // tip along +Z
    const pillarGeo = new THREE.CylinderGeometry(0.85, 1.3, 1, 6); pillarGeo.translate(0, 0.5, 0);
    const rootGeo = new THREE.ConeGeometry(0.42, 1, 5); rootGeo.translate(0, 0.5, 0);
    const debrisGeo = new THREE.DodecahedronGeometry(0.62);
    const discGeo = new THREE.CircleGeometry(1, 40); discGeo.rotateX(-Math.PI / 2);
    const squareGeo = new THREE.PlaneGeometry(1, 1); squareGeo.rotateX(-Math.PI / 2);
    const ringGeo = new THREE.RingGeometry(0.94, 1, 72); ringGeo.rotateX(-Math.PI / 2);
    const thornGeo = new THREE.ConeGeometry(0.5, 4.2, 5); thornGeo.translate(0, 2.1, 0);
    const warnMat = (c = 0xff5a2a) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const softTex = (r, g, b) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(0.5, `rgba(${r},${g},${b},.45)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const sporeTex = softTex(170, 70, 220), dustTex = softTex(150, 130, 105), glowTex = softTex(150, 255, 160);
    const fx = new THREE.Group(); fx.name = 'DragonFX'; scene.add(fx);
    const pool = (make, n) => { const list = []; for (let i = 0; i < n; i++) { const o = make(); o.visible = false; fx.add(o); list.push(o); } let k = 0; return () => { const o = list[k]; k = (k + 1) % n; return o; }; };
    const getSpike = pool(() => new THREE.Mesh(spikeGeo, stoneMat), 90);
    const getPillar = pool(() => new THREE.Mesh(pillarGeo, stoneMat), 40);
    const getRoot = pool(() => new THREE.Mesh(rootGeo, rootMat), 90);
    const getDebris = pool(() => new THREE.Mesh(debrisGeo, stoneMat), 26);
    const getWarn = pool(() => new THREE.Mesh(discGeo, warnMat()), 60);
    const getSquare = pool(() => new THREE.Mesh(squareGeo, warnMat()), 50);
    const spore = pool(() => new THREE.Sprite(new THREE.SpriteMaterial({ map: sporeTex, transparent: true, depthWrite: false, opacity: 0 })), 220);
    const dust = pool(() => new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 })), 120);
    const live = [];                                                    // every moving effect: {obj, t, life, update(e, dt) -> false to end}
    const addFx = e => { e.t = 0; e.obj && (e.obj.visible = true); live.push(e); return e; };
    function puffDust(p, n = 6, size = 3, up = 2) {
      for (let i = 0; i < n; i++) { const s = dust(); s.position.set(p.x + rand(-1, 1), p.y + 0.4, p.z + rand(-1, 1)); s.scale.setScalar(size * rand(0.6, 1.1));
        const vx = rand(-2, 2), vz = rand(-2, 2), vy = rand(0.5, up);
        addFx({ obj: s, life: rand(0.9, 1.6), update(e, dt) { e.obj.position.x += vx * dt; e.obj.position.z += vz * dt; e.obj.position.y += vy * dt; e.obj.scale.multiplyScalar(1 + dt * 0.6); e.obj.material.opacity = 0.55 * (1 - e.t / e.life); } }); }
    }

    // ================================================================ arena: thorn wall, moonpetal flowers
    const thorns = new THREE.Group(); fx.add(thorns);
    for (let i = 0; i < 70; i++) { const a = i / 70 * Math.PI * 2 + rand(-0.03, 0.03), r = ARENA.r + 1.5 + rand(-0.6, 0.6), x = ARENA.x + Math.cos(a) * r, z = ARENA.z + Math.sin(a) * r;
      const m = new THREE.Mesh(thornGeo, i % 3 ? rootMat : mossMat); m.position.set(x, ground(x, z), z); m.rotation.set(rand(-0.25, 0.25), rand(0, 6.28), rand(-0.25, 0.25)); m.scale.set(rand(0.8, 1.3), rand(0.8, 1.4), rand(0.8, 1.3)); m.userData.y = m.position.y; thorns.add(m); }
    thorns.visible = false; let wallUp = 0;
    const flowers = [0.6, 2.7, 4.8].map(a => {
      const x = ARENA.x + Math.cos(a) * (ARENA.r - 4), z = ARENA.z + Math.sin(a) * (ARENA.r - 4), g = new THREE.Group(); g.position.set(x, ground(x, z), z);
      const petal = new THREE.MeshStandardMaterial({ color: 0xdff2ff, emissive: new THREE.Color(0x7fd0ff), emissiveIntensity: 0.9, roughness: 0.5 });
      for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), petal); p.scale.set(1, 0.35, 2.1); const b = k / 6 * 6.28; p.position.set(Math.cos(b) * 0.32, 0.55, Math.sin(b) * 0.32); p.rotation.y = -b; g.add(p); }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 5), mossMat); stem.position.y = 0.27; g.add(stem);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6, color: 0x9ad8ff })); halo.scale.setScalar(1.8); halo.position.y = 0.6; g.add(halo);
      fx.add(g); return { g, ready: true, t: 0 };
    });

    // ================================================================ HUD (boss bar, damage numbers, banner)
    const root = ctx.root;
    if (root && !document.getElementById('bossCss')) { const st = document.createElement('style'); st.id = 'bossCss'; st.textContent = `
      #bossBar { position: absolute; left: 50%; top: 122px; transform: translateX(-50%); width: min(560px, 70%); z-index: 34; pointer-events: none; display: none; font-family: 'Fredoka', 'Nunito', system-ui, sans-serif; }
      #bossBar .bn { display: flex; justify-content: space-between; align-items: baseline; color: #f6ead0; text-shadow: 0 1px 3px #000; font-weight: 700; font-size: 15px; letter-spacing: .04em; margin-bottom: 4px; }
      #bossBar .bt { font-size: 13px; color: #cfe8c0; } #bossBar .bt.en { color: #ff7a5a; animation: bbPulse .6s ease-in-out infinite alternate; }
      #bossBar .bb { position: relative; height: 16px; border-radius: 9px; background: rgba(10, 14, 10, .78); border: 1px solid rgba(220, 255, 200, .35); overflow: hidden; box-shadow: 0 3px 12px rgba(0,0,0,.45); }
      #bossBar .bc, #bossBar .bf { position: absolute; left: 0; top: 0; bottom: 0; }
      #bossBar .bc { background: rgba(255, 240, 200, .8); transition: width .6s ease .3s; }
      #bossBar .bf { background: linear-gradient(180deg, #9be86a, #3e8f2a 60%, #2c6a1e); transition: width .12s; }
      #bossBar .bm { position: absolute; top: -2px; bottom: -2px; width: 2px; background: rgba(255, 220, 120, .85); }
      #bossBar .bs { margin-top: 3px; font-size: 12px; color: #ffd28a; text-shadow: 0 1px 2px #000; min-height: 15px; text-align: center; }
      @keyframes bbPulse { to { color: #ffd0c0; } }
      body.touch-ui #bossBar { top: calc(54px + var(--st, 0px)); width: min(420px, 52%); }
      .dmgNum { position: absolute; z-index: 35; pointer-events: none; font: 800 20px 'Fredoka', 'Nunito', sans-serif; color: #fff1c8; text-shadow: 0 0 6px #ff9a30, 0 2px 2px #000; transform: translate(-50%, -50%); transition: transform .8s ease-out, opacity .8s; }
      .dmgNum.big { font-size: 26px; color: #ffe46a; }
      #bossBanner { position: absolute; left: 50%; top: 60%; transform: translate(-50%, -50%); z-index: 36; pointer-events: none; text-align: center; opacity: 0; transition: opacity .6s;
        font: 800 38px/1.1 'Fredoka', 'Nunito', sans-serif; color: #e9f6d8; letter-spacing: .08em; text-shadow: 0 0 22px #5fcf3a, 0 3px 4px #000; }
      #bossBanner small { display: block; font-size: 15px; letter-spacing: .3em; color: #cbe5b8; margin-top: 6px; }
      #bossBanner.show { opacity: 1; }`; document.head.appendChild(st); }
    const bar = root ? document.createElement('div') : null, banner = root ? document.createElement('div') : null;
    if (bar) { bar.id = 'bossBar'; bar.innerHTML = `<div class="bn"><span>${NAME}</span><span class="bt"></span></div><div class="bb"><div class="bc"></div><div class="bf"></div><div class="bm" style="left:65%"></div><div class="bm" style="left:30%"></div></div><div class="bs"></div>`; root.appendChild(bar);
      banner.id = 'bossBanner'; root.appendChild(banner); }
    const barFill = bar && bar.querySelector('.bf'), barChip = bar && bar.querySelector('.bc'), barTime = bar && bar.querySelector('.bt'), barSub = bar && bar.querySelector('.bs');
    function showBanner(a, b, ms = 2600) { if (!banner) return; banner.innerHTML = a + (b ? `<small>${b}</small>` : ''); banner.classList.add('show'); clearTimeout(showBanner.t); showBanner.t = setTimeout(() => banner.classList.remove('show'), ms); }
    function drawBar() { if (!bar) return; const f = Math.max(0, D.hp / HP_MAX) * 100; barFill.style.width = f + '%'; barChip.style.width = f + '%';
      const left = Math.max(0, ENRAGE_T - D.fightT), m = Math.floor(left / 60), s = Math.floor(left % 60);
      barTime.textContent = D.enraged ? 'ENRAGED' : `${m}:${String(s).padStart(2, '0')}`; barTime.classList.toggle('en', D.enraged || left < 30);
      barSub.textContent = D.exhausted > 0 ? 'Exhausted! Strike now' : D.act && D.act.ult && D.act.t > 1.8 ? 'Horns in the earth: he takes little damage. Find the safe ground!' : ''; }
    function dmgNumber(p, n, big) { if (!root) return; v4.copy(p).project(camera); if (v4.z > 1) return; const el = document.createElement('div'); el.className = 'dmgNum' + (big ? ' big' : ''); el.textContent = Math.round(n);
      el.style.left = (v4.x * 0.5 + 0.5) * root.clientWidth + 'px'; el.style.top = (-v4.y * 0.5 + 0.5) * root.clientHeight + 'px'; root.appendChild(el);
      requestAnimationFrame(() => { el.style.transform = `translate(-50%, -150%)`; el.style.opacity = '0'; }); setTimeout(() => el.remove(), 850); }

    // ================================================================ the model
    async function load() {
      if (loading) return loading;
      loading = (async () => {
        const asset = A.RedBird.createBirdAsset(THREE, await A.EarthDragon.loadDragonBytes()); await asset.textureReady;
        rig = A.EarthDragon.makeDragon(THREE, asset); rig.root.scale.setScalar(SC); rig.mesh.castShadow = true; rig.mesh.receiveShadow = true; scene.add(rig.root);
        rig.material.emissive = new THREE.Color(0, 0, 0);
        // vines that burst out of the tail for the Vine-Whip
        rig.vines = []; const segs = ['Tail_06', 'Tail_09', 'Tail_12', 'Tail_15', 'Tail_18', 'Tail_20'];
        const vg = new THREE.CylinderGeometry(0.035, 0.075, 1, 5); vg.translate(0, 0.5, 0); const leafG = new THREE.ConeGeometry(0.16, 0.5, 4); leafG.translate(0, 0.25, 0);
        segs.forEach((n, i) => { for (const s of [-1, 1]) { const a = new THREE.Mesh(vg, vineMat), b = new THREE.Mesh(vg, vineMat), leaf = new THREE.Mesh(leafG, mossMat);
          a.add(b); b.position.y = 1; b.add(leaf); leaf.position.y = 1; [a, b, leaf].forEach(m => m.visible = true); a.visible = false; fx.add(a); rig.vines.push({ m: a, b, bone: rig.by[n], s, len: 0, ph: i * 0.9 + (s > 0 ? 0 : 1.7) }); } });
        return rig;
      })().catch(e => { loading = null; throw e; });
      return loading;
    }
    const fwd = () => v1.set(Math.sin(D.yaw), 0, Math.cos(D.yaw));
    function boneWorld(name, out) { const b = rig && rig.by[name]; if (!b) return out.copy(D.pos); b.getWorldPosition(out); return out; }
    const bodyCenter = new THREE.Vector3(), headPos = new THREE.Vector3();
    function updateCenters() { bodyCenter.set(D.pos.x + Math.sin(D.yaw) * 1.4, D.pos.y + D.alt + 2.3, D.pos.z + Math.cos(D.yaw) * 1.4); if (rig) boneWorld('Head', headPos); else headPos.copy(bodyCenter); }
    const combat = { position: bodyCenter, radius: 3.2, dead: true, boss: true, onHit: (dmg, dir, src) => hurt(HURT.boom, src || 'sonicBoom', bodyCenter) };
    const unreg = A.Combat ? A.Combat.register(combat) : () => {};

    // ================================================================ hero helpers
    const heroP = () => player.position;
    const heroDead = () => !!(ctx.health && ctx.health.dead);
    const invuln = () => { const c = ctx.controller && ctx.controller(); return !!(c && c.dodging) || heroDead(); };
    const heroAir = () => player.position.y - ground(player.position.x, player.position.z) > 0.85;
    function hitHero(frac, at, knock = 7, opts = {}) {
      if (heroDead() || (!opts.dot && invuln())) return false;
      at = at.clone();
      const mult = D.enraged ? 1.25 : 1, p = heroP(), dir = v2.set(p.x - at.x, 0, p.z - at.z); if (dir.lengthSq() < 1e-4) dir.set(Math.sin(D.yaw), 0, Math.cos(D.yaw)); dir.normalize();
      ctx.hitHero && ctx.hitHero(frac * mult, dir.clone(), at.clone(), opts.dot ? 0 : knock, Object.assign({ boss: true }, opts));
      return true;
    }
    const inArena = (p, pad = 0) => Math.hypot(p.x - ARENA.x, p.z - ARENA.z) < ARENA.r + pad;

    // ================================================================ taking damage
    function hurt(n, src, at) {
      if (D.state !== 'fight' || D.hp <= 0) return 0;
      let k = 1; if (D.exhausted > 0) k *= 1.5; if (ctx.tempest && ctx.tempest()) k *= 1.5; if (D.act && D.act.ult && D.act.t > 1.8 && D.act.t < 9.2) k *= 0.3;
      const d = n * k; D.hp = Math.max(0, D.hp - d); D.flash = 1; D.dmgTaken += d; D.lastHitT = D.fightT;
      dmgNumber(at || bodyCenter, d, k > 1.2); sfx && sfx('bossHit', { at: (at || bodyCenter).clone() });
      if (D.hp <= 0) die(); else drawBar();
      return d;
    }
    function swordHit(d) {
      if (D.state !== 'fight' || !rig) return 0;
      const p = heroP(), fy = player.rotation.y, fx = Math.sin(fy), fz = Math.cos(fy);
      // nearest point of his body / head / tail root to the hero
      let best = Infinity, at = null;
      for (const c of hurtPoints()) { const dx = c.p.x - p.x, dz = c.p.z - p.z, dist = Math.hypot(dx, dz) - c.r, dy = c.p.y - p.y;
        if (dy < -1.5 || dy > (d && d.kind === 'up' ? 5.5 : 4.2)) continue;
        const cos = Math.hypot(dx, dz) > 0.5 ? (dx * fx + dz * fz) / Math.hypot(dx, dz) : 1; if (cos < 0.1) continue;
        if (dist < best) { best = dist; at = c.p; } }
      if (best > 2.7 || !at) return 0;
      const kind = d && d.kind, n = kind === 'up' ? HURT.up : kind === 'down' ? HURT.down : (d && d.index >= 4) ? HURT.finisher : (ctx.female ? 26 : HURT.combo);
      return hurt(n, 'sword', v3.copy(at).lerp(p, 0.3).setY(p.y + 1.4));
    }
    const hp1 = { p: new THREE.Vector3(), r: 2.6 }, hp2 = { p: new THREE.Vector3(), r: 1.5 }, hp3 = { p: new THREE.Vector3(), r: 1.4 }, hp4 = { p: new THREE.Vector3(), r: 1.1 };
    function hurtPoints() { hp1.p.copy(bodyCenter); hp2.p.copy(headPos); boneWorld('Tail_04', hp3.p); boneWorld('Fore_Wrist.L', hp4.p); return [hp1, hp2, hp3, hp4]; }

    // ================================================================ pose timelines
    const NUM = ['pitch', 'lift', 'roll', 'twist', 'spine', 'spineYaw', 'neck', 'neckYaw', 'head', 'headYaw', 'jaw', 'crouch', 'wings', 'tailYaw', 'tailLift', 'tailStraight', 'claws'];
    const ARR = ['armL', 'armR'];
    function basePose(t) {
      return { wings: 0.5, spine: 0.03 * Math.sin(t * 1.3), lift: 0.002 * Math.sin(t * 1.3), head: 0.04 * Math.sin(t * 0.9), tailWave: { phase: t * 0.22, amp: 1 }, armL: [0, 0, 0, 0], armR: [0, 0, 0, 0] };
    }
    function sample(keys, t, base) {
      let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
      const [t0, a] = keys[i], [t1, b] = keys[Math.min(i + 1, keys.length - 1)], u = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : 1, s = u * u * (3 - 2 * u);
      const out = Object.assign({}, base);
      for (const k of NUM) { const x = a[k] ?? base[k] ?? 0, y = b[k] ?? base[k] ?? 0; out[k] = x + (y - x) * s; }
      for (const k of ARR) { const x = a[k] || base[k] || [0, 0, 0, 0], y = b[k] || base[k] || [0, 0, 0, 0]; out[k] = x.map((v, j) => v + ((y[j] ?? 0) - v) * s); }
      return out;
    }
    function smoothTo(P, dt) {                          // ease the drawn pose toward the wanted one (clean blends between moves)
      const c = D.cur, k = 1 - Math.exp(-dt * 14);
      for (const key of NUM) { const w = P[key] ?? 0; c[key] = c[key] === undefined ? w : c[key] + (w - c[key]) * k; }
      for (const key of ARR) { const w = P[key] || [0, 0, 0, 0]; c[key] = (c[key] || [0, 0, 0, 0]).map((v, j) => v + ((w[j] ?? 0) - v) * k); }
      c.walk = P.walk; c.flap = P.flap; c.tailWave = P.tailWave; return c;
    }

    // ================================================================ attacks
    const ACT = {};
    const start = (name, extra = {}) => { const def = ACT[name]; D.act = Object.assign({ name, t: 0, fired: new Set(), ...def }, extra); D.act.init && D.act.init(D.act); D.cd[name] = def.cd || 0; };
    const once = (a, key, t) => { if (a.t >= t && !a.fired.has(key)) { a.fired.add(key); return true; } return false; };
    const frontPoint = (d = 3) => v3.set(D.pos.x + Math.sin(D.yaw) * d, D.pos.y, D.pos.z + Math.cos(D.yaw) * d);
    function arcHit(reach, half, frac, knock, from = 2.5) {           // a sweep in front of him
      const p = heroP(), o = frontPoint(from).clone(), dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
      const f = fwd(), cos = d > 0.01 ? (dx * f.x + dz * f.z) / d : 1;
      if (d < reach && (cos > Math.cos(half) || d < 2.5) && Math.abs(p.y - D.pos.y) < 3.5) hitHero(frac, o, knock);
    }

    ACT.claw = { cd: 2.4, dur: 2.3, keys: [[0, {}],
      [0.42, { pitch: -0.24, armL: [1.35, 0.8, -0.55, 0.25], claws: 1, head: -0.15, jaw: 0.45, twist: -0.15 }],
      [0.6, { pitch: -0.04, armL: [0.85, 0.1, 0.95, -0.1], claws: 1, twist: 0.3, jaw: 0.7 }],
      [0.92, { pitch: -0.26, armL: [0.5, 0.1, 0.7, 0], armR: [1.35, 0.8, 0.55, 0.25], twist: 0.05, claws: 1 }],
      [1.1, { pitch: -0.04, armR: [0.85, 0.1, -0.95, -0.1], twist: -0.3, jaw: 0.7, claws: 1 }],
      [1.6, { armL: [0.15, 0, 0, 0], armR: [0.15, 0, 0, 0] }], [2.3, {}]],
      step(a, dt) {
        if (a.t > 0.35 && a.t < 1.15) moveForward(2.4 * dt);
        if (once(a, 'w1', 0.36) || once(a, 'w2', 0.86)) sfx && sfx('claw', { at: frontPoint(4).clone() });
        if (once(a, 'h1', 0.55)) arcHit(8.2, 1.25, DMG.claw, 8);
        if (once(a, 'h2', 1.05)) arcHit(8.2, 1.25, DMG.claw, 8);
      } };
    ACT.tail = { cd: 4, dur: 1.95, track: 0, keys: [[0, {}],
      [0.5, { twist: 0.6, tailYaw: -1.2, tailLift: 0.25, spineYaw: -0.45, crouch: 0.25, head: -0.1 }],
      [0.98, { twist: -0.85, tailYaw: 1.7, tailLift: 0.4, spineYaw: 0.55, tailStraight: 0.7, crouch: 0.15 }],
      [1.4, { twist: -0.25, tailYaw: 0.4 }], [1.95, {}]],
      step(a) {
        if (once(a, 'w', 0.55)) sfx && sfx('tailWhoosh', { at: D.pos.clone() });
        if (a.t > 0.6 && a.t < 1.02 && !a.hit) {            // the sweep covers his back half out to the tail tip (~9.5 m)
          const p = heroP(), dx = p.x - D.pos.x, dz = p.z - D.pos.z, d = Math.hypot(dx, dz), f = fwd(), cos = (dx * f.x + dz * f.z) / (d || 1);
          if (d > 1.5 && d < 9.8 && cos < -0.15 && p.y - D.pos.y < 2.8) a.hit = hitHero(DMG.tail, boneWorld('Tail_14', v2), 11);
        }
      } };
    ACT.stomp = { cd: 6.5, dur: 2.7, track: 0.8, keys: [[0, {}],
      [0.85, { pitch: -0.62, armL: [1.55, 0.35, 0, 0.6], armR: [1.55, 0.35, 0, 0.6], wings: 1.35, head: -0.45, jaw: 0.85, crouch: 0.3 }],
      [1.05, { pitch: 0.2, armL: [0.95, 0.25, 0, -0.35], armR: [0.95, 0.25, 0, -0.35], wings: 0.95, head: 0.45, crouch: 0.55, jaw: 0.3, claws: 1 }],
      [1.85, { pitch: 0.12, crouch: 0.45, head: 0.3, wings: 0.7 }], [2.7, {}]],
      step(a) {
        if (once(a, 'roar', 0.3)) sfx && sfx('growl', { at: headPos.clone() });
        if (once(a, 'slam', 1.05)) { const o = frontPoint(3.6).clone(); o.y = ground(o.x, o.z); shake(0.9); sfx && sfx('stomp', { at: o.clone() }); puffDust(o, 10, 4, 3);
          const p = heroP(), dir = v2.set(p.x - o.x, 0, p.z - o.z); if (dir.lengthSq() < 1) dir.copy(fwd()); dir.normalize(); shockwave(o, dir.clone()); }
      } };
    ACT.whip = { cd: 10, dur: 2.7, track: 0.4, phase2: true, keys: [[0, {}],
      [0.65, { crouch: 0.5, spine: 0.2, tailStraight: 1, tailLift: 0.3, tailYaw: -0.7, head: 0.25, wings: 0.8 }],
      [1.9, { crouch: 0.35, tailStraight: 1, tailLift: 0.18, tailYaw: 0.35, head: 0.1, wings: 0.8 }], [2.7, {}]],
      init(a) { a.ring = getWarn(); a.ring.geometry = ringGeo; a.ring.material.color.set(0x7dff4a); a.ring.visible = true; a.ring.scale.setScalar(12.5); a.ring.position.set(D.pos.x, D.pos.y + 0.08, D.pos.z); },
      step(a, dt) {
        const R = a.ring; R.position.set(D.pos.x, ground(D.pos.x, D.pos.z) + 0.08, D.pos.z); R.material.opacity = a.t < 0.7 ? 0.45 + 0.35 * Math.sin(a.t * 30) : Math.max(0, 0.5 - (a.t - 0.7));
        if (once(a, 'glow', 0.1)) sfx && sfx('vineCreak', { at: D.pos.clone() });
        const spin = a.t > 0.7 && a.t < 1.9; if (spin) D.yaw += dt * Math.PI * 2 * 1.4 / 1.2;
        if (once(a, 'whoosh', 0.72)) sfx && sfx('vineWhip', { at: D.pos.clone() });
        vineReach(a.t < 0.6 ? 0 : a.t < 0.85 ? (a.t - 0.6) / 0.25 : a.t < 1.85 ? 1 : Math.max(0, 1 - (a.t - 1.85) / 0.35));
        if (spin && !a.hit) { const p = heroP(), d = Math.hypot(p.x - D.pos.x, p.z - D.pos.z); if (d < 12.5 && !heroAir()) a.hit = hitHero(DMG.whip, D.pos, 12); }
      }, end(a) { a.ring.visible = false; a.ring.geometry = discGeo; vineReach(0); } };
    ACT.spears = { cd: 12, dur: 4.6, keys: [[0, {}],
      [0.6, { pitch: -0.2, head: -0.6, jaw: 1, wings: 1.25, neck: -0.2 }], [1.2, { pitch: -0.1, head: -0.15, jaw: 0.35, wings: 1.1 }], [4.6, {}]],
      step(a) {
        if (once(a, 'roar', 0.5)) { sfx && sfx('roar', { at: headPos.clone() }); shake(0.35); }
        if (once(a, 'rise', 0.7)) a.list = raiseSpears(10, 7.5);
        for (let k = 0; k < 5; k++) if (once(a, 'f' + k, 1.4 + k * 0.5)) { fireSpear(a.list[k * 2], 34, 1.0); fireSpear(a.list[k * 2 + 1], 34, -1.0); }
      } };
    ACT.breath = { cd: 11, dur: 3.7, phase2: true, keys: [[0, {}],
      [0.55, { neck: -0.35, head: -0.45, jaw: 0.35, pitch: -0.14 }], [0.85, { neck: 0.12, head: 0.22, jaw: 1, neckYaw: -0.65 }],
      [2.95, { neck: 0.12, head: 0.22, jaw: 1, neckYaw: 0.65 }], [3.7, {}]],
      step(a, dt) {
        if (once(a, 'in', 0.2)) sfx && sfx('inhale', { at: headPos.clone() });
        if (a.t > 0.85 && a.t < 2.95) {
          if (once(a, 'out', 0.86)) sfx && sfx('breath', { at: headPos.clone() });
          const yaw = D.yaw + (-0.65 + 1.3 * (a.t - 0.85) / 2.1) * 0.85, dx = Math.sin(yaw), dz = Math.cos(yaw);
          boneWorld('Jaw', v2); for (let i = 0; i < 5; i++) emitSpore(v2, dx, dz);
          const p = heroP(), hx = p.x - v2.x, hz = p.z - v2.z, d = Math.hypot(hx, hz);
          if (d < 17 && (hx * dx + hz * dz) / (d || 1) > Math.cos(0.33)) { a.acc = (a.acc || 0) + dt; if (a.acc > 0.25) { a.acc = 0; hitHero(DMG.breath * 0.25, v2, 0, { dot: true }); } }
          a.cloudT = (a.cloudT || 0) - dt; if (a.cloudT <= 0) { a.cloudT = 0.32; const r = rand(6, 13); addCloud(v2.x + dx * r, v2.z + dz * r); }
        }
      } };
    ACT.ult = { cd: 0, dur: 10.6, ult: true, keys: [[0, {}],
      [1.0, { pitch: -0.38, head: -0.65, jaw: 1, wings: 1.5, neck: -0.25 }],
      [1.8, { pitch: 0.38, neck: 0.75, head: 1.05, crouch: 0.6, spine: 0.25, wings: 1.15, jaw: 0.2, armL: [0.6, 0.3, 0, -0.2], armR: [0.6, 0.3, 0, -0.2] }],
      [9.0, { pitch: 0.36, neck: 0.75, head: 1.05, crouch: 0.62, spine: 0.25, wings: 1.1, jaw: 0.2, armL: [0.6, 0.3, 0, -0.2], armR: [0.6, 0.3, 0, -0.2] }],
      [10.6, {}]],
      init(a) { showBanner('Wrath of the Ancient Grove', 'find the ground that is not marked'); },
      step(a, dt) {
        if (once(a, 'roar', 0.9)) { sfx && sfx('roar', { at: headPos.clone(), arg: 1.4 }); shake(0.6); }
        if (once(a, 'plunge', 1.8)) { sfx && sfx('stomp', { at: headPos.clone() }); shake(1.2); puffDust(boneWorld('Head', v2).setY(D.pos.y), 14, 4, 3); sfx && sfx('rumble', { at: D.pos.clone() }); }
        if (a.t > 1.8 && a.t < 9.0) { shakeHold(0.18); a.debT = (a.debT || 0) - dt; if (a.debT <= 0) { a.debT = 0.22; dropDebris(Math.random() < 0.35); } }
        const P = ['checkA', 'checkB', 'rings', 'track', 'checkA', 'track2'];
        for (let k = 0; k < P.length; k++) if (once(a, 'w' + k, 2.3 + k * 1.12)) wave(P[k]);
        if (once(a, 'end', 9.2)) sfx && sfx('stomp', { at: D.pos.clone() });
      }, end() { D.exhausted = 3.6; showBanner('Exhausted!', 'strike now', 1500); } };

    function moveForward(d) { const f = fwd(); const nx = D.pos.x + f.x * d, nz = D.pos.z + f.z * d; if (Math.hypot(nx - ARENA.x, nz - ARENA.z) < ARENA.r - 6) { D.pos.x = nx; D.pos.z = nz; D.pos.y = ground(nx, nz); } }
    const shake = a => ctx.shake && ctx.shake(a); let holdShake = 0; const shakeHold = a => { holdShake = Math.max(holdShake, a); };

    // ---------------------------------------------------------------- Seismic Stomp shockwave: jagged rocks race along the ground
    function shockwave(o, dir) {
      const side = v4.set(-dir.z, 0, dir.x).clone();
      addFx({ life: 1.6, d: 0, last: 0, update(e, dt) {
        const prev = e.d; e.d = Math.min(36, e.d + 27 * dt);
        while (e.last + 1.25 < e.d) { e.last += 1.25; const x = o.x + dir.x * e.last, z = o.z + dir.z * e.last; if (Math.hypot(x - ARENA.x, z - ARENA.z) > ARENA.r) { e.d = 99; break; }
          for (let k = 0; k < 3; k++) { const sx = x + side.x * rand(-1.1, 1.1), sz = z + side.z * rand(-1.1, 1.1); spike(sx, sz, rand(0.7, 1.35)); }
          if (Math.random() < 0.5) puffDust(v2.set(x, ground(x, z), z), 1, 2.4, 1.5); }
        if (!e.hit) { const p = heroP(), rx = p.x - o.x, rz = p.z - o.z, along = rx * dir.x + rz * dir.z, lat = Math.abs(rx * side.x + rz * side.z);
          if (along > prev - 0.8 && along < e.d + 0.6 && lat < 1.7 && !heroAir()) { e.hit = hitHero(DMG.stomp, v2.set(o.x + dir.x * along, p.y, o.z + dir.z * along), 6, { launch: 7 }); } }
        return e.d < 36;
      } });
    }
    function spike(x, z, s, life = 1.3) {
      const m = getSpike(), y = ground(x, z); m.visible = true; m.position.set(x, y - 2.4 * s, z); m.rotation.set(rand(-0.35, 0.35), rand(0, 6.28), rand(-0.35, 0.35)); m.scale.set(s, s * rand(0.8, 1.3), s);
      addFx({ obj: m, life, update(e) { const u = e.t; m.position.y = y - 2.4 * s * (u < 0.08 ? 1 - u / 0.08 : u > e.life - 0.4 ? (u - (e.life - 0.4)) / 0.4 : 0); } });
    }
    // ---------------------------------------------------------------- stone spears
    function raiseSpears(n, h, around = 1) {
      const list = [], f = fwd().clone();
      for (let i = 0; i < n; i++) {
        const a = D.yaw + Math.PI + (i - (n - 1) / 2) / Math.max(1, n - 1) * 2.6 * around, r = rand(3.5, 6);
        const sp = new THREE.Mesh(spearGeo, spearMat); sp.castShadow = false; fx.add(sp);
        const base = new THREE.Vector3(D.pos.x + Math.sin(a) * r + f.x * 1.5, D.pos.y + D.alt + h + rand(-1, 1.5), D.pos.z + Math.cos(a) * r + f.z * 1.5);
        sp.position.set(base.x, ground(base.x, base.z) - 2, base.z);
        const e = addFx({ obj: sp, life: 99, state: 'rise', base, vel: new THREE.Vector3(), update: updateSpear }); list.push(e);
        puffDust(v2.set(base.x, ground(base.x, base.z), base.z), 1, 2, 1);
      }
      sfx && sfx('rockRise', { at: D.pos.clone() });
      return list;
    }
    function aimLead(from, speed, spread) {
      const p = heroP(), hv = ctx.heroVel ? ctx.heroVel() : v4.set(0, 0, 0), tFly = from.distanceTo(p) / speed;
      const aim = v2.set(p.x + hv.x * tFly * 0.75, p.y + 1.0, p.z + hv.z * tFly * 0.75);
      if (spread) { const s = v3.set(-(aim.z - from.z), 0, aim.x - from.x).normalize().multiplyScalar(spread); aim.add(s); }
      return aim.sub(from).normalize().clone();
    }
    function fireSpear(e, speed, spread = 0) { if (!e || e.state === 'gone') return; e.state = 'fly'; e.vel.copy(aimLead(e.obj.position, speed, spread)).multiplyScalar(speed); e.t = 0; sfx && sfx('spear', { at: e.obj.position.clone() }); }
    function updateSpear(e, dt) {
      const sp = e.obj;
      if (e.state === 'rise') { sp.position.lerp(e.base, Math.min(1, dt * 5)); const p = heroP(); sp.lookAt(p.x, p.y + 1, p.z); sp.rotateZ(e.t * 3); return true; }
      if (e.state === 'fly') {
        const from = v4.copy(sp.position); sp.position.addScaledVector(e.vel, dt); sp.lookAt(v2.copy(sp.position).add(e.vel));
        // swept test (a fast spear moves > 1 m per frame): closest point of this frame's path to the hero's body
        const p = heroP(), seg = v2.copy(sp.position).sub(from), L2 = seg.lengthSq(); v3.set(p.x, p.y + 1.0, p.z);
        const u = L2 > 0 ? Math.max(0, Math.min(1, v1.copy(v3).sub(from).dot(seg) / L2)) : 0, cp = from.addScaledVector(seg, u);
        v3.y = Math.max(p.y + 0.3, Math.min(p.y + 1.7, cp.y));
        if (!e.hit && cp.distanceTo(v3) < 1.0) { e.hit = hitHero(e.dmg || DMG.spear, sp.position, 5); if (e.hit) { e.state = 'gone'; puffDust(sp.position, 3, 1.5, 1); sfx && sfx('rockBreak', { at: sp.position.clone() }); fx.remove(sp); return false; } }
        const g = ground(sp.position.x, sp.position.z);
        if (sp.position.y <= g + 0.3 || e.t > 3) { e.state = 'stuck'; e.t = 0; sp.position.y = Math.max(sp.position.y, g + 0.3); puffDust(v2.set(sp.position.x, g, sp.position.z), 3, 2, 1.2); sfx && sfx('rockBreak', { at: sp.position.clone() }); }
        return true;
      }
      if (e.state === 'stuck') { if (e.t > 1.4) { sp.scale.multiplyScalar(1 - dt * 5); if (e.t > 1.9) { fx.remove(sp); return false; } } return true; }
      fx.remove(sp); return false;
    }
    // ---------------------------------------------------------------- blight breath + lingering clouds
    function emitSpore(at, dx, dz) {
      const s = spore(); s.position.copy(at); s.scale.setScalar(rand(0.6, 1.1)); const sp = rand(10, 15), ux = dx + rand(-0.2, 0.2), uz = dz + rand(-0.2, 0.2), uy = rand(-0.25, 0.05);
      const shade = rand(0.55, 1); s.material.color.setRGB(0.75 * shade + 0.25, 0.45 * shade, 0.9 * shade + 0.1); s.material.rotation = rand(0, 6.28);
      addFx({ obj: s, life: rand(1.1, 1.5), update(e, dt) { e.obj.position.x += ux * sp * dt * (1 - e.t / e.life * 0.6); e.obj.position.z += uz * sp * dt * (1 - e.t / e.life * 0.6); e.obj.position.y = Math.max(ground(e.obj.position.x, e.obj.position.z) + 0.5, e.obj.position.y + uy * sp * dt);
        e.obj.scale.multiplyScalar(1 + dt * 1.1); e.obj.material.opacity = 0.32 * Math.min(1, e.t * 5) * (1 - e.t / e.life); } });
    }
    const clouds = [];
    function addCloud(x, z) {
      if (Math.hypot(x - ARENA.x, z - ARENA.z) > ARENA.r - 1) return;
      const c = { x, z, r: 3.4, t: 0, life: 9, sprites: [] };
      for (let i = 0; i < 6; i++) { const s = spore(); s.visible = true; s.position.set(x + rand(-2, 2), ground(x, z) + rand(0.4, 1.3), z + rand(-2, 2)); s.scale.setScalar(rand(2.2, 3.3)); s.material.color.setRGB(rand(0.55, 0.8), rand(0.25, 0.4), rand(0.7, 0.95)); s.material.rotation = rand(0, 6.28); c.sprites.push(s); }
      clouds.push(c);
    }
    function updateClouds(dt) {
      const p = heroP();
      for (let i = clouds.length - 1; i >= 0; i--) { const c = clouds[i]; c.t += dt; const a = Math.min(1, c.t * 2) * Math.min(1, (c.life - c.t) / 1.5);
        c.sprites.forEach((s, k) => { s.material.opacity = 0.3 * a; s.position.y += Math.sin(c.t * 1.3 + k) * 0.003; });
        if (Math.hypot(p.x - c.x, p.z - c.z) < c.r && p.y - ground(c.x, c.z) < 3) { c.acc = (c.acc || 0) + dt; if (c.acc > 0.5) { c.acc = 0; hitHero(DMG.cloud * 0.5, v2.set(c.x, p.y, c.z), 0, { dot: true }); } }
        if (c.t > c.life) { c.sprites.forEach(s => { s.visible = false; s.material.opacity = 0; }); clouds.splice(i, 1); } }
    }
    // ---------------------------------------------------------------- ultimate: eruption waves + falling debris
    function erupt(x, z, size, delay = 0.95, kind = 'cell') {
      const y = ground(x, z), w = kind === 'cell' ? getSquare() : getWarn(); w.visible = true; w.position.set(x, y + 0.07, z); w.scale.set(size, 1, size); w.material.color.set(0xff6a2a);
      addFx({ obj: w, life: delay + 0.15, update(e) { e.obj.material.opacity = (0.25 + 0.3 * Math.abs(Math.sin(e.t * 9))) * Math.min(1, e.t * 4); if (e.t >= delay) { e.obj.material.opacity = 0; return false; } return true; } });
      addFx({ life: delay + 1.9, update(e) {
        if (!e.up && e.t >= delay) { e.up = true; shakeHold(0.35);
          const n = kind === 'cell' ? 4 : 2, half = size * 0.5;
          if (Math.random() < 0.5) { const pl = getPillar(); pl.visible = true; pl.position.set(x + rand(-0.6, 0.6), y - 5, z + rand(-0.6, 0.6)); pl.scale.set(rand(0.9, 1.2), rand(3.5, 5.5), rand(0.9, 1.2)); pl.rotation.set(rand(-0.15, 0.15), rand(0, 6), rand(-0.15, 0.15)); e.parts = [{ m: pl, h: pl.scale.y, y }]; }
          else e.parts = [];
          for (let k = 0; k < n; k++) { const r = getRoot(); r.visible = true; r.material = Math.random() < 0.3 ? mossMat : rootMat; r.position.set(x + rand(-half, half) * 0.8, y - 5, z + rand(-half, half) * 0.8);
            r.scale.set(rand(1, 1.6), rand(3, 5.5), rand(1, 1.6)); r.rotation.set(rand(-0.4, 0.4), rand(0, 6), rand(-0.4, 0.4)); e.parts.push({ m: r, h: r.scale.y, y }); }
          puffDust(v2.set(x, y, z), 2, 2.6, 2); if (Math.random() < 0.35) sfx && sfx('rockRise', { at: v2.clone(), arg: 0.6 });
          const p = heroP(), inside = kind === 'cell' ? Math.abs(p.x - x) < half && Math.abs(p.z - z) < half : Math.hypot(p.x - x, p.z - z) < size;
          if (inside && p.y - y < 2.5) hitHero(DMG.pillar, v2.set(x, p.y, z), 4, { launch: 8 });
        }
        if (e.parts) { const u = e.t - delay; for (const q of e.parts) q.m.position.y = q.y - (u < 0.12 ? (1 - u / 0.12) * q.h : u > 1.4 ? Math.min(1, (u - 1.4) / 0.45) * q.h : 0) - 0.3;
          if (e.t >= e.life - 0.02) for (const q of e.parts) q.m.visible = false; }
        return true; } });
    }
    function wave(kind) {
      const C = 7;
      if (kind === 'checkA' || kind === 'checkB') { for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) { if (((i + j) & 1) !== (kind === 'checkA' ? 0 : 1)) continue;
        const x = ARENA.x + i * C, z = ARENA.z + j * C; if (Math.hypot(x - ARENA.x, z - ARENA.z) > ARENA.r - 2 || Math.hypot(x - D.pos.x, z - D.pos.z) < 4.5) continue; erupt(x, z, C - 0.4); } }
      else if (kind === 'rings') { for (let r = 9; r < ARENA.r; r += 8) for (let k = 0, n = Math.round(r * 0.9); k < n; k++) { const a = k / n * 6.28; erupt(D.pos.x + Math.cos(a) * r, D.pos.z + Math.sin(a) * r, 2.4, 0.95, 'disc'); } }
      else { const p = heroP(), hv = ctx.heroVel ? ctx.heroVel() : v4.set(0, 0, 0); for (let k = 0; k < (kind === 'track2' ? 5 : 3); k++) { const lead = 0.3 + k * 0.32; erupt(p.x + hv.x * lead, p.z + hv.z * lead, 2.8, 0.75 + k * 0.32, 'disc'); } }
      sfx && sfx('rumbleHit', { at: D.pos.clone() });
    }
    function dropDebris(targeted) {
      const p = heroP(); let x, z;
      if (targeted) { x = p.x + rand(-1.5, 1.5); z = p.z + rand(-1.5, 1.5); } else { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * (ARENA.r - 2); x = ARENA.x + Math.cos(a) * r; z = ARENA.z + Math.sin(a) * r; }
      const y = ground(x, z), w = getWarn(); w.visible = true; w.position.set(x, y + 0.06, z); w.scale.setScalar(1.6); w.material.color.set(0x220a02);
      const rock = getDebris(); rock.visible = true; rock.scale.setScalar(rand(0.8, 1.4)); const fall = 0.85;
      addFx({ obj: rock, life: fall + 0.6, update(e) { const u = Math.min(1, e.t / fall); e.obj.position.set(x, y + 22 * (1 - u * u), z); e.obj.rotation.x += 0.2; e.obj.rotation.z += 0.13;
        w.material.color.setRGB(0.6 * u, 0.15 * u, 0.05 * u); w.material.opacity = 0.35 + 0.4 * u; w.scale.setScalar(1.6 - 0.4 * u);
        if (u >= 1 && !e.land) { e.land = true; w.visible = false; puffDust(v2.set(x, y, z), 3, 2.2, 1.6); sfx && Math.random() < 0.5 && sfx('rockBreak', { at: v2.clone() });
          const p2 = heroP(); if (Math.hypot(p2.x - x, p2.z - z) < 1.8 && p2.y - y < 2.5) hitHero(DMG.debris, v2.set(x, p2.y, z), 4); }
        if (e.land) e.obj.position.y = y + 0.3 - (e.t - fall) * 1.2;
        return true; } });
    }
    // ---------------------------------------------------------------- the vines of the Vine-Whip
    function vineReach(k) { if (!rig) return; for (const v of rig.vines) v.len = k; }
    function updateVines(t) {
      if (!rig) return;
      for (const v of rig.vines) { v.m.visible = v.len > 0.02; if (!v.m.visible) continue;
        v.bone.getWorldPosition(v.m.position); const out = v2.set(D.pos.x - v.m.position.x, 0, D.pos.z - v.m.position.z).normalize().negate();
        const side = v3.set(-out.z, 0, out.x).multiplyScalar(v.s * 0.6), dir = v4.copy(out).add(side).normalize();
        v.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.add(v1.set(0, 0.1 + 0.06 * Math.sin(t * 18 + v.ph), 0)).normalize());
        v.m.scale.set(1, 3.1 * v.len, 1); v.b.rotation.set(0.5 * Math.sin(t * 14 + v.ph) * v.s, 0, 0.35 * v.s + 0.25 * Math.sin(t * 11 + v.ph));     // the outer half whips and curls
        v.b.scale.set(0.8, 0.95, 0.8); }
    }

    // ================================================================ enrage: flight
    function startFlight() {
      D.enraged = true; D.fly = { mode: 'takeoff', t: 0, ang: Math.atan2(D.pos.z - ARENA.z, D.pos.x - ARENA.x), barrages: 0, next: 2.5 };
      D.act = null; showBanner('Gaiavor takes to the sky!', 'the Earth Dragon is enraged'); sfx && sfx('roar', { at: headPos.clone(), arg: 1.5 }); shake(0.7);
    }
    function updateFlight(dt) {
      const F = D.fly, p = heroP(); F.t += dt;
      const faceHero = k => { const want = Math.atan2(p.x - D.pos.x, p.z - D.pos.z); let d = want - D.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); D.yaw += d * Math.min(1, dt * k); };
      let P;
      if (F.mode === 'takeoff') { D.alt = Math.min(11, D.alt + dt * 5.5); faceHero(2); P = { wings: 2, flap: { phase: F.t * 1.6, amp: 1 }, crouch: 1, tailStraight: 0.5, pitch: -0.15, head: 0.25 }; if (F.t > 2.4) { F.mode = 'hover'; F.t = 0; } }
      else if (F.mode === 'hover') {
        F.ang += dt * 0.35; const tx = ARENA.x + Math.cos(F.ang) * 18, tz = ARENA.z + Math.sin(F.ang) * 18; D.pos.x += (tx - D.pos.x) * Math.min(1, dt * 0.8); D.pos.z += (tz - D.pos.z) * Math.min(1, dt * 0.8); D.pos.y = ground(D.pos.x, D.pos.z);
        D.alt += (11 + Math.sin(F.t * 1.3) * 0.8 - D.alt) * Math.min(1, dt * 2); faceHero(3);
        P = { wings: 2, flap: { phase: F.t * 1.25, amp: 1 }, crouch: 1, tailStraight: 0.5, pitch: 0.05, head: 0.35, jaw: F.firing ? 0.8 : 0.2 };
        F.next -= dt;
        if (F.next <= 0 && !F.firing) { F.firing = { list: raiseSpears(20, 3.5, 1.4), t: 0, k: 0 }; sfx && sfx('roar', { at: headPos.clone() }); }
        if (F.firing) { const fr = F.firing; fr.t += dt;
          while (fr.t > 0.9 + fr.k * 0.14 && fr.k < 20) { fireSpear(fr.list[fr.k], 36, rand(-1.4, 1.4)); fr.list[fr.k].dmg = DMG.barrage; fr.k++; }
          if (fr.k >= 20 && fr.t > 4) { F.firing = null; F.barrages++; F.next = 4.5; if (F.barrages % 2 === 0) { F.mode = 'swoop'; F.t = 0; F.target = new THREE.Vector3(p.x, ground(p.x, p.z), p.z); sfx && sfx('roar', { at: headPos.clone() }); } } }
      } else if (F.mode === 'swoop') {
        const T = F.target, dx = T.x - D.pos.x, dz = T.z - D.pos.z, d = Math.hypot(dx, dz);
        if (F.t < 0.8) { faceHero(4); D.alt += dt * 2; P = { wings: 1.6, flap: { phase: F.t * 2, amp: 1 }, crouch: 1, pitch: -0.2, jaw: 1 }; }
        else { const sp = 24 * dt; D.pos.x += dx / (d || 1) * Math.min(sp, d); D.pos.z += dz / (d || 1) * Math.min(sp, d); D.pos.y = ground(D.pos.x, D.pos.z); D.alt = Math.max(0, D.alt - dt * 14);
          P = { wings: 1.9, crouch: 0.8, pitch: 0.35, jaw: 1, armL: [1.2, 0.3, 0, 0], armR: [1.2, 0.3, 0, 0], claws: 1, tailStraight: 1 };
          if (!F.hit && Math.hypot(p.x - D.pos.x, p.z - D.pos.z) < 3.2 && p.y - (D.pos.y + D.alt) < 3) F.hit = hitHero(DMG.swoop, D.pos, 13);
          if (D.alt <= 0.01 && (d < 0.5 || F.t > 3)) { F.mode = 'tired'; F.t = 0; D.exhausted = 4.5; shake(1); sfx && sfx('stomp', { at: D.pos.clone() }); puffDust(D.pos, 12, 4, 2.5); showBanner('He crashed down!', 'strike now', 1500); } }
      } else if (F.mode === 'tired') {
        D.alt = 0; P = { wings: 0.9, crouch: 0.65, head: 0.55, jaw: 0.35 + 0.15 * Math.sin(F.t * 6), spine: 0.15 };
        if (F.t > 4.6) { F.mode = 'takeoff'; F.t = 0; F.hit = false; }
      }
      return P;
    }

    // ================================================================ AI: choose the next move
    function decide() {
      const p = heroP(), dx = p.x - D.pos.x, dz = p.z - D.pos.z, d = Math.hypot(dx, dz), f = fwd(), cos = (dx * f.x + dz * f.z) / (d || 1);
      const ready = n => (D.cd[n] || 0) <= 0, p2 = D.phase >= 2, hpF = D.hp / HP_MAX;
      if (!D.ultDone[0] && hpF <= 0.65) { D.ultDone[0] = true; return start('ult'); }
      if (!D.ultDone[1] && hpF <= 0.30) { D.ultDone[1] = true; return start('ult'); }
      if (d < 10.5 && cos < -0.25 && ready('tail')) return start('tail');
      if (d > 9 && Math.random() < 0.45) { D.approachT = rand(1.4, 2.6); return null; }       // often he closes in to fight claw to claw
      if (cos > 0.55) {
        if (d < 8 && ready('claw')) return start('claw');
        if (p2 && d < 12 && ready('whip') && Math.random() < 0.6) return start('whip');
        if (p2 && d < 16 && d > 4 && ready('breath') && Math.random() < 0.55) return start('breath');
        if (d > 7 && d < 34 && ready('spears') && Math.random() < 0.5) return start('spears');
        if (d > 6 && d < 32 && ready('stomp')) return start('stomp');
      }
      if (d < 7 && ready('whip') && p2) return start('whip');
      return null;
    }

    // ================================================================ fight lifecycle
    function wake() {
      D.state = 'intro'; D.t = 0; D.introRoar = false; D.fellFx = false; D.hp = HP_MAX; D.fightT = 0; D.phase = 1; D.enraged = false; D.fly = null; D.alt = 0; D.ultDone = [false, false]; D.cd = { stomp: 3, spears: 6, breath: 4, whip: 4 }; D.exhausted = 0;
      thorns.visible = true; sfx && sfx('roar', { at: center.clone(), arg: 1.3 }); shake(0.8);
      showBanner(NAME, 'Heart of the Grove', 3000); if (bar) { bar.style.display = 'block'; drawBar(); }
      ctx.onFight && ctx.onFight(true);
    }
    function resetSleep() {
      D.state = 'dormant'; D.hp = HP_MAX; D.act = null; D.fly = null; D.alt = 0; D.exhausted = 0; D.enraged = false; D.pos.copy(center); D.yaw = Math.PI * 0.85; D.t = 0;
      thorns.visible = false; wallUp = 0; if (bar) bar.style.display = 'none'; combat.dead = true; clearFx(); ctx.onFight && ctx.onFight(false);
      if (rig) { rig.root.visible = true; rig.root.scale.setScalar(SC); rig.material.color.setRGB(1, 1, 1); }
    }
    function die() {
      D.state = 'dying'; D.deadT = 0; D.act = null; D.fly = null; D.exhausted = 0; combat.dead = true; sfx && sfx('roar', { at: headPos.clone(), arg: 0.7 }); shake(0.8);
      showBanner('Gaiavor has fallen', 'the Heart of the Grove is at peace', 3800); drawBar(); if (barFill) { barFill.style.width = '0%'; barChip.style.width = '0%'; barSub.textContent = 'Defeated'; }
      let n = 0; try { n = +localStorage.getItem('aethelos.groveHearts.v1') || 0; localStorage.setItem('aethelos.groveHearts.v1', String(n + 1)); } catch (_) {}
      ctx.onVictory && ctx.onVictory();
    }
    function clearFx() { for (const e of live) { if (e.obj) { e.obj.visible = false; if (e.obj.geometry === spearGeo) fx.remove(e.obj); } } live.length = 0; for (const c of clouds) c.sprites.forEach(s => s.visible = false); clouds.length = 0; vineReach(0); }

    // ================================================================ main update
    let frame = 0;
    function update(dt) {
      frame++; if (!rig) return;
      dt = Math.min(dt, 0.05); D.t += dt;
      const p = heroP(), dHero = Math.hypot(p.x - ARENA.x, p.z - ARENA.z);
      // the effects run in every state
      for (let i = live.length - 1; i >= 0; i--) { const e = live[i]; e.t += dt; const keep = e.update(e, dt); if (keep === false || e.t > e.life) { if (e.obj && e.obj.geometry !== spearGeo) e.obj.visible = false; live.splice(i, 1); } }
      updateClouds(dt);
      if (holdShake > 0) { shake(holdShake); holdShake = 0; }
      // flowers heal (fight only, and only when hurt)
      for (const F of flowers) { if (!F.ready) { F.t += dt; if (F.t > 45) { F.ready = true; F.g.visible = true; } continue; }
        F.g.rotation.y += dt * 0.6; if (D.state === 'fight' && ctx.health && ctx.health.hp < ctx.health.max && Math.hypot(p.x - F.g.position.x, p.z - F.g.position.z) < 1.7) {
          ctx.health.heal(25); F.ready = false; F.t = 0; F.g.visible = false; sfx && sfx('pickup', { at: F.g.position.clone() }); showToast && showToast('Moonpetal: +25 health'); } }
      let P;
      if (D.state === 'gone') { rig.root.visible = false; if (gameHours() >= D.respawnAt) resetSleep(); return; }
      if (D.state === 'dormant') {
        P = { crouch: 1, spine: 0.35 + 0.03 * Math.sin(D.t * 0.8), neck: 0.55, head: 0.65, wings: 0.25, tailYaw: 1.3, tailWave: { phase: D.t * 0.1, amp: 0.5 }, pitch: 0.1, lift: -0.035, armL: [-0.1, 0.1, 0, 0.5], armR: [-0.1, 0.1, 0, 0.5] };
        if (!heroDead() && dHero < ARENA.r - 6) wake();
      } else if (D.state === 'intro') {
        const u = D.t; P = sample([[0, { crouch: 1, spine: 0.35, neck: 0.55, head: 0.65, wings: 0.25, tailYaw: 1.3, pitch: 0.1, lift: -0.035 }], [1.4, { crouch: 0.2, wings: 0.8 }],
          [2.2, { pitch: -0.45, head: -0.7, jaw: 1, wings: 1.6, neck: -0.3 }], [3.6, { pitch: -0.2, head: -0.4, jaw: 0.6, wings: 1.3 }], [4.2, {}]], u, basePose(D.t));
        faceToward(p, dt, 1.2); if (u > 1.9 && !D.introRoar) { D.introRoar = true; sfx && sfx('roar', { at: headPos.clone(), arg: 1.6 }); shake(1.0); }
        wallUp = Math.min(1, wallUp + dt * 0.8);
        if (u > 4.2) { D.state = 'fight'; D.t = 0; }
      } else if (D.state === 'fight') {
        D.fightT += dt; combat.dead = false;
        for (const k in D.cd) D.cd[k] -= dt;
        if (D.phase === 1 && D.hp / HP_MAX < 0.55) { D.phase = 2; showBanner('Gaiavor grows furious', 'new attacks: Vine-Whip and Blight Breath', 2200); sfx && sfx('roar', { at: headPos.clone() }); }
        if (!D.enraged && D.fightT >= ENRAGE_T && !(D.act && D.act.ult)) startFlight();
        if (heroDead()) { /* the world will reset us */ }
        D.exhausted = Math.max(0, D.exhausted - dt);
        if (D.fly) P = updateFlight(dt);
        else if (D.act) { const a = D.act; a.t += dt; if (a.t < (a.track ?? 0.3)) faceToward(p, dt, 2.2); P = sample(a.keys, a.t, basePose(D.t)); a.step && a.step(a, dt); if (a.t >= a.dur) { a.end && a.end(a); D.act = null; D.idleT = rand(0.35, 0.8) / (D.phase >= 2 ? 1.25 : 1); } }
        else if (D.exhausted > 0) P = { crouch: 0.6, head: 0.55, jaw: 0.35 + 0.2 * Math.sin(D.t * 7), spine: 0.15, wings: 0.7 };
        else {
          D.idleT -= dt; P = basePose(D.t);
          const dx = p.x - D.pos.x, dz = p.z - D.pos.z, d = Math.hypot(dx, dz), turn = faceToward(p, dt, 1.7);
          D.approachT = Math.max(0, (D.approachT || 0) - dt);
          if (D.idleT <= 0 && !D.approachT && Math.abs(turn) < 0.5 && decide()) { /* started */ }
          else if ((d > 7.5 || (D.approachT > 0 && d > 5.5)) && !heroDead()) {                // walk toward him
            const sp = 4.6 * dt, f = fwd(); const nx = D.pos.x + f.x * sp, nz = D.pos.z + f.z * sp;
            if (Math.hypot(nx - ARENA.x, nz - ARENA.z) < ARENA.r - 6) { D.pos.x = nx; D.pos.z = nz; D.pos.y = ground(nx, nz); D.walkPh += sp / 4.4; }
            P.walk = { phase: D.walkPh, amp: 1 };
          } else if (D.approachT > 0) D.approachT = 0; else if (Math.abs(turn) > 0.15) { D.walkPh += dt * 0.6; P.walk = { phase: D.walkPh, amp: 0.45 }; }
        }
        // keep the hero inside the thorns and out of the dragon's body
        const r = Math.hypot(p.x - ARENA.x, p.z - ARENA.z); if (r > ARENA.r - 0.6 && !heroDead()) { p.x = ARENA.x + (p.x - ARENA.x) / r * (ARENA.r - 0.6); p.z = ARENA.z + (p.z - ARENA.z) / r * (ARENA.r - 0.6); }
        if (D.alt < 2) for (const [off, rad] of [[1.2, 2.7], [3.4, 1.6]]) { const cx = D.pos.x + Math.sin(D.yaw) * off, cz = D.pos.z + Math.cos(D.yaw) * off, ddx = p.x - cx, ddz = p.z - cz, dd = Math.hypot(ddx, ddz);
          if (dd < rad && dd > 0.01) { p.x = cx + ddx / dd * rad; p.z = cz + ddz / dd * rad; } }
        if (heroDead()) { /* handled by onHeroDefeated */ }
        if (frame % 6 === 0) drawBar();
      } else if (D.state === 'dying') {
        D.deadT += dt; D.alt = Math.max(0, D.alt - dt * 8);
        P = sample([[0, { pitch: -0.3, head: -0.6, jaw: 1, wings: 1.4 }], [1.2, { pitch: 0.05, crouch: 0.7, head: 0.4, jaw: 0.5, wings: 0.9, spineYaw: 0.3 }], [2.6, { pitch: 0.12, crouch: 1, spine: 0.4, neck: 0.8, head: 0.9, wings: 0.2, tailYaw: 0.8, lift: -0.04, jaw: 0.3 }], [9, { pitch: 0.12, crouch: 1, spine: 0.4, neck: 0.8, head: 0.9, wings: 0.2, tailYaw: 0.8, lift: -0.04 }]], D.deadT, basePose(0));
        P.tailWave = null;
        const g = Math.min(1, Math.max(0, (D.deadT - 2.5) / 3)); rig.material.color.setRGB(1 - 0.45 * g, 1 - 0.3 * g, 1 - 0.5 * g);       // turns to moss and stone
        if (D.deadT > 1.8 && !D.fellFx) { D.fellFx = true; shake(0.6); puffDust(D.pos, 12, 4, 2); sfx && sfx('stomp', { at: D.pos.clone() }); }
        wallUp = Math.max(0, wallUp - dt * 0.4);
        if (D.deadT > 8.5) { D.state = 'gone'; D.respawnAt = gameHours() + RESPAWN_H; rig.root.visible = false; thorns.visible = false; if (bar) bar.style.display = 'none'; clearFx(); ctx.onFight && ctx.onFight(false); }
      }
      // thorn wall rises / sinks
      thorns.visible = wallUp > 0.01; if (thorns.visible) thorns.children.forEach((m, i) => { m.position.y = m.userData.y - 4.5 * (1 - Math.min(1, wallUp * 1.2 - (i % 7) * 0.02)); });
      if (D.state === 'fight' || D.state === 'intro') wallUp = Math.min(1, wallUp + dt * 0.8);
      // draw
      D.flash = Math.max(0, D.flash - dt * 6); const ex = D.exhausted > 0 ? 0.12 + 0.08 * Math.sin(D.t * 8) : 0;
      rig.material.emissive.setRGB(0.55 * D.flash + ex * 0.6, 0.55 * D.flash + ex * 0.5, 0.45 * D.flash + ex * 0.1);
      rig.root.position.set(D.pos.x, D.pos.y + D.alt, D.pos.z); rig.root.rotation.set(0, D.yaw, 0);
      if (P) rig.pose(smoothTo(P, dt));
      rig.root.updateMatrixWorld(true);                 // bone positions are used for hits (tail, head, jaw) this frame
      updateCenters(); updateVines(D.t);
    }
    function faceToward(p, dt, rate) { const want = Math.atan2(p.x - D.pos.x, p.z - D.pos.z); let d = want - D.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); D.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt); return d; }
    function onHeroDefeated() { if (D.state === 'fight' || D.state === 'intro') setTimeout(resetSleep, 2300); }
    function dispose() {
      unreg(); clearFx(); scene.remove(fx); if (rig) { scene.remove(rig.root); rig.material.dispose(); }
      bar && bar.remove(); banner && banner.remove();
      for (const m of [stoneMat, spearMat, rootMat, mossMat, vineMat]) m.dispose(); for (const g of [spikeGeo, spearGeo, pillarGeo, rootGeo, debrisGeo, discGeo, squareGeo, ringGeo, thornGeo]) g.dispose();
      for (const t of [sporeTex, dustTex, glowTex]) t.dispose();
    }
    return {
      load, update, swordHit, dispose, onHeroDefeated, ARENA, get state() { return D.state; }, get hp() { return D.hp; }, get hpMax() { return HP_MAX; },
      get fighting() { return D.state === 'fight' || D.state === 'intro'; }, get ready() { return !!rig; }, get flying() { return D.alt > 3; },
      aimPoint: () => (D.state === 'fight' && D.alt < 3 ? bodyCenter : null), get position() { return D.pos; },
      debug: { D, start: n => start(n), wake, resetSleep, flowers, clouds, live, hurt: n => hurt(n, 'debug'), setFightTime: t => { D.fightT = t; }, startFlight, get rig() { return rig; } }
    };
  }
  A.createEarthDragon = createEarthDragon; A.DRAGON_ARENA = ARENA;
})();
