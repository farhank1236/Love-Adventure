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
  const svg = k => `<svg viewBox="0 0 64 64" aria-hidden="true">${ICON[k]}</svg>`;
  function createTouchControls({ root, state, showToast, onRotate }) {
    if (!isTouchDevice()) return { enabled: false, rotated: false, dispose() {} };
    document.body.classList.add('touch-ui');
    if (!document.getElementById('touchCss')) { const st = document.createElement('style'); st.id = 'touchCss'; st.textContent = `
      body.touch-ui #phase1World { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
      #phase1World.touch-rotated { inset: auto; top: 0; transform-origin: 0 0; transform: rotate(90deg); }
      body.touch-ui #phase1Hud .phase1-top .phase1-panel p, body.touch-ui #phase1Hud .phase1-status { display: none !important; }
      body.touch-ui #phase1Hud .phase1-top .phase1-panel { padding: 6px 12px; }
      body.touch-ui #phase1Hud .phase1-top .phase1-panel h1 { font-size: 15px; margin: 0; }
      body.touch-ui #phase1Editor { display: none !important; }
      body.touch-ui #phase1Hud .phase1-actions { position: absolute; top: max(8px, env(safe-area-inset-top)); left: 50%; right: auto; bottom: auto; transform: translateX(-50%); padding: 4px; display: flex; gap: 6px; }
      body.touch-ui #phase1Hud .phase1-actions button { font-size: 12px; padding: 6px 10px; }
      body.touch-ui #kClock { top: 8px !important; right: 236px !important; }
      #touchUI { position: absolute; inset: 0; z-index: 40; pointer-events: none; font-family: 'Fredoka', 'Nunito', system-ui, sans-serif; }
      #touchUI .tb { position: absolute; pointer-events: auto; display: grid; place-items: center; border-radius: 50%; color: #eaf4ff;
        background: radial-gradient(circle at 35% 30%, rgba(60, 96, 150, .55), rgba(10, 20, 38, .62)); border: 2px solid rgba(190, 220, 255, .38);
        box-shadow: 0 4px 14px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .15); touch-action: none; -webkit-tap-highlight-color: transparent; }
      #touchUI .tb svg { width: 52%; height: 52%; }
      #touchUI .tb.on { background: radial-gradient(circle at 35% 30%, rgba(110, 170, 255, .85), rgba(30, 70, 150, .8)); border-color: rgba(220, 240, 255, .9); transform: scale(.94); }
      #touchUI .tb.sm { width: 42px; height: 42px; border-radius: 12px; }
      #touchUI .tb small { position: absolute; bottom: -15px; font-size: 10px; font-weight: 700; letter-spacing: .06em; color: rgba(235, 245, 255, .85); text-shadow: 0 1px 2px #000; }
      #touchUI .tb.latched { border-color: #9fd0ff; box-shadow: 0 0 12px rgba(120, 190, 255, .8); }
      #touchJoy { position: absolute; pointer-events: auto; left: 0; bottom: 0; width: 46%; height: 64%; touch-action: none; }
      #touchJoyBase { position: absolute; width: 132px; height: 132px; margin: -66px 0 0 -66px; border-radius: 50%; border: 2px solid rgba(200, 225, 255, .35);
        background: radial-gradient(circle, rgba(20, 40, 70, .18), rgba(10, 20, 38, .42)); transition: opacity .2s; }
      #touchJoyKnob { position: absolute; width: 62px; height: 62px; margin: -31px 0 0 -31px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, rgba(170, 205, 255, .9), rgba(50, 90, 150, .85));
        border: 2px solid rgba(235, 245, 255, .8); box-shadow: 0 4px 12px rgba(0, 0, 0, .4); }
      #touchJoy.idle #touchJoyBase, #touchJoy.idle #touchJoyKnob { opacity: .55; }
      #touchJoy.run #touchJoyKnob { background: radial-gradient(circle at 35% 30%, #ffffff, #4aa8ff); box-shadow: 0 0 16px #4aa8ff; }
      #touchRotateHint { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); padding: 10px 16px; border-radius: 12px; background: rgba(8, 16, 30, .78); color: #eaf4ff;
        font: 600 14px/1.3 system-ui, sans-serif; pointer-events: none; opacity: 0; transition: opacity .4s; z-index: 41; text-align: center; }
      #touchRotateHint.show { opacity: 1; }
      body.touch-ui #skillV { position: absolute !important; pointer-events: auto !important; right: calc(176px + env(safe-area-inset-right)) !important; bottom: 128px !important; width: 62px !important; height: 62px !important; }
    `; document.head.appendChild(st); }
    const ui = document.createElement('div'); ui.id = 'touchUI'; root.appendChild(ui);
    const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
    const tap = code => { key(code, true); setTimeout(() => key(code, false), 60); };
    // ---------------------------------------------------------------- buttons
    const R = 'env(safe-area-inset-right)', Bm = 'env(safe-area-inset-bottom)';
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
    button('tHorse', 'horse', 'HORSE', { right: `calc(28px + ${R})`, bottom: `calc(226px + ${Bm})` }, { size: 54, onDown: () => tap('KeyH') });
    // the V ring is the skill button
    const hookSkill = () => { const v = document.getElementById('skillV'); if (!v || v.dataset.touch) return !!v; v.dataset.touch = '1';
      v.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); tap('KeyV'); }); return true; };
    const skillTimer = setInterval(() => { if (hookSkill()) clearInterval(skillTimer); }, 500);
    // top bar
    const TOP = 'max(8px, env(safe-area-inset-top))';
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
      home(); onRotate && onRotate(rotated);
    }
    async function goLandscape(toggle = false) {
      const el = document.documentElement;
      try {
        if (toggle && document.fullscreenElement) { await document.exitFullscreen(); return; }
        if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else if (!document.fullscreenElement && el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } catch (_) {}
      try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) {}
      setTimeout(layout, 350);
    }
    const first = () => { goLandscape(); };
    root.addEventListener('pointerdown', first, { once: true, capture: true });
    addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 250));
    layout();
    if (innerHeight > innerWidth) { hint.classList.add('show'); setTimeout(() => hint.classList.remove('show'), 4000); }
    showToast && showToast('Touch controls on');
    return {
      enabled: true, get rotated() { return rotated; },
      dispose() { clearInterval(skillTimer); ui.remove(); document.body.classList.remove('touch-ui'); root.classList.remove('touch-rotated'); root.style.width = root.style.height = root.style.left = '';
        removeEventListener('resize', layout); state.touchMove = null; }
    };
  }
  A.createTouchControls = createTouchControls; A.isTouchDevice = isTouchDevice;
})();
