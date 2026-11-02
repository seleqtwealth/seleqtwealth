/* ==========================================================================
   /diwali sound: a raga bell, tanpura drone, sitar-like plucks and firework
   sounds, all synthesised in the browser (no samples, nothing to license),
   plus the page's sound switch. The visuals are WebGL scenes in /diwali-webgl.js.
   ========================================================================== */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Raag Yaman (all notes natural except a sharp Ma), just intonation
  const YAMAN = [1, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 5 / 3, 15 / 8];

  // ── Shared sound engine ──────────────────────────────────────────────
  const Sound = (function () {
    let ctx = null, dry = null, wet = null, master = null, rec = null, on = true;
    function impulse(c, secs, decay) {
      const n = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
      return b;
    }
    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.25;
        master = ctx.createGain(); master.gain.value = on ? 0.9 : 0;
        dry = ctx.createGain();
        wet = ctx.createGain(); wet.gain.value = 0.3;
        const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 3.2, 2.6);
        dry.connect(comp); wet.connect(verb); verb.connect(comp);
        comp.connect(master); master.connect(ctx.destination);
        if (ctx.createMediaStreamDestination) { rec = ctx.createMediaStreamDestination(); master.connect(rec); }
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function route(node, send) {
      node.connect(dry);
      if (send) { const g = ctx.createGain(); g.gain.value = send; node.connect(g); g.connect(wet); }
    }
    function panned(pan) {
      if (!ctx.createStereoPanner) return null;
      const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); return p;
    }
    return {
      ensure, route, panned,
      get ctx() { return ctx; },
      get on() { return on; },
      set(v) { on = v; if (master) master.gain.setTargetAtTime(v ? 0.9 : 0, ctx.currentTime, 0.05); },
      stream() { return rec && rec.stream; }
    };
  })();
  // browsers only allow sound after a gesture: wake the engine on the first one
  ['pointerdown', 'keydown', 'touchend'].forEach(ev =>
    document.addEventListener(ev, () => Sound.ensure(), { capture: true, passive: true }));

  // a soft glass-and-bronze bell
  function bell(f, vel, pan) {
    const c = Sound.ctx; if (!c || !Sound.on) return;
    const t = c.currentTime + 0.01;
    const bus = c.createGain();
    const p = Sound.panned(pan);
    if (p) { bus.connect(p); Sound.route(p, 0.9); } else Sound.route(bus, 0.9);
    [[1, 1, 3.4], [2, 0.38, 2.2], [3.01, 0.16, 1.4], [4.17, 0.08, 0.9], [5.43, 0.045, 0.6]].forEach(([r, a, d]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f * r;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a * vel * 0.2, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + d + 0.05);
    });
  }

  // tanpura: Pa, Sa, Sa, low Sa, plucked over and over
  function startDrone(sa) {
    const c = Sound.ensure(); if (!c) return null;
    const notes = [sa * 0.75, sa, sa, sa / 2];
    let i = 0, next = c.currentTime + 0.1, alive = true;
    const bus = c.createGain(); bus.gain.value = 0;
    bus.gain.setTargetAtTime(1, c.currentTime, 0.8);
    Sound.route(bus, 0.6);
    function pluck(f, t) {
      const g = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 6;
      lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(600, t + 2.5);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
      [0, 0.35].forEach(det => {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det * 10;
        o.connect(lp); o.start(t); o.stop(t + 4.3);
      });
      lp.connect(g); g.connect(bus);
    }
    const timer = setInterval(() => {
      if (!alive) return;
      while (next < c.currentTime + 0.5) { pluck(notes[i % 4], next); next += 1.05; i++; }
    }, 200);
    return {
      stop() {
        alive = false; clearInterval(timer);
        bus.gain.setTargetAtTime(0, c.currentTime, 0.4);
        setTimeout(() => bus.disconnect(), 2500);
      }
    };
  }

  // Karplus-Strong pluck with a gentle buzz, rendered once per note
  const ksCache = new Map();
  function ksBuffer(f) {
    const c = Sound.ctx; if (!c) return null;
    const key = Math.round(f * 100);
    if (ksCache.has(key)) return ksCache.get(key);
    const rate = c.sampleRate, n = Math.floor(rate * 2.6), buf = c.createBuffer(1, n, rate), d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(rate / f)), line = new Float32Array(N);
    for (let i = 0; i < N; i++) line[i] = (Math.random() * 2 - 1) * (i < N * 0.6 ? 1 : 0.5);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      let v = 0.4985 * (cur + line[(idx + 1) % N]);
      if (v > 0.22) v = 0.22 + (v - 0.22) * 0.3;   // the jawari buzz of a sitar bridge
      line[idx] = v; d[i] = cur * 0.6; idx = (idx + 1) % N;
    }
    for (let i = n - 2000; i < n; i++) d[i] *= (n - i) / 2000;
    ksCache.set(key, buf);
    return buf;
  }
  function pluck(f, vel, pan) {
    const c = Sound.ctx; if (!c || !Sound.on) return;
    const b = ksBuffer(f); if (!b) return;
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = b; g.gain.value = clamp(vel, 0.15, 1) * 0.8;
    const p = Sound.panned(pan);
    s.connect(g);
    if (p) { g.connect(p); Sound.route(p, 0.5); } else Sound.route(g, 0.5);
    s.start();
  }

  // short noise bursts: sparkler crackle, firework thump, anaar hiss
  let noiseBuf = null;
  function noise() {
    const c = Sound.ctx; if (!c) return null;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function burstSound(kind, pan, delay) {
    const c = Sound.ctx; if (!c || !Sound.on || c.state !== 'running') return;
    const t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noise(); s.loop = true;
    const p = Sound.panned(pan);
    if (kind === 'thump') {
      f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.9);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      const o = c.createOscillator(), og = c.createGain();
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
      og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(og); og.connect(p || g); o.start(t); o.stop(t + 0.7);
      s.start(t, Math.random()); s.stop(t + 1.2);
    } else if (kind === 'crackle') {
      f.type = 'highpass'; f.frequency.value = 2500;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(rand(0.04, 0.12), t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      s.start(t, Math.random()); s.stop(t + 0.05);
    } else if (kind === 'hiss-short') {   // a rocket leaving
      f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.7;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      s.start(t, Math.random()); s.stop(t + 1.2);
    } else {   // hiss
      f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.8;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.15); g.gain.setValueAtTime(0.08, t + 2.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      s.start(t, Math.random()); s.stop(t + 3.3);
    }
    s.connect(f); f.connect(g);
    if (p) { g.connect(p); Sound.route(p, 0.5); } else Sound.route(g, 0.5);
  }

  // the stages themselves are WebGL scenes in /diwali-webgl.js; they borrow this sound
  window.SELEQT_DW = { Sound, burstSound, bell, pluck, startDrone };

  // sound switch for the page
  const sw = document.createElement('button');
  sw.type = 'button';
  sw.className = 'dwp-sound';
  sw.setAttribute('aria-pressed', 'true');
  sw.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#d4b06a" stroke-width="1.6"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#d4b06a" stroke="none"/><path class="dwp-wave" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg><span>Sound on</span>';
  sw.addEventListener('click', () => {
    const on = !Sound.on;
    Sound.ensure(); Sound.set(on);
    sw.setAttribute('aria-pressed', on ? 'true' : 'false');
    sw.querySelector('span').textContent = on ? 'Sound on' : 'Sound off';
  });
  document.body.appendChild(sw);
})();

/* ── 05 Gujarat After Dark: real satellite night lights, year by year ──
   Reads /images/diwali/nightlights/data.json (built from NASA imagery). */
(function () {
  const box = document.querySelector('#night-lights [data-nl]');
  if (!box) return;
  const stage = box.querySelector('.dwp-nl-stage');
  const slider = box.querySelector('input[type=range]');
  const out = box.querySelector('output');
  const yearEl = box.querySelector('.dwp-nl-year');
  const list = box.querySelector('.dwp-nl-side ul');
  const play = box.querySelector('[data-act="play"]');
  fetch('/images/diwali/nightlights/data.json').then(r => r.json()).then(data => {
    const years = data.years;
    const imgs = new Map();
    function img(y) {
      if (!imgs.has(y)) {
        const i = new Image();
        i.alt = '';
        i.decoding = 'async';
        i.src = '/images/diwali/nightlights/gujarat-' + y + '.webp';
        stage.insertBefore(i, yearEl);
        imgs.set(y, i);
      }
      return imgs.get(y);
    }
    data.cities.forEach(c => {
      const p = document.createElement('span');
      p.className = 'dwp-nl-pin' + (c.left ? ' is-left' : '') + (c.minor ? ' is-minor' : '');
      p.style.left = (c.x * 100) + '%';
      p.style.top = (c.y * 100) + '%';
      p.innerHTML = '<span>' + c.name + '</span>';
      stage.appendChild(p);
    });
    list.innerHTML = data.growth.map(g => '<li><span>' + g.name + '</span><b>' + g.label + '</b></li>').join('');
    slider.min = 0; slider.max = years.length - 1; slider.step = 1;
    let cur = -1;
    function show(i) {
      i = Math.max(0, Math.min(years.length - 1, i));
      if (i === cur) return;
      cur = i;
      const y = years[i];
      imgs.forEach((el, k) => el.classList.toggle('is-on', k === y));
      img(y).classList.add('is-on');
      if (years[i + 1]) img(years[i + 1]);          // preload the next year
      slider.value = i; out.textContent = y; yearEl.textContent = y;
    }
    slider.addEventListener('input', () => { stop(); show(+slider.value); });
    let timer = 0;
    function stop() { clearInterval(timer); timer = 0; play && (play.textContent = 'Play the years'); }
    play && play.addEventListener('click', () => {
      if (timer) return stop();
      if (cur >= years.length - 1) show(0);
      play.textContent = 'Pause';
      timer = setInterval(() => { if (cur >= years.length - 1) stop(); else show(cur + 1); }, 1100);
    });
    show(0);
    // play once when it first comes into view
    new IntersectionObserver((es, o) => {
      if (es[0].isIntersecting && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) { o.disconnect(); play && play.click(); }
    }, { threshold: 0.5 }).observe(stage);
  }).catch(() => { box.hidden = true; });
})();
