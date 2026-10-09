/* Aethelos sky and day/night.
   - 24-hour clock: 1 real minute = 1 game hour (hold T to fast-forward). The day starts at 08:30.
   - Two suns and three moons rise in the west and set in the east (west = -x, east = +x).
   - Sky colour: physically based single scattering (Rayleigh + Mie) for both suns and the brightest moon, rendered into
     a small sky-view texture that the dome, the water reflections and the distance haze all read.
   - Dome: sun discs with limb darkening, moons with phases and maria, stars and a faint galaxy band, a drifting cloud layer.
   - Lights: the main sun (or the brightest moon at night) casts shadows; the second sun adds warm fill; image-based
     ambient light from the sky (PMREM environment, refreshed as the sun moves).
   API: createSky({THREE, renderer, scene, quality}) -> { update(dt, camera, focus), hour, setHour(h), lut, U, sun, ... } */
(() => {
  const A = window.Aethelos ||= {};
  const ATMOS = /* glsl */`
    const float PR = 6371e3, AR = 6471e3; const vec3 BR = vec3(5.802e-6, 13.558e-6, 33.1e-6); const float BM = 6e-6, HR = 8e3, HM = 1.2e3, G = 0.78;
    vec2 rsi(vec3 r0, vec3 rd, float sr){ float b = dot(rd, r0), c = dot(r0, r0) - sr * sr, d = b * b - c; if (d < 0.0) return vec2(1e5, -1e5); d = sqrt(d); return vec2(-b - d, -b + d); }
    // single scattering of light from direction s (unit) seen along r; returns radiance per unit light intensity
    vec3 scatter(vec3 r, vec3 r0, vec3 s){
      vec2 p = rsi(r0, r, AR); if (p.x > p.y) return vec3(0.0);
      vec2 pg = rsi(r0, r, PR); if (pg.x > 0.0) p.y = min(p.y, pg.x); p.x = max(p.x, 0.0);
      const int NI = 14, NJ = 6; float ds = (p.y - p.x) / float(NI), t = p.x;
      vec3 tR = vec3(0.0), tM = vec3(0.0); float oR = 0.0, oM = 0.0;
      float mu = dot(r, s), mumu = mu * mu, gg = G * G;
      float pRlh = 3.0 / (16.0 * 3.14159265) * (1.0 + mumu);
      float pMie = 3.0 / (8.0 * 3.14159265) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * G, 1.5) * (2.0 + gg));
      for (int i = 0; i < NI; i++){
        vec3 q = r0 + r * (t + ds * 0.5); float h = length(q) - PR;
        float dR = exp(-h / HR) * ds, dM = exp(-h / HM) * ds; oR += dR; oM += dM;
        float dj = rsi(q, s, AR).y / float(NJ), tj = 0.0, lR = 0.0, lM = 0.0; bool lit = true;
        for (int j = 0; j < NJ; j++){ vec3 qj = q + s * (tj + dj * 0.5); float hj = length(qj) - PR; if (hj < 0.0) { lit = false; break; } lR += exp(-hj / HR) * dj; lM += exp(-hj / HM) * dj; tj += dj; }
        if (lit) { vec3 att = exp(-(BM * 1.1 * (0.55 * oM + lM) + BR * (0.55 * oR + lR))); tR += dR * att; tM += dM * att; }   // 0.55: cheap stand-in for multiple scattering
        t += ds;
      }
      return pRlh * BR * tR + pMie * BM * tM;
    }
    vec2 dirToLut(vec3 d){ float el = asin(clamp(d.y, -1.0, 1.0)); float e = sign(el) * sqrt(abs(el) / 1.5707963); return vec2(atan(d.x, d.z) / 6.2831853 + 0.5, e * 0.5 + 0.5); }
    vec3 lutToDir(vec2 uv){ float e = uv.y * 2.0 - 1.0; float el = sign(e) * e * e * 1.5707963; float az = (uv.x - 0.5) * 6.2831853; return vec3(cos(el) * sin(az), sin(el), cos(el) * cos(az)); }
  `;
  const H = 1 / 12 * Math.PI;
  function createSky({ THREE, renderer, scene, quality = 'high' }) {
    const M = A.Mat, U = M.U, V = THREE.Vector3;
    const S = { hour: 8.5, day: 0, ff: 1, lastLut: -1, lastEnv: -1, envRT: null, envTimer: 0 };
    const uni = {
      uSun: { value: new V(0, 1, 0) }, uSun2: { value: new V(0, 1, 0) }, uSunI: { value: new V() }, uSun2I: { value: new V() },
      uMoon: { value: [new V(), new V(), new V()] }, uMoonI: { value: 0 }, uBrightMoon: { value: new V(0, 1, 0) }, uMoonGlow: { value: new V() },
      uLut: { value: null }, uNightK: U.uNight, uTime: U.uTime, uCloudOff: U.uCloudOff, uCloudCover: U.uCloudCover, uEnv: { value: 0 }, uCamY: { value: 10 },
      uSunCol: { value: new V(1, 1, 1) }, uLightCol: { value: new V(1, 1, 1) }, uAmb: { value: new V(0.3, 0.4, 0.5) }
    };
    // ------------------------------------------------ sky-view LUT
    const LW = quality === 'low' ? 128 : 256, LH = quality === 'low' ? 64 : 128;
    const lutRT = new THREE.WebGLRenderTarget(LW, LH, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    lutRT.texture.wrapS = THREE.RepeatWrapping; lutRT.texture.generateMipmaps = false; uni.uLut.value = lutRT.texture;
    const lutMat = new THREE.ShaderMaterial({ uniforms: uni, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: ATMOS + /* glsl */`uniform vec3 uSun; uniform vec3 uSun2; uniform vec3 uSunI; uniform vec3 uSun2I; uniform vec3 uBrightMoon; uniform vec3 uMoonGlow; uniform float uCamY; varying vec2 vUv;
        void main(){ vec3 d = lutToDir(vUv); vec3 r0 = vec3(0.0, PR + max(2.0, uCamY), 0.0);
          vec3 c = scatter(d, r0, uSun) * 9.0;
          c += scatter(d, r0, uSun2) * 9.0 * 0.3 * vec3(1.0, 0.82, 0.62);
          c += scatter(d, r0, uBrightMoon) * uMoonGlow;
          c += vec3(0.0006, 0.0011, 0.0024) * (1.0 - 0.5 * abs(d.y));                // airglow + starlight: night never goes fully black
          gl_FragColor = vec4(c, 1.0); }` });
    const lutScene = new THREE.Scene(), lutCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lutMat); quad.frustumCulled = false; lutScene.add(quad);
    function renderLut() { const prev = renderer.getRenderTarget(); renderer.setRenderTarget(lutRT); renderer.render(lutScene, lutCam); renderer.setRenderTarget(prev); }

    // ------------------------------------------------ dome
    const DOME = /* glsl */`
      uniform sampler2D uLut; uniform vec3 uSun; uniform vec3 uSun2; uniform vec3 uSunCol; uniform vec3 uSunI; uniform vec3 uSun2I; uniform vec3 uMoon[3]; uniform float uMoonI;
      uniform float uNightK; uniform float uTime; uniform vec2 uCloudOff; uniform float uCloudCover; uniform float uEnv; uniform vec3 uLightCol; uniform vec3 uAmb;
      varying vec3 vDir;
      ${M.NOISE}
      float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      vec3 sky(vec3 d){ return texture2D(uLut, dirToLut(d)).rgb; }
      float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void moon(vec3 d, vec3 md, float rad, vec3 tint, float seed, inout vec3 col, inout float occ){
        float ca = dot(d, md); if (ca < cos(rad * 1.05)) return;
        vec3 up = abs(md.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0); vec3 X = normalize(cross(up, md)), Y = cross(md, X);
        vec2 q = vec2(dot(d, X), dot(d, Y)) / sin(rad); float r2 = dot(q, q);
        float edge = 1.0 - smoothstep(0.92, 1.0, sqrt(r2)); if (edge <= 0.0) return;
        vec3 n = normalize(X * q.x + Y * q.y - md * sqrt(max(0.0, 1.0 - r2)));     // surface normal facing us
        float maria = vn3(n * 3.0 + seed) * 0.6 + vn3(n * 9.0 + seed) * 0.3 + vn3(n * 27.0) * 0.1;
        float alb = mix(0.55, 1.0, smoothstep(0.35, 0.7, maria));
        float lit = smoothstep(-0.05, 0.12, dot(n, uSun)) + 0.25 * smoothstep(-0.05, 0.12, dot(n, uSun2)) + 0.02;   // phase from the suns, faint earthshine
        vec3 mc = tint * alb * lit * uMoonI * 1.4;
        float ext = smoothstep(-0.02, 0.12, md.y);
        col = mix(col, col * 0.35 + mc * ext, edge); occ = max(occ, edge);
      }
      void main(){
        vec3 d = normalize(vDir), dd = d; dd.y = max(dd.y, 0.0); dd = normalize(dd + vec3(0.0, 0.0001, 0.0));
        vec3 col = sky(d.y > 0.0 ? d : dd);
        if (d.y < 0.0) col = mix(col, uAmb * vec3(0.32, 0.36, 0.26) + uLightCol * 0.035, smoothstep(0.0, -0.12, d.y));     // ground below the horizon
        float occ = 0.0;
        // three moons
        moon(d, uMoon[0], 0.034, vec3(0.92, 0.93, 0.95), 1.0, col, occ);
        moon(d, uMoon[1], 0.021, vec3(0.75, 0.85, 1.0), 7.0, col, occ);
        moon(d, uMoon[2], 0.014, vec3(1.0, 0.78, 0.62), 13.0, col, occ);
        if (uEnv < 0.5) {
          // stars (fixed to the sky, slowly turning with the night) and a faint galaxy band
          float rot = uTime * 0.0015; vec3 sd = vec3(d.x * cos(rot) - d.z * sin(rot), d.y, d.x * sin(rot) + d.z * cos(rot));
          vec3 c = sd * 220.0, ci = floor(c); float hs = h13(ci);
          vec3 sp = ci + 0.5 + (vec3(h13(ci + 3.1), h13(ci + 7.7), h13(ci + 1.3)) - 0.5) * 0.7;
          float star = smoothstep(0.42, 0.0, length(c - sp)) * step(0.985, hs) * (0.4 + 2.5 * pow(h13(ci + 9.0), 6.0));
          star *= 0.75 + 0.25 * sin(uTime * (3.0 + 6.0 * h13(ci + 2.0)) + hs * 60.0);
          float band = exp(-pow(dot(sd, normalize(vec3(0.4, 0.3, 0.86))) * 4.0, 2.0)) * (0.4 + 0.6 * vn3(sd * 6.0)) * vn3(sd * 18.0 + 4.0);
          vec3 sc = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), h13(ci + 5.0)) * star * 0.09 + vec3(0.55, 0.6, 0.8) * band * 0.012;
          col += sc * uNightK * (1.0 - occ) * smoothstep(0.0, 0.2, d.y);
          // sun discs with limb darkening
          float r1 = 0.0085, r2 = 0.0055;
          float a1 = acos(clamp(dot(d, uSun), -1.0, 1.0)) / r1, a2 = acos(clamp(dot(d, uSun2), -1.0, 1.0)) / r2;
          if (a1 < 1.0) col += uSunI * 900.0 * (0.45 + 0.55 * sqrt(1.0 - a1 * a1)) * smoothstep(1.0, 0.9, a1) * (1.0 - occ);
          if (a2 < 1.0) col += uSun2I * 900.0 * (0.45 + 0.55 * sqrt(1.0 - a2 * a2)) * smoothstep(1.0, 0.9, a2) * (1.0 - occ);
          // a soft glow halo around each sun (forward scattering not resolved by the LUT)
          col += uSunI * 1.6 * pow(max(0.0, dot(d, uSun)), 900.0) + uSun2I * 1.2 * pow(max(0.0, dot(d, uSun2)), 1400.0);
        }
        // clouds: a layer 1.6 km up, lit by the main light, silver linings toward the suns
        if (d.y > 0.0) {
          float t = 1600.0 / max(d.y, 0.02); vec2 cp = d.xz * t;
          float fade = 1.0 - smoothstep(9000.0, 42000.0, t);
          vec2 w = (cp + uCloudOff) * 0.0016;
          float base = fbm2(w), det = fbm2(w * 4.3 + uTime * 0.01) * 0.35 + vn2(w * 13.0) * 0.12;
          float dens = smoothstep(1.0 - uCloudCover, 1.32 - uCloudCover, base + (det - 0.24) * 0.6);
          if (dens > 0.001) {
            vec2 ls = normalize(uSun.xz + 1e-4) * 0.04;
            float shadow = smoothstep(1.0 - uCloudCover, 1.3 - uCloudCover, fbm2(w + ls) + (det - 0.24) * 0.4);
            float mu = dot(d, uSun), silver = pow(max(0.0, mu), 8.0) * 2.0 + pow(max(0.0, mu), 60.0) * 6.0;
            vec3 lightC = uLightCol * (0.55 * (1.0 - 0.75 * shadow) + silver * (1.0 - dens) * 0.6);
            vec3 ambC = sky(normalize(vec3(d.x, 0.6, d.z))) * 1.7 + uAmb * 0.15;
            vec3 cc = (lightC * 0.32 + ambC) * mix(1.0, 0.55, dens * shadow);
            float a = dens * fade * smoothstep(0.0, 0.08, d.y) * (1.0 - occ * 0.6);
            col = mix(col, cc, a * 0.92);
          }
        }
        gl_FragColor = vec4(col, 1.0);
      }`;
    const domeMat = new THREE.ShaderMaterial({ uniforms: uni, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: ATMOS + DOME });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24), domeMat); dome.name = 'SkyDome'; dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome);
    // environment (image based lighting): the dome without sun discs / stars, captured into a PMREM cube
    const envMat = new THREE.ShaderMaterial({ uniforms: { ...uni, uEnv: { value: 1 } }, side: THREE.BackSide, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: ATMOS + DOME });
    const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), envMat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    function renderEnv() {
      const opts = { size: quality === 'low' ? 64 : 128 }; if (S.envRT) opts.renderTarget = S.envRT;
      let rt; try { rt = pmrem.fromScene(envScene, 0, 1, 1000, opts); } catch (_) { rt = pmrem.fromScene(envScene, 0, 1, 1000); }
      if (S.envRT && rt !== S.envRT) S.envRT.dispose();
      S.envRT = rt; scene.environment = rt.texture;
    }

    // ------------------------------------------------ lights
    const sun = new THREE.DirectionalLight(0xffffff, 3); sun.name = 'Sun'; sun.castShadow = true;
    const SM = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024, SS = quality === 'high' ? 62 : 70;
    sun.shadow.mapSize.set(SM, SM); Object.assign(sun.shadow.camera, { near: 1, far: 700, left: -SS, right: SS, top: SS, bottom: -SS });
    sun.shadow.bias = -0.00025; sun.shadow.normalBias = quality === 'high' ? 0.035 : 0.06; sun.shadow.radius = 2.5; sun.shadow.blurSamples = 12;
    const sun2 = new THREE.DirectionalLight(0xffd2a0, 0.5); sun2.name = 'Sun2';
    const night = new THREE.HemisphereLight(0x5070a8, 0x141c24, 0); night.name = 'NightAmbient';
    scene.add(sun, sun.target, sun2, sun2.target, night);

    // ------------------------------------------------ celestial mechanics
    function arc(hour, rise, tilt, out) { const th = (hour - rise) * H; return out.set(-Math.cos(th), Math.sin(th) * Math.cos(tilt), -Math.sin(th) * Math.sin(tilt)).normalize(); }
    const TAU_R = [0.0596, 0.1337, 0.2786], TAU_M = 0.055;
    function transmit(dir, out) {          // atmosphere transmittance toward a body (Kasten-Young air mass)
      const e = Math.asin(Math.max(-1, Math.min(1, dir.y))), deg = Math.max(-1.5, e * 180 / Math.PI);
      const m = 1 / (Math.max(0.0, Math.sin(Math.max(e, -0.02))) + 0.50572 * Math.pow(deg + 6.07995, -1.6364));
      return out.set(Math.exp(-(TAU_R[0] + TAU_M) * m), Math.exp(-(TAU_R[1] + TAU_M) * m), Math.exp(-(TAU_R[2] + TAU_M) * m));
    }
    const MOONS = [{ rise: 18.0, tilt: 0.38, drift: 0.83, size: 1.0 }, { rise: 20.4, tilt: 0.78, drift: -1.31, size: 0.55 }, { rise: 16.7, tilt: 0.12, drift: 2.07, size: 0.35 }];
    const tmp = new V(), tmp2 = new V(), smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const state = { sunDir: new V(), sun2Dir: new V(), mainDir: new V(), mainI: 0, night: 0 };
    function celestial() {
      const h = S.hour, s1 = arc(h, 6.0, 0.45, uni.uSun.value), s2 = arc(h, 6.75, 0.72, uni.uSun2.value);
      const t1 = transmit(s1, new V()), t2 = transmit(s2, new V());
      const up1 = smooth(-0.035, 0.03, s1.y), up2 = smooth(-0.035, 0.03, s2.y);
      uni.uSunI.value.copy(t1).multiplyScalar(up1); uni.uSun2I.value.copy(t2).multiplyScalar(up2 * 0.3).multiply(tmp.set(1, 0.82, 0.62));
      // moons (each drifts a different amount every day, so the nights change)
      let best = -1, bi = 0;
      MOONS.forEach((m, i) => { const d = arc(h, m.rise + ((S.day * m.drift) % 6), m.tilt, uni.uMoon.value[i]); const v = d.y * m.size; if (v > best) { best = v; bi = i; } });
      const bm = uni.uMoon.value[bi]; uni.uBrightMoon.value.copy(bm.y > -0.1 ? bm : tmp.set(0, -1, 0));
      const moonUp = smooth(-0.03, 0.08, bm.y) * MOONS[bi].size;
      const phase = 0.5 + 0.5 * -bm.dot(s1);                                         // full when opposite the sun
      const nightK = smooth(0.06, -0.14, s1.y); state.night = nightK;
      uni.uMoonI.value = 0.06 + 0.25 * nightK; uni.uMoonGlow.value.set(0.85, 0.92, 1).multiplyScalar(9 * 0.012 * moonUp * (0.3 + 0.7 * phase));
      U.uNight.value = nightK; U.uDay.value = smooth(-0.02, 0.2, s1.y);
      // main light: sun 1, or the brightest moon at night
      const sunI = 3.2 * up1, moonI = 0.32 * moonUp * (0.35 + 0.65 * phase) * nightK;
      if (sunI >= moonI) { state.mainDir.copy(s1); sun.color.setRGB(t1.x, t1.y, t1.z).multiplyScalar(1 / Math.max(t1.x, 0.001)); sun.intensity = sunI * Math.max(t1.x, 0.001); uni.uLightCol.value.copy(t1).multiplyScalar(up1 * 3.2); }
      else { state.mainDir.copy(bm); sun.color.setRGB(0.62, 0.72, 1.0); sun.intensity = moonI; uni.uLightCol.value.set(0.62, 0.72, 1.0).multiplyScalar(moonI * 2.2); }
      state.mainI = sun.intensity;
      sun2.color.setRGB(t2.x, t2.y * 0.82, t2.z * 0.62).multiplyScalar(1 / Math.max(t2.x, 0.001)); sun2.intensity = 1.0 * up2 * Math.max(t2.x, 0.001); state.sun2Dir.copy(s2);
      night.intensity = 0.55 * nightK; state.sunDir.copy(s1);
      uni.uSunCol.value.copy(t1);
      // ambient estimate (zenith sky) for the dome's ground and water
      const day = U.uDay.value; uni.uAmb.value.set(0.25, 0.35, 0.55).multiplyScalar(0.15 + 0.85 * day).add(tmp.set(0.01, 0.015, 0.03).multiplyScalar(nightK));
      // weather: cloud cover drifts over the days
      U.uCloudCover.value = 0.3 + 0.14 * Math.sin(S.day * 1.9 + h * 0.13 + 2.0) + 0.05 * Math.sin(h * 0.71);
    }
    const lightPos = new V();
    function placeLights(focus) {
      // shadow camera follows the hero, snapped to shadow texels so edges do not crawl
      const d = state.mainDir.y > 0.02 ? state.mainDir : tmp2.set(state.mainDir.x, 0.02, state.mainDir.z).normalize();
      const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
      const q = new THREE.Quaternion().setFromUnitVectors(new V(0, 0, 1), d), qi = q.clone().invert();
      lightPos.copy(focus).applyQuaternion(qi); lightPos.x = Math.round(lightPos.x / texel) * texel; lightPos.y = Math.round(lightPos.y / texel) * texel; lightPos.applyQuaternion(q);
      sun.target.position.copy(lightPos); sun.position.copy(lightPos).addScaledVector(d, 320); sun.target.updateMatrixWorld();
      sun2.target.position.copy(focus); sun2.position.copy(focus).addScaledVector(state.sun2Dir, 300); sun2.target.updateMatrixWorld();
    }
    const api = {
      U: uni, lut: lutRT.texture, sun, sun2, state, dome,
      get hour() { return S.hour; }, get day() { return S.day; },
      setHour(h) { S.hour = ((h % 24) + 24) % 24; celestial(); renderLut(); renderEnv(); S.lastLut = S.lastEnv = S.hour; },
      fastForward(on) { S.ff = on ? 60 : 1; },
      clockText() { const h = Math.floor(S.hour), m = Math.floor((S.hour - h) * 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); },
      update(dt, camera, focus) {
        S.hour += dt / 60 * S.ff; if (S.hour >= 24) { S.hour -= 24; S.day++; }
        celestial();
        U.uCloudOff.value.x += U.uWind.value.x * dt * 14 * Math.max(1, S.ff * 0.2); U.uCloudOff.value.y += U.uWind.value.z * dt * 14 * Math.max(1, S.ff * 0.2);
        uni.uCamY.value = camera.position.y;
        const dh = Math.abs(S.hour - S.lastLut); if (S.lastLut < 0 || Math.min(dh, 24 - dh) > 0.004 * Math.max(1, S.ff / 6)) { renderLut(); S.lastLut = S.hour; }
        S.envTimer -= dt; const de = Math.abs(S.hour - S.lastEnv);
        if (S.lastEnv < 0 || (S.envTimer <= 0 && Math.min(de, 24 - de) > 0.06)) { renderEnv(); S.lastEnv = S.hour; S.envTimer = 0.5; }
        scene.environmentIntensity = 1.0;
        dome.position.copy(camera.position);
        placeLights(focus);
      },
      dispose() { lutRT.dispose(); S.envRT && S.envRT.dispose(); pmrem.dispose(); domeMat.dispose(); envMat.dispose(); scene.remove(dome, sun, sun.target, sun2, sun2.target, night); }
    };
    celestial(); renderLut(); renderEnv(); S.lastLut = S.lastEnv = S.hour;
    return api;
  }
  A.createSky = createSky; A.SkyGLSL = { ATMOS };
})();
