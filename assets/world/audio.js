/* Aethelos sound: every effect is synthesised live with Web Audio (no sound files to download).
   createAudio({camera}) -> { unlock(), play(name, {at, vol, rate}), loop(name, on, {at, vol}), setMuted(b), muted, ambient(day, night), update() }
   Sounds: neigh, snort, hoof (hard / soft), saddle, swing, hit, shing (sword drawn), swordIn, portal, portalClose, powerUp,
   ignite, boom, impact, jump, land, roll, kick, step, horseJump, horseLand, fire (loop), plus ambience (wind, birds, crickets). */
(() => {
  const A = window.Aethelos ||= {};
  const MUTE_KEY = 'aethelos.muted.v1';
  function createAudio({ camera } = {}) {
    let ctx = null, master = null, comp = null, noiseBuf = null, muted = false;
    try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (_) {}
    const loops = {};
    function init() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC();
      comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(comp);
      const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return ctx;
    }
    function unlock() { if (!init()) return; if (ctx.state === 'suspended') ctx.resume(); }
    const now = () => ctx.currentTime;
    // ------------------------------------------------ building blocks
    function out(at, vol = 1) {                        // gain (+ stereo pan and distance fall-off when `at` is given)
      const g = ctx.createGain(); g.gain.value = vol;
      if (at && camera) {
        const v = at.clone().applyMatrix4(camera.matrixWorldInverse), d = v.length();
        g.gain.value = vol / (1 + Math.max(0, d - 4) / 9);
        if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, v.x / Math.max(3, d))); g.connect(p); p.connect(master); return g; }
      }
      g.connect(master); return g;
    }
    function noise(dur, t0 = now()) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05); return s; }
    function env(g, t0, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(end, t0 + a + d); }
    function filt(type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
    function osc(type, f, t0, dur) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); o.start(t0); o.stop(t0 + dur + 0.05); return o; }
    function thump(dst, t0, f0, f1, dur, vol) { const o = osc('sine', f0, t0, dur); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur); const g = ctx.createGain(); env(g, t0, 0.004, vol, dur); o.connect(g); g.connect(dst); }
    function hiss(dst, t0, type, f, q, a, vol, d, sweepTo) { const s = noise(a + d, t0), b = filt(type, f, q), g = ctx.createGain(); if (sweepTo) b.frequency.exponentialRampToValueAtTime(sweepTo, t0 + a + d); env(g, t0, a, vol, d); s.connect(b); b.connect(g); g.connect(dst); }
    function ring(dst, t0, f, partials, dur, vol) { for (const [m, a, dk] of partials) { const o = osc('sine', f * m, t0, dur * dk); const g = ctx.createGain(); env(g, t0, 0.002, vol * a, dur * dk); o.connect(g); g.connect(dst); } }
    // ------------------------------------------------ the sounds
    const S = {
      hoof(o, t0, { hard = true, heavy = 1 } = {}) {      // a hoof strike: knock on the road, thud on grass
        thump(o, t0, 150 * (0.9 + Math.random() * 0.2), 55, 0.09 * heavy, 0.9 * heavy);
        hiss(o, t0, 'bandpass', hard ? 1900 + Math.random() * 500 : 700, hard ? 3 : 1.2, 0.002, hard ? 0.55 : 0.35, hard ? 0.05 : 0.08);
        if (!hard) hiss(o, t0 + 0.01, 'lowpass', 2500, 0.7, 0.01, 0.12, 0.12);                 // turf kicked up
      },
      neigh(o, t0) {                                      // whinny: a rising cry that breaks into a fast falling trill, then a breath
        const dur = 1.45, src = osc('sawtooth', 520, t0, dur), vib = osc('sine', 9, t0, dur), vg = ctx.createGain();
        vg.gain.setValueAtTime(5, t0); vg.gain.linearRampToValueAtTime(70, t0 + 0.5); vg.gain.linearRampToValueAtTime(110, t0 + 1.2);
        vib.frequency.setValueAtTime(7, t0); vib.frequency.linearRampToValueAtTime(15, t0 + 0.6); vib.frequency.linearRampToValueAtTime(11, t0 + dur);
        vib.connect(vg); vg.connect(src.frequency);
        src.frequency.setValueAtTime(520, t0); src.frequency.exponentialRampToValueAtTime(1150, t0 + 0.32); src.frequency.exponentialRampToValueAtTime(900, t0 + 0.6);
        src.frequency.exponentialRampToValueAtTime(420, t0 + 1.3);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.08); g.gain.setValueAtTime(0.5, t0 + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        const mix = ctx.createGain(); mix.gain.value = 1;
        for (const [f, q, a] of [[900, 6, 1], [1700, 7, 0.6], [2900, 8, 0.3]]) { const b = filt('bandpass', f, q), ga = ctx.createGain(); ga.gain.value = a; src.connect(b); b.connect(ga); ga.connect(g); }
        g.connect(o); hiss(o, t0, 'bandpass', 1600, 0.8, 0.05, 0.12, dur * 0.9);                                // breathy edge
        S.snort(o, t0 + dur - 0.05, 0.6);
      },
      snort(o, t0, v = 1) { hiss(o, t0, 'lowpass', 900, 0.8, 0.01, 0.55 * v, 0.12); hiss(o, t0 + 0.14, 'lowpass', 700, 0.8, 0.01, 0.4 * v, 0.2); thump(o, t0, 90, 60, 0.15, 0.25 * v); },
      saddle(o, t0) { for (let i = 0; i < 5; i++) hiss(o, t0 + i * 0.045 + Math.random() * 0.02, 'bandpass', 420 + Math.random() * 200, 6, 0.005, 0.25, 0.05); },
      swing(o, t0, r = 1) { hiss(o, t0, 'bandpass', 380 * r, 1.4, 0.06, 0.55, 0.22, 2300 * r); },
      hit(o, t0) { ring(o, t0, 620 + Math.random() * 60, [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.3, 0.35], [8.9, 0.15, 0.2]], 0.5, 0.35); hiss(o, t0, 'highpass', 3000, 0.7, 0.002, 0.5, 0.06); thump(o, t0, 160, 70, 0.12, 0.5); },
      shing(o, t0) { hiss(o, t0, 'bandpass', 1200, 1.2, 0.15, 0.25, 0.1, 5000); ring(o, t0 + 0.18, 1650, [[1, 1, 1], [1.51, 0.6, 0.8], [2.33, 0.45, 0.6], [3.62, 0.25, 0.4]], 1.3, 0.22); },
      swordIn(o, t0) { hiss(o, t0, 'bandpass', 4000, 1.2, 0.02, 0.3, 0.3, 900); ring(o, t0, 1100, [[1, 1, 1], [2.1, 0.4, 0.5]], 0.35, 0.12); },
      portal(o, t0, big = 1) {                            // pocket dimension tearing open: deep swirl + airy shimmer
        hiss(o, t0, 'bandpass', 300, 2, 0.25, 0.5 * big, 0.9 * big, 1400);
        for (const f of [196, 293.7, 392]) { const s = osc('sine', f * (big > 1 ? 0.5 : 1), t0, 1.4 * big), tr = osc('sine', 7, t0, 1.4 * big), tg = ctx.createGain(), g = ctx.createGain();
          tg.gain.value = 0.5; tr.connect(tg); tg.connect(g.gain); env(g, t0, 0.3, 0.07 * big, 1.1 * big); s.connect(g); g.connect(o); }
        thump(o, t0, 70, 35, 0.6 * big, 0.4 * big);
      },
      portalClose(o, t0) { hiss(o, t0, 'bandpass', 1800, 1.5, 0.02, 0.35, 0.4, 250); thump(o, t0 + 0.25, 80, 40, 0.3, 0.35); },
      powerUp(o, t0) {                                    // energy gathering: a rising chord with a tremolo and crackle
        for (const m of [1, 1.5, 2.01]) { const s = osc('sawtooth', 70 * m, t0, 1.3), g = ctx.createGain(), b = filt('lowpass', 400, 2);
          s.frequency.exponentialRampToValueAtTime(300 * m, t0 + 1.2); b.frequency.exponentialRampToValueAtTime(3000, t0 + 1.2); env(g, t0, 0.9, 0.12, 0.35); s.connect(b); b.connect(g); g.connect(o); }
        for (let i = 0; i < 14; i++) hiss(o, t0 + Math.random() * 1.1, 'highpass', 2500 + Math.random() * 3000, 1, 0.002, 0.25 * Math.random() + 0.08, 0.04);
      },
      ignite(o, t0) { hiss(o, t0, 'lowpass', 300, 0.8, 0.02, 1.0, 0.9, 5000); thump(o, t0, 75, 28, 0.9, 1.0); hiss(o, t0 + 0.05, 'bandpass', 2200, 0.8, 0.05, 0.35, 1.2); },
      boom(o, t0, big = 1) { hiss(o, t0, 'bandpass', 500, 0.9, 0.02, 0.8 * big, 0.5, 3200); thump(o, t0, 110, 38, 0.5 * big, 0.9 * big); hiss(o, t0, 'highpass', 4500, 0.7, 0.001, 0.5, 0.05); },
      impact(o, t0) { thump(o, t0, 90, 30, 0.6, 1.0); hiss(o, t0, 'lowpass', 1800, 0.7, 0.005, 0.8, 0.5, 300); },
      jump(o, t0) { hiss(o, t0, 'bandpass', 700, 1.2, 0.03, 0.25, 0.15, 1400); },
      land(o, t0, v = 1) { thump(o, t0, 120, 50, 0.12, 0.6 * v); hiss(o, t0, 'lowpass', 1500, 0.7, 0.003, 0.3 * v, 0.1); },
      roll(o, t0) { hiss(o, t0, 'bandpass', 500, 1, 0.08, 0.35, 0.35, 1500); S.land(o, t0 + 0.35, 0.8); },
      kick(o, t0) { thump(o, t0, 200, 90, 0.08, 0.7); hiss(o, t0, 'bandpass', 1400, 2, 0.002, 0.35, 0.04); },
      step(o, t0, hard = false) { thump(o, t0, 120 + Math.random() * 30, 60, 0.06, 0.32); hiss(o, t0, 'bandpass', hard ? 2400 : 900, hard ? 2.5 : 1, 0.003, hard ? 0.22 : 0.16, hard ? 0.04 : 0.07); },
      horseJump(o, t0) { S.snort(o, t0, 0.7); for (const dt of [0, 0.05]) S.hoof(o, t0 + dt, { hard: false, heavy: 1.2 }); },
      horseLand(o, t0) { for (const dt of [0, 0.06, 0.16, 0.21]) S.hoof(o, t0 + dt, { hard: false, heavy: 1.5 }); },
      chirp(o, t0) { const f = 3200 + Math.random() * 1800, n = 2 + (Math.random() * 4 | 0);
        for (let i = 0; i < n; i++) { const t = t0 + i * (0.09 + Math.random() * 0.05), s = osc('sine', f, t, 0.08), g = ctx.createGain();
          s.frequency.setValueAtTime(f, t); s.frequency.exponentialRampToValueAtTime(f * (0.7 + Math.random() * 0.6), t + 0.07); env(g, t, 0.01, 0.06, 0.06); s.connect(g); g.connect(o); } },
      // ---- red birds
      squawk(o, t0, v = 1) {                              // a harsh, nasal caw
        const f = 900 + Math.random() * 300, s = osc('sawtooth', f, t0, 0.32), g = ctx.createGain(), b = filt('bandpass', 1800, 3);
        s.frequency.setValueAtTime(f, t0); s.frequency.exponentialRampToValueAtTime(f * 1.35, t0 + 0.06); s.frequency.exponentialRampToValueAtTime(f * 0.7, t0 + 0.3);
        env(g, t0, 0.015, 0.22 * v, 0.28); s.connect(b); b.connect(g); g.connect(o); hiss(o, t0, 'bandpass', 2600, 2, 0.01, 0.08 * v, 0.25);
      },
      screech(o, t0) {                                    // locking on: a rising, trembling shriek
        const s = osc('sawtooth', 1300, t0, 0.75), vib = osc('sine', 28, t0, 0.75), vg = ctx.createGain(), g = ctx.createGain(), b = filt('bandpass', 2600, 2.5);
        vg.gain.value = 90; vib.connect(vg); vg.connect(s.frequency); s.frequency.setValueAtTime(1300, t0); s.frequency.exponentialRampToValueAtTime(2300, t0 + 0.55);
        env(g, t0, 0.08, 0.2, 0.6); s.connect(b); b.connect(g); g.connect(o); hiss(o, t0, 'highpass', 4200, 1, 0.1, 0.06, 0.55);
      },
      flap(o, t0, v = 1) { hiss(o, t0, 'bandpass', 600 + Math.random() * 200, 1.1, 0.02, 0.22 * v, 0.09); },
      dash(o, t0) { hiss(o, t0, 'bandpass', 500, 1.2, 0.08, 0.5, 0.45, 2600); hiss(o, t0 + 0.05, 'highpass', 3500, 0.8, 0.05, 0.12, 0.35); },
      birdHit(o, t0) { S.squawk(o, t0, 1.3); thump(o, t0, 220, 90, 0.08, 0.6); hiss(o, t0, 'bandpass', 1500, 1, 0.003, 0.5, 0.18); },          // struck: squawk + feathers
      birdCrash(o, t0) { thump(o, t0, 130, 45, 0.18, 0.9); hiss(o, t0, 'lowpass', 1600, 0.8, 0.004, 0.6, 0.25); S.squawk(o, t0 + 0.02, 0.7); },
      hurt(o, t0) { thump(o, t0, 140, 55, 0.16, 0.8); hiss(o, t0, 'bandpass', 900, 1.4, 0.004, 0.45, 0.16); hiss(o, t0 + 0.02, 'highpass', 3000, 1, 0.003, 0.25, 0.08); },
      cricket(o, t0) { for (let i = 0; i < 3; i++) { const t = t0 + i * 0.06, s = osc('sine', 4300, t, 0.04), g = ctx.createGain(); env(g, t, 0.004, 0.03, 0.03); s.connect(g); g.connect(o); } }
    };
    function play(name, { at = null, vol = 1, ...opt } = {}) {
      if (!ctx || ctx.state !== 'running' || muted || !S[name]) return;
      const o = out(at, vol);
      try { S[name](o, now() + 0.005, opt.arg); } catch (e) { console.warn('sfx', name, e); }
    }
    // looped beds: blue fire crackle (Azure Tempest), wind
    function loop(name, on, { vol = 0.5, at = null } = {}) {
      if (!ctx || ctx.state !== 'running') return;
      let L = loops[name];
      if (on && !L) {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        const g = ctx.createGain(); g.gain.value = 0.0001; let chain;
        if (name === 'fire') { const b = filt('bandpass', 900, 0.7), lfo = osc('sine', 13, now(), 1e6), lg = ctx.createGain(); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(g.gain); s.connect(b); b.connect(g); chain = [lfo]; }
        else { const b = filt('lowpass', 420, 0.6), lfo = osc('sine', 0.13, now(), 1e6), lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(b.frequency); s.connect(b); b.connect(g); chain = [lfo]; }
        g.connect(master); s.start(); L = loops[name] = { s, g, chain };
      }
      if (L) {
        const t = now(); L.g.gain.cancelScheduledValues(t); L.g.gain.setTargetAtTime(on && !muted ? vol : 0.0001, t, on ? 0.15 : 0.4);
        if (!on) { setTimeout(() => { if (loops[name] === L && L.g.gain.value < 0.002) { try { L.s.stop(); L.chain.forEach(c => c.stop()); } catch (_) {} delete loops[name]; } }, 2500); }
      }
    }
    let ambT = 0;
    function ambient(dt, { day = 1, night = 0, at = null, city = false } = {}) {
      if (!ctx || ctx.state !== 'running' || muted) return;
      loop('wind', true, { vol: 0.05 + 0.03 * night });
      ambT -= dt; if (ambT > 0) return; ambT = 0.6 + Math.random() * 2.2;
      if (day > 0.4 && Math.random() < 0.55 * day) play('chirp', { vol: 0.5 + Math.random() * 0.5 });
      if (night > 0.5 && Math.random() < 0.8) play('cricket', { vol: 0.4 + Math.random() * 0.4 });
    }
    function setMuted(m) { muted = !!m; try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (_) {}
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05); }
    function dispose() { for (const k in loops) loop(k, false); if (ctx) setTimeout(() => ctx.close().catch(() => {}), 600); }
    return { unlock, play, loop, ambient, setMuted, get muted() { return muted; }, get ready() { return !!ctx && ctx.state === 'running'; }, dispose };
  }
  A.createAudio = createAudio;
})();
