/* Aethelos rivers: flowing water with depth colour (clear in the shallows, deep blue-green in the channel), the river bed
   visible through it, sky and planar reflections (the banks, trees and buildings mirror in the water on High quality),
   both suns' glints, moonlight at night, foam along the banks and around shallow stones, ripples that flow downstream.
   createWater({THREE, renderer, scene, terrain, sky, quality}) -> { material, beforeRender(camera, hide), setQuality(q), dispose() } */
(() => {
  const A = window.Aethelos ||= {};
  function waveNormalTexture(THREE, N = 256) {
    // tileable ripple normals: a sum of waves with integer wave numbers (so it wraps), random phases
    const h = new Float32Array(N * N), waves = [];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 48; i++) { const kx = Math.round((rnd() * 2 - 1) * (2 + i * 0.6)), ky = Math.round((rnd() * 2 - 1) * (2 + i * 0.6)); if (!kx && !ky) continue; waves.push([kx, ky, rnd() * 6.283, 1 / Math.pow(Math.hypot(kx, ky), 1.4)]); }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0; for (const [kx, ky, ph, a] of waves) v += a * Math.sin(6.2831853 * (kx * x + ky * y) / N + ph); h[y * N + x] = v; }
    const d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], gy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
      const nx = -gx * 2.2, ny = -gy * 2.2, l = Math.hypot(nx, ny, 1); d.set([(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255], (y * N + x) * 4);
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    return t;
  }
  function createWater({ THREE, renderer, scene, terrain, sky, quality = 'high' }) {
    const data = terrain.dataTexture(THREE), SU = sky.U, MU = A.Mat.U;
    const refl = { on: quality === 'high', rt: null, cam: new THREE.PerspectiveCamera(), plane: new THREE.Plane(), matrix: new THREE.Matrix4(), level: -999 };
    const U = {
      uLut: { value: sky.lut }, uSun: SU.uSun, uSun2: SU.uSun2, uSunI: SU.uSunI, uSun2I: SU.uSun2I, uLightCol: SU.uLightCol, uAmb: SU.uAmb, uMoonDir: SU.uBrightMoon,
      uTime: MU.uTime, uNight: MU.uNight, uDay: MU.uDay, uData: { value: data }, uN: { value: data.userData.n }, uCell: { value: data.userData.cell }, uHalf: { value: data.userData.half },
      uWaves: { value: waveNormalTexture(THREE) }, uRefl: { value: null }, uReflOn: { value: 0 }, uReflMat: { value: refl.matrix }, uReflY: { value: -999 }
    };
    const material = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide, premultipliedAlpha: true, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
      vertexShader: /* glsl */`attribute vec2 flowUv; attribute vec3 flowDir; varying vec2 vFlow; varying vec3 vFD; varying vec3 vWP;
        void main(){ vFlow = flowUv; vFD = flowDir; vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: A.SkyGLSL.ATMOS + A.Mat.NOISE + /* glsl */`
        uniform sampler2D uLut; uniform vec3 uSun; uniform vec3 uSun2; uniform vec3 uSunI; uniform vec3 uSun2I; uniform vec3 uLightCol; uniform vec3 uAmb; uniform vec3 uMoonDir;
        uniform float uTime; uniform float uNight; uniform float uDay; uniform sampler2D uData; uniform float uN; uniform float uCell; uniform float uHalf;
        uniform sampler2D uWaves; uniform sampler2D uRefl; uniform float uReflOn; uniform mat4 uReflMat; uniform float uReflY;
        varying vec2 vFlow; varying vec3 vFD; varying vec3 vWP;
        float groundAt(vec2 xz){ vec2 f = (xz + uHalf) / uCell; ivec2 i = ivec2(floor(f)); vec2 t = fract(f); int n = int(uN) - 1;
          float a = texelFetch(uData, clamp(i, ivec2(0), ivec2(n)), 0).x, b = texelFetch(uData, clamp(i + ivec2(1, 0), ivec2(0), ivec2(n)), 0).x;
          float c = texelFetch(uData, clamp(i + ivec2(0, 1), ivec2(0), ivec2(n)), 0).x, d = texelFetch(uData, clamp(i + ivec2(1, 1), ivec2(0), ivec2(n)), 0).x;
          return t.x + t.y <= 1.0 ? a + (b - a) * t.x + (c - a) * t.y : d + (c - d) * (1.0 - t.x) + (b - d) * (1.0 - t.y); }
        vec3 skyR(vec3 d){ d.y = max(d.y, 0.015); return texture2D(uLut, dirToLut(normalize(d))).rgb; }
        void main(){
          float depth = vWP.y - groundAt(vWP.xz);
          if (depth < -0.05) discard;
          vec3 V = normalize(cameraPosition - vWP); float dist = length(cameraPosition - vWP);
          // river frame: T downstream, B across
          vec2 T2 = normalize(vFD.xy); vec3 T = vec3(T2.x, 0.0, T2.y), B = vec3(-T2.y, 0.0, T2.x);
          float W = vFD.z, speed = 0.7 + 9.0 / W;
          vec2 rc = vec2(vFlow.y, (vFlow.x - 0.5) * W);           // metres along / across
          float midK = 1.0 - pow(abs(vFlow.x - 0.5) * 2.0, 2.0); // faster in the middle
          vec2 adv = vec2(uTime * speed * (0.55 + 0.45 * midK), 0.0);
          vec3 n1 = texture2D(uWaves, (rc - adv) / 5.5).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uWaves, (mat2(0.8, 0.6, -0.6, 0.8) * rc - adv * 1.35) / 2.1 + 0.37).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(uWaves, (rc - adv * 0.5) / 17.0 + 0.71).xyz * 2.0 - 1.0;
          vec2 tn = (n1.xy * 0.55 + n2.xy * 0.35 + n3.xy * 0.5) * mix(1.0, 0.35, smoothstep(30.0, 160.0, dist));
          vec3 N = normalize(vec3(0.0, 1.0, 0.0) + T * tn.x * 0.55 + B * tn.y * 0.55);
          // Fresnel + reflections
          float NV = max(dot(N, V), 0.0), F = 0.02 + 0.98 * pow(1.0 - NV, 5.0);
          vec3 R = reflect(-V, N), refl = skyR(R);
          if (uReflOn > 0.5) {
            vec4 pr = uReflMat * vec4(vWP.x, uReflY, vWP.z, 1.0); vec2 ruv = pr.xy / pr.w + tn * 0.035;
            float ok = (1.0 - smoothstep(0.25, 1.2, abs(vWP.y - uReflY))) * step(0.0, pr.w);
            vec4 rs = texture2D(uRefl, clamp(ruv, 0.001, 0.999)); refl = mix(refl, rs.rgb, ok * rs.a);
          }
          // glints from both suns and the moon
          vec3 spec = vec3(0.0);
          vec3 H1 = normalize(uSun + V), H2 = normalize(uSun2 + V), H3 = normalize(uMoonDir + V);
          spec += uSunI * 260.0 * pow(max(dot(N, H1), 0.0), 900.0) * step(0.0, uSun.y) + uSunI * 2.2 * pow(max(dot(N, H1), 0.0), 60.0) * step(0.0, uSun.y);
          spec += uSun2I * 220.0 * pow(max(dot(N, H2), 0.0), 900.0) * step(0.0, uSun2.y);
          spec += uLightCol * uNight * 20.0 * pow(max(dot(N, H3), 0.0), 500.0) * step(0.0, uMoonDir.y);
          // body: absorption through the water column, scattering in green-blue
          float d = max(depth, 0.0) / max(0.25, abs(V.y) + 0.15);
          vec3 Tr = exp(-d * vec3(0.55, 0.16, 0.12) * 1.6);
          float trans = dot(Tr, vec3(0.2126, 0.7152, 0.0722));
          vec3 lightIn = uAmb * 1.4 + uLightCol * 0.12 * max(uSun.y, 0.0);
          vec3 body = vec3(0.016, 0.06, 0.058) * lightIn * 2.2;
          // foam: shore line, around shallow stones, drifting streaks downstream
          float shore = 1.0 - smoothstep(0.0, 0.32, depth);
          float fn = fbm2(vec2(rc.x * 0.45, rc.y * 1.3) - adv * vec2(0.45, 0.0)) * 0.7 + vn2(rc * 2.5 - adv * 0.9) * 0.3;
          float streak = smoothstep(0.62, 0.8, vn2(vec2(rc.x * 0.12 - adv.x * 0.12, rc.y * 1.6))) * 0.35 * midK * smoothstep(0.6, 1.4, depth);
          float foam = clamp(shore * smoothstep(0.35, 0.65, fn + shore * 0.35) + streak * smoothstep(0.55, 0.75, fn), 0.0, 1.0);
          vec3 foamC = (uAmb * 1.5 + uLightCol * 0.35 * max(uSun.y, 0.05)) * 0.9;
          vec3 col = body * (1.0 - trans) * (1.0 - F) + refl * F + spec;
          float alpha = 1.0 - trans * (1.0 - F);
          col = mix(col, foamC, foam); alpha = mix(alpha, 1.0, foam * 0.92);
          float edge = smoothstep(-0.05, 0.08, depth); col *= edge; alpha *= edge;   // feather into the bank
          gl_FragColor = vec4(col, alpha);
        }`
    });
    // ---------------------------------------------- planar reflection (High): mirror the camera about the nearest river surface
    function ensureRT(w, h) {
      if (refl.rt && refl.rt.width === w && refl.rt.height === h) return;
      refl.rt && refl.rt.dispose(); refl.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 }); U.uRefl.value = refl.rt.texture;
    }
    const tmpV = new THREE.Vector3(), lookAt = new THREE.Vector3(), normal = new THREE.Vector3(0, 1, 0), clip = new THREE.Vector4(), q = new THREE.Vector4();
    const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    function beforeRender(camera, hide, size) {
      U.uReflOn.value = 0; if (!refl.on) return;
      // nearest water within 110 m in front of / around the camera
      const p = camera.position; let best = null;
      for (let r = 0; r <= 110 && !best; r += 22) for (let a = 0; a < 8 && !best; a++) {
        const x = p.x + Math.cos(a * 0.785) * r, z = p.z + Math.sin(a * 0.785) * r, w = terrain.waterAt(x, z); if (w) best = w;
        if (r === 0) break;
      }
      if (!best) return;
      const y = best.level; if (p.y < y + 0.2) return;
      camera.getWorldDirection(tmpV); if (tmpV.y > 0.35) return;                  // looking up at the sky: no water in view
      ensureRT(Math.max(2, Math.round(size.x * 0.5)), Math.max(2, Math.round(size.y * 0.5)));
      const rc = refl.cam; rc.copy(camera); rc.position.set(p.x, 2 * y - p.y, p.z);
      camera.getWorldDirection(tmpV); lookAt.copy(p).add(tmpV); lookAt.y = 2 * y - lookAt.y; rc.up.set(0, -1, 0).applyQuaternion(camera.quaternion).reflect(normal).negate(); rc.lookAt(lookAt);
      rc.updateMatrixWorld(); rc.projectionMatrix.copy(camera.projectionMatrix);
      // oblique near plane at the water surface (clips everything below it)
      refl.plane.setFromNormalAndCoplanarPoint(normal, tmpV.set(0, y, 0)); refl.plane.applyMatrix4(rc.matrixWorldInverse);
      clip.set(refl.plane.normal.x, refl.plane.normal.y, refl.plane.normal.z, refl.plane.constant);
      const e = rc.projectionMatrix.elements;
      q.x = (Math.sign(clip.x) + e[8]) / e[0]; q.y = (Math.sign(clip.y) + e[9]) / e[5]; q.z = -1; q.w = (1 + e[10]) / e[14];
      clip.multiplyScalar(2 / clip.dot(q)); e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
      rc.projectionMatrixInverse.copy(rc.projectionMatrix).invert();
      refl.matrix.copy(bias).multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
      const vis = hide.map(o => o.visible); hide.forEach(o => { o.visible = false; });
      const small = (scene.getObjectByName('WorldObjects')?.children || []).filter(m => m.visible && m.userData && m.userData.cull < 300); small.forEach(m => { m.visible = false; });   // the mirror skips small props
      const su = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
      const prev = renderer.getRenderTarget(); renderer.setRenderTarget(refl.rt); renderer.clear(); renderer.render(scene, rc); renderer.setRenderTarget(prev);
      renderer.shadowMap.autoUpdate = su; hide.forEach((o, i) => { o.visible = vis[i]; }); small.forEach(m => { m.visible = true; });
      U.uReflOn.value = 1; U.uReflY.value = y;
    }
    return { material, U, beforeRender, setQuality(q) { refl.on = q === 'high'; }, dispose() { material.dispose(); U.uWaves.value.dispose(); refl.rt && refl.rt.dispose(); } };
  }
  A.createWater = createWater;
})();
