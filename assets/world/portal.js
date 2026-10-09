/* Pocket-dimension portal (blue): a torn hole in the air.
   - interior: a deep tunnel of swirling blue energy with stars receding into it (parallax), dark navy core
   - rim: a ragged ring of blue fire with white-hot sparks, turbulent and flickering (HDR, so it blooms)
   - outer glow, crackling sparks thrown off the rim and pulled back in, and a light that lights the surroundings
   - opens as a vertical tear that widens into an ellipse; closes the other way
   The portal faces its local +Y axis (the disc lies in local XZ).  createPortalFX(THREE, scene, {radius, aspect}) ->
   { group, setOpen(a), update(dt, camera), dispose() }.  Put it under any object (a bone, the scene) and set open 0..1. */
(() => {
  const A = window.Aethelos ||= {};
  const NOISE = `
    float ph(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float pn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(ph(i), ph(i + vec2(1, 0)), u.x), mix(ph(i + vec2(0, 1)), ph(i + vec2(1, 1)), u.x), u.y); }
    float pf(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * pn(p); p = p * 2.07 + 13.1; a *= 0.5; } return s; }`;
  const VS = `varying vec2 vUv; varying vec3 vVd; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vVd = normalize((inverse(viewMatrix) * vec4(normalize(mv.xyz), 0.0)).xyz); gl_Position = projectionMatrix * mv; }`;
  function createPortalFX(THREE, scene, { radius = 0.3, aspect = 1.0, light = true, sparks = 60, lampPower = 14 } = {}) {
    const group = new THREE.Group(); group.name = 'PortalFX';
    const U = { uTime: { value: Math.random() * 10 }, uOpen: { value: 0 }, uAspect: { value: aspect } };
    // ---- interior (the tunnel) + rim fire: one disc, two passes
    const disc = new THREE.PlaneGeometry(2.6, 2.6, 1, 1); disc.rotateX(-Math.PI / 2);          // lies in XZ, faces +Y
    // opaque (writes depth): the haze / fog pass then treats the hole as a near surface instead of fogging it with the sky behind
    const inner = new THREE.ShaderMaterial({ uniforms: U, transparent: false, depthWrite: true, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: VS, fragmentShader: `uniform float uTime; uniform float uOpen; uniform float uAspect; varying vec2 vUv; varying vec3 vVd; ${NOISE}
        void main(){
          vec2 p = (vUv - 0.5) * 2.6; p.y /= uAspect;
          float r = length(p), a = atan(p.y, p.x);
          float edge = 1.0 + 0.10 * (pf(vec2(a * 3.0, uTime * 1.6)) - 0.5) + 0.04 * sin(a * 7.0 + uTime * 5.0);
          float inside = 1.0 - smoothstep(edge - 0.06, edge, r);
          if (inside <= 0.5) discard;
          float rr = r;
          // tunnel: log-polar coordinates scroll inward and spin
          float depth = 1.0 / max(rr, 0.12);
          vec2 tc = vec2(a / 6.2831 * 6.0 + uTime * 0.35 + depth * 0.22, depth * 0.9 - uTime * 1.6);
          float swirl = pf(tc * vec2(1.0, 0.6)) * 0.65 + pf(tc * vec2(2.0, 1.4) + 7.0) * 0.35;
          float arms = pow(0.5 + 0.5 * sin(a * 3.0 + log(rr + 0.02) * 5.5 + uTime * 3.0 + swirl * 4.0), 3.0);
          vec3 deep = vec3(0.005, 0.012, 0.05), mid = vec3(0.03, 0.18, 0.75), hot = vec3(0.45, 0.8, 1.6);
          vec3 col = mix(deep, mid, smoothstep(0.35, 1.0, swirl) * (0.35 + 0.65 * rr));
          col += hot * arms * smoothstep(0.15, 0.9, rr) * 0.55;
          // stars rushing out of the depth
          vec2 sc = vec2(a / 6.2831853 * 56.0, depth * 3.0 - uTime * 2.5); vec2 si = floor(sc);
          float st = step(0.93, ph(si)) * smoothstep(0.32, 0.0, length(fract(sc) - 0.5));
          col += vec3(0.75, 0.9, 1.4) * st * smoothstep(0.1, 0.6, rr) * 1.5;
          col *= 0.25 + 0.75 * smoothstep(0.0, 0.55, rr);                       // a dark, deep heart
          col = mix(deep * 0.6, col, smoothstep(0.02, 0.22, rr));
          gl_FragColor = vec4(col, 1.0);
        }` });
    const rim = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending,
      vertexShader: VS, fragmentShader: `uniform float uTime; uniform float uOpen; uniform float uAspect; varying vec2 vUv; varying vec3 vVd; ${NOISE}
        void main(){
          vec2 p = (vUv - 0.5) * 2.6; p.y /= uAspect;
          float r = length(p), a = atan(p.y, p.x);
          float edge = 1.0 + 0.10 * (pf(vec2(a * 3.0, uTime * 1.6)) - 0.5) + 0.04 * sin(a * 7.0 + uTime * 5.0);
          float d = r - edge;
          float fire = pf(vec2(a * 6.0 + uTime * 2.0, d * 6.0 - uTime * 5.0));
          float tongue = smoothstep(0.58, 0.95, fire + 0.42 - max(d, 0.0) * 9.0) * step(-0.02, d);
          float bd = d / 0.03; float band = exp(-bd * bd);
          float id_ = min(d, 0.0) / 0.08; float inner = exp(-id_ * id_) * step(d, 0.0) * 0.6;           // light spilling into the hole
          float glow = exp(-max(d, 0.0) * 9.0) * 0.22 * step(0.0, d);
          float flick = 0.85 + 0.15 * sin(uTime * 37.0 + a * 5.0);
          vec3 c = vec3(0.08, 0.38, 1.7) * (tongue * 1.5 + glow + inner) + vec3(0.55, 0.9, 1.9) * band * 1.5;
          float alpha = clamp((band + tongue * 0.8 + glow + inner) * flick, 0.0, 1.0) * smoothstep(0.0, 0.15, uOpen);
          gl_FragColor = vec4(c * alpha, alpha);
        }` });
    const mInner = new THREE.Mesh(disc, inner), mRim = new THREE.Mesh(disc, rim);
    mInner.renderOrder = 8; mRim.renderOrder = 9; mInner.frustumCulled = mRim.frustumCulled = false;
    const holder = new THREE.Group(); holder.scale.setScalar(radius); holder.add(mInner, mRim); group.add(holder);
    // ---- sparks (GPU points, animated from seeds)
    const n = sparks, sg = new THREE.BufferGeometry(), seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) seeds.set([Math.random() * 6.283, Math.random(), Math.random(), 0.5 + Math.random()], i * 4);
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); sg.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    const sm = new THREE.ShaderMaterial({ uniforms: Object.assign({ uR: { value: radius } }, U), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `attribute vec4 seed; uniform float uTime; uniform float uOpen; uniform float uR; uniform float uAspect; varying float vA;
        void main(){ float t = fract(uTime * 0.6 * seed.w + seed.y); float a = seed.x + t * 2.5 * (seed.z - 0.5);
          float out_ = seed.z > 0.5 ? 1.0 + t * 0.6 : 1.4 - t * 0.45;
          vec3 p = vec3(cos(a) * out_, (seed.z - 0.5) * 0.25 * t, sin(a) * out_ * uAspect) * uR * uOpen;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vA = sin(3.14159 * t) * smoothstep(0.2, 0.6, uOpen);
          gl_PointSize = (1.0 + 1.6 * seed.w) * 26.0 * sqrt(uR) / max(0.2, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * vA; if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.3, 0.65, 1.6) * a, a); }` });
    const pts = new THREE.Points(sg, sm); pts.frustumCulled = false; pts.renderOrder = 10; group.add(pts);
    let lamp = null;
    if (light) { lamp = new THREE.PointLight(0x3a8cff, 0, radius * 14, 1.8); lamp.position.set(0, radius * 0.4, 0); group.add(lamp); }
    let open = 0;
    const api = {
      group, mats: [inner, rim, sm],
      get open() { return open; },
      setOpen(a) {
        open = Math.max(0, Math.min(1, a)); U.uOpen.value = open;
        // tear open: tall slit first, then it widens
        holder.scale.set(radius * Math.max(0.02, Math.pow(open, 1.6)), radius, radius * Math.max(0.02, Math.pow(open, 0.55)));
        holder.visible = pts.visible = open > 0.005;                         // the light stays in the scene (no shader recompiles)
        if (lamp) lamp.intensity = lampPower * open * Math.min(1, radius / 0.3);
      },
      update(dt) { U.uTime.value += dt; },
      dispose() { group.parent && group.parent.remove(group); disc.dispose(); sg.dispose(); inner.dispose(); rim.dispose(); sm.dispose(); }
    };
    api.setOpen(0); return api;
  }
  A.createPortalFX = createPortalFX;
})();
