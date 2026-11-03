/* Raag of Lamps, Strings of Light and Sparkler Writing: photoreal WebGL scenes.
   Bundled with the fireworks into /diwali-webgl.js (see scripts/diwali-webgl.src.js).

   Each scene is a real photograph plus light rendered in HDR:
   - Raag of Lamps: a real lit diya (Abhishek Soni, Unsplash) floating on a night river
     (Mike Iukhtenko, Unsplash); flames mirror and streak in the water, warm the ripple crests
   - Strings of Light: fairy lights before a carved haveli doorway (Sarthak Shah, Wikimedia Commons),
     lighting the stone and catching the brass on the door
   - Sparkler Writing: a long-exposure buffer over a defocused Atal Bridge riverfront
   finished with bloom, neutral tone mapping, grain and vignette. Sound comes from
   window.SELEQT_DW (diwali-experiences.js). */
import {
  WebGLRenderer, Scene, OrthographicCamera, Mesh, PlaneGeometry, ShaderMaterial, GLSL3,
  WebGLRenderTarget, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, TextureLoader,
  SRGBColorSpace, BufferGeometry, BufferAttribute, Points, AdditiveBlending, NoBlending,
  Vector2, Vector4, NoToneMapping
} from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  NoiseEffect, VignetteEffect, BlendFunction
} from 'postprocessing';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const YAMAN = [1, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 5 / 3, 15 / 8];
const DW = () => window.SELEQT_DW || null;
const VERT = /* glsl */`out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// ── shared kit ──────────────────────────────────────────────────────────
function kit(el, { photo, photoSmall, aspect, focus = [0.5, 0.5], bloom = {}, grain = 0.13, fallback }) {
  const canvas = el.querySelector('canvas');
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!renderer.capabilities.isWebGL2) throw new Error('webgl2');
  } catch (e) {
    el.classList.add('no-gl');
    if (fallback) el.style.background = 'url("' + fallback + '") center / cover';
    return null;
  }
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.autoClear = false;
  const gl = renderer.getContext();
  const maxPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 256;
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new PlaneGeometry(2, 2);
  const small = () => el.clientWidth < 700;
  const loader = new TextureLoader();
  const tex = loader.load(small() && photoSmall ? photoSmall : photo);
  tex.colorSpace = SRGBColorSpace;
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
  const K = {
    el, canvas, renderer, cam, quad, tex, loader, composer, small, maxPoint,
    W: 1, H: 1, PR: 1, cover: new Vector4(1, 1, 0, 0), targets: [], onResize: [],
    rt(mip) {
      const t = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, magFilter: LinearFilter,
        minFilter: mip ? LinearMipmapLinearFilter : LinearFilter, generateMipmaps: !!mip });
      K.targets.push(t); return t;
    },
    scene(mat) { const s = new Scene(); s.add(new Mesh(quad, mat)); return s; },
    points(max, frag, extraUniforms) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(max * 3), 3));
      g.setAttribute('color', new BufferAttribute(new Float32Array(max * 3), 3));
      g.setAttribute('size', new BufferAttribute(new Float32Array(max), 1));
      g.setAttribute('aux', new BufferAttribute(new Float32Array(max * 2), 2));
      g.setDrawRange(0, 0);
      const m = new ShaderMaterial({
        glslVersion: GLSL3, blending: AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
        uniforms: Object.assign({ uRes: { value: new Vector2(1, 1) }, uPR: { value: 1 }, uTime: { value: 0 } }, extraUniforms || {}),
        vertexShader: /* glsl */`
          in vec3 color; in float size; in vec2 aux; out vec3 vCol; out vec2 vAux;
          uniform vec2 uRes; uniform float uPR;
          void main(){
            vCol = color; vAux = aux;
            gl_Position = vec4(position.x / uRes.x * 2.0 - 1.0, 1.0 - position.y / uRes.y * 2.0, 0.0, 1.0);
            gl_PointSize = size * uPR;
          }`,
        fragmentShader: frag
      });
      const p = new Points(g, m); p.frustumCulled = false;
      const s = new Scene(); s.add(p);
      K.pointLayers.push(m);
      return { g, m, s, max, n: 0,
        begin() { this.n = 0; },
        push(x, y, r, gg, b, size, a0, a1) {
          if (this.n >= max) return;
          const i = this.n++, P = g.attributes.position.array, C = g.attributes.color.array, S = g.attributes.size.array, A = g.attributes.aux.array;
          P[i * 3] = x; P[i * 3 + 1] = y; C[i * 3] = r; C[i * 3 + 1] = gg; C[i * 3 + 2] = b;
          S[i] = Math.min(size, K.maxPoint / K.PR); A[i * 2] = a0 || 0; A[i * 2 + 1] = a1 || 0;
        },
        end() { g.setDrawRange(0, this.n); ['position', 'color', 'size', 'aux'].forEach(a => { g.attributes[a].needsUpdate = true; }); }
      };
    },
    pointLayers: [],
    finish(compScene) {
      composer.addPass(new RenderPass(compScene, cam));
      const b = new BloomEffect(Object.assign({ mipmapBlur: true, intensity: 1.0, luminanceThreshold: 0.8, luminanceSmoothing: 0.25, radius: 0.72, levels: 7 }, bloom));
      const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
      const noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT });
      noise.blendMode.opacity.value = grain;
      const vig = new VignetteEffect({ offset: 0.32, darkness: 0.55 });
      composer.addPass(new EffectPass(cam, b, vig, tone, noise));
    },
    layout() {
      K.W = Math.max(1, el.clientWidth); K.H = Math.max(1, el.clientHeight);
      K.PR = Math.min(window.devicePixelRatio || 1, small() ? 1.5 : 1.75);
      renderer.setPixelRatio(K.PR); renderer.setSize(K.W, K.H, false); composer.setSize(K.W, K.H);
      K.targets.forEach(t => { t.setSize(Math.round(K.W * K.PR), Math.round(K.H * K.PR)); renderer.setRenderTarget(t); renderer.clear(); });
      renderer.setRenderTarget(null);
      const sa = K.W / K.H, fx = Math.min(1, sa / aspect), fy = Math.min(1, aspect / sa);
      K.cover.set(fx, fy, clamp(focus[0] - fx / 2, 0, 1 - fx), clamp((1 - focus[1]) - fy / 2, 0, 1 - fy));
      K.pointLayers.forEach(m => { m.uniforms.uRes.value.set(K.W, K.H); m.uniforms.uPR.value = K.PR; });
      K.onResize.forEach(f => f());
    },
    at(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },
    run(frame) {
      let raf = 0, running = false, visible = false, last = 0, sim = 0;
      const loop = now => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now; sim += dt;
        frame(dt, sim);
        raf = requestAnimationFrame(loop);
      };
      K.start = () => { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); K.onStart && K.onStart(); };
      K.stop = () => { if (!running) return; running = false; cancelAnimationFrame(raf); K.onStop && K.onStop(); };
      K.layout();
      if ('ResizeObserver' in window) new ResizeObserver(() => K.layout()).observe(el);
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible && !document.hidden ? K.start() : K.stop(); }, { threshold: 0.05 }).observe(el);
      document.addEventListener('visibilitychange', () => { document.hidden ? K.stop() : visible && K.start(); });
    }
  };
  return K;
}

// shared fragment chunk: value noise
const NOISE = /* glsl */`
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }`;

// ════════════════════════════════════════════════════════════════════════
// Raag of Lamps: diyas floating on a night river
// ════════════════════════════════════════════════════════════════════════
function raag(el) {
  const K = kit(el, { photo: '/images/diwali/river.webp', photoSmall: '/images/diwali/river-small.webp', aspect: 1.5,
    focus: [0.5, 0.5], bloom: { intensity: 1.1, luminanceThreshold: 0.7 }, fallback: '/images/diwali/river-small.webp' });
  if (!K) return;
  const sprite = K.loader.load('/images/diwali/diya-sprite.webp'); sprite.colorSpace = SRGBColorSpace;
  const SPR_A = 400 / 502;                 // sprite width / height
  const BASE_V = 0.765;                    // the bowl's waterline, from the top of the sprite
  const lampRT = K.rt(true), reflRT = K.rt(true);
  const lampFrag = flip => /* glsl */`
    out vec4 fragColor; in vec3 vCol; in vec2 vAux;
    uniform sampler2D tSprite; uniform float uTime;
    void main(){
      vec2 uv = gl_PointCoord;
      uv.x = (uv.x - 0.5) / ${SPR_A.toFixed(4)} + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0) discard;
      ${flip ? 'uv.y = 1.0 - uv.y;' : ''}
      // the flame sways and breathes; the clay does not
      float flame = smoothstep(0.62, 0.2, uv.y);
      uv.x += flame * (sin(uTime * 7.3 + vAux.x * 9.0 + uv.y * 7.0) * 0.012 + sin(uTime * 13.1 + vAux.x * 3.0) * 0.006) * (0.62 - uv.y);
      vec3 raw = texture(tSprite, vec2(uv.x, 1.0 - uv.y)).rgb;
      vec3 c = max(raw - 0.035, 0.0) * 1.04;                                        // true black around the lamp
      float bowl = smoothstep(0.6, 0.68, uv.y) * smoothstep(0.86, 0.78, uv.y) * smoothstep(0.12, 0.24, uv.x) * smoothstep(0.92, 0.82, uv.x);
      c = mix(c, raw * vec3(2.4, 1.9, 1.6), bowl * 0.85);                          // the clay, lit by its own flame
      c *= vCol * mix(1.0, vAux.y, flame);
      fragColor = vec4(c, 1.0);
    }`;
  const LAMPS = K.points(40, lampFrag(false), { tSprite: { value: sprite } });
  const REFL = K.points(40, lampFrag(true), { tSprite: { value: sprite } });
  const MAXR = 8, rip = Array.from({ length: MAXR }, () => new Vector4(0, 0, 99, 0));
  const comp = new ShaderMaterial({
    glslVersion: GLSL3, depthTest: false, depthWrite: false,
    uniforms: { tPhoto: { value: K.tex }, tLamp: { value: null }, tRefl: { value: null }, uCover: { value: K.cover }, uTime: { value: 0 },
      uRip: { value: rip }, uAspect: { value: 1 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      out vec4 fragColor; in vec2 vUv;
      uniform sampler2D tPhoto, tLamp, tRefl; uniform vec4 uCover; uniform float uTime, uAspect;
      uniform vec4 uRip[${MAXR}];
      ${NOISE}
      void main(){
        // rings spreading from where lamps were set down (flattened by perspective)
        vec2 d = vec2(0.0);
        for (int i = 0; i < ${MAXR}; i++) {
          vec4 r = uRip[i]; if (r.w <= 0.0) continue;
          vec2 v = (vUv - r.xy) * vec2(uAspect, 3.2);
          float dist = length(v), front = r.z * 0.22;
          float w = sin((dist - front) * 90.0) * exp(-pow((dist - front) * 14.0, 2.0)) * r.w * exp(-r.z * 0.9);
          d += normalize(v + 1e-5) * w * 0.006;
        }
        float n = vnoise(vec2(vUv.x * 14.0, vUv.y * 60.0 - uTime * 0.5)) - 0.5;
        vec2 iuv = uCover.zw + (vUv + d) * uCover.xy;
        vec3 photo = texture(tPhoto, iuv).rgb;
        float lum = dot(photo, vec3(0.3333));
        vec3 col = photo * vec3(0.5, 0.58, 0.78) * 0.62;                   // moonless night on the river
        // warm light from every flame, caught mostly by the ripple crests
        vec3 light = textureLod(tLamp, vUv, 5.5).rgb * 1.4 + textureLod(tLamp, vUv, 3.5).rgb * 0.5;
        float crest = smoothstep(0.1, 0.38, lum);
        col += light * (crest * 4.2 + 0.22);
        // reflections: mirrored flames, smeared down and broken by the water
        float row = vnoise(vec2(vUv.y * 260.0, uTime * 0.8)) - 0.5;
        vec2 ruv = vUv + d * 2.0 + vec2(row * 0.006 + n * 0.004, 0.0);
        vec3 refl = vec3(0.0);
        for (int k = 0; k < 8; k++) refl += textureLod(tRefl, ruv + vec2(0.0, -float(k) * 0.008), 1.2).rgb;
        col += refl / 8.0 * (0.25 + 0.95 * crest);                         // broken up by the ripples it lands on
        col += texture(tLamp, vUv).rgb;
        fragColor = vec4(col, 1.0);
      }`
  });
  const compScene = K.scene(comp);
  K.finish(compScene);

  // lamps and music
  const SA = 261.63, PERIOD = (60 / 66) * 4;
  const lamps = [], ripples = [];
  let drone = null, wantDrone = false;
  const maxLamps = () => (K.small() ? 12 : 18);
  const persp = y => 0.38 + 0.62 * clamp(y / K.H, 0, 1);
  function noteFor(x) { const k = clamp(Math.floor((x / K.W) * 15), 0, 14); return SA * YAMAN[k % 7] * Math.pow(2, Math.floor(k / 7)); }
  function ring(l, vel) {
    l.flare = 1;
    ripples.push({ x: l.x / K.W, y: 1 - (l.y + l.h * (BASE_V - 0.5)) / K.H, t: 0, a: 0.5 * vel });
    const dw = DW(); if (dw && dw.bell) dw.bell(l.f, vel, (l.x / K.W) * 1.6 - 0.8);
  }
  function add(x, y, sound) {
    y = clamp(y, K.H * 0.18, K.H * 0.94);
    const l = { x, y, f: noteFor(x), ph: 0, rate: 1 / (PERIOD * rand(0.94, 1.06)), seed: rand(0, 10), flare: sound ? 1 : 0.4, a: 0, dying: false,
      vx: rand(5, 10), h: (K.small() ? 150 : 210) * persp(y) };
    lamps.push(l);
    const live = lamps.filter(m => !m.dying);
    if (live.length > maxLamps()) live[0].dying = true;
    if (sound) ring(l, 1);
    else ripples.push({ x: x / K.W, y: 1 - (y + l.h * (BASE_V - 0.5)) / K.H, t: 0, a: 0.25 });
  }
  K.onResize.push(() => {
    comp.uniforms.uAspect.value = K.W / K.H;
    if (!lamps.length) { add(K.W * 0.3, K.H * 0.7, false); add(K.W * 0.55, K.H * 0.5, false); add(K.W * 0.74, K.H * 0.64, false); lamps.forEach((l, i) => { l.ph = i * 0.33; }); }
  });
  K.canvas.addEventListener('pointerdown', e => {
    const dw = DW(); dw && dw.Sound.ensure();
    el.classList.add('is-touched');
    wantDrone = true; if (!drone && dw && dw.Sound.on) drone = dw.startDrone(130.81);
    const p = K.at(e); add(p.x, p.y, true);
  });
  K.onStart = () => { const dw = DW(); if (wantDrone && !drone && dw && dw.Sound.on) drone = dw.startDrone(130.81); };
  K.onStop = () => { if (drone) { drone.stop(); drone = null; } };
  const box = el.parentElement;
  const recBtn = box.querySelector('[data-act="record"]'), clearBtn = box.querySelector('[data-act="clear"]');
  clearBtn && clearBtn.addEventListener('click', () => { lamps.forEach(l => { l.dying = true; }); if (drone) { drone.stop(); drone = null; } wantDrone = false; });
  recBtn && recBtn.addEventListener('click', () => {
    const dw = DW(); if (!dw) return;
    dw.Sound.ensure();
    const stream = dw.Sound.stream();
    if (!stream || !window.MediaRecorder) { recBtn.textContent = 'Recording is not supported in this browser'; recBtn.disabled = true; return; }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined), chunks = [];
    mr.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    mr.onstop = () => {
      const mime = mr.mimeType || type || 'audio/webm';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(chunks, { type: mime }));
      a.download = 'seleqt-raag-of-lamps.' + (mime.indexOf('mp4') > -1 ? 'm4a' : 'webm');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      recBtn.disabled = false; recBtn.textContent = 'Save a 30-second clip';
    };
    if (!lamps.some(l => !l.dying)) { add(K.W * 0.35, K.H * 0.6, true); add(K.W * 0.62, K.H * 0.45, true); }
    wantDrone = true; if (!drone && dw.Sound.on) drone = dw.startDrone(130.81);
    el.classList.add('is-touched');
    mr.start(); recBtn.disabled = true;
    let left = 30; recBtn.textContent = 'Recording, ' + left + 's';
    const tick = setInterval(() => { left--; recBtn.textContent = 'Recording, ' + left + 's'; if (left <= 0) { clearInterval(tick); mr.stop(); } }, 1000);
  });

  K.run((dt, t) => {
    const live = lamps.filter(l => !l.dying);
    for (const l of live) {                       // lamps listen to their neighbours and fall into step
      let d = l.rate;
      for (const m of live) {
        if (m === l) continue;
        const dist = Math.hypot(m.x - l.x, m.y - l.y);
        if (dist < K.W * 0.45) d += 0.05 * Math.sin(TAU * (m.ph - l.ph)) * (1 - dist / (K.W * 0.45));
      }
      l.ph += d * dt;
      if (l.ph >= 1) { l.ph -= 1; if (wantDrone) ring(l, 0.5); else l.flare = 0.5; }
    }
    LAMPS.begin(); REFL.begin();
    for (let i = lamps.length - 1; i >= 0; i--) {
      const l = lamps[i];
      if (!reduce) l.x += l.vx * persp(l.y) * dt;
      if (l.x > K.W + l.h) l.dying = true;
      l.a = l.dying ? l.a - dt * 0.7 : Math.min(1, l.a + dt * 1.5);
      if (l.dying && l.a <= 0) { lamps.splice(i, 1); continue; }
      l.flare = Math.max(0, l.flare - dt * 1.4);
      const flick = reduce ? 1 : 0.9 + 0.1 * Math.sin(t * 9.1 + l.seed) * Math.sin(t * 5.7 + l.seed * 2);
      const bob = reduce ? 0 : Math.sin(t * 1.3 + l.seed) * 1.5 * persp(l.y);
      const k = l.a * flick * (1.6 + l.flare * 1.4);
      LAMPS.push(l.x, l.y + bob, k, k * 0.96, k * 0.9, l.h, l.seed, 1 + l.flare * 0.6);
      // the mirror image sits below the bowl's waterline
      const base = l.y + bob + l.h * (BASE_V - 0.5);
      REFL.push(l.x, base + (base - (l.y + bob)) + l.h * 0.02, k * 0.55, k * 0.5, k * 0.45, l.h, l.seed, 1);
    }
    LAMPS.end(); REFL.end();
    for (let i = 0; i < MAXR; i++) {
      const r = ripples[ripples.length - 1 - i];
      if (r) { r.t += dt * (i === 0 ? 1 : 1); rip[i].set(r.x, r.y, r.t, r.a); } else rip[i].w = 0;
    }
    for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].t > 6) ripples.splice(i, 1);
    if (ripples.length > MAXR) ripples.splice(0, ripples.length - MAXR);
    [LAMPS.m, REFL.m].forEach(m => { m.uniforms.uTime.value = t; });
    const r = K.renderer;
    r.setRenderTarget(lampRT); r.clear(); r.render(LAMPS.s, K.cam);
    r.setRenderTarget(reflRT); r.clear(); r.render(REFL.s, K.cam);
    r.setRenderTarget(null);
    comp.uniforms.tLamp.value = lampRT.texture; comp.uniforms.tRefl.value = reflRT.texture; comp.uniforms.uTime.value = t;
    K.composer.render(dt);
  });
}

// ════════════════════════════════════════════════════════════════════════
// Strings of Light: fairy lights before a haveli doorway
// ════════════════════════════════════════════════════════════════════════
function strings(el) {
  const K = kit(el, { photo: '/images/diwali/haveli-door.webp', photoSmall: '/images/diwali/haveli-door-small.webp', aspect: 4 / 3,
    focus: [0.51, 0.45], bloom: { intensity: 1.25, luminanceThreshold: 0.75, radius: 0.8 }, fallback: '/images/diwali/haveli-door-small.webp' });
  if (!K) return;
  const brass = K.loader.load('/images/diwali/haveli-brass-mask.webp');      // the door's brass bands, studs and rings
  const bulbRT = K.rt(true);
  const BULBS = K.points(900, /* glsl */`
    out vec4 fragColor; in vec3 vCol; in vec2 vAux;
    void main(){
      vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p);
      if (r > 1.0) discard;
      float blur = smoothstep(0.3, 0.8, vAux.x);             // 0 in focus, 1 fully out of focus
      float sharp = exp(-r * r * 14.0) * 1.4 + exp(-r * r * 3.0) * 0.18;
      float disc = smoothstep(1.0, 0.72, r) * (0.66 + 0.34 * smoothstep(0.45, 0.95, r)) * 0.1 * vAux.y;   // soft lens bokeh, faintly brighter at the rim
      fragColor = vec4(mix(vCol * sharp, vCol * vec3(1.0, 0.8, 0.52) * disc, blur), 1.0);   // no sharp core inside a bokeh disc
    }`);
  const WIRE = K.points(3000, /* glsl */`
    out vec4 fragColor; in vec3 vCol;
    void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float a = exp(-dot(p, p) * 3.0); fragColor = vec4(vCol * a, 1.0); }`);
  const comp = new ShaderMaterial({
    glslVersion: GLSL3, depthTest: false, depthWrite: false,
    uniforms: { tPhoto: { value: K.tex }, tBrass: { value: brass }, tBulb: { value: null }, uCover: { value: K.cover }, uGlow: { value: 0.3 }, uTime: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      out vec4 fragColor; in vec2 vUv;
      uniform sampler2D tPhoto, tBrass, tBulb; uniform vec4 uCover; uniform float uGlow, uTime;
      void main(){
        vec2 iuv = uCover.zw + vUv * uCover.xy;
        vec3 stone = texture(tPhoto, iuv).rgb;
        float lum = dot(stone, vec3(0.3333));
        vec3 col = stone * vec3(0.3, 0.34, 0.46) * 0.36;                  // the doorway by moonlight
        float brass = texture(tBrass, iuv).a;
        // diyas on the step just below the frame warm the foot of the door
        float fall = exp(-pow(length((iuv - vec2(0.51, -0.08)) * vec2(1.3, 1.0)) * 2.7, 2.0));
        vec3 lamp = vec3(1.0, 0.55, 0.22) * uGlow * fall * (0.92 + 0.08 * sin(uTime * 3.1) * sin(uTime * 4.7));
        col += stone * lamp * 2.2 + brass * lamp * 2.4;
        vec3 light = textureLod(tBulb, vUv, 5.5).rgb * 1.6 + textureLod(tBulb, vUv, 3.5).rgb * 0.6;
        col += stone * light * 2.6 + light * lum * 0.4;                    // the carved stone warms up near the lights
        col += brass * stone * (textureLod(tBulb, vUv, 3.0).rgb * 5.0 + textureLod(tBulb, vUv, 1.5).rgb * 1.5);   // brass catches the bulbs
        col += texture(tBulb, vUv).rgb;
        fragColor = vec4(col, 1.0);
      }`
  });
  K.finish(K.scene(comp));

  const SA = 196;
  let strs = [];
  const last = new Map();
  function layout() {
    const n = K.small() ? 6 : 9;
    const degs = n === 6 ? [0, 2, 3, 4, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
    strs = [];
    for (let i = 0; i < n; i++) {
      const k = degs[i];
      const depth = (i === 1 || i === n - 2) ? 0.85 : 0;               // two strings hang nearer the lens, out of focus
      strs.push({
        x: K.W * (0.08 + 0.84 * i / (n - 1)), top: -10, len: K.H * (0.6 + 0.3 * (0.5 + 0.5 * Math.sin(i * 1.9 + 0.4))),
        f: SA * YAMAN[k % 7] * Math.pow(2, Math.floor(k / 7)), amp: 0, t: 9, py: 0.5, sway: rand(0, 6), depth,
        warm: rand(0, 1)
      });
    }
  }
  K.onResize.push(layout);
  function hit(s, y, v) {
    s.amp = clamp(3 + v * 0.012, 3, 16); s.t = 0; s.py = clamp((y - s.top) / s.len, 0, 1);
    const dw = DW(); if (dw && dw.pluck) dw.pluck(s.f, 0.35 + clamp(v / 2200, 0, 0.65), (s.x / K.W) * 1.6 - 0.8);
  }
  K.canvas.addEventListener('pointermove', e => {
    const p = K.at(e), prev = last.get(e.pointerId), now = performance.now();
    last.set(e.pointerId, { x: p.x, y: p.y, t: now });
    if (!prev) return;
    const v = Math.hypot(p.x - prev.x, p.y - prev.y) / Math.max(1, now - prev.t) * 1000;
    for (const s of strs) {
      if ((prev.x - s.x) * (p.x - s.x) <= 0 && prev.x !== p.x) {
        const u = (s.x - prev.x) / (p.x - prev.x), y = prev.y + u * (p.y - prev.y);
        if (y > s.top - 10 && y < s.top + s.len + 10) { hit(s, y, v); el.classList.add('is-touched'); }
      }
    }
  });
  K.canvas.addEventListener('pointerdown', e => {
    const dw = DW(); dw && dw.Sound.ensure();
    const p = K.at(e);
    last.set(e.pointerId, { x: p.x, y: p.y, t: performance.now() });
    const s = strs.find(q => Math.abs(q.x - p.x) < 18 && p.y < q.top + q.len);
    if (s) { hit(s, p.y, 600); el.classList.add('is-touched'); }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => K.canvas.addEventListener(ev, e => last.delete(e.pointerId)));

  K.run((dt, t) => {
    BULBS.begin(); WIRE.begin();
    let energy = 0;
    for (const s of strs) {
      s.t += dt;
      const env = Math.exp(-s.t * 2.4), vib = s.amp * env;
      energy += env * s.amp / 16;
      const sway = reduce ? 0 : Math.sin(t * 0.6 + s.sway) * 2.2;
      const at = u => s.x + sway * u * u + vib * Math.sin(Math.PI * u) * Math.cos(TAU * 7 * s.t) * (1 - Math.abs(u - s.py) * 0.4);
      const scale = 1 + s.depth * 1.6;
      for (let w = 0; w <= 60; w++) { const u = w / 60; WIRE.push(at(u), s.top + u * s.len, 0.012, 0.01, 0.008, 2 * scale); }
      const n = Math.max(10, Math.floor(s.len / (22 * (1 + s.depth * 0.6))));
      for (let b = 1; b <= n; b++) {
        const u = b / n, x = at(u), y = s.top + u * s.len;
        const wave = Math.exp(-Math.pow(Math.abs(u - s.py) - s.t * 1.3, 2) / 0.006) * Math.exp(-s.t * 1.1);
        const base = 1.45 + 0.14 * Math.sin(t * 2.1 + b * 1.7 + s.sway);
        const k = base + wave * 3.5 + env * 0.6;
        const tint = s.warm > 0.5 ? [1.0, 0.72, 0.38] : [1.0, 0.82, 0.55];
        // strings near the lens blur into large, overlapping, unevenly bright discs (scaled down on narrow stages)
        const size = s.depth ? (9 + s.depth * 28) * clamp(K.W / 1100, 0.6, 1) : 6.5;
        const vary = s.depth ? 0.7 + 0.3 * Math.abs(Math.sin(b * 12.9898 + s.sway * 7.1)) : 1;
        BULBS.push(x, y, tint[0] * k, tint[1] * k, tint[2] * k, size, s.depth, vary);
      }
    }
    BULBS.end(); WIRE.end();
    const r = K.renderer;
    r.setRenderTarget(bulbRT); r.clear(); r.render(WIRE.s, K.cam); r.render(BULBS.s, K.cam);
    r.setRenderTarget(null);
    comp.uniforms.tBulb.value = bulbRT.texture; comp.uniforms.uTime.value = t;
    comp.uniforms.uGlow.value = 0.26 + Math.min(0.16, energy * 0.03);
    K.composer.render(dt);
  });
}

// ════════════════════════════════════════════════════════════════════════
// Sparkler Writing: a long exposure over the riverfront, out of focus
// ════════════════════════════════════════════════════════════════════════
function sparkler(el) {
  const K = kit(el, { photo: '/images/diwali/riverfront-bokeh.webp', aspect: 1600 / 1201, focus: [0.45, 0.55],
    bloom: { intensity: 1.2, luminanceThreshold: 0.72, radius: 0.75 }, grain: 0.15, fallback: '/images/diwali/riverfront-bokeh.webp' });
  if (!K) return;
  const expoA = K.rt(true), expoB = K.rt(true), sparkA = K.rt(false), sparkB = K.rt(false);
  const fade = new ShaderMaterial({
    glslVersion: GLSL3, blending: NoBlending, depthTest: false, depthWrite: false,
    uniforms: { tPrev: { value: null }, uDecay: { value: 1 } }, vertexShader: VERT,
    fragmentShader: /* glsl */`out vec4 fragColor; in vec2 vUv; uniform sampler2D tPrev; uniform float uDecay;
      void main(){ fragColor = vec4(texture(tPrev, vUv).rgb * uDecay, 1.0); }`
  });
  const fadeScene = K.scene(fade);
  const DOT = /* glsl */`out vec4 fragColor; in vec3 vCol;
    void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0) discard;
      fragColor = vec4(vCol * (exp(-r2 * 7.0) + exp(-r2 * 2.0) * 0.15), 1.0); }`;
  const STAMP = K.points(4000, DOT), SPARK = K.points(5000, DOT);
  const comp = new ShaderMaterial({
    glslVersion: GLSL3, depthTest: false, depthWrite: false,
    uniforms: { tPhoto: { value: K.tex }, tExpo: { value: null }, tSpark: { value: null }, uCover: { value: K.cover }, uTip: { value: new Vector4(0, 0, 0, 0) }, uRes: { value: new Vector2(1, 1) } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      out vec4 fragColor; in vec2 vUv;
      uniform sampler2D tPhoto, tExpo, tSpark; uniform vec4 uCover, uTip; uniform vec2 uRes;
      void main(){
        vec2 iuv = uCover.zw + vUv * uCover.xy;
        vec3 bg = texture(tPhoto, iuv).rgb * 0.62;
        vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
        float d = length(px - uTip.xy) / max(uRes.y, 1.0);
        vec3 tipLight = vec3(1.0, 0.7, 0.38) * uTip.w * exp(-d * d * 9.0);
        vec3 spill = textureLod(tExpo, vUv, 6.0).rgb * 0.18;
        vec3 col = bg + bg * (tipLight * 1.4 + spill) + tipLight * 0.05;
        col += texture(tExpo, vUv).rgb + texture(tSpark, vUv).rgb;
        col += vec3(1.0, 0.85, 0.6) * uTip.w * (exp(-d * d * 9000.0) * 6.0 + exp(-d * d * 900.0) * 0.6);   // the burning head
        fragColor = vec4(col, 1.0);
      }`
  });
  K.finish(K.scene(comp));
  K.onResize.push(() => { comp.uniforms.uRes.value.set(K.W, K.H); });

  let down = false, lastP = null, tip = null, tipLight = 0, pending = [];
  const sparks = [];
  K.canvas.addEventListener('pointerdown', e => {
    const dw = DW(); dw && dw.Sound.ensure();
    down = true; K.canvas.setPointerCapture(e.pointerId);
    lastP = tip = K.at(e); el.classList.add('is-touched');
  });
  K.canvas.addEventListener('pointermove', e => {
    if (!down) return;
    const p = K.at(e);
    const dist = Math.hypot(p.x - lastP.x, p.y - lastP.y);
    const steps = Math.ceil(dist / 1.4);
    for (let i = 1; i <= steps; i++) pending.push({ x: lastP.x + (p.x - lastP.x) * i / steps, y: lastP.y + (p.y - lastP.y) * i / steps });
    lastP = tip = p;
  });
  ['pointerup', 'pointercancel'].forEach(ev => K.canvas.addEventListener(ev, () => { down = false; tip = null; }));
  let clearNext = false;
  const box = el.parentElement;
  const cb = box.querySelector('[data-act="clear"]'), sb = box.querySelector('[data-act="save"]');
  cb && cb.addEventListener('click', () => { clearNext = true; sparks.length = 0; });
  let lastDt = 0.016;
  function swap() {
    let t1 = expoTargets[0]; expoTargets[0] = expoTargets[1]; expoTargets[1] = t1;
    t1 = sparkTargets[0]; sparkTargets[0] = sparkTargets[1]; sparkTargets[1] = t1;
  }
  const expoTargets = [expoA, expoB], sparkTargets = [sparkA, sparkB];

  function render(dt) {
    const r = K.renderer;
    const [eA, eB] = expoTargets, [sA, sB] = sparkTargets;
    fade.uniforms.tPrev.value = eA.texture; fade.uniforms.uDecay.value = clearNext ? 0 : Math.pow(0.9985, dt * 60);
    r.setRenderTarget(eB); r.render(fadeScene, K.cam);
    STAMP.begin();
    for (const p of pending) { const k = rand(0.75, 1.3); STAMP.push(p.x, p.y, 2.5 * k, 1.8 * k, 0.95 * k, rand(3.4, 5.4)); }
    pending = [];
    if (tip) for (const s of sparks) if (Math.random() < 0.3) STAMP.push(s.x, s.y, 0.55, 0.38, 0.18, 1.3);   // the camera records the sparks too
    STAMP.end(); r.render(STAMP.s, K.cam);
    fade.uniforms.tPrev.value = sA.texture; fade.uniforms.uDecay.value = clearNext ? 0 : Math.pow(0.72, dt * 60);
    r.setRenderTarget(sB); r.render(fadeScene, K.cam);
    SPARK.begin();
    for (const s of sparks) { const k = 1 - s.t / s.life; SPARK.push(s.x, s.y, 2.4 * k, 1.7 * k, 0.8 * k, s.size); }
    SPARK.end(); r.render(SPARK.s, K.cam);
    r.setRenderTarget(null);
    comp.uniforms.tExpo.value = eB.texture; comp.uniforms.tSpark.value = sB.texture;
    comp.uniforms.uTip.value.set(tip ? tip.x : 0, tip ? tip.y : 0, 0, tipLight);
    K.composer.render(dt);
    swap();
    clearNext = false;
  }

  sb && sb.addEventListener('click', () => {
    render(lastDt);                                   // draw a fresh frame and read it straight away
    const shot = K.canvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
      const w = img.width, h = img.height, cap = Math.round(h * 0.16);
      const out = document.createElement('canvas'); out.width = w; out.height = h + cap;
      const o = out.getContext('2d');
      o.fillStyle = '#05090f'; o.fillRect(0, 0, w, h + cap);
      o.drawImage(img, 0, 0);
      o.textAlign = 'center';
      o.fillStyle = '#d4b06a'; o.font = 'italic ' + Math.round(cap * 0.42) + 'px "Cormorant Garamond", serif';
      o.fillText('Shubh Deepavali', w / 2, h + cap * 0.52);
      o.fillStyle = 'rgba(244,241,234,0.6)'; o.font = '300 ' + Math.round(cap * 0.16) + 'px "Outfit", sans-serif';
      o.fillText('S E L E Q T   ·   seleqtwealth.in/diwali', w / 2, h + cap * 0.82);
      out.toBlob(b => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = 'seleqt-sparkler-writing.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, 'image/png');
    };
    img.src = shot;
  });

  K.run((dt, t) => {
    lastDt = dt;
    tipLight += ((tip ? 1.1 + Math.random() * 0.5 : 0) - tipLight) * Math.min(1, dt * 18);
    if (tip) {
      for (let k = 0; k < (K.small() ? 22 : 34); k++) {
        const a = rand(0, TAU), sp = rand(80, 430);
        sparks.push({ x: tip.x, y: tip.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, t: 0, life: rand(0.1, 0.42), size: rand(1.4, 2.4), fork: Math.random() < 0.12 });
      }
      const dw = DW(); if (dw && Math.random() < dt * 30) dw.burstSound('crackle', (tip.x / K.W) * 1.6 - 0.8);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.t += dt;
      if (s.t >= s.life) {
        sparks.splice(i, 1);
        if (s.fork) for (let k = 0; k < 3; k++) {          // real sparkler sparks branch as they burn
          const a = Math.atan2(s.vy, s.vx) + rand(-1.1, 1.1);
          sparks.push({ x: s.x, y: s.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, t: 0, life: rand(0.06, 0.16), size: 1.2, fork: false });
        }
        continue;
      }
      s.vy += 360 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.985;
    }
    if (sparks.length > SPARK.max) sparks.splice(0, sparks.length - SPARK.max);
    render(dt);
  });
}

const makers = { raag, strings, sparkler };
document.querySelectorAll('.dwp-stage[data-xp]').forEach(el => {
  const m = makers[el.getAttribute('data-xp')];
  if (m) m(el);
});
