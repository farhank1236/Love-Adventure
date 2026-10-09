/* Aethelos world editor (E toggles). Select (click), move (drag along the ground), rotate, scale, rename, change
   category, edit metadata, duplicate, delete, add from the catalogue, undo/redo, auto-save to this browser,
   export / import the whole map as JSON, reset to the default kingdom.
   Editor camera: right-drag (or Alt+drag) to orbit, wheel to zoom, WASD / arrows to fly, Shift = faster. */
(() => {
  const A = window.Aethelos ||= {};
  const CSS = `
  #kEditor { position: fixed; inset: 0; z-index: 60; pointer-events: none; font: 13px/1.35 'Nunito', system-ui, sans-serif; color: #eaf2f8; }
  #kEditor[hidden] { display: none !important; }
  #kEditor .kp { pointer-events: auto; background: rgba(12, 22, 34, .88); border: 1px solid rgba(160, 196, 224, .25); border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, .35); backdrop-filter: blur(6px); }
  #kEditor h3 { margin: 0 0 8px; font: 700 12px/1 'Fredoka', 'Nunito', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #ffd98a; }
  #kEditor button { font: inherit; color: #eaf2f8; background: #24425a; border: 1px solid #3d6684; border-radius: 7px; padding: 6px 10px; cursor: pointer; }
  #kEditor button:hover { background: #2f5574; } #kEditor button.warn { background: #6a2b2b; border-color: #9a4545; } #kEditor button.on { background: #b07b22; border-color: #e0a640; color: #fff; }
  #kEditor input, #kEditor select, #kEditor textarea { font: inherit; color: #eaf2f8; background: #0d1824; border: 1px solid #36546c; border-radius: 6px; padding: 5px 7px; min-width: 0; }
  #kEditor .bar { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; padding: 8px; flex-wrap: wrap; justify-content: center; max-width: calc(100vw - 32px); }
  #kEditor .bar .title { align-self: center; font: 700 13px 'Fredoka', sans-serif; letter-spacing: .12em; color: #ffd98a; padding: 0 6px; }
  #kEditor .cat { position: absolute; left: 12px; top: 74px; bottom: 12px; width: 236px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  #kEditor .cat .list { overflow: auto; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  #kEditor .cat .grp { margin-top: 6px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #9fc0d8; }
  #kEditor .cat .item { text-align: left; background: transparent; border-color: transparent; padding: 4px 8px; }
  #kEditor .cat .item:hover { background: #1d3a50; } #kEditor .cat .item.on { background: #b07b22; }
  #kEditor .props { position: absolute; right: 12px; top: 74px; width: 286px; max-height: calc(100vh - 86px); overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  #kEditor .row { display: grid; grid-template-columns: 74px 1fr; gap: 6px; align-items: center; }
  #kEditor .trio { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  #kEditor .row label, #kEditor .muted { color: #9fc0d8; font-size: 12px; }
  #kEditor .btns { display: flex; flex-wrap: wrap; gap: 6px; }
  #kEditor .help { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); padding: 7px 12px; font-size: 12px; color: #cfe0ec; max-width: calc(100vw - 560px); text-align: center; }
  #kEditor .modal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(4, 10, 18, .55); pointer-events: auto; }
  #kEditor .modal .kp { width: min(720px, calc(100vw - 32px)); padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  #kEditor .modal textarea { height: 300px; font: 12px/1.3 ui-monospace, monospace; }
  @media (max-width: 900px) { #kEditor .cat { width: 180px; } #kEditor .props { width: 230px; } #kEditor .help { display: none; } }`;

  function createEditor(ctx) {
    const { THREE, scene, camera, renderer, canvas, world, player, state, showToast } = ctx;
    if (!document.getElementById('kEditorCss')) { const st = document.createElement('style'); st.id = 'kEditorCss'; st.textContent = CSS; document.head.appendChild(st); }
    const T = A.Models.TYPES, CATS = A.Models.CATEGORIES;
    const el = document.createElement('div'); el.id = 'kEditor'; el.hidden = true;
    el.innerHTML = `
      <div class="bar kp">
        <span class="title">WORLD EDITOR</span>
        <button data-a="save" title="Save the map in this browser">Save</button>
        <button data-a="load" title="Reload the last saved map">Load saved</button>
        <button data-a="export" title="Download the map as JSON">Export JSON</button>
        <button data-a="import" title="Load a map from a JSON file or pasted text">Import JSON</button>
        <button data-a="undo" title="Undo (Ctrl+Z)">Undo</button><button data-a="redo" title="Redo (Ctrl+Y)">Redo</button>
        <button data-a="reset" class="warn" title="Throw away all edits and restore the default kingdom">Reset map</button>
        <button data-a="exit" class="on" title="Back to the game (E)">Play (E)</button>
      </div>
      <div class="cat kp">
        <h3>Add object</h3>
        <input data-k="search" placeholder="Search types…" aria-label="Search object types">
        <select data-k="catFilter" aria-label="Filter by category"><option value="">All categories</option></select>
        <div class="list" data-k="list"></div>
        <div class="muted" data-k="count"></div>
      </div>
      <div class="props kp" data-k="props"><h3>Selection</h3><p class="muted">Click an object in the world to select it, or pick a type on the left to place a new one.</p></div>
      <div class="help kp" data-k="help">Click: select · Drag: move along the ground · R / Shift+R: rotate · + / −: scale · Del: delete · Ctrl+D: duplicate · F: focus · Right-drag: orbit · Wheel: zoom · WASD: fly · E: play</div>`;
    ctx.root.appendChild(el);
    const $ = k => el.querySelector(`[data-k="${k}"]`), props = $('props');
    const objs = () => world.objects, byId = id => world.objects.find(o => o.id === id);

    // ---------------------------------------------------------------- catalogue
    const catFilter = $('catFilter');
    for (const c of CATS) { const o = document.createElement('option'); o.value = c; o.textContent = c; catFilter.appendChild(o); }
    let placingType = null, ghost = null, ghostYaw = 0;
    function renderList() {
      const q = $('search').value.trim().toLowerCase(), cf = catFilter.value, list = $('list'); list.innerHTML = '';
      const groups = {};
      for (const t of Object.values(T)) {
        if (t.hidden || (cf && t.category !== cf) || (q && !(t.label.toLowerCase().includes(q) || t.id.includes(q) || t.category.toLowerCase().includes(q)))) continue;
        (groups[t.category] ||= []).push(t);
      }
      for (const c of CATS) if (groups[c]) {
        const g = document.createElement('div'); g.className = 'grp'; g.textContent = c; list.appendChild(g);
        for (const t of groups[c]) { const b = document.createElement('button'); b.className = 'item' + (placingType === t.id ? ' on' : ''); b.textContent = t.label; b.title = t.id; b.onclick = () => startPlacing(t.id); list.appendChild(b); }
      }
      $('count').textContent = `${world.objects.length} objects in the kingdom`;
    }
    $('search').oninput = renderList; catFilter.onchange = renderList;

    // ---------------------------------------------------------------- history + persistence
    const undo = [], redo = [];
    const snap = () => JSON.stringify(world.objects);
    function commit(before, label) { undo.push({ before, label }); if (undo.length > 60) undo.shift(); redo.length = 0; afterChange(true); }
    function restore(json) { world.objects.length = 0; for (const o of JSON.parse(json)) world.objects.push(o); select(selected && byId(selected.id) ? selected.id : null); afterChange(true); }
    let saveTimer = 0, dirtyLayer = false;
    function afterChange(rebuild) {
      if (rebuild) { world.layer.rebuild(world.objects); ctx.rebuildCollision(); dirtyLayer = false; }
      clearTimeout(saveTimer); saveTimer = setTimeout(() => { A.MapStore.save(world.objects); }, 400);    // auto-save
      renderList(); renderProps(); updateBox();
    }

    // ---------------------------------------------------------------- selection
    let selected = null; const box = new THREE.Box3Helper(new THREE.Box3(), 0xffc84a); box.visible = false; box.renderOrder = 5; scene.add(box);
    function updateBox() { if (!selected) { box.visible = false; return; } world.layer.boundsOf(selected, box.box); box.box.expandByScalar(0.15); box.visible = true; }
    function select(id) { selected = id ? byId(id) || null : null; renderProps(); updateBox(); }
    const deg = r => +(r * 180 / Math.PI).toFixed(1), rad = d => d * Math.PI / 180;
    function renderProps() {
      const o = selected;
      if (!o) { props.innerHTML = '<h3>Selection</h3><p class="muted">Click an object in the world to select it, or pick a type on the left to place a new one.</p>'; return; }
      const t = T[o.type] || { label: o.type };
      props.innerHTML = `<h3>${esc(t.label)}</h3>
        <div class="row"><label>ID</label><span class="muted" style="word-break:break-all">${esc(o.id)}</span></div>
        <div class="row"><label for="kName">Name</label><input id="kName" data-f="name" value="${esc(o.name)}"></div>
        <div class="row"><label>Type</label><span>${esc(o.type)}</span></div>
        <div class="row"><label for="kCat">Category</label><select id="kCat" data-f="category">${CATS.map(c => `<option${c === o.category ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="row"><label>Position</label><div class="trio">${['x', 'y', 'z'].map(a => `<input type="number" step="0.5" data-f="position.${a}" value="${o.position[a]}" aria-label="position ${a}">`).join('')}</div></div>
        <div class="row"><label>Rotation°</label><div class="trio">${['x', 'y', 'z'].map(a => `<input type="number" step="5" data-f="rotation.${a}" value="${deg(o.rotation[a] || 0)}" aria-label="rotation ${a} degrees">`).join('')}</div></div>
        <div class="row"><label>Scale</label><div class="trio">${['x', 'y', 'z'].map(a => `<input type="number" step="0.1" min="0.05" data-f="scale.${a}" value="${+(+o.scale[a]).toFixed(3)}" aria-label="scale ${a}">`).join('')}</div></div>
        <div class="row"><label></label><label><input type="checkbox" data-k="uniform" checked> Uniform scale</label></div>
        <div class="row" style="align-items:start"><label for="kMeta">Metadata</label><textarea id="kMeta" data-f="metadata" rows="4">${esc(JSON.stringify(o.metadata || {}, null, 1))}</textarea></div>
        <div class="btns"><button data-b="ground">Snap to ground</button><button data-b="focus">Focus (F)</button><button data-b="dup">Duplicate</button><button data-b="del" class="warn">Delete</button></div>`;
      props.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => setField(inp.dataset.f, inp.value, inp));
      props.querySelector('[data-b="ground"]').onclick = () => edit(o2 => { o2.position.y = +groundY(o2.position.x, o2.position.z).toFixed(2); }, 'snap');
      props.querySelector('[data-b="focus"]').onclick = focusSel;
      props.querySelector('[data-b="dup"]').onclick = duplicate;
      props.querySelector('[data-b="del"]').onclick = del;
    }
    function setField(f, v, inp) {
      const before = snap(), o = selected; if (!o) return;
      if (f === 'name') o.name = String(v).slice(0, 80) || o.name;
      else if (f === 'category') o.category = v;
      else if (f === 'metadata') { try { o.metadata = JSON.parse(v); inp.style.borderColor = ''; } catch (_) { inp.style.borderColor = '#d05050'; showToast('Metadata must be valid JSON'); return; } }
      else {
        const [grp, ax] = f.split('.'), n = parseFloat(v); if (!isFinite(n)) return;
        if (grp === 'rotation') o.rotation[ax] = +rad(n).toFixed(4);
        else if (grp === 'scale') { const s = Math.max(0.05, n); if (props.querySelector('[data-k="uniform"]')?.checked) { const k = s / (o.scale[ax] || 1); for (const a of ['x', 'y', 'z']) o.scale[a] = +(o.scale[a] * k).toFixed(3); } else o.scale[ax] = s; }
        else o.position[ax] = n;
      }
      commit(before, f);
    }
    function edit(fn, label) { if (!selected) return; const before = snap(); fn(selected); commit(before, label); }
    function groundY(x, z) { return world.terrain.heightAt(x, z); }
    function nextId(type) { let n = 0; for (const o of world.objects) if (o.type === type) { const m = /_(\d+)$/.exec(o.id); if (m) n = Math.max(n, +m[1]); } return `${type}_${String(n + 1).padStart(3, '0')}`; }
    function duplicate() {
      if (!selected) return; const before = snap(), c = JSON.parse(JSON.stringify(selected));
      c.id = nextId(c.type); c.name = selected.name + ' (copy)'; c.position.x = +(c.position.x + 4).toFixed(2); c.position.y = +(groundY(c.position.x, c.position.z) + (selected.position.y - groundY(selected.position.x, selected.position.z))).toFixed(2);
      world.objects.push(c); selected = c; commit(before, 'duplicate'); showToast('Duplicated');
    }
    function del() {
      if (!selected) return; const before = snap(), i = world.objects.indexOf(selected);
      if (i >= 0) world.objects.splice(i, 1); const nm = selected.name; selected = null; commit(before, 'delete'); showToast('Deleted ' + nm);
    }
    function focusSel() { if (!selected) return; cam.focus.set(selected.position.x, selected.position.y + 2, selected.position.z); cam.dist = Math.max(10, Math.min(80, world.layer.boundsOf(selected).getSize(new THREE.Vector3()).length() * 1.6)); }
    function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    // ---------------------------------------------------------------- placing new objects
    function startPlacing(type) {
      stopPlacing(); placingType = type; ghostYaw = 0;
      const parts = A.Models.get(THREE, type); ghost = new THREE.Group();
      for (const [k, g] of Object.entries(parts)) { const m = new THREE.Mesh(g, k === 'glow' ? world.layer.mat.glow : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.6, side: THREE.DoubleSide })); ghost.add(m); }
      ghost.visible = false; scene.add(ghost); renderList(); showToast(`Placing ${T[type].label}: click to place, R to rotate, Esc to stop`);
    }
    function stopPlacing() { if (ghost) { scene.remove(ghost); ghost.traverse(n => { if (n.isMesh && n.material !== world.layer.mat.glow) n.material.dispose(); }); } ghost = null; placingType = null; renderList(); }
    function place(x, z, keep) {
      const before = snap(), t = T[placingType];
      const o = { id: nextId(placingType), name: `${t.label} ${nextId(placingType).split('_').pop() * 1}`, type: placingType, category: t.category,
        position: { x: +x.toFixed(2), y: +groundY(x, z).toFixed(2), z: +z.toFixed(2) }, rotation: { x: 0, y: +ghostYaw.toFixed(4), z: 0 }, scale: { x: 1, y: 1, z: 1 },
        metadata: { region: regionId(x, z), addedInEditor: true } };
      world.objects.push(o); selected = o; commit(before, 'add'); if (!keep) stopPlacing();
    }
    function regionId(x, z) { for (const g of A.Layout.REGIONS) if (g.r && Math.hypot(x - g.x, z - g.z) < g.r) return g.id; return 'wilds'; }

    // ---------------------------------------------------------------- editor camera (orbit around a focus point)
    const cam = { focus: new THREE.Vector3(), yaw: 0, pitch: 0.75, dist: 38 };
    function enterCamera() { cam.focus.copy(player.position); cam.yaw = state.camYaw; cam.pitch = 0.75; cam.dist = 38; }
    const keys = Object.create(null);
    function update(dt) {
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 90 : 30) * dt * Math.max(0.6, cam.dist / 40), fwd = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw)), right = new THREE.Vector3(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
      const ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      cam.focus.addScaledVector(fwd, iz * sp).addScaledVector(right, ix * sp);
      if (keys.KeyQ) cam.focus.y -= sp; if (keys.KeyZ) cam.focus.y += sp;
      const lim = A.Layout.SIZE / 2; cam.focus.x = Math.max(-lim, Math.min(lim, cam.focus.x)); cam.focus.z = Math.max(-lim, Math.min(lim, cam.focus.z));
      cam.focus.y = Math.max(world.terrain.heightAt(cam.focus.x, cam.focus.z), Math.min(cam.focus.y, 400));
      const h = Math.cos(cam.pitch) * cam.dist;
      camera.position.set(cam.focus.x - Math.sin(cam.yaw) * h, cam.focus.y + Math.sin(cam.pitch) * cam.dist, cam.focus.z - Math.cos(cam.yaw) * h);
      const floor = world.terrain.heightAt(camera.position.x, camera.position.z) + 1; if (camera.position.y < floor) camera.position.y = floor;
      camera.lookAt(cam.focus);
      world.layer.update(dt, cam.focus.x, cam.focus.z);
    }

    // ---------------------------------------------------------------- picking
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function setRay(e) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
    function pickObject(e) {
      setRay(e); const hits = ray.intersectObjects(world.layer.meshes, false);
      for (const h of hits) { if (h.instanceId === undefined) continue; const id = h.object.userData.ids[h.instanceId]; const o = byId(id); if (o) return { o, point: h.point }; }
      return null;
    }
    function pickGround(e) { setRay(e); const h = ray.intersectObjects(world.terrainGroup.children, false)[0]; return h ? h.point : null; }

    // ---------------------------------------------------------------- input
    let drag = null, orbit = null;
    const onDown = e => {
      if (!active || e.target !== canvas) return;
      if (e.button === 2 || e.button === 1 || e.altKey) { orbit = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
      if (e.button !== 0) return;
      if (placingType) { const p = pickGround(e); if (p) place(p.x, p.z, e.shiftKey); return; }
      const hit = pickObject(e);
      if (!hit) { select(null); return; }
      select(hit.o.id);
      const g = pickGround(e) || hit.point;
      drag = { o: hit.o, before: snap(), dx: hit.o.position.x - g.x, dz: hit.o.position.z - g.z, lift: hit.o.position.y - groundY(hit.o.position.x, hit.o.position.z), moved: false };
    };
    const onMove = e => {
      if (!active) return;
      if (orbit) { cam.yaw -= (e.clientX - orbit.x) * 0.005; cam.pitch = Math.max(0.08, Math.min(1.45, cam.pitch + (e.clientY - orbit.y) * 0.004)); orbit = { x: e.clientX, y: e.clientY }; return; }
      if (placingType && ghost) { const p = pickGround(e); if (p) { ghost.visible = true; ghost.position.set(p.x, groundY(p.x, p.z), p.z); ghost.rotation.y = ghostYaw; } return; }
      if (drag) {
        const p = pickGround(e); if (!p) return;
        const o = drag.o; o.position.x = +(p.x + drag.dx).toFixed(2); o.position.z = +(p.z + drag.dz).toFixed(2); o.position.y = +(groundY(o.position.x, o.position.z) + drag.lift).toFixed(2);
        world.layer.updateObject(o); updateBox(); drag.moved = true;
      }
    };
    const onUp = () => {
      if (orbit) { orbit = null; return; }
      if (drag) { const d = drag; drag = null; if (d.moved) { d.o.metadata = { ...(d.o.metadata || {}), region: regionId(d.o.position.x, d.o.position.z) }; commit(d.before, 'move'); } }
    };
    const onWheel = e => { if (!active || e.target !== canvas) return; e.preventDefault(); cam.dist = Math.max(4, Math.min(600, cam.dist * Math.exp(e.deltaY * 0.0012))); };
    const onCtx = e => { if (active && e.target === canvas) e.preventDefault(); };
    const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    const onKey = e => {
      if (!active) return;
      if (e.type === 'keyup') { keys[e.code] = false; return; }
      if (typing()) { if (e.code === 'Escape') document.activeElement.blur(); return; }
      keys[e.code] = true;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyZ') { e.preventDefault(); doUndo(); return; }
      if (ctrl && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) { e.preventDefault(); doRedo(); return; }
      if (ctrl && e.code === 'KeyD') { e.preventDefault(); duplicate(); return; }
      if (ctrl && e.code === 'KeyS') { e.preventDefault(); act('save'); return; }
      if (e.code === 'Escape') { if (placingType) stopPlacing(); else select(null); return; }
      if (e.code === 'KeyR') { const step = rad(e.shiftKey ? -15 : 15); if (placingType) { ghostYaw += step; if (ghost) ghost.rotation.y = ghostYaw; } else edit(o => { o.rotation.y = +((o.rotation.y || 0) + step).toFixed(4); }, 'rotate'); return; }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') { edit(o => { for (const a of ['x', 'y', 'z']) o.scale[a] = +(o.scale[a] * 1.1).toFixed(3); }, 'scale'); return; }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') { edit(o => { for (const a of ['x', 'y', 'z']) o.scale[a] = +Math.max(0.05, o.scale[a] / 1.1).toFixed(3); }, 'scale'); return; }
      if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); del(); return; }
      if (e.code === 'KeyF') { focusSel(); return; }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    function doUndo() { const u = undo.pop(); if (!u) { showToast('Nothing to undo'); return; } redo.push({ before: snap(), label: u.label }); restore(u.before); showToast('Undo ' + u.label); }
    function doRedo() { const r = redo.pop(); if (!r) { showToast('Nothing to redo'); return; } undo.push({ before: snap(), label: r.label }); restore(r.before); showToast('Redo ' + r.label); }

    // ---------------------------------------------------------------- toolbar actions
    let resetArmed = 0;
    function act(a) {
      if (a === 'exit') return toggle(false);
      if (a === 'undo') return doUndo();
      if (a === 'redo') return doRedo();
      if (a === 'save') { const ok = A.MapStore.save(world.objects); showToast(ok ? `Map saved (${world.objects.length} objects)` : 'Could not save in this browser'); return; }
      if (a === 'load') { const d = A.MapStore.load(); if (!d) { showToast('No saved map yet'); return; } const before = snap(); world.objects.length = 0; for (const o of d.objects) if (T[o.type]) world.objects.push(o); select(null); commit(before, 'load'); showToast('Saved map loaded'); return; }
      if (a === 'export') return exportJson();
      if (a === 'import') return importJson();
      if (a === 'reset') {
        const btn = el.querySelector('[data-a="reset"]');
        if (Date.now() - resetArmed > 4000) { resetArmed = Date.now(); btn.textContent = 'Click again to reset'; setTimeout(() => { btn.textContent = 'Reset map'; }, 4000); return; }
        resetArmed = 0; btn.textContent = 'Reset map'; const before = snap(); const fresh = A.KingdomObjects.generate(world.terrain); world.objects.length = 0; for (const o of fresh) world.objects.push(o);
        select(null); commit(before, 'reset'); showToast('Default kingdom restored');
      }
    }
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
    function mapJson() { return JSON.stringify({ format: 'aethelos-map', version: 1, exportedAt: new Date().toISOString(), objectCount: world.objects.length, objects: world.objects }, null, 1); }
    function modal(title, body, buttons) {
      const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="kp"><h3>${title}</h3>${body}<div class="btns"></div></div>`;
      const bb = m.querySelector('.btns'); for (const [label, fn, cls] of buttons) { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = () => fn(m); bb.appendChild(b); }
      m.onclick = e => { if (e.target === m) m.remove(); }; el.appendChild(m); return m;
    }
    function exportJson() {
      const text = mapJson();
      try { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'aethelos-map.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); } catch (_) {}
      const m = modal('Export map JSON', `<p class="muted">If no download started (some embedded viewers block downloads), copy this text and save it as <b>aethelos-map.json</b>.</p><textarea readonly aria-label="Map JSON"></textarea>`,
        [['Copy', mm => { const ta = mm.querySelector('textarea'); navigator.clipboard?.writeText(ta.value).then(() => showToast('Copied'), () => { ta.select(); showToast('Selected: press Ctrl+C'); }); }], ['Close', mm => mm.remove()]]);
      m.querySelector('textarea').value = text;
    }
    function importJson() {
      const m = modal('Import map JSON', `<p class="muted">Choose an exported <b>.json</b> file, or paste map JSON below. This replaces the current map (Undo can bring it back).</p><input type="file" accept=".json,application/json" aria-label="Map JSON file"><textarea placeholder='{"format":"aethelos-map","objects":[…]}' aria-label="Paste map JSON"></textarea>`,
        [['Import', mm => applyImport(mm.querySelector('textarea').value, mm)], ['Cancel', mm => mm.remove(), 'warn']]);
      m.querySelector('input[type=file]').onchange = ev => { const f = ev.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { m.querySelector('textarea').value = r.result; }; r.readAsText(f); };
    }
    function applyImport(text, m) {
      let d; try { d = JSON.parse(text); } catch (_) { showToast('That is not valid JSON'); return; }
      const list = Array.isArray(d) ? d : d && Array.isArray(d.objects) ? d.objects : null;
      if (!list) { showToast('No "objects" list found'); return; }
      const ok = [], seen = new Set(); let skipped = 0;
      for (const o of list) {
        if (!o || !T[o.type] || !o.position || seen.has(o.id)) { skipped++; continue; }
        seen.add(o.id = String(o.id || nextId(o.type)));
        ok.push({ id: o.id, name: String(o.name || T[o.type].label), type: o.type, category: CATS.includes(o.category) ? o.category : T[o.type].category,
          position: { x: +o.position.x || 0, y: +o.position.y || 0, z: +o.position.z || 0 }, rotation: { x: +(o.rotation?.x) || 0, y: +(o.rotation?.y) || 0, z: +(o.rotation?.z) || 0 },
          scale: { x: +(o.scale?.x) || 1, y: +(o.scale?.y) || 1, z: +(o.scale?.z) || 1 }, metadata: o.metadata && typeof o.metadata === 'object' ? o.metadata : {} });
      }
      if (!ok.length) { showToast('No usable objects in that JSON'); return; }
      const before = snap(); world.objects.length = 0; ok.forEach(o => world.objects.push(o)); select(null); commit(before, 'import'); m.remove();
      showToast(`Imported ${ok.length} objects${skipped ? `, skipped ${skipped}` : ''}`);
    }

    // ---------------------------------------------------------------- enter / exit
    let active = false;
    function toggle(on = !active) {
      if (on === active) return; active = on; state.editing = on; el.hidden = !on;
      const hud = document.getElementById('phase1Hud'); if (hud) hud.style.visibility = on ? 'hidden' : '';
      for (const k in state.keys) state.keys[k] = false; for (const k in keys) keys[k] = false;
      if (on) { if (document.pointerLockElement) document.exitPointerLock?.(); enterCamera(); renderList(); renderProps(); showToast('Editor: changes save automatically'); }
      else { stopPlacing(); select(null); drag = orbit = null; ctx.resumeCamera(); showToast('Back to the adventure'); }
    }
    canvas.addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('contextmenu', onCtx);
    addEventListener('keydown', onKey); addEventListener('keyup', onKey);
    function dispose() {
      canvas.removeEventListener('pointerdown', onDown); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('contextmenu', onCtx); removeEventListener('keydown', onKey); removeEventListener('keyup', onKey);
      stopPlacing(); scene.remove(box); el.remove();
    }
    return { toggle, update, dispose, get active() { return active; }, get selected() { return selected; }, select, startPlacing, place, act, applyImport, mapJson, undo: doUndo, redo: doRedo, setField, cam };
  }
  A.createEditor = createEditor;
})();
