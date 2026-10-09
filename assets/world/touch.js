/* Phones and tablets: landscape game screen + on-screen controls.
   - Detects a touch device (coarse pointer / touch points; ?touch=1 forces it, ?touch=0 turns it off).
   - Landscape: asks for fullscreen + a landscape orientation lock on the first tap (Android). Where that is not possible
     (iPhone Safari, or inside an embedded page) and the phone is held upright, the game screen itself is turned 90° so it
     always plays in landscape.
   - Left thumb: a floating joystick (push it to the edge to run). Right thumb: Attack (big), Jump, Roll, Run toggle, Horse
     (tap 3x quickly to summon / send back), Azure Tempest (the V ring). Drag anywhere else to turn the camera, pinch to zoom.
     Top: time (hold), graphics, sound, fullscreen.
   createTouchControls({ root, state, showToast, onRotate }) -> { enabled, rotated, dispose() } */
(() => {
  const A = window.Aethelos ||= {};
  function isTouchDevice() {
    try { const q = new URLSearchParams(location.search).get('touch'); if (q === '1') return true; if (q === '0') return false; } catch (_) {}
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && (coarse || mobileUA);
  }
  const ICON = {
    attack: '<path d="M14 50 L44 20 L50 14 L48 22 L18 52 Z M16 40 L24 48 M12 52 L8 56" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
    jump: '<path d="M32 50 V16 M18 30 L32 16 L46 30" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
    roll: '<path d="M46 22 A16 16 0 1 0 48 38" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M38 18 L47 22 L44 31" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
    run: '<path d="M18 18 L32 32 L18 46 M32 18 L46 32 L32 46" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
    horse: '<path d="M20 48 V30 A12 12 0 0 1 44 30 V48" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><circle cx="20" cy="40" r="1.8" fill="#0b1626"/><circle cx="44" cy="40" r="1.8" fill="#0b1626"/>',
    time: '<circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 22 V32 L40 37" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
    gfx: '<circle cx="32" cy="32" r="8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 12 V18 M32 46 V52 M12 32 H18 M46 32 H52 M18 18 L22 22 M42 42 L46 46 M46 18 L42 22 M22 42 L18 46" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
    sound: '<path d="M14 26 H22 L34 16 V48 L22 38 H14 Z" fill="currentColor"/><path d="M40 24 A10 10 0 0 1 40 40 M44 18 A18 18 0 0 1 44 46" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
    mute: '<path d="M14 26 H22 L34 16 V48 L22 38 H14 Z" fill="currentColor"/><path d="M40 26 L52 38 M52 26 L40 38" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
    full: '<path d="M14 24 V14 H24 M40 14 H50 V24 M50 40 V50 H40 M24 50 H14 V40" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) || navigator.standalone === true;
  const canFullscreen = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  // call straight from a tap (Begin Adventure / Continue): fullscreen + landscape lock where the browser allows it (Android, iPad)
  function enterGameFullscreen() {
    if (!isTouchDevice() || standalone()) return;
    const el = document.documentElement;
    try {
      const done = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (_) {} };
      if (document.fullscreenElement || document.webkitFullscreenElement) return done();
      const r = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
      if (r && r.then) r.then(done, () => {}); else done();
    } catch (_) {}
  }
  const svg = k => `<svg viewBox="0 0 64 64" aria-hidden="true">${ICON[k]}</svg>`;
  function createTouchControls({ root, state, showToast, onRotate }) {
    if (!isTouchDevice()) return { enabled: false, rotated: false, dispose() {} };
    document.body.classList.add('touch-ui'); document.documentElement.classList.add('touch-lock');
    // fill the whole phone screen (under the notch / Dynamic Island) and never let the page zoom: iOS zooms on quick double taps
    const vp = document.querySelector('meta[name=viewport]'), vpWas = vp && vp.getAttribute('content');
    if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    const stop = e => { if (e.cancelable) e.preventDefault(); };
    let lastEnd = 0;
    const onTouchEnd = e => { const now = e.timeStamp || Date.now(); if ((now - lastEnd < 400 && !e.target.closest?.('button')) || e.target.closest?.('#touchUI')) stop(e); lastEnd = now; };
    const onTouchStart = e => { if (e.touches.length > 1 || e.target.closest?.('#touchUI')) stop(e); };
    const onTouchMove = e => { if (e.touches.length > 1 || e.scale && e.scale !== 1) stop(e); };
    const noZoom = [['gesturestart', stop], ['gesturechange', stop], ['gestureend', stop], ['dblclick', stop], ['touchstart', onTouchStart], ['touchmove', onTouchMove], ['touchend', onTouchEnd]];
    noZoom.forEach(([n, f]) => document.addEventListener(n, f, { passive: false }));
    const unzoom = () => { if (window.visualViewport && visualViewport.scale > 1.01 && vp) { const c = vp.getAttribute('content'); vp.setAttribute('content', c.endsWith(' ') ? c.trim() : c + ' '); } };   // re-applying the meta snaps a stray zoom back
    if (!document.getElementById('touchCss')) { const st = document.createElement('style'); st.id = 'touchCss'; st.textContent = `
      html.touch-lock, html.touch-lock body { overflow: hidden !important; overscroll-behavior: none; touch-action: none; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; height: 100%; }
      body.touch-ui #phase1World { --sl: env(safe-area-inset-left, 0px); --sr: env(safe-area-inset-right, 0px); --st: env(safe-area-inset-top, 0px); --sb: env(safe-area-inset-bottom, 0px); }
      body.touch-ui #phase1World.touch-rotated { --sl: env(safe-area-inset-top, 0px); --sr: env(safe-area-inset-bottom, 0px); --st: env(safe-area-inset-right, 0px); --sb: env(safe-area-inset-left, 0px); }
      body.touch-ui #phase1Hud .phase1-top { left: calc(10px + var(--sl)); right: calc(10px + var(--sr)); top: calc(8px + var(--st)); }
      body.touch-ui #phase1World { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
      #phase1World.touch-rotated { inset: auto; top: 0; transform-origin: 0 0; transform: rotate(90deg); }
      body.touch-ui #phase1Hud .phase1-top .phase1-panel p, body.touch-ui #phase1Hud .phase1-status { display: none !important; }
      body.touch-ui #phase1Hud .phase1-top .phase1-panel { padding: 6px 12px; }
      body.touch-ui #phase1Hud .phase1-top .phase1-panel h1 { font-size: 15px; margin: 0; }
      body.touch-ui #phase1Editor { display: none !important; }
      body.touch-ui #phase1Hud .phase1-actions { position: absolute; top: calc(8px + var(--st)); left: 50%; right: auto; bottom: auto; transform: translateX(-50%); padding: 4px; display: flex; gap: 6px; }
      body.touch-ui #phase1Hud .phase1-actions button { font-size: 12px; padding: 6px 10px; }
      body.touch-ui #kClock { top: calc(12px + var(--st)) !important; left: calc(138px + var(--sl)) !important; right: auto !important; }
      #touchUI { position: absolute; inset: 0; z-index: 40; pointer-events: none; font-family: 'Fredoka', 'Nunito', system-ui, sans-serif; }
      #touchUI .tb { position: absolute; pointer-events: auto; display: grid; place-items: center; border-radius: 50%; color: #eaf4ff;
        background: radial-gradient(circle at 35% 30%, rgba(60, 96, 150, .55), rgba(10, 20, 38, .62)); border: 2px solid rgba(190, 220, 255, .38);
        box-shadow: 0 4px 14px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .15); touch-action: none; -webkit-tap-highlight-color: transparent; }
      #touchUI .tb svg { width: 52%; height: 52%; }
      #touchUI .tb.on { background: radial-gradient(circle at 35% 30%, rgba(110, 170, 255, .85), rgba(30, 70, 150, .8)); border-color: rgba(220, 240, 255, .9); transform: scale(.94); }
      #touchUI .tb.sm { width: 42px; height: 42px; border-radius: 12px; }
      #touchUI .tb small { position: absolute; bottom: -15px; font-size: 10px; font-weight: 700; letter-spacing: .06em; color: rgba(235, 245, 255, .85); text-shadow: 0 1px 2px #000; }
      #touchUI .tb.latched { border-color: #9fd0ff; box-shadow: 0 0 12px rgba(120, 190, 255, .8); }
      #touchJoy { position: absolute; pointer-events: auto; left: var(--sl); bottom: 0; width: 46%; height: 64%; touch-action: none; }
      #touchJoyBase { position: absolute; width: 132px; height: 132px; margin: -66px 0 0 -66px; border-radius: 50%; border: 2px solid rgba(200, 225, 255, .35);
        background: radial-gradient(circle, rgba(20, 40, 70, .18), rgba(10, 20, 38, .42)); transition: opacity .2s; }
      #touchJoyKnob { position: absolute; width: 62px; height: 62px; margin: -31px 0 0 -31px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, rgba(170, 205, 255, .9), rgba(50, 90, 150, .85));
        border: 2px solid rgba(235, 245, 255, .8); box-shadow: 0 4px 12px rgba(0, 0, 0, .4); }
      #touchJoy.idle #touchJoyBase, #touchJoy.idle #touchJoyKnob { opacity: .55; }
      #touchJoy.run #touchJoyKnob { background: radial-gradient(circle at 35% 30%, #ffffff, #4aa8ff); box-shadow: 0 0 16px #4aa8ff; }
      #touchRotateHint { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); padding: 10px 16px; border-radius: 12px; background: rgba(8, 16, 30, .78); color: #eaf4ff;
        font: 600 14px/1.3 system-ui, sans-serif; pointer-events: none; opacity: 0; transition: opacity .4s; z-index: 41; text-align: center; }
      #touchRotateHint.show { opacity: 1; }
      #touchIosTip { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(340px, 80%); padding: 14px 18px; border-radius: 14px; background: rgba(8, 16, 30, .9);
        border: 1px solid rgba(190, 220, 255, .35); color: #eaf4ff; font: 500 14px/1.45 system-ui, sans-serif; text-align: center; z-index: 42; pointer-events: none; opacity: 0; transition: opacity .35s; }
      #touchIosTip.show { opacity: 1; pointer-events: auto; }
      #touchIosTip .sh { display: inline-block; padding: 0 6px; border-radius: 6px; background: rgba(120, 170, 255, .25); font-weight: 700; }
      #touchIosTip small { display: block; margin-top: 8px; opacity: .6; font-size: 11px; }
      html.touch-lock, html.touch-lock body { background: #000 !important; }
      body.touch-ui #skillV { position: absolute !important; pointer-events: auto !important; right: calc(176px + var(--sr)) !important; bottom: 128px !important; width: 62px !important; height: 62px !important; }
    `; document.head.appendChild(st); }
    const ui = document.createElement('div'); ui.id = 'touchUI'; root.appendChild(ui);
    const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
    const tap = code => { key(code, true); setTimeout(() => key(code, false), 60); };
    // ---------------------------------------------------------------- buttons
    const R = 'var(--sr)', Bm = 'var(--sb)';
    function button(id, icon, label, css, { size = 64, onDown, onUp, small = false } = {}) {
      const b = document.createElement('div'); b.className = 'tb' + (small ? ' sm' : ''); b.id = id; b.innerHTML = svg(icon) + (label ? `<small>${label}</small>` : '');
      if (!small) { b.style.width = b.style.height = size + 'px'; }
      Object.assign(b.style, css);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) {} onDown && onDown(); });
      const up = e => { e.preventDefault(); e.stopPropagation(); if (!b.classList.contains('on')) return; b.classList.remove('on'); onUp && onUp(); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      ui.appendChild(b); return b;
    }
    // attack: hold the stick down for the low slash
    button('tAttack', 'attack', 'ATTACK', { right: `calc(26px + ${R})`, bottom: `calc(30px + ${Bm})` }, { size: 92, onDown: () => {
      const low = state.touchMove && state.touchMove.y > 0.6; if (low) state.keys.ArrowDown = true; key('Space', true); key('Space', false); if (low) setTimeout(() => { state.keys.ArrowDown = false; }, 80); } });
    button('tJump', 'jump', 'JUMP', { right: `calc(132px + ${R})`, bottom: `calc(26px + ${Bm})` }, { size: 62, onDown: () => key('KeyZ', true), onUp: () => key('KeyZ', false) });
    button('tRoll', 'roll', 'ROLL', { right: `calc(40px + ${R})`, bottom: `calc(140px + ${Bm})` }, { size: 58, onDown: () => tap('KeyC') });
    const runB = button('tRun', 'run', 'RUN', { right: `calc(118px + ${R})`, bottom: `calc(112px + ${Bm})` }, { size: 54, onDown: () => {
      state.touchRunToggle = !state.touchRunToggle; runB.classList.toggle('latched', state.touchRunToggle); } });
    button('tHorse', 'horse', 'SUMMON', { right: `calc(28px + ${R})`, bottom: `calc(226px + ${Bm})` }, { size: 54, onDown: () => tap('KeyH') });
    // the V ring is the skill button
    const hookSkill = () => { const v = document.getElementById('skillV'); if (!v || v.dataset.touch) return !!v; v.dataset.touch = '1';
      v.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); tap('KeyV'); }); return true; };
    const skillTimer = setInterval(() => { if (hookSkill()) clearInterval(skillTimer); }, 500);
    // top bar
    const TOP = 'calc(8px + var(--st))';
    button('tTime', 'time', '', { top: TOP, right: `calc(178px + ${R})` }, { small: true, onDown: () => key('KeyT', true), onUp: () => key('KeyT', false) });
    button('tGfx', 'gfx', '', { top: TOP, right: `calc(126px + ${R})` }, { small: true, onDown: () => tap('KeyG') });
    const sndB = button('tSnd', 'sound', '', { top: TOP, right: `calc(74px + ${R})` }, { small: true, onDown: () => { tap('KeyM'); setTimeout(syncSound, 120); } });
    function syncSound() { const m = (() => { try { return localStorage.getItem('aethelos.muted.v1') === '1'; } catch (_) { return false; } })(); sndB.innerHTML = svg(m ? 'mute' : 'sound'); }
    syncSound();
    button('tFull', 'full', '', { top: TOP, right: `calc(22px + ${R})` }, { small: true, onDown: () => goLandscape(true) });
    // ---------------------------------------------------------------- joystick (floating: it appears under the left thumb)
    const joy = document.createElement('div'); joy.id = 'touchJoy'; joy.className = 'idle';
    joy.innerHTML = '<div id="touchJoyBase"></div><div id="touchJoyKnob"></div>'; ui.appendChild(joy);
    const base = joy.querySelector('#touchJoyBase'), knob = joy.querySelector('#touchJoyKnob');
    const RAD = 56; let jid = null, cx = 0, cy = 0;
    const local = (dx, dy) => rotated ? [dy, -dx] : [dx, dy];                       // screen -> game-screen axes
    function home() { if (jid !== null) return; const h = joy.clientHeight; cx = 110; cy = h - 110; place(cx, cy, 0, 0); }   // never yank it from under a thumb
    function place(x, y, kx, ky) { base.style.left = x + 'px'; base.style.top = y + 'px'; knob.style.left = (x + kx) + 'px'; knob.style.top = (y + ky) + 'px'; }
    function joyLocal(e) { const r = joy.getBoundingClientRect();                     // pointer position in the joystick's own (possibly turned) frame
      if (!rotated) return [e.clientX - r.left, e.clientY - r.top];
      return [e.clientY - r.top, r.right - e.clientX]; }
    joy.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (jid !== null) return; jid = e.pointerId; try { joy.setPointerCapture(jid); } catch (_) {}
      [cx, cy] = joyLocal(e); joy.classList.remove('idle'); place(cx, cy, 0, 0); state.touchMove = { x: 0, y: 0 }; });
    joy.addEventListener('pointermove', e => { if (e.pointerId !== jid) return; e.preventDefault(); e.stopPropagation();
      const [x, y] = joyLocal(e); let dx = x - cx, dy = y - cy; const d = Math.hypot(dx, dy);
      if (d > RAD * 1.6) { cx += dx / d * (d - RAD * 1.6); cy += dy / d * (d - RAD * 1.6); dx = x - cx; dy = y - cy; }   // the base follows a thumb that drifts away
      const m = Math.min(1, Math.hypot(dx, dy) / RAD), a = Math.atan2(dy, dx), kx = Math.cos(a) * m * RAD, ky = Math.sin(a) * m * RAD;
      place(cx, cy, kx, ky); state.touchMove = { x: kx / RAD, y: ky / RAD }; state.touchRun = m > 0.92; joy.classList.toggle('run', state.touchRun || !!state.touchRunToggle); });
    const joyUp = e => { if (e.pointerId !== jid) return; jid = null; state.touchMove = null; state.touchRun = false; joy.className = 'idle'; home(); };
    joy.addEventListener('pointerup', joyUp); joy.addEventListener('pointercancel', joyUp);
    // ---------------------------------------------------------------- landscape
    let rotated = false;
    const hint = document.createElement('div'); hint.id = 'touchRotateHint'; hint.textContent = 'Tip: turn your phone sideways for the full view'; ui.appendChild(hint);
    function layout() {
      const portrait = innerHeight > innerWidth;
      const want = portrait;                                                           // could not lock: turn the game screen itself
      if (want !== rotated) { rotated = want; root.classList.toggle('touch-rotated', rotated); }
      if (rotated) { Object.assign(root.style, { width: innerHeight + 'px', height: innerWidth + 'px', left: innerWidth + 'px' }); }
      else { root.style.width = root.style.height = root.style.left = ''; }
      unzoom(); home(); onRotate && onRotate(rotated);
    }
    async function goLandscape(toggle = false) {
      const el = document.documentElement;
      if (toggle && !canFullscreen() && !standalone()) { showIosTip(true); return; }
      try {
        if (toggle && (document.fullscreenElement || document.webkitFullscreenElement)) { await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen()); return; }
        if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else if (!document.webkitFullscreenElement && el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } catch (_) {}
      try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) {}
      setTimeout(layout, 350);
    }
    const tip = document.createElement('div'); tip.id = 'touchIosTip';
    tip.innerHTML = '<b>Full screen on iPhone</b><br>Tap <span class="sh">Share</span> then <b>Add to Home Screen</b>.<br>Open Æthelos from that icon: no Safari bars, only the game.<small>tap to close</small>';
    tip.addEventListener('pointerdown', e => { e.stopPropagation(); tip.classList.remove('show'); }); ui.appendChild(tip);
    function showIosTip(force) {
      let n = 0; try { n = +localStorage.getItem('aethelos.iosTip.v1') || 0; } catch (_) {}
      if (!force && n >= 3) return; try { localStorage.setItem('aethelos.iosTip.v1', String(n + 1)); } catch (_) {}
      tip.classList.add('show'); clearTimeout(showIosTip.t); showIosTip.t = setTimeout(() => tip.classList.remove('show'), 9000);
    }
    if (!canFullscreen() && !standalone()) setTimeout(() => showIosTip(false), 1500);
    const first = () => { goLandscape(); };
    root.addEventListener('pointerdown', first, { once: true, capture: true });
    addEventListener('resize', layout); window.visualViewport && visualViewport.addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 250));
    layout();
    if (innerHeight > innerWidth) { hint.classList.add('show'); setTimeout(() => hint.classList.remove('show'), 4000); }
    showToast && showToast('Touch controls on');
    return {
      enabled: true, get rotated() { return rotated; },
      dispose() { clearInterval(skillTimer); noZoom.forEach(([n, f]) => document.removeEventListener(n, f, { passive: false })); document.documentElement.classList.remove('touch-lock');
        if (vp && vpWas) vp.setAttribute('content', vpWas); window.visualViewport && visualViewport.removeEventListener('resize', layout); ui.remove(); document.body.classList.remove('touch-ui'); root.classList.remove('touch-rotated'); root.style.width = root.style.height = root.style.left = '';
        removeEventListener('resize', layout); state.touchMove = null; }
    };
  }
  A.createTouchControls = createTouchControls; A.isTouchDevice = isTouchDevice; A.enterGameFullscreen = enterGameFullscreen;
})();
