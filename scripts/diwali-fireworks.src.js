/* Fireworks over Sabarmati: photoreal fireworks over a real night photograph of
   the Atal Bridge (Sahil Parmar, Unsplash licence).

   Source for /diwali-fireworks.js. Build (from a folder with three, postprocessing
   and esbuild installed):
     npx esbuild path/to/scripts/diwali-fireworks.src.js --bundle --minify \
       --format=esm --target=es2020 --outfile=path/to/diwali-fireworks.js

   How it looks real:
   - sparks render into a fading HDR buffer, so every star leaves a long-exposure streak
   - bursts flash, light the clouds and the bridge, and leave drifting smoke
   - fireworks appear only where the photo shows sky (masks from the photo itself),
     so they sit behind the bridge and the far bank; the river reflects them
   - bloom, neutral tone mapping, film grain and vignette finish the frame like a camera */
import {
  WebGLRenderer, Scene, OrthographicCamera, Mesh, PlaneGeometry, ShaderMaterial, GLSL3,
  WebGLRenderTarget, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, TextureLoader,
  SRGBColorSpace, BufferGeometry, BufferAttribute, Points, AdditiveBlending, NoBlending,
  Vector2, Vector4, Vector3, NoToneMapping
} from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  NoiseEffect, VignetteEffect, BlendFunction
} from 'postprocessing';

const stageEl = document.querySelector('.dwp-stage[data-xp="fireworks"]');
if (stageEl) init(stageEl);

function init(el) {
  const canvas = el.querySelector('canvas');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IMG = { w: 4624, h: 3472, water: 0.8158 };   // waterline as a fraction of photo height
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 needed');
  } catch (e) {
    el.classList.add('no-gl');
    return;
  }
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.autoClear = false;

  const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new PlaneGeometry(2, 2);
  const small = () => el.clientWidth < 700;
  const loader = new TextureLoader();
  const photo = loader.load(small() ? '/images/diwali/riverfront-small.webp' : '/images/diwali/riverfront.webp');
  photo.colorSpace = SRGBColorSpace;
  const masks = loader.load('/images/diwali/riverfront-masks.png');

  // ── render targets ──────────────────────────────────────────────────
  let W = 1, H = 1, PR = 1, trailA, trailB, fxRT;
  const rtOpts = { type: HalfFloatType, depthBuffer: false, magFilter: LinearFilter, minFilter: LinearFilter };
  function makeTargets(w, h) {
    [trailA, trailB, fxRT].forEach(t => t && t.dispose());
    trailA = new WebGLRenderTarget(w, h, rtOpts);
    trailB = new WebGLRenderTarget(w, h, rtOpts);
    fxRT = new WebGLRenderTarget(w, h, { ...rtOpts, generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
    [trailA, trailB].forEach(t => { renderer.setRenderTarget(t); renderer.clear(); });
    renderer.setRenderTarget(null);
  }

  const vert = /* glsl */`out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  // fade: the previous trail frame, a little dimmer
  const fadeMat = new ShaderMaterial({
    glslVersion: GLSL3, blending: NoBlending, depthTest: false, depthWrite: false,
    uniforms: { tPrev: { value: null }, uDecay: { value: 0.86 } },
    vertexShader: vert,
    fragmentShader: /* glsl */`
      out vec4 fragColor; in vec2 vUv; uniform sampler2D tPrev; uniform float uDecay;
      void main(){ fragColor = vec4(texture(tPrev, vUv).rgb * uDecay, 1.0); }`
  });
  const fadeScene = new Scene(); fadeScene.add(new Mesh(quad, fadeMat));

  // sparks and smoke share one point shader
  function pointsMat(soft) {
    return new ShaderMaterial({
      glslVersion: GLSL3, blending: AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
      uniforms: { uRes: { value: new Vector2(1, 1) }, uPR: { value: 1 } },
      vertexShader: /* glsl */`
        in vec3 color; in float size; out vec3 vCol;
        uniform vec2 uRes; uniform float uPR;
        void main(){
          vCol = color;
          vec2 ndc = vec2(position.x / uRes.x * 2.0 - 1.0, 1.0 - position.y / uRes.y * 2.0);
          gl_Position = vec4(ndc, 0.0, 1.0);
          gl_PointSize = size * uPR;
        }`,
      fragmentShader: soft ? /* glsl */`
        out vec4 fragColor; in vec3 vCol;
        void main(){
          vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p);
          if (r2 > 1.0) discard;
          float a = exp(-r2 * 2.6) * (1.0 - r2);
          fragColor = vec4(vCol * a, 1.0);
        }` : /* glsl */`
        out vec4 fragColor; in vec3 vCol;
        void main(){
          vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p);
          if (r2 > 1.0) discard;
          float core = exp(-r2 * 9.0), halo = exp(-r2 * 2.2) * 0.25;
          fragColor = vec4(vCol * (core + halo), 1.0);
        }`
    });
  }
  function pointCloud(max, soft) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute('size', new BufferAttribute(new Float32Array(max), 1));
    g.setDrawRange(0, 0);
    const m = pointsMat(soft);
    const p = new Points(g, m); p.frustumCulled = false;
    const s = new Scene(); s.add(p);
    return { g, m, s, max };
  }
  const SPARKS = pointCloud(7000, false);
  const SMOKE = pointCloud(600, true);

  // fx compose: trails plus burst flashes
  const MAXF = 6;
  const flashU = Array.from({ length: MAXF }, () => new Vector4(0, 0, 1, 0));
  const flashC = Array.from({ length: MAXF }, () => new Vector3(1, 1, 1));
  const fxMat = new ShaderMaterial({
    glslVersion: GLSL3, blending: NoBlending, depthTest: false, depthWrite: false,
    uniforms: { tTrail: { value: null }, uRes: { value: new Vector2(1, 1) }, uFlash: { value: flashU }, uFlashC: { value: flashC } },
    vertexShader: vert,
    fragmentShader: /* glsl */`
      out vec4 fragColor; in vec2 vUv; uniform sampler2D tTrail; uniform vec2 uRes;
      uniform vec4 uFlash[${MAXF}]; uniform vec3 uFlashC[${MAXF}];
      void main(){
        vec3 c = texture(tTrail, vUv).rgb;
        vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
        for (int i = 0; i < ${MAXF}; i++) {
          vec4 f = uFlash[i];
          if (f.w <= 0.0) continue;
          float d2 = dot(px - f.xy, px - f.xy) / (f.z * f.z);
          c += uFlashC[i] * f.w * (exp(-d2 * 48.0) * 0.8 + exp(-d2 * 7.0) * 0.025);
        }
        fragColor = vec4(c, 1.0);
      }`
  });
  const fxScene = new Scene(); fxScene.add(new Mesh(quad, fxMat));

  // the photograph, graded for night, with the fireworks set into it
  const compMat = new ShaderMaterial({
    glslVersion: GLSL3, depthTest: false, depthWrite: false,
    uniforms: {
      tPhoto: { value: photo }, tMask: { value: masks }, tFx: { value: null },
      uCover: { value: new Vector4(1, 1, 0, 0) }, uWaterY: { value: 0.2 }, uTime: { value: 0 }, uLight: { value: 0 }
    },
    vertexShader: vert,
    fragmentShader: /* glsl */`
      out vec4 fragColor; in vec2 vUv;
      uniform sampler2D tPhoto, tMask, tFx;
      uniform vec4 uCover; uniform float uWaterY, uTime, uLight;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 iuv = uCover.zw + vUv * uCover.xy;
        vec3 photo = texture(tPhoto, iuv).rgb;
        vec4 m = texture(tMask, iuv);
        float sky = m.r, water = m.g, cloud = m.b;
        // night grade: a deeper, cooler sky so the bursts carry the scene
        vec3 col = photo * mix(1.0, 0.58, sky);
        col = mix(col, col * vec3(0.82, 0.9, 1.15), sky * 0.7);
        // light from the fireworks: wide and soft from the blurred buffer
        vec3 wide = textureLod(tFx, vUv, 6.0).rgb * 1.6 + textureLod(tFx, vUv, 4.5).rgb * 0.8;
        col += sky * wide * (cloud * cloud * 1.8 + 0.03);                 // clouds catch the light
        col += (1.0 - sky) * (1.0 - water) * photo * wide * 1.2;          // the bridge and bank glow with it
        col += photo * uLight * 0.1;                                      // the whole scene breathes with big bursts
        // the fireworks themselves, only where there is sky
        col += texture(tFx, vUv).rgb * sky;
        // the river: mirrored about the far waterline, broken up by moving ripples
        if (water > 0.001) {
          float depth = max(uWaterY - vUv.y, 0.0);
          float n = vnoise(vec2(vUv.x * 9.0, depth * 140.0 - uTime * 0.6)) - 0.5;
          float n2 = vnoise(vec2(vUv.x * 30.0 + uTime * 0.2, depth * 420.0 - uTime * 1.4)) - 0.5;
          vec2 r = vec2(vUv.x + (n * 0.018 + n2 * 0.006) * (0.3 + depth * 9.0), uWaterY + depth * 1.02 + n2 * 0.004);
          vec3 refl = textureLod(tFx, r, 1.0 + depth * 30.0).rgb * 0.9 + textureLod(tFx, r, 4.0).rgb * 0.6;
          float fres = mix(0.75, 0.3, clamp(depth / 0.12, 0.0, 1.0));
          col += water * refl * fres * (0.75 + 0.5 * smoothstep(-0.2, 0.3, n2));
          // and a soft sheen of whatever is burning in the sky above
          vec3 above = textureLod(tFx, vec2(vUv.x + n * 0.03, min(0.97, uWaterY + 0.35)), 7.0).rgb;
          col += water * above * (1.6 + 1.2 * smoothstep(-0.25, 0.35, n2)) * fres;
        }
        fragColor = vec4(col, 1.0);
      }`
  });
  const compScene = new Scene(); compScene.add(new Mesh(quad, compMat));

  // camera finishing
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
  composer.addPass(new RenderPass(compScene, cam));
  const bloom = new BloomEffect({ mipmapBlur: true, intensity: 1.05, luminanceThreshold: 0.78, luminanceSmoothing: 0.25, radius: 0.72, levels: 7 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
  const grain = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: false });
  grain.blendMode.opacity.value = 0.13;
  const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.55 });
  composer.addPass(new EffectPass(cam, bloom, vignette, tone, grain));

  // ── layout: cover the stage like a photograph would ──────────────────
  let horizonY = 0, waterPx = 0;
  function layout() {
    W = Math.max(1, el.clientWidth); H = Math.max(1, el.clientHeight);
    PR = Math.min(window.devicePixelRatio || 1, small() ? 1.5 : 1.75);
    renderer.setPixelRatio(PR);
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    const fxScale = small() ? 0.75 : 1;
    makeTargets(Math.round(W * PR * fxScale), Math.round(H * PR * fxScale));
    const ia = IMG.w / IMG.h, sa = W / H;
    const fx = Math.min(1, sa / ia), fy = Math.min(1, ia / sa);
    const focusX = sa < 1.1 ? 0.5 : 0.5, focusYtop = sa > ia ? 0.6 : 0.5;
    const ox = Math.min(Math.max(focusX - fx / 2, 0), 1 - fx);
    const oy = Math.min(Math.max((1 - focusYtop) - fy / 2, 0), 1 - fy);   // bottom-up
    compMat.uniforms.uCover.value.set(fx, fy, ox, oy);
    const wy = (1 - IMG.water - oy) / fy;          // waterline in screen uv (bottom-up)
    compMat.uniforms.uWaterY.value = wy;
    waterPx = (1 - wy) * H;
    horizonY = waterPx - H * 0.055 / fy;           // the far treeline sits just above the water
    [SPARKS, SMOKE].forEach(c => { c.m.uniforms.uRes.value.set(W, H); c.m.uniforms.uPR.value = PR * fxScale; });
    fxMat.uniforms.uRes.value.set(W, H);
  }

  // ── fireworks ────────────────────────────────────────────────────────
  const COLORS = {
    gold: [1.0, 0.58, 0.2], amber: [1.0, 0.4, 0.1], white: [1.0, 0.94, 0.84], silver: [0.82, 0.88, 1.0],
    red: [1.0, 0.16, 0.1], green: [0.3, 1.0, 0.32], violet: [0.55, 0.38, 1.0], blue: [0.25, 0.45, 1.0]
  };
  const PALETTES = [['gold'], ['gold', 'white'], ['red', 'gold'], ['green', 'white'], ['violet', 'silver'], ['white'], ['amber'], ['blue', 'silver'], ['red', 'white']];
  const stars = [], smoke = [], rockets = [], flashes = [];
  let light = 0;

  function star(o) { stars.push(Object.assign({ t: 0, drag: 1.4, g: 46, size: 2.6, i0: 4, trail: 0, kind: 'star' }, o)); }
  function scale() { return H / 640; }

  function launch(tx, ty) {
    const s = scale();
    const x0 = tx + rand(-0.025, 0.025) * W;
    rockets.push({ x: x0, y: horizonY + 4, x0, y0: horizonY + 4, tx, ty, t: 0, dur: rand(1.1, 1.6), wob: rand(0, TAU) });
    window.SELEQT_DW && window.SELEQT_DW.burstSound('hiss-short', (tx / W) * 1.6 - 0.8, 0);
  }

  function burst(x, y) {
    const s = scale();
    const kinds = ['peony', 'peony', 'chrys', 'willow', 'ring', 'crossette', 'glitter', 'pistil'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const pal = kind === 'willow' ? ['gold'] : kind === 'glitter' ? ['white', 'silver'] : PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const R = rand(170, 240) * s * (small() ? 0.85 : 1);          // burst radius in px
    const n = Math.round((kind === 'ring' ? 70 : kind === 'crossette' ? 26 : kind === 'willow' ? 110 : 150) * (small() ? 0.7 : 1));
    const tiltA = rand(0, TAU), tiltB = rand(0.25, 1);
    for (let i = 0; i < n; i++) {
      let vx, vy;
      if (kind === 'ring') {
        const a = (i / n) * TAU; const cx = Math.cos(a), cy = Math.sin(a) * tiltB;
        vx = cx * Math.cos(tiltA) - cy * Math.sin(tiltA); vy = cx * Math.sin(tiltA) + cy * Math.cos(tiltA);
      } else {                                                      // a sphere of stars, seen from the side
        const u = rand(-1, 1), th = rand(0, TAU), k = Math.sqrt(1 - u * u);
        vx = k * Math.cos(th); vy = k * Math.sin(th);
        if (kind !== 'willow') { const j = rand(0.92, 1.04); vx *= j; vy *= j; }
      }
      const c = COLORS[pal[i % pal.length]];
      const sp = R * (kind === 'willow' ? 1.25 : 1.55);
      star({
        x, y, vx: vx * sp, vy: vy * sp, col: c,
        life: kind === 'willow' ? rand(3.2, 4.2) : kind === 'glitter' ? rand(1.8, 2.4) : rand(1.5, 2.1),
        drag: kind === 'willow' ? 1.7 : 1.9, g: kind === 'willow' ? 34 * s : 52 * s,
        i0: kind === 'willow' ? 3.2 : 4.5, size: kind === 'willow' ? 2.4 : 2.8,
        trail: kind === 'willow' ? 0.9 : kind === 'chrys' ? 0.55 : 0,
        split: kind === 'crossette', glitter: kind === 'glitter'
      });
    }
    if (kind === 'pistil') {                                         // a bright inner core in a second colour
      const c = COLORS[['white', 'gold', 'green', 'red'][Math.floor(Math.random() * 4)]];
      for (let i = 0; i < 50; i++) {
        const u = rand(-1, 1), th = rand(0, TAU), k = Math.sqrt(1 - u * u);
        star({ x, y, vx: k * Math.cos(th) * R * 0.75, vy: k * Math.sin(th) * R * 0.75, col: c, life: rand(1.0, 1.4), i0: 5 });
      }
    }
    const fc = COLORS[pal[0]];
    flashes.push({ x, y, r: R * 2.2, t: 0, dur: 0.18, col: fc, i: kind === 'willow' ? 1.6 : 2.4 });
    if (flashes.length > MAXF) flashes.shift();
    light = Math.min(1.4, light + 0.55);
    for (let i = 0; i < 18; i++) {
      const a = rand(0, TAU), d = rand(0, R * 0.7);
      smoke.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, vx: rand(4, 14) * s, vy: rand(-6, 2) * s,
        t: 0, life: rand(7, 11), size: rand(60, 120) * s, col: fc });
    }
    if (smoke.length > SMOKE.max) smoke.splice(0, smoke.length - SMOKE.max);
    const dw = window.SELEQT_DW;
    if (dw) {
      const pan = (x / W) * 1.6 - 0.8, delay = 0.35;
      dw.burstSound('thump', pan, delay);
      if (kind === 'chrys' || kind === 'glitter' || kind === 'willow') for (let k = 0; k < 14; k++) dw.burstSound('crackle', pan, delay + 0.9 + k * rand(0.04, 0.11));
    }
  }

  // ── simulation ───────────────────────────────────────────────────────
  function step(dt, time) {
    const s = scale();
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.t += dt;
      const u = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - u, 2.2);
      r.x = r.x0 + (r.tx - r.x0) * e + Math.sin(r.t * 9 + r.wob) * 1.2 * s;
      r.y = r.y0 + (r.ty - r.y0) * e;
      if (Math.random() < 0.7) star({ x: r.x, y: r.y + 2, vx: rand(-14, 14) * s, vy: rand(10, 40) * s, col: COLORS.amber, life: rand(0.25, 0.5), i0: 1.6, size: 1.8, drag: 3, g: 60 * s });
      if (u >= 1) { rockets.splice(i, 1); burst(r.tx, r.ty); }
    }
    for (let i = stars.length - 1; i >= 0; i--) {
      const p = stars[i]; p.t += dt;
      if (p.t >= p.life) {
        stars.splice(i, 1);
        if (p.split) for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.atan2(p.vy, p.vx);
          star({ x: p.x, y: p.y, vx: Math.cos(a) * 90 * s, vy: Math.sin(a) * 90 * s, col: p.col, life: rand(0.7, 1.0), i0: 3.5, size: 2.2 });
        }
        continue;
      }
      if (p.split && p.t > p.life * 0.45) { p.t = p.life; continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.trail && Math.random() < p.trail) {
        star({ x: p.x, y: p.y, vx: p.vx * 0.05, vy: p.vy * 0.05, col: COLORS.amber, life: rand(0.8, 1.8), i0: 0.9, size: 1.6, drag: 2.5, g: 30 * s });
      }
    }
    if (stars.length > SPARKS.max) stars.splice(0, stars.length - SPARKS.max);
    for (let i = smoke.length - 1; i >= 0; i--) {
      const m = smoke[i]; m.t += dt;
      if (m.t >= m.life) { smoke.splice(i, 1); continue; }
      m.x += m.vx * dt; m.y += m.vy * dt;
    }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t > flashes[i].dur) flashes.splice(i, 1); }
    light *= Math.exp(-dt * 2.2);
  }

  function upload() {
    // sparks
    let pos = SPARKS.g.attributes.position.array, col = SPARKS.g.attributes.color.array, siz = SPARKS.g.attributes.size.array, n = 0;
    for (const r of rockets) {
      pos[n * 3] = r.x; pos[n * 3 + 1] = r.y; col.set([3.2, 2.2, 1.2], n * 3); siz[n] = 3.2; n++;
    }
    for (const p of stars) {
      const u = p.t / p.life;
      let i = p.i0 * (u < 0.7 ? 1 - u * 0.4 : (1 - u) * 2.4);            // bright, then burning out
      if (p.glitter && u > 0.35) i *= Math.random() < 0.45 ? 2.2 : 0.05; // strobing glitter
      else if (u > 0.75 && Math.random() < 0.25) i *= 0.35;               // flicker as they die
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y;
      col[n * 3] = p.col[0] * i; col[n * 3 + 1] = p.col[1] * i; col[n * 3 + 2] = p.col[2] * i;
      siz[n] = p.size * (1 - u * 0.35); n++;
      if (n >= SPARKS.max) break;
    }
    SPARKS.g.setDrawRange(0, n);
    ['position', 'color', 'size'].forEach(a => { SPARKS.g.attributes[a].needsUpdate = true; });
    // smoke, lit by recent bursts
    pos = SMOKE.g.attributes.position.array; col = SMOKE.g.attributes.color.array; siz = SMOKE.g.attributes.size.array; n = 0;
    for (const m of smoke) {
      const u = m.t / m.life, a = Math.min(1, m.t * 1.5) * (1 - u) * (0.005 + light * 0.016);
      pos[n * 3] = m.x; pos[n * 3 + 1] = m.y;
      col[n * 3] = (0.5 + m.col[0] * 0.5) * a; col[n * 3 + 1] = (0.46 + m.col[1] * 0.4) * a; col[n * 3 + 2] = (0.44 + m.col[2] * 0.3) * a;
      siz[n] = m.size * (1 + u * 0.8); n++;
    }
    SMOKE.g.setDrawRange(0, n);
    ['position', 'color', 'size'].forEach(a => { SMOKE.g.attributes[a].needsUpdate = true; });
    for (let i = 0; i < MAXF; i++) {
      const f = flashes[i];
      if (f) { const u = f.t / f.dur; flashU[i].set(f.x, f.y, f.r, f.i * Math.pow(1 - u, 2)); flashC[i].set(...f.col); }
      else flashU[i].w = 0;
    }
  }

  function render(dt, time) {
    // 1. trails: fade the last frame, add this frame's sparks
    fadeMat.uniforms.tPrev.value = trailA.texture;
    fadeMat.uniforms.uDecay.value = Math.pow(0.86, dt * 60);
    renderer.setRenderTarget(trailB);
    renderer.render(fadeScene, cam);
    renderer.render(SPARKS.s, cam);
    [trailA, trailB] = [trailB, trailA];
    // 2. fx: trails, flashes and smoke (mipmapped for soft light)
    fxMat.uniforms.tTrail.value = trailA.texture;
    renderer.setRenderTarget(fxRT);
    renderer.render(fxScene, cam);
    renderer.render(SMOKE.s, cam);
    renderer.setRenderTarget(null);
    // 3. the photograph with everything set in, then the camera finish
    compMat.uniforms.tFx.value = fxRT.texture;
    compMat.uniforms.uTime.value = time;
    compMat.uniforms.uLight.value = light;
    composer.render(dt);
  }

  // ── run only while on screen ─────────────────────────────────────────
  // the show is paced in animation time, so a slow or throttled device never piles shells up
  let raf = 0, running = false, visible = false, last = 0, sim = 0, lastTouch = -10, nextAuto = 1.2;
  const queued = [];
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    sim += dt;
    const time = sim;
    if (!reduce && time - lastTouch > 5 && time > nextAuto && rockets.length === 0) {
      queued.push({ at: time, x: rand(0.18, 0.86) * W, y: rand(0.14, 0.42) * horizonY });
      if (Math.random() < 0.15) queued.push({ at: time + 0.42, x: rand(0.18, 0.86) * W, y: rand(0.14, 0.42) * horizonY });
      nextAuto = time + rand(2.6, 4.8);
    }
    for (let i = queued.length - 1; i >= 0; i--) if (queued[i].at <= time) { launch(queued[i].x, queued[i].y); queued.splice(i, 1); }
    step(dt, time); upload(); render(dt, time);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  layout();
  if ('ResizeObserver' in window) new ResizeObserver(() => layout()).observe(el);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible && !document.hidden ? start() : stop(); }, { threshold: 0.05 }).observe(el);
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : visible && start(); });
  canvas.addEventListener('pointerdown', e => {
    window.SELEQT_DW && window.SELEQT_DW.Sound.ensure();
    el.classList.add('is-touched');
    lastTouch = sim;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    launch(x, Math.min(y, horizonY * 0.82));
  });
  // a first shell so the scene is alive when it scrolls in
  queued.push({ at: 0.9, x: W * 0.62, y: horizonY * 0.3 });
}
