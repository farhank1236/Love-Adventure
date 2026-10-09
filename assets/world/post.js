/* Aethelos post-processing: the scene renders in HDR (half float, MSAA) and is finished here.
   1. SSAO (high quality): contact shadows in corners, under eaves, between rocks (half resolution, depth-aware blur)
   2. Aerial perspective: height fog + distance haze coloured by the sky in that direction (sunset glow toward the suns)
   3. Bloom: lamps, fire, the sun, the blue flame skill
   4. Exposure (brighter at night), ACES filmic curve, colour grade, vignette, dither
   Dynamic resolution keeps the frame rate up: the 3D view drops to as low as 60 % resolution when frames are slow.
   API: createPost({THREE, renderer, sky, quality}) -> { render(scene, camera), setSize(w, h), setQuality(q), scale, dispose() } */
(() => {
  const A = window.Aethelos ||= {};
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  function createPost({ THREE, renderer, sky, quality = 'high' }) {
    const Q = { q: quality, scale: 1, msaa: 4, ssao: true, bloomLevels: 6 };
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
    const qScene = new THREE.Scene(); qScene.add(quad); const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };
    const HF = THREE.HalfFloatType;
    let W = 2, Hh = 2, main = null, lit = null, aoA = null, aoB = null, mips = [];
    const mk = (w, h, o = {}) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: HF, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, ...o });
    function alloc() {
      [main, lit, aoA, aoB, ...mips].forEach(t => t && t.dispose());
      const w = Math.max(2, Math.round(W * Q.scale)), h = Math.max(2, Math.round(Hh * Q.scale));
      const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
      main = mk(w, h, { depthBuffer: true, depthTexture: dt, samples: Q.msaa });
      lit = mk(w, h); aoA = mk(w >> 1, h >> 1, { type: THREE.UnsignedByteType }); aoB = mk(w >> 1, h >> 1, { type: THREE.UnsignedByteType });
      mips = []; let mw = w >> 1, mh = h >> 1; for (let i = 0; i < Q.bloomLevels && mw > 2 && mh > 2; i++) { mips.push(mk(mw, mh)); mw >>= 1; mh >>= 1; }
      U.uRes.value.set(w, h);
    }
    const U = {
      tScene: { value: null }, tDepth: { value: null }, tAO: { value: null }, tLit: { value: null }, tBloom: { value: null }, tSrc: { value: null }, uLut: { value: sky.lut },
      uRes: { value: new THREE.Vector2(2, 2) }, uTexel: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2() },
      uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() },
      uNear: { value: 0.15 }, uFar: { value: 3000 }, uAOOn: { value: 1 }, uFogD: { value: 0.0011 }, uFogH: { value: 90 }, uSun: sky.U.uSun, uLightCol: sky.U.uLightCol,
      uExposure: { value: 1 }, uNight: A.Mat.U.uNight, uBloom: { value: 0.06 }, uThresh: { value: 1.2 }, uTime: A.Mat.U.uTime, uDay: A.Mat.U.uDay
    };
    const DEPTH = /* glsl */`
      uniform sampler2D tDepth; uniform mat4 uProjInv; uniform mat4 uViewInv; uniform mat4 uProj;
      vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }`;
    const mat = (fs, extra = {}) => new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, ...extra });
    // ---------------------------------------------- SSAO
    const ssaoMat = mat(DEPTH + /* glsl */`uniform vec2 uRes; uniform float uTime; varying vec2 vUv;
      float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main(){
        float d0 = texture2D(tDepth, vUv).x; if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
        vec2 tx = 2.0 / uRes; vec3 P = viewPos(vUv);
        vec3 px = viewPos(vUv + vec2(tx.x, 0.0)) - P, nx = P - viewPos(vUv - vec2(tx.x, 0.0));
        vec3 py = viewPos(vUv + vec2(0.0, tx.y)) - P, ny = P - viewPos(vUv - vec2(0.0, tx.y));
        vec3 N = normalize(cross(abs(px.z) < abs(nx.z) ? px : nx, abs(py.z) < abs(ny.z) ? py : ny));
        float R = 0.85, rs = R * uProj[1][1] * 0.5 / max(0.2, -P.z), ao = 0.0;
        float rnd = h12(gl_FragCoord.xy) * 6.2831853;
        const int NS = 12;
        for (int i = 0; i < NS; i++){
          float f = (float(i) + 0.5) / float(NS); float a = rnd + float(i) * 2.39996;
          vec2 o = vec2(cos(a), sin(a)) * rs * f * vec2(uRes.y / uRes.x, 1.0);
          vec3 v = viewPos(vUv + o) - P; float vv = dot(v, v);
          ao += max(0.0, dot(v, N) - 0.02 * -P.z * 0.05) / (vv + 0.05) * smoothstep(R * R * 2.0, 0.0, vv);
        }
        ao = clamp(1.0 - 1.35 * ao / float(NS), 0.0, 1.0);
        gl_FragColor = vec4(ao, ao, ao, 1.0);
      }`);
    const blurMat = mat(DEPTH + /* glsl */`uniform sampler2D tSrc; uniform vec2 uDir; uniform vec2 uRes; varying vec2 vUv;
      void main(){ float z0 = viewPos(vUv).z, s = 0.0, w = 0.0;
        for (int i = -3; i <= 3; i++){ vec2 uv = vUv + uDir * float(i) * 2.0 / uRes; float z = viewPos(uv).z; float k = exp(-abs(z - z0) * 2.0 / max(1.0, -z0 * 0.05)) * (1.0 - abs(float(i)) / 4.0);
          s += texture2D(tSrc, uv).r * k; w += k; }
        float a = s / max(w, 1e-4); gl_FragColor = vec4(a, a, a, 1.0); }`);
    // ---------------------------------------------- AO + aerial perspective
    const litMat = mat(DEPTH + A.SkyGLSL.ATMOS + /* glsl */`uniform sampler2D tScene; uniform sampler2D tAO; uniform sampler2D uLut; uniform float uAOOn; uniform float uFogD; uniform float uFogH;
      uniform vec3 uCam; uniform vec3 uSun; uniform vec3 uLightCol; varying vec2 vUv;
      void main(){
        vec3 col = texture2D(tScene, vUv).rgb; float d = texture2D(tDepth, vUv).x;
        if (d < 0.99999) {
          if (uAOOn > 0.5) { float ao = texture2D(tAO, vUv).r; col *= mix(1.0, ao, 0.9); }
          vec3 vp = viewPos(vUv); vec3 wp = (uViewInv * vec4(vp, 1.0)).xyz; vec3 r = wp - uCam; float dist = length(r); vec3 dir = r / dist;
          float k = 1.0 / uFogH, dy = r.y;
          float hint = abs(dy * k) > 1e-3 ? (1.0 - exp(-dy * k)) / (dy * k) : 1.0;
          float od = uFogD * exp(-max(uCam.y, -50.0) * k) * dist * hint;
          float fog = 1.0 - exp(-od);
          vec3 hd = normalize(vec3(dir.x, max(dir.y, 0.0) * 0.5 + 0.025, dir.z));
          vec3 haze = texture2D(uLut, dirToLut(hd)).rgb * 1.05 + uLightCol * 0.012 * pow(max(0.0, dot(dir, uSun)), 6.0);
          col = col * (1.0 - fog) + haze * fog;
        }
        gl_FragColor = vec4(col, 1.0);
      }`);
    // ---------------------------------------------- bloom (prefilter + 13-tap down, tent up)
    const preMat = mat(/* glsl */`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
      vec3 q(vec2 o){ vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb; return min(c, vec3(60.0)); }
      void main(){ vec3 c = (q(vec2(-1,-1)) + q(vec2(1,-1)) + q(vec2(-1,1)) + q(vec2(1,1))) * 0.25;
        float l = max(c.r, max(c.g, c.b)), kn = uThresh * 0.5, s = clamp(l - uThresh + kn, 0.0, 2.0 * kn); s = s * s / (4.0 * kn + 1e-4);
        gl_FragColor = vec4(c * max(s, l - uThresh) / max(l, 1e-4), 1.0); }`);
    const downMat = mat(/* glsl */`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      vec3 s(float x, float y){ return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
      void main(){ vec3 a = s(-2.,2.), b = s(0.,2.), c = s(2.,2.), d = s(-2.,0.), e = s(0.,0.), f = s(2.,0.), g = s(-2.,-2.), h = s(0.,-2.), i = s(2.,-2.), j = s(-1.,1.), k = s(1.,1.), l = s(-1.,-1.), m = s(1.,-1.);
        gl_FragColor = vec4(e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125, 1.0); }`);
    const upMat = mat(/* glsl */`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      vec3 s(float x, float y){ return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
      void main(){ vec3 c = s(0.,0.) * 4.0 + (s(-1.,0.) + s(1.,0.) + s(0.,-1.) + s(0.,1.)) * 2.0 + s(-1.,-1.) + s(1.,-1.) + s(-1.,1.) + s(1.,1.);
        gl_FragColor = vec4(c / 16.0, 1.0); }`, { blending: THREE.AdditiveBlending, transparent: true });
    // ---------------------------------------------- final: exposure, filmic curve, grade
    const finalMat = mat(/* glsl */`uniform sampler2D tLit; uniform sampler2D tBloom; uniform float uExposure; uniform float uBloom; uniform float uNight; uniform float uDay; uniform float uTime; varying vec2 vUv;
      vec3 aces(vec3 v){ const mat3 I = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 O = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        v = I * v; vec3 a = v * (v + 0.0245786) - 0.000090537, b = v * (0.983729 * v + 0.4329510) + 0.238081; return clamp(O * (a / b), 0.0, 1.0); }
      vec3 srgb(vec3 c){ c = max(c, vec3(0.0)); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        vec3 c = texture2D(tLit, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
        c *= uExposure;
        // grade: cool moonlit shadows at night, slightly warm sunlit highlights by day
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, c * vec3(0.86, 0.95, 1.18), uNight * 0.6);
        c = mix(c, c * vec3(1.04, 1.0, 0.95), uDay * smoothstep(0.2, 1.5, l) * 0.6);
        c = aces(c * 1.6);
        float g = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(g), c, 1.07);            // saturation
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.12);                                          // gentle S-curve
        vec2 v = vUv - 0.5; c *= 1.0 - 0.32 * dot(v, v) * 1.6;                             // vignette
        c = srgb(clamp(c, 0.0, 1.0));
        c += (fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 7.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
        gl_FragColor = vec4(c, 1.0);
      }`);
    const black = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); black.needsUpdate = true;
    function setQuality(q) {
      Q.q = q; Q.msaa = q === 'low' ? 0 : 4; Q.ssao = q === 'high'; Q.bloomLevels = q === 'low' ? 4 : 6; U.uAOOn.value = Q.ssao ? 1 : 0;
      alloc();
    }
    // dynamic resolution: average frame time drives the render scale (0.6 .. 1)
    const perf = { acc: 0, n: 0, t: 0 };
    function adapt(dt) {
      if (!dt || dt > 0.25) return;
      perf.acc += dt; perf.n++; perf.t += dt; if (perf.t < 2) return;
      const avg = perf.acc / perf.n; perf.acc = perf.n = perf.t = 0;
      let s = Q.scale; if (avg > 0.024 && s > 0.6) s = Math.max(0.6, s - 0.1); else if (avg < 0.0145 && s < 1) s = Math.min(1, s + 0.1);
      if (s !== Q.scale) { Q.scale = s; alloc(); }
    }
    const api = {
      get scale() { return Q.scale; }, get quality() { return Q.q; }, U,
      setSize(w, h) { W = w; Hh = h; alloc(); },
      setQuality,
      adapt,
      render(scene, camera) {
        if (!main) alloc();
        // night exposure: the eye adapts
        U.uExposure.value = 1.6 * (1.0 + 2.2 * A.Mat.U.uNight.value);
        // haze: clear by day, valley mist around dawn
        const h = sky.hour, dawn = Math.max(0, 1 - Math.abs(h - 6.3) / 2.2);
        U.uFogD.value = 0.00055 + 0.0016 * dawn * dawn; U.uFogH.value = 90 - 55 * dawn;
        U.uProjInv.value.copy(camera.projectionMatrixInverse); U.uProj.value.copy(camera.projectionMatrix); U.uViewInv.value.copy(camera.matrixWorld); U.uCam.value.copy(camera.position);
        renderer.setRenderTarget(main); renderer.render(scene, camera);
        U.tDepth.value = main.depthTexture; U.tScene.value = main.texture;
        if (Q.ssao) {
          pass(ssaoMat, aoA);
          U.tSrc.value = aoA.texture; U.uDir.value.set(1, 0); pass(blurMat, aoB);
          U.tSrc.value = aoB.texture; U.uDir.value.set(0, 1); pass(blurMat, aoA);
          U.tAO.value = aoA.texture;
        } else U.tAO.value = black;
        pass(litMat, lit);
        // bloom chain
        U.tSrc.value = lit.texture; U.uTexel.value.set(1 / lit.width, 1 / lit.height); pass(preMat, mips[0]);
        for (let i = 1; i < mips.length; i++) { U.tSrc.value = mips[i - 1].texture; U.uTexel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height); pass(downMat, mips[i]); }
        for (let i = mips.length - 1; i > 0; i--) { U.tSrc.value = mips[i].texture; U.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height); quad.material = upMat; renderer.setRenderTarget(mips[i - 1]); renderer.autoClear = false; renderer.render(qScene, qCam); renderer.autoClear = true; }
        U.tLit.value = lit.texture; U.tBloom.value = mips[0].texture;
        pass(finalMat, null);
      },
      dispose() { [main, lit, aoA, aoB, ...mips].forEach(t => t && t.dispose()); [ssaoMat, blurMat, litMat, preMat, downMat, upMat, finalMat].forEach(m => m.dispose()); }
    };
    setQuality(quality);
    return api;
  }
  A.createPost = createPost;
})();
