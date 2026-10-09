/* Townsfolk of Aethelgard (the Main City): people who walk the city streets, stop to rest or look around, turn to
   watch the hero, greet him when he comes close and show their names when he is near.
   Each person is one skinned mesh (about 1.5k triangles) built from rounded parts on a 13-bone skeleton with a
   procedural walk (stride, knee bend, arm swing, hip sway, bob). createTownsfolk({THREE, scene, world, player, camera, root}) */
(() => {
  const A = window.Aethelos ||= {};
  const PEOPLE = [
    ['Edda Marlowe', 'Baker', 'f'], ['Rowan Ashby', 'City Guard', 'm', 'guard'], ['Mira Thornwell', 'Herbalist', 'f'], ['Old Bram', 'Fisherman', 'm', 'old'],
    ['Tobin Hale', 'Blacksmith\'s apprentice', 'm'], ['Liora Venn', 'Weaver', 'f'], ['Gareth Crane', 'Merchant', 'm'], ['Nessa Brook', 'Flower seller', 'f'],
    ['Aldric Stone', 'Mason', 'm'], ['Wren Ellery', 'Courier', 'f'], ['Hobb Merriweather', 'Innkeeper', 'm', 'old'], ['Sabine Lark', 'Scribe', 'f'],
    ['Cedric Vale', 'City Guard', 'm', 'guard'], ['Ysolde Finch', 'Seamstress', 'f'], ['Piers Dunmore', 'Carpenter', 'm'], ['Maren Holt', 'Farmer', 'f', 'old'],
    ['Jory Pell', 'Stable boy', 'm', 'young'], ['Elowen Reed', 'Healer', 'f'], ['Fenwick Gray', 'Lamplighter', 'm', 'old'], ['Tilda Rowe', 'Cheesemaker', 'f'],
    ['Osric Bell', 'Bell ringer', 'm'], ['Hester Quill', 'Bookbinder', 'f', 'old'], ['Lyle Ashdown', 'Miller', 'm'], ['Brenna Cole', 'Potter', 'f'],
    ['Dain Harrow', 'Hunter', 'm'], ['Isolde Wynn', 'Musician', 'f', 'young']
  ];
  const GREET = ['Good day, Sir Knight!', 'Fine weather in Aethelgard today.', 'The palace gardens are in bloom, you know.', 'Safe travels, warrior.',
    'Mind the river, the current is quick this season.', 'Is that a pocket portal I saw? Remarkable!', 'Fresh bread at the bakery, if you are hungry.',
    'They say Ironpeak hides old treasure.', 'Long live the crown!', 'Ah, the hero of Aethelos!', 'Your horse is a beauty.', 'Good to see you, friend.'];
  const SKIN = [0xf1c8a5, 0xe0ac86, 0xc68e64, 0x9a6845, 0x6e4a32, 0xf6d6bd];
  const HAIR = [0x1d1612, 0x3b2516, 0x6b3a1f, 0x9a5a2a, 0xc9a35a, 0x8a8580, 0xd8d2c8];
  const CLOTH = [0x6d4a2f, 0x3e5a36, 0x8a2f24, 0x2f4a73, 0xb08a3c, 0x5b5d63, 0x7a5c7e, 0x3a6c6a, 0x9c7a55, 0x4b3a2a, 0xc8b89a, 0x2d3a4f];

  function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

  /* ---------------------------------------------------------------- body builder */
  const BONES = ['Root', 'Hips', 'Chest', 'Head', 'UArmL', 'FArmL', 'UArmR', 'FArmR', 'ThighL', 'ShinL', 'ThighR', 'ShinR', 'Neck'];
  function buildPerson(THREE, spec) {
    const r = rng(spec.seed), pick = a => a[(r() * a.length) | 0];
    const female = spec.sex === 'f', old = spec.age === 'old', young = spec.age === 'young', guard = spec.kind === 'guard';
    const H = (female ? 1.64 : 1.76) * (young ? 0.9 : 1) * (0.96 + r() * 0.07), s = H / 1.75;   // proportions scale with height
    const skin = new THREE.Color(pick(SKIN)), hair = new THREE.Color(old ? pick([0x8a8580, 0xd8d2c8, 0xb8b2a8]) : pick(HAIR));
    const top = new THREE.Color(guard ? 0x23406e : pick(CLOTH)), bottom = new THREE.Color(guard ? 0x3a3a40 : pick(CLOTH)), shoe = new THREE.Color(pick([0x2b1d14, 0x3d2a1c, 0x1c1714]));
    const accent = new THREE.Color(guard ? 0xc9a43a : pick(CLOTH)), leather = new THREE.Color(0x4a3220), dark = new THREE.Color(0x15110f), white = new THREE.Color(0xeee8dc);
    const build = (female ? 0.92 : 1.0) * (0.95 + r() * 0.12);
    // joints (model space, bind pose)
    const J = { Root: [0, 0, 0], Hips: [0, 0.98 * s, 0], Chest: [0, 1.22 * s, 0], Neck: [0, 1.46 * s, 0], Head: [0, 1.55 * s, 0],
      UArmL: [0.19 * s * build, 1.42 * s, 0], FArmL: [0.21 * s * build, 1.14 * s, 0], UArmR: [-0.19 * s * build, 1.42 * s, 0], FArmR: [-0.21 * s * build, 1.14 * s, 0],
      ThighL: [0.095 * s, 0.94 * s, 0], ShinL: [0.095 * s, 0.51 * s, 0], ThighR: [-0.095 * s, 0.94 * s, 0], ShinR: [-0.095 * s, 0.51 * s, 0] };
    const parts = [];
    const part = (geo, bone, color, m = {}) => {           // m: {p:[x,y,z], r:[x,y,z], sc:[x,y,z]} in model space
      const M = new THREE.Matrix4().compose(new THREE.Vector3(...(m.p || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(m.r || [0, 0, 0]))), new THREE.Vector3(...(m.sc || [1, 1, 1])));
      geo.applyMatrix4(M); parts.push({ geo, bone: BONES.indexOf(bone), color }); };
    const cap = (rad, len, seg = 10) => new THREE.CapsuleGeometry(rad, Math.max(0.001, len), 4, seg);
    const limb = (a, b, rad, bone, color, rs = [1, 1]) => {   // capsule between joints a and b
      const A_ = new THREE.Vector3(...a), B_ = new THREE.Vector3(...b), d = B_.clone().sub(A_), L = d.length();
      const g = cap(rad, L - rad * 2 * 0.6); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      g.scale(rs[0], 1, rs[1]); g.applyQuaternion(q); g.translate((A_.x + B_.x) / 2, (A_.y + B_.y) / 2, (A_.z + B_.z) / 2); parts.push({ geo: g, bone: BONES.indexOf(bone), color }); };
    // legs + shoes
    for (const [side, t, sh] of [[1, 'ThighL', 'ShinL'], [-1, 'ThighR', 'ShinR']]) {
      const x = 0.095 * s * side;
      limb([x, 0.95 * s, 0], [x, 0.51 * s, 0.01], 0.088 * s * build, t, bottom, [1, 1.05]);
      limb([x, 0.51 * s, 0.01], [x, 0.09 * s, -0.01], 0.064 * s * build, sh, guard ? new THREE.Color(0x2a2a2e) : bottom, [1, 1.1]);
      part(new THREE.CapsuleGeometry(0.052 * s, 0.13 * s, 3, 8), sh, shoe, { p: [x, 0.05 * s, 0.045 * s], r: [Math.PI / 2, 0, 0], sc: [1.05, 1, 0.85] });
    }
    // pelvis / trousers top, belt
    part(new THREE.CylinderGeometry(0.175 * s * build, 0.175 * s * build, 0.22 * s, 14), 'Hips', bottom, { p: [0, 0.97 * s, 0], sc: [1, 1, 0.8] });
    part(new THREE.CylinderGeometry(0.182 * s * build, 0.182 * s * build, 0.05 * s, 14), 'Hips', leather, { p: [0, 1.075 * s, 0], sc: [1.02, 1, 0.82] });
    if (!female && !guard) part(new THREE.CylinderGeometry(0.18 * s * build, 0.235 * s * build, 0.3 * s, 14, 1, true), 'Hips', top.clone().multiplyScalar(0.92), { p: [0, 0.93 * s, 0], sc: [1, 1, 0.84] });   // tunic skirt
    if (female && !guard) {                                // long dress / skirt over the legs
      part(new THREE.CylinderGeometry(0.17 * s, 0.31 * s, 0.82 * s, 14, 1, true), 'Hips', bottom, { p: [0, 0.66 * s, 0], sc: [1, 1, 0.85] });
    }
    // torso (tunic), chest a little deeper at the top
    part(new THREE.CylinderGeometry(0.2 * s * build, 0.17 * s * build, 0.42 * s, 16), 'Chest', top, { p: [0, 1.28 * s, 0], sc: [1, 1, 0.74] });
    part(new THREE.SphereGeometry(0.205 * s * build, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'Chest', top, { p: [0, 1.46 * s, 0], sc: [1.06, 0.45, 0.76] });
    if (female) part(new THREE.SphereGeometry(0.15 * s, 12, 8), 'Chest', top, { p: [0, 1.33 * s, 0.045 * s], sc: [1.05, 0.55, 0.62] });
    if (guard) { part(new THREE.BoxGeometry(0.28 * s, 0.62 * s, 0.03 * s), 'Chest', accent, { p: [0, 1.12 * s, 0.13 * s] });   // tabard
      part(new THREE.BoxGeometry(0.29 * s, 0.6 * s, 0.03 * s), 'Chest', top, { p: [0, 1.12 * s, -0.13 * s] }); }
    else if (spec.apron) part(new THREE.BoxGeometry(0.3 * s, 0.55 * s, 0.02 * s), 'Hips', white, { p: [0, 0.86 * s, 0.135 * s], r: [-0.06, 0, 0] });
    // arms (sleeves) + hands
    for (const [side, u, f] of [[1, 'UArmL', 'FArmL'], [-1, 'UArmR', 'FArmR']]) {
      const x = 0.2 * s * build * side;
      part(new THREE.SphereGeometry(0.075 * s * build, 10, 8), u, top, { p: [x, 1.425 * s, 0], sc: [1.1, 0.95, 1] });             // shoulder
      limb([x, 1.43 * s, 0], [x * 1.08, 1.14 * s, 0], 0.062 * s * build, u, top);
      limb([x * 1.08, 1.14 * s, 0], [x * 1.1, 0.9 * s, 0.03 * s], 0.05 * s * build, f, r() < 0.4 && !guard ? skin : top);
      part(new THREE.SphereGeometry(0.052 * s, 10, 8), f, skin, { p: [x * 1.1, 0.845 * s, 0.035 * s], sc: [0.75, 1.2, 1.05] });
    }
    // neck + head
    part(new THREE.CylinderGeometry(0.056 * s, 0.065 * s, 0.11 * s, 10), 'Neck', skin, { p: [0, 1.505 * s, 0] });
    const hy = 1.645 * s, hs = 1.08;                        // head a touch larger than strict proportions read better in game
    part(new THREE.SphereGeometry(0.105 * s * hs, 16, 12), 'Head', skin, { p: [0, hy, 0.005], sc: [0.92, 1.12, 1.0] });
    part(new THREE.SphereGeometry(0.06 * s, 10, 6), 'Head', skin, { p: [0, hy - 0.07 * s, 0.035 * s], sc: [1.2, 0.75, 1.0] });   // jaw / chin
    part(new THREE.ConeGeometry(0.018 * s, 0.05 * s, 6), 'Head', skin, { p: [0, hy - 0.005 * s, 0.106 * s], r: [Math.PI / 2, 0, 0] }); // nose
    for (const x of [-0.036, 0.036]) {
      part(new THREE.SphereGeometry(0.014 * s, 8, 6), 'Head', white, { p: [x * s, hy + 0.018 * s, 0.088 * s], sc: [1.2, 0.8, 0.6] });
      part(new THREE.SphereGeometry(0.008 * s, 6, 5), 'Head', dark, { p: [x * s, hy + 0.018 * s, 0.096 * s] });
      part(new THREE.BoxGeometry(0.034 * s, 0.007 * s, 0.01 * s), 'Head', hair.clone().multiplyScalar(0.7), { p: [x * s, hy + 0.045 * s, 0.094 * s], r: [0, 0, x > 0 ? -0.15 : 0.15] });   // brows
      part(new THREE.SphereGeometry(0.022 * s, 6, 6), 'Head', skin, { p: [x * 2.8 * s, hy + 0.005 * s, 0], sc: [0.5, 1, 0.8] });   // ears
    }
    part(new THREE.BoxGeometry(0.038 * s, 0.006 * s, 0.008 * s), 'Head', new THREE.Color(0x8a4a42), { p: [0, hy - 0.052 * s, 0.093 * s] }); // mouth
    // hair styles
    const style = guard ? 'helmet' : female ? pick(['long', 'bun', 'braid', 'long']) : old ? pick(['bald', 'short', 'hood']) : pick(['short', 'short', 'shaggy', 'hat']);
    const capG = (rad, phiLen) => new THREE.SphereGeometry(rad, 16, 10, 0, Math.PI * 2, 0, phiLen);
    if (style !== 'bald' && style !== 'helmet') part(capG(0.113 * s, Math.PI * 0.55), 'Head', hair, { p: [0, hy + 0.012 * s, -0.008 * s], sc: [0.95, 1.1, 1.06], r: [-0.25, 0, 0] });
    if (style === 'long') part(new THREE.CapsuleGeometry(0.09 * s, 0.2 * s, 4, 10), 'Head', hair, { p: [0, hy - 0.11 * s, -0.06 * s], sc: [1.15, 1, 0.55] });
    if (style === 'braid') part(new THREE.CapsuleGeometry(0.03 * s, 0.32 * s, 3, 8), 'Head', hair, { p: [0, hy - 0.16 * s, -0.1 * s], r: [0.25, 0, 0] });
    if (style === 'bun') part(new THREE.SphereGeometry(0.05 * s, 10, 8), 'Head', hair, { p: [0, hy + 0.06 * s, -0.1 * s] });
    if (style === 'shaggy') part(capG(0.118 * s, Math.PI * 0.62), 'Head', hair, { p: [0, hy + 0.0, -0.012 * s], sc: [0.98, 1.12, 1.08], r: [-0.35, 0, 0] });
    if (style === 'bald') part(capG(0.11 * s, Math.PI * 0.62), 'Head', hair, { p: [0, hy - 0.02 * s, -0.02 * s], sc: [1.0, 0.7, 1.0], r: [-1.2, 0, 0] });
    if (style === 'hat') { part(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.012 * s, 16), 'Head', new THREE.Color(0xc9a65a), { p: [0, hy + 0.075 * s, 0] });
      part(new THREE.CylinderGeometry(0.085 * s, 0.11 * s, 0.09 * s, 14), 'Head', new THREE.Color(0xc9a65a), { p: [0, hy + 0.12 * s, 0] }); }
    if (style === 'hood') part(capG(0.13 * s, Math.PI * 0.7), 'Head', top.clone().multiplyScalar(0.8), { p: [0, hy + 0.01 * s, -0.02 * s], sc: [1, 1.1, 1.1], r: [-0.45, 0, 0] });
    if (style === 'helmet') { part(capG(0.122 * s, Math.PI * 0.5), 'Head', new THREE.Color(0x8d9096), { p: [0, hy + 0.02 * s, 0] });
      part(new THREE.CylinderGeometry(0.128 * s, 0.128 * s, 0.02 * s, 16), 'Head', new THREE.Color(0x6d7076), { p: [0, hy + 0.02 * s, 0] }); }
    if (!female && (old || r() < 0.3)) part(new THREE.SphereGeometry(0.07 * s, 10, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), 'Head', hair, { p: [0, hy - 0.035 * s, 0.045 * s], sc: [1.05, 1.0, 0.9] });   // beard
    // merge
    let nv = 0, ni = 0; for (const p of parts) { nv += p.geo.attributes.position.count; ni += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const p of parts) {
      const g = p.geo; if (!g.attributes.normal) g.computeVertexNormals();
      const P = g.attributes.position, N = g.attributes.normal, n = P.count;
      for (let i = 0; i < n; i++) { pos.set([P.getX(i), P.getY(i), P.getZ(i)], (vo + i) * 3); nor.set([N.getX(i), N.getY(i), N.getZ(i)], (vo + i) * 3);
        const shade = 0.93 + 0.07 * Math.sin(P.getX(i) * 40 + P.getY(i) * 31);                       // a little cloth variation
        col.set([p.color.r * shade, p.color.g * shade, p.color.b * shade], (vo + i) * 3); si[(vo + i) * 4] = p.bone; sw[(vo + i) * 4] = 1; }
      if (g.index) for (let k = 0; k < g.index.count; k++) idx[io++] = g.index.getX(k) + vo; else for (let k = 0; k < n; k++) idx[io++] = k + vo;
      vo += n; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); geo.setIndex(new THREE.BufferAttribute(idx.subarray(0, io), 1));
    // skeleton
    const bones = BONES.map(n => { const b = new THREE.Bone(); b.name = n; return b; });
    const par = { Hips: 'Root', Chest: 'Hips', Neck: 'Chest', Head: 'Neck', UArmL: 'Chest', FArmL: 'UArmL', UArmR: 'Chest', FArmR: 'UArmR', ThighL: 'Hips', ShinL: 'ThighL', ThighR: 'Hips', ShinR: 'ThighR' };
    BONES.forEach((n, i) => { const j = J[n], p = par[n] ? J[par[n]] : [0, 0, 0]; bones[i].position.set(j[0] - p[0], j[1] - p[1], j[2] - p[2]); if (par[n]) bones[BONES.indexOf(par[n])].add(bones[i]); });
    bones[0].updateMatrixWorld(true);
    return { geo, bones, height: H, style };
  }

  function createTownsfolk({ THREE, scene, world, player, camera, root, count = PEOPLE.length }) {
    const T = world.terrain, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
    // walkable streets: the city roads (inside the walls)
    const streets = T.roads.filter(R => /^city-/.test(R.id) && R.pts.length > 3);
    const group = new THREE.Group(); group.name = 'Townsfolk'; scene.add(group);
    const list = [];
    PEOPLE.slice(0, count).forEach(([name, role, sex, kind], k) => {
      const age = kind === 'old' ? 'old' : kind === 'young' ? 'young' : 'adult';
      const spec = { seed: 101 + k * 37, sex, age, kind, apron: /Baker|Cheesemaker|Innkeeper|Potter/.test(role) };
      const B = buildPerson(THREE, spec);
      const mesh = new THREE.SkinnedMesh(B.geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      const holder = new THREE.Group(); holder.add(B.bones[0]); holder.add(mesh); mesh.bind(new THREE.Skeleton(B.bones));
      const R = streets[k % streets.length], side = k % 2 ? 1 : -1;
      const p = { name, role, holder, mesh, b: Object.fromEntries(B.bones.map(b => [b.name, b])), height: B.height, R, i: (k * 7) % (R.pts.length - 1), dir: k % 3 ? 1 : -1,
        lane: side * (R.width / 2 - 0.9 - (k % 3) * 0.35), speed: 1.05 + ((k * 13) % 7) * 0.07 * (kind === 'old' ? 0.7 : 1), ph: k * 0.7, state: 'walk', wait: 0,
        walkT: 12 + (k % 5) * 6, yaw: 0, look: 0, greetT: 0, x: 0, z: 0, y: 0, stride: B.height * 0.42, swing: 0 };
      if (R.loop === undefined && R.pts[0][0] === R.pts[R.pts.length - 1][0] && R.pts[0][1] === R.pts[R.pts.length - 1][1]) R.loop = true;
      place(p, 0); group.add(holder); list.push(p);
    });
    function lanePoint(p, i) { const P = p.R.pts, n = P.length; i = p.R.loop ? ((i % (n - 1)) + (n - 1)) % (n - 1) : Math.max(0, Math.min(n - 1, i)); const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const off = p.lane * p.dir; return [P[i][0] - dz / l * off, P[i][1] + dx / l * off]; }
    function place(p) { const [x, z] = lanePoint(p, p.i); p.x = x; p.z = z; p.y = world.groundAt(x, z, 50).h; p.holder.position.set(x, p.y, z); }
    // ---------------------------------------------------------------- nameplates + greeting bubble
    if (!document.getElementById('npcCss')) { const st = document.createElement('style'); st.id = 'npcCss'; st.textContent = `
      .npcName { position: absolute; left: 0; top: 0; z-index: 11; pointer-events: none; transform: translate(-50%, -100%); white-space: nowrap; text-align: center;
        font: 700 12px/1.15 'Fredoka', 'Nunito', system-ui, sans-serif; color: #fff6e0; text-shadow: 0 1px 3px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9); opacity: 0; transition: opacity .25s; }
      .npcName small { display: block; font-weight: 600; font-size: 10px; color: #d9cbb0; }
      .npcName.show { opacity: 1; }`; document.head.appendChild(st); }
    const host = root || document.body, tags = [];
    for (let i = 0; i < 6; i++) { const el = document.createElement('div'); el.className = 'npcName'; host.appendChild(el); tags.push(el); }
    const bubble = document.createElement('div'); bubble.className = 'heroSay'; bubble.style.fontSize = '13px'; host.appendChild(bubble);
    let bubbleT = 0, bubbleP = null, lastGreet = -99, clock = 0;
    const v = new THREE.Vector3();
    function project(p, lift) { v.set(p.x, p.y + p.height + lift, p.z).project(camera); if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
      return [(v.x * 0.5 + 0.5) * (host.clientWidth || innerWidth), (-v.y * 0.5 + 0.5) * (host.clientHeight || innerHeight)]; }
    // ---------------------------------------------------------------- per frame
    function pose(p, dt, moving) {
      const b = p.b, w = p.swing = p.swing + ((moving ? 1 : 0) - p.swing) * Math.min(1, dt * 5);
      const s = Math.sin(p.ph), c = Math.cos(p.ph), t = clock + p.name.length;
      const legA = 0.48 * w, armA = 0.32 * w;
      b.ThighL.rotation.x = -legA * s; b.ThighR.rotation.x = legA * s;
      b.ShinL.rotation.x = 0.85 * w * Math.max(0, Math.sin(p.ph - 1.2)) + 0.05; b.ShinR.rotation.x = 0.85 * w * Math.max(0, Math.sin(p.ph + Math.PI - 1.2)) + 0.05;
      b.UArmL.rotation.x = armA * s; b.UArmR.rotation.x = -armA * s; b.UArmL.rotation.z = 0.06; b.UArmR.rotation.z = -0.06;
      b.FArmL.rotation.x = -0.25 - 0.25 * w * Math.max(0, -s); b.FArmR.rotation.x = -0.25 - 0.25 * w * Math.max(0, s);
      b.Hips.position.y = p.b.Root.children.length ? b.Hips.userData.y0 + 0.025 * w * Math.abs(c) : b.Hips.position.y;
      b.Hips.rotation.y = 0.08 * w * s; b.Chest.rotation.y = -0.1 * w * s; b.Hips.rotation.z = 0.03 * w * c;
      // idle: breathing and weight shift; the head turns toward whatever it looks at
      const idle = 1 - w; b.Chest.rotation.x = 0.02 * Math.sin(t * 1.7) * idle - 0.04 * w; b.Hips.rotation.z += 0.025 * Math.sin(t * 0.6) * idle;
      b.Head.rotation.y += (p.look - b.Head.rotation.y) * Math.min(1, dt * 4); b.Head.rotation.x = 0.04 * Math.sin(t * 0.9) * idle;
    }
    list.forEach(p => { p.b.Hips.userData.y0 = p.b.Hips.position.y; });
    function update(dt) {
      clock += dt; const cam = camera.position, hp = player.position;
      const dyn = [];
      for (const p of list) {
        const dc = Math.hypot(p.x - cam.x, p.z - cam.z), far = dc > 140; p.holder.visible = !far; if (far && p.state !== 'walk') continue;
        const toHero = Math.hypot(hp.x - p.x, hp.z - p.z);
        // look at the hero when he is close, otherwise glance around now and then
        let look = 0;
        if (toHero < 7) { const a = Math.atan2(hp.x - p.x, hp.z - p.z) - p.yaw; look = Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(a), Math.cos(a)))); }
        else if (p.state === 'rest') look = 0.8 * Math.sin(clock * 0.4 + p.ph);
        p.look = look;
        let moving = false;
        if (p.state === 'rest') { p.wait -= dt; if (p.wait <= 0) { p.state = 'walk'; p.walkT = 15 + Math.random() * 25; } }
        else {
          // the hero standing in the way: stop and wait (and say hello)
          const [tx, tz] = lanePoint(p, p.i + p.dir), dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
          const ahead = toHero < 1.6 && ((hp.x - p.x) * dx + (hp.z - p.z) * dz) > 0;
          let blocked = ahead;
          for (const o of list) if (o !== p && Math.hypot(o.x - p.x, o.z - p.z) < 0.75 && ((o.x - p.x) * dx + (o.z - p.z) * dz) > 0 && o.state !== 'rest' && o.lane * o.dir === p.lane * p.dir) blocked = true;
          if (!blocked) {
            const step = Math.min(d, p.speed * dt); p.x += dx / d * step; p.z += dz / d * step; moving = !far;
            const want = Math.atan2(dx, dz); p.yaw += Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw)) * Math.min(1, dt * 6);
            p.ph += step / p.stride * Math.PI;
            if (d - step < 0.05) { p.i += p.dir; const n = p.R.pts.length;
              if (p.i <= 0 || p.i >= n - 1) { if (p.R.loop) p.i = (p.i + n - 1) % (n - 1); else { p.dir = -p.dir; p.i = Math.max(0, Math.min(n - 1, p.i)); p.state = 'rest'; p.wait = 2 + Math.random() * 4; } } }
            p.walkT -= dt; if (p.walkT <= 0) { p.state = 'rest'; p.wait = 3 + Math.random() * 6; }
          }
          p.y += (world.groundAt(p.x, p.z, p.y + 1).h - p.y) * Math.min(1, dt * 10);
        }
        if (!far) { p.holder.position.set(p.x, p.y, p.z); p.holder.rotation.y = p.yaw; pose(p, dt, moving); }
        if (toHero < 12) dyn.push({ x: p.x, z: p.z, r: 0.28 });
        // greeting
        if (toHero < 2.6 && clock - p.greetT > 30 && clock - lastGreet > 4) { p.greetT = lastGreet = clock; bubble.textContent = p.name.split(' ')[0] + ': ' + GREET[(Math.random() * GREET.length) | 0]; bubble.classList.add('show'); bubbleT = 3.2; bubbleP = p; }
      }
      world.dynamic && (world.dynamic.npcs = dyn);
      // nameplates for the nearest people in view
      const near = list.filter(p => p.holder.visible).map(p => [p, Math.hypot(p.x - hp.x, p.z - hp.z)]).filter(a => a[1] < 14).sort((a, b) => a[1] - b[1]).slice(0, tags.length);
      tags.forEach((el, i) => { const a = near[i]; const xy = a && project(a[0], 0.32);
        if (!xy) { el.classList.remove('show'); return; }
        if (el.dataset.who !== a[0].name) { el.innerHTML = `${a[0].name}<small>${a[0].role}</small>`; el.dataset.who = a[0].name; }
        el.style.left = xy[0].toFixed(1) + 'px'; el.style.top = xy[1].toFixed(1) + 'px'; el.classList.add('show'); });
      if (bubbleT > 0) { bubbleT -= dt; const xy = bubbleP && project(bubbleP, 0.62);
        if (xy) { bubble.style.left = xy[0].toFixed(1) + 'px'; bubble.style.top = xy[1].toFixed(1) + 'px'; bubble.style.visibility = ''; } else bubble.style.visibility = 'hidden';
        if (bubbleT <= 0) bubble.classList.remove('show'); }
    }
    function dispose() { scene.remove(group); list.forEach(p => p.mesh.geometry.dispose()); mat.dispose(); tags.forEach(t => t.remove()); bubble.remove(); world.dynamic && (world.dynamic.npcs = null); }
    return { update, dispose, list };
  }
  A.createTownsfolk = createTownsfolk; A.TOWNSFOLK = PEOPLE; A.buildPerson = buildPerson;
})();
