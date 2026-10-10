/* Hero health for the 3D world.
   createHeroHealth({ root, max, sfx, onDefeat }) -> { hp, max, frac, dead, damage(frac, info), heal(amount), update(dt), reset(), dispose() }
   - damage(0.10) takes 10% of the maximum. A red flash, a trailing "chip" on the bar and a hurt sound show it.
   - After 8 s without damage it regenerates 3% of the maximum per second.
   - At 0 the onDefeat() callback runs once (the world sends the hero back to Dawnmeadow) and reset() restores it. */
(() => {
  const A = window.Aethelos ||= {};
  function createHeroHealth({ root, max = 100, sfx, onDefeat }) {
    const H = { hp: max, max, chip: max, sinceHit: 99, dead: false, flash: 0 };
    if (!document.getElementById('heroHpCss')) { const st = document.createElement('style'); st.id = 'heroHpCss'; st.textContent = `
      #heroHp { position: absolute; left: 18px; bottom: 18px; z-index: 31; display: flex; align-items: center; gap: 8px; pointer-events: none; font-family: 'Fredoka', 'Nunito', system-ui, sans-serif; }
      #heroHp .hpHeart { width: 26px; height: 26px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
      #heroHp .hpBar { position: relative; width: 210px; height: 14px; border-radius: 8px; background: rgba(8, 14, 26, .72); border: 1px solid rgba(255, 255, 255, .25); overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
      #heroHp .hpChip, #heroHp .hpFill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 8px; }
      #heroHp .hpChip { background: rgba(255, 236, 200, .85); transition: width .5s ease .25s; }
      #heroHp .hpFill { background: linear-gradient(180deg, #ff6b5e, #c4142a); box-shadow: inset 0 1px 0 rgba(255,255,255,.35); transition: width .12s; }
      #heroHp .hpNum { color: #fff4e6; font-size: 13px; font-weight: 700; text-shadow: 0 1px 2px #000; min-width: 34px; }
      #heroHp.low .hpFill { animation: hpPulse .8s ease-in-out infinite alternate; } @keyframes hpPulse { to { filter: brightness(1.6); } }
      #heroHurt { position: absolute; inset: 0; pointer-events: none; z-index: 29; opacity: 0; background: radial-gradient(ellipse at center, rgba(160, 0, 0, 0) 45%, rgba(190, 0, 10, .55) 100%); }
      body.touch-ui #heroHp { left: calc(12px + var(--sl, 0px)); top: calc(52px + var(--st, 0px)); bottom: auto; }
      body.touch-ui #heroHp .hpBar { width: 150px; height: 11px; }
      body.touch-ui #heroHp .hpHeart { width: 20px; height: 20px; }`;
      document.head.appendChild(st); }
    const el = document.createElement('div'); el.id = 'heroHp';
    el.innerHTML = `<svg class="hpHeart" viewBox="0 0 32 32"><path d="M16 28 C 6 20 2 15 2 9.5 A 6.8 6.8 0 0 1 16 7 A 6.8 6.8 0 0 1 30 9.5 C 30 15 26 20 16 28 Z" fill="#e8283a" stroke="#ffd6d6" stroke-width="1.6"/></svg>
      <div class="hpBar"><div class="hpChip"></div><div class="hpFill"></div></div><div class="hpNum"></div>`;
    root.appendChild(el);
    const hurt = document.createElement('div'); hurt.id = 'heroHurt'; root.appendChild(hurt);
    const fill = el.querySelector('.hpFill'), chip = el.querySelector('.hpChip'), num = el.querySelector('.hpNum');
    function draw() { const f = Math.max(0, H.hp / H.max); fill.style.width = (f * 100).toFixed(1) + '%'; chip.style.width = (Math.max(f, H.chip / H.max) * 100).toFixed(1) + '%';
      num.textContent = Math.ceil(H.hp); el.classList.toggle('low', f <= 0.3); }
    draw();
    const api = {
      get hp() { return H.hp; }, get max() { return H.max; }, get frac() { return H.hp / H.max; }, get dead() { return H.dead; },
      damage(frac, info = {}) {
        if (H.dead || frac <= 0) return false;
        H.chip = Math.max(H.chip, H.hp); H.hp = Math.max(0, H.hp - H.max * frac); H.sinceHit = 0;
        if (!info.quiet) sfx && sfx('hurt', info.at ? { at: info.at } : {}); H.flash = info.quiet ? Math.max(H.flash, 0.35) : 1;
        draw(); setTimeout(() => { H.chip = H.hp; draw(); }, 30);
        if (H.hp <= 0) { H.dead = true; onDefeat && onDefeat(info); }
        return true;
      },
      heal(n) { if (H.dead) return; H.hp = Math.min(H.max, H.hp + n); H.chip = H.hp; draw(); },
      update(dt) {
        H.sinceHit += dt;
        if (!H.dead && !api.noRegen && H.sinceHit > 8 && H.hp < H.max) { H.hp = Math.min(H.max, H.hp + H.max * 0.03 * dt); H.chip = H.hp; draw(); }
        if (H.flash > 0) { H.flash = Math.max(0, H.flash - dt * 2.2); hurt.style.opacity = (H.flash * 0.9).toFixed(3); }
      },
      reset() { H.hp = H.chip = H.max; H.dead = false; H.sinceHit = 99; H.flash = 0; hurt.style.opacity = 0; draw(); },
      dispose() { el.remove(); hurt.remove(); }
    };
    return api;
  }
  A.createHeroHealth = createHeroHealth;
})();
