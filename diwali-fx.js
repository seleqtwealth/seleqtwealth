/* ==========================================================================
   Diwali fireworks (6 to 11 November 2026): a tap anywhere on the site sets
   off a firework, and the first page of a visit opens on a short show.
   Loaded by main.js only during the festival (html.diwali-season). Taps do
   nothing while the lights are switched off; reduced motion gets none of it.

   How it looks real, with no libraries (raw WebGL2):
   - sparks render into a half-float buffer that fades a little every frame,
     so each star leaves a streak, like a long-exposure photograph
   - a glow taken from that buffer's mipmaps stands in for lens bloom, and each
     burst flashes and briefly lights the page around it
   - the light is tone-mapped (1 - e^-x), so cores roll off to white instead of
     clipping, and laid over the page with its own alpha
   - shells (peony, chrysanthemum, willow, ring, crossette, glitter, pistil)
     keep the drag and gravity of the Sabarmati fireworks
   The loop runs only while something is in the air.
   ========================================================================== */
(function () {
  const root = document.documentElement;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { root.classList.remove('dw-opening'); return; }
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const TAU = Math.PI * 2;
  const keep = fn => { try { fn(); } catch (e) { /* storage blocked */ } };

  const COLORS = {
    gold: [1.0, 0.58, 0.2], amber: [1.0, 0.4, 0.1], white: [1.0, 0.94, 0.84], silver: [0.82, 0.88, 1.0],
    red: [1.0, 0.16, 0.1], green: [0.3, 1.0, 0.32], violet: [0.55, 0.38, 1.0], rose: [1.0, 0.42, 0.46]
  };
  // mostly golds and whites, so it stays in the house colours; a little colour now and then
  const PALETTES = [['gold'], ['gold', 'white'], ['gold'], ['red', 'gold'], ['white'], ['amber'], ['silver', 'white'], ['rose', 'gold'], ['violet', 'silver'], ['green', 'gold']];
  const KINDS = ['peony', 'peony', 'chrys', 'willow', 'ring', 'crossette', 'glitter', 'pistil'];

  // ── canvas + WebGL2 ─────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.id = 'dw-fx';
  canvas.setAttribute('aria-hidden', 'true');
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }); } catch (e) { gl = null; }

  let W = 1, H = 1, PR = 1, TW = 1, TH = 1;
  let half = false, tex = null, fbo = null, pPts, pFade, pComp, vaoPts, vaoNone, buf, maxPoint = 64;
  const MAXS = 6000, data = new Float32Array(MAXS * 6), MAXF = 6;
  const stars = [], rockets = [], flashes = [];
  let ok = false;

  const VS_TRI = `#version 300 es
    out vec2 vUv;
    void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const FS_FADE = `#version 300 es
    precision mediump float; out vec4 o; void main(){ o = vec4(0.0); }`;
  const VS_PTS = `#version 300 es
    layout(location = 0) in vec2 aPos; layout(location = 1) in vec3 aCol; layout(location = 2) in float aSize;
    uniform vec2 uView; uniform float uPR, uMax; out vec3 vCol;
    void main(){
      vCol = aCol;
      gl_Position = vec4(aPos.x / uView.x * 2.0 - 1.0, 1.0 - aPos.y / uView.y * 2.0, 0.0, 1.0);
      gl_PointSize = min(aSize * uPR, uMax);
    }`;
  const FS_PTS = `#version 300 es
    precision highp float; in vec3 vCol; out vec4 o;
    void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0) discard;
      o = vec4(vCol * (exp(-r2 * 7.0) + exp(-r2 * 2.0) * 0.15), 1.0); }`;
  const FS_COMP = `#version 300 es
    precision highp float; in vec2 vUv; out vec4 o;
    uniform sampler2D tTrail; uniform vec2 uView; uniform vec4 uFl[${MAXF}]; uniform vec3 uFc[${MAXF}];
    void main(){
      vec3 h = texture(tTrail, vUv).rgb;
      h += textureLod(tTrail, vUv, 2.0).rgb * 0.45 + textureLod(tTrail, vUv, 4.0).rgb * 0.5 + textureLod(tTrail, vUv, 6.0).rgb * 0.65;
      vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uView;
      for (int i = 0; i < ${MAXF}; i++) {
        vec4 f = uFl[i]; if (f.w <= 0.0) continue;
        float d = length(p - f.xy) / f.z;
        h += uFc[i] * f.w * (exp(-d * d * 2.5) * 0.3 + exp(-d * d * 28.0) * 0.9);
      }
      vec3 c = 1.0 - exp(-h * 1.15);
      o = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
    }`;

  function compile(vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  function makeTarget() {
    if (tex) gl.deleteTexture(tex);
    if (fbo) gl.deleteFramebuffer(fbo);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(TW, TH))) + 1, half ? gl.RGBA16F : gl.RGBA8, TW, TH);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && half) { half = false; makeTarget(); return; }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, w < 700 ? 1.25 : 1.5);
    if (Math.abs(w - W) < 1 && Math.abs(h - H) < 1 && pr === PR && tex) return;
    W = w; H = h; PR = pr;
    canvas.width = TW = Math.max(1, Math.round(W * PR));
    canvas.height = TH = Math.max(1, Math.round(H * PR));
    if (ok) makeTarget();
  }

  function setup() {
    half = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    maxPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64;
    pPts = compile(VS_PTS, FS_PTS); pFade = compile(VS_TRI, FS_FADE); pComp = compile(VS_TRI, FS_COMP);
    vaoNone = gl.createVertexArray();
    vaoPts = gl.createVertexArray();
    gl.bindVertexArray(vaoPts);
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20);
    gl.bindVertexArray(null);
    ok = true;
    makeTarget();
  }

  // ── fireworks ───────────────────────────────────────────────────────
  const scale = () => Math.min(W, H) / 640;
  function star(o) { if (stars.length < MAXS) stars.push(Object.assign({ t: 0, drag: 1.4, g: 46 * scale(), size: 2.6, i0: 4, trail: 0 }, o)); }

  function burst(x, y, o) {
    o = o || {};
    const s = scale(), small = W < 700;
    const kind = o.kind || pick(KINDS);
    const pal = o.pal || (kind === 'willow' ? ['gold'] : kind === 'glitter' ? ['white', 'silver'] : pick(PALETTES));
    const R = o.R || rand(150, 210) * s;
    const k = (o.n || 1) * (small ? 0.7 : 1);
    const n = Math.round((kind === 'ring' ? 70 : kind === 'crossette' ? 26 : kind === 'willow' ? 110 : 150) * k);
    const tiltA = rand(0, TAU), tiltB = rand(0.25, 1);
    for (let i = 0; i < n; i++) {
      let vx, vy;
      if (kind === 'ring') {
        const a = (i / n) * TAU, cx = Math.cos(a), cy = Math.sin(a) * tiltB;
        vx = cx * Math.cos(tiltA) - cy * Math.sin(tiltA); vy = cx * Math.sin(tiltA) + cy * Math.cos(tiltA);
      } else {                                                   // a sphere of stars, seen from the side
        const u = rand(-1, 1), th = rand(0, TAU), q = Math.sqrt(1 - u * u);
        vx = q * Math.cos(th); vy = q * Math.sin(th);
        if (kind !== 'willow') { const j = rand(0.92, 1.04); vx *= j; vy *= j; }
      }
      const sp = R * (kind === 'willow' ? 1.25 : 1.55);
      star({
        x, y, vx: vx * sp, vy: vy * sp, col: COLORS[pal[i % pal.length]],
        life: kind === 'willow' ? rand(3.2, 4.2) : kind === 'glitter' ? rand(1.8, 2.4) : rand(1.5, 2.1),
        drag: kind === 'willow' ? 1.7 : 1.9, g: (kind === 'willow' ? 34 : 52) * s,
        i0: kind === 'willow' ? 3.2 : 4.5, size: kind === 'willow' ? 2.4 : 2.8,
        trail: kind === 'willow' ? 0.9 : kind === 'chrys' ? 0.55 : 0,
        split: kind === 'crossette', glitter: kind === 'glitter'
      });
    }
    if (kind === 'pistil') {                                      // a bright inner core in a second colour
      const c = COLORS[pick(['white', 'gold', 'rose'])];
      for (let i = 0; i < 50 * k; i++) {
        const u = rand(-1, 1), th = rand(0, TAU), q = Math.sqrt(1 - u * u);
        star({ x, y, vx: q * Math.cos(th) * R * 0.75, vy: q * Math.sin(th) * R * 0.75, col: c, life: rand(1.0, 1.4), i0: 5, g: 52 * s });
      }
    }
    flashes.push({ x, y, r: R * 2.2, t: 0, dur: 0.18, col: COLORS[pal[0]], i: (kind === 'willow' ? 1.6 : 2.4) * (o.flash || 1) });
    if (flashes.length > MAXF) flashes.shift();
    o.onBurst && o.onBurst();
    wake();
  }

  function launch(x0, y0, tx, ty, dur, o) {
    rockets.push({ x: x0, y: y0, x0, y0, tx, ty, t: 0, dur: dur || rand(1.0, 1.4), wob: rand(0, TAU), o: o || {} });
    wake();
  }

  function step(dt) {
    const s = scale();
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.t += dt;
      const u = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - u, 2.2);
      r.x = r.x0 + (r.tx - r.x0) * e + Math.sin(r.t * 9 + r.wob) * 1.2 * s;
      r.y = r.y0 + (r.ty - r.y0) * e;
      if (Math.random() < dt * 42) star({ x: r.x, y: r.y + 2, vx: rand(-14, 14) * s, vy: rand(10, 40) * s, col: COLORS.amber, life: rand(0.25, 0.5), i0: 1.6, size: 1.8, drag: 3, g: 60 * s });
      if (u >= 1) { rockets.splice(i, 1); burst(r.tx, r.ty, r.o); }
    }
    for (let i = stars.length - 1; i >= 0; i--) {
      const p = stars[i]; p.t += dt;
      if (p.t >= p.life) {
        stars.splice(i, 1);
        if (p.split) for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.atan2(p.vy, p.vx);
          star({ x: p.x, y: p.y, vx: Math.cos(a) * 90 * s, vy: Math.sin(a) * 90 * s, col: p.col, life: rand(0.7, 1.0), i0: 3.5, size: 2.2, g: 46 * s });
        }
        continue;
      }
      if (p.split && p.t > p.life * 0.45) { p.t = p.life; continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.trail && Math.random() < p.trail * dt * 60) {
        star({ x: p.x, y: p.y, vx: p.vx * 0.05, vy: p.vy * 0.05, col: COLORS.amber, life: rand(0.8, 1.8), i0: 0.9, size: 1.6, drag: 2.5, g: 30 * s });
      }
    }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t > flashes[i].dur) flashes.splice(i, 1); }
  }

  function upload() {
    let n = 0;
    for (const r of rockets) { data.set([r.x, r.y, 3.2, 2.2, 1.2, 3.2], n * 6); n++; }
    for (const p of stars) {
      if (n >= MAXS) break;
      const u = p.t / p.life;
      let i = p.i0 * (u < 0.7 ? 1 - u * 0.4 : (1 - u) * 2.4);            // bright, then burning out
      if (p.glitter && u > 0.35) i *= Math.random() < 0.45 ? 2.2 : 0.05;  // strobing glitter
      else if (u > 0.75 && Math.random() < 0.25) i *= 0.35;               // flicker as they die
      const o = n * 6;
      data[o] = p.x; data[o + 1] = p.y;
      data[o + 2] = p.col[0] * i; data[o + 3] = p.col[1] * i; data[o + 4] = p.col[2] * i;
      data[o + 5] = p.size * (1 - u * 0.35);
      n++;
    }
    if (n) { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 6); }
    return n;
  }

  const flU = new Float32Array(MAXF * 4), flC = new Float32Array(MAXF * 3);
  function render(dt) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, TW, TH);
    gl.enable(gl.BLEND);
    // 1. the long exposure: last frame's light fades a little
    const d = Math.pow(0.86, dt * 60);
    gl.blendColor(d, d, d, d);
    gl.blendFunc(gl.ZERO, gl.CONSTANT_COLOR);
    gl.useProgram(pFade);
    gl.bindVertexArray(vaoNone);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2. this frame's sparks, added in HDR
    const n = upload();
    if (n) {
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(pPts);
      gl.uniform2f(gl.getUniformLocation(pPts, 'uView'), W, H);
      gl.uniform1f(gl.getUniformLocation(pPts, 'uPR'), PR);
      gl.uniform1f(gl.getUniformLocation(pPts, 'uMax'), maxPoint);
      gl.bindVertexArray(vaoPts);
      gl.drawArrays(gl.POINTS, 0, n);
    }
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // 3. mipmaps for the glow
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    // 4. glow, flashes, tone mapping, over the page
    flU.fill(0);
    flashes.forEach((f, i) => { const u = f.t / f.dur; flU.set([f.x, f.y, f.r, f.i * Math.pow(1 - u, 2)], i * 4); flC.set(f.col, i * 3); });
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(pComp);
    gl.uniform1i(gl.getUniformLocation(pComp, 'tTrail'), 0);
    gl.uniform2f(gl.getUniformLocation(pComp, 'uView'), W, H);
    gl.uniform4fv(gl.getUniformLocation(pComp, 'uFl'), flU);
    gl.uniform3fv(gl.getUniformLocation(pComp, 'uFc'), flC);
    gl.bindVertexArray(vaoNone);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ── the loop: runs only while something is in the air ───────────────
  let raf = 0, last = 0, quiet = 0, clock = 0, timeline = [];
  function frame(now) {
    // the show keeps real time even on a slow device: physics takes up to four small steps a frame
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now; clock += dt;
    while (timeline.length && timeline[0].t <= clock) timeline.shift().fn();
    if (ok) {
      const n = Math.min(4, Math.max(1, Math.ceil(dt / 0.034)));
      for (let i = 0; i < n; i++) step(dt / n);
      render(dt);
    }
    const busy = stars.length || rockets.length || flashes.length || timeline.length;
    quiet = busy ? 0 : quiet + dt;
    if (quiet > 2.5) {                                           // the streaks have faded: rest until the next tap
      if (ok) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clear(gl.COLOR_BUFFER_BIT);
      }
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  function wake() {
    quiet = 0;
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  // ── a tap anywhere: a firework where the finger or cursor landed ────
  let down = null, recent = [];
  function onDown(e) {
    if (!e.isPrimary || e.button > 0) { down = null; return; }
    down = { x: e.clientX, y: e.clientY, t: performance.now(), el: e.target };
  }
  function onUp(e) {
    const d = down; down = null;
    if (!d || !e.isPrimary || !ok || !root.classList.contains('diwali')) return;
    if (performance.now() - d.t > 450 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;   // a scroll or a drag
    if (d.el && d.el.closest && d.el.closest('input, textarea, select, option, label, [contenteditable], .cookie-banner, .dw-toggle')) return;
    const now = performance.now();
    recent = recent.filter(t => now - t < 1200); recent.push(now);
    const busy = Math.min(1, 2.4 / recent.length);               // rapid tapping: smaller shells, never a white-out
    burst(e.clientX, e.clientY, { R: rand(0.75, 1) * Math.max(90, Math.min(210, Math.min(W, H) * 0.24)), n: busy });
  }

  // ── the opening: one rocket in the dark, gold over the name, then the page ──
  function opening() {
    if (!root.classList.contains('dw-opening')) return;
    keep(() => sessionStorage.setItem('seleqt_dw_open', '1'));
    if (performance.now() > 6000) {                                // a very slow load: don't keep anyone in the dark
      root.classList.add('dw-reveal');
      setTimeout(() => root.classList.remove('dw-opening', 'dw-reveal'), 1100);
      return;
    }
    root.classList.add('dw-live');                                 // the show has started: the cover's safety timer stands down
    const el = document.createElement('div');
    el.className = 'dw-open';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="dw-open-mark">SELEQT</div><div class="dw-open-sub">Shubh Deepavali</div>';
    document.body.appendChild(el);
    const s = Math.min(W, H), small = W < 700;
    let done = false;
    function reveal() {
      if (done) return;
      done = true;
      el.classList.add('is-out');
      root.classList.add('dw-reveal');
      setTimeout(() => { root.classList.remove('dw-opening', 'dw-reveal', 'dw-live'); el.remove(); }, 1100);
    }
    const lit = () => el.classList.add('is-lit');
    timeline = [
      { t: 0.25, fn: () => launch(W * 0.5 + rand(-6, 6), H + 12, W * 0.5, H * 0.36, 1.15, { kind: 'willow', pal: ['gold'], R: s * 0.5, n: 1.6, flash: 1.3, onBurst: lit }) },
      { t: 1.25, fn: () => launch(W * 0.18, H + 12, W * (small ? 0.22 : 0.2), H * 0.24, 1.0, { kind: 'peony', pal: ['gold', 'white'], R: s * 0.24 }) },
      { t: 1.55, fn: () => launch(W * 0.84, H + 12, W * (small ? 0.78 : 0.8), H * 0.2, 1.0, { kind: 'chrys', pal: ['rose', 'gold'], R: s * 0.26 }) },
      { t: 2.15, fn: () => launch(W * 0.62, H + 12, W * 0.66, H * 0.14, 0.9, { kind: 'glitter', R: s * 0.2, n: 0.8 }) },
      { t: 3.35, fn: reveal }
    ].map(e => ({ t: clock + e.t, fn: e.fn }));
    if (!ok) { lit(); timeline = [{ t: clock + 2.2, fn: reveal }]; }   // no WebGL: the name alone, then the page
    const skip = () => { if (!done) { timeline = timeline.filter(e => e.fn !== reveal); reveal(); } };
    ['pointerdown', 'keydown', 'wheel', 'touchmove'].forEach(ev => window.addEventListener(ev, skip, { once: true, passive: true }));
    setTimeout(skip, 5000);                                        // however slow the device, the page is never held back
    wake();
  }

  function init() {
    document.body.appendChild(canvas);
    resize();
    if (gl) { try { setup(); } catch (e) { ok = false; } }
    window.addEventListener('resize', () => { if (ok) resize(); }, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', () => { down = null; }, { passive: true });
    window.SELEQT_FX = { burst, launch };
    opening();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
