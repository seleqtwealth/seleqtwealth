/* ==========================================================================
   Diwali night decorations (3 to 11 November 2026)
   Loaded by main.js only when the head script has marked the festival
   (html.diwali-season). html.diwali means the lights are on; the visitor can
   switch them off with the "Shubh Deepavali" button, remembered on this device.
   ========================================================================== */
(function () {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const keep = fn => { try { fn(); } catch (e) { /* storage blocked */ } };
  let sky = null;

  // ── Toran: a marigold garland along the top of each section ──────────
  function torans(on) {
    document.querySelectorAll('.dw-toran').forEach(t => t.remove());
    document.querySelectorAll('[data-dw-pos]').forEach(el => { el.style.position = ''; el.removeAttribute('data-dw-pos'); });
    if (!on) return;
    document.querySelectorAll('section, footer.footer, .article-body, .article-footer').forEach(el => {
      if (el.matches('.hero, #hero, .sub-hero, .article-header')) return;
      if (el.parentElement && el.parentElement.closest('section, .article-body')) return;
      if (el.offsetHeight < 140) return;
      if (getComputedStyle(el).position === 'static') { el.style.position = 'relative'; el.setAttribute('data-dw-pos', ''); }
      const t = document.createElement('div');
      t.className = 'dw-toran';
      t.setAttribute('aria-hidden', 'true');
      el.insertBefore(t, el.firstChild);
    });
  }

  // ── Hero photos: towers light up, diyas light the banyan ──────────────
  function heroLights(on) {
    document.querySelectorAll('.dw-lights, .dw-banyan-light, .dw-banyan-bark').forEach(n => n.remove());
    if (!on) return;
    const gift = document.querySelector('.hero-photo--gift .hero-photo');
    if (gift) {
      ['a', 'b'].forEach(v => {
        const img = new Image();
        img.className = 'dw-lights dw-lights--' + v;
        img.alt = '';
        img.decoding = 'async';
        img.src = '/images/diwali/gift-lights-' + v + '.webp';
        gift.appendChild(img);
      });
    }
    const banyan = document.querySelector('.hero-photo--banyan .hero-photo');
    if (banyan) {
      ['dw-banyan-light', 'dw-banyan-bark'].forEach(cls => {
        const layer = document.createElement('div');
        layer.className = cls;
        banyan.insertBefore(layer, banyan.querySelector('.hero-photo-glow'));
      });
    }
  }

  // ── Sky lanterns drifting up, and embers trailing the cursor ──────────
  function startSky() {
    if (reduce || sky) return;
    const c = document.createElement('canvas');
    c.id = 'dw-sky';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    let W = 0, H = 0;
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener('resize', size);

    const small = W < 760;
    const lanterns = [];
    const embers = [];
    function lantern(initial) {
      // mostly in the side margins, so they rarely cross the text
      const band = Math.max(56, W * 0.16);
      const x = Math.random() < 0.88
        ? (Math.random() < 0.5 ? Math.random() * band : W - Math.random() * band)
        : Math.random() * W;
      lanterns.push({
        x,
        y: initial ? H * (0.3 + Math.random() * 0.75) : H + 30 + Math.random() * 80,
        s: (small ? 7 : 9) + Math.random() * (small ? 5 : 8),
        vy: 8 + Math.random() * 12,
        ph: Math.random() * 6.28,
        amp: 5 + Math.random() * 10,
        fl: Math.random() * 10
      });
    }
    for (let i = 0; i < (small ? 5 : 9); i++) lantern(true);

    function drawLantern(l, t) {
      const x = l.x + Math.sin(t * 0.35 + l.ph) * l.amp, y = l.y, s = l.s;
      const a = Math.min(1, Math.max(0, (y - 70) / (H * 0.3))) * Math.min(1, Math.max(0, (H + 40 - y) / 90));
      if (a <= 0) return;
      const f = 0.85 + 0.15 * Math.sin(t * 7 + l.fl) * Math.sin(t * 3.1 + l.fl * 2);
      const halo = ctx.createRadialGradient(x, y + s * 0.2, 0, x, y + s * 0.2, s * 3.2);
      halo.addColorStop(0, 'rgba(255,190,100,' + (0.3 * a * f) + ')');
      halo.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(x, y + s * 0.2, s * 3.2, 0, 6.2832); ctx.fill();
      const tw = s * 0.62, bw = s * 0.86, h = s * 1.25;
      const body = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
      body.addColorStop(0, 'rgba(214,120,48,' + (0.72 * a) + ')');
      body.addColorStop(1, 'rgba(255,214,140,' + (0.95 * a * f) + ')');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x - tw / 2, y - h / 2);
      ctx.lineTo(x + tw / 2, y - h / 2);
      ctx.quadraticCurveTo(x + bw / 2 + s * 0.08, y, x + bw / 2, y + h / 2);
      ctx.lineTo(x - bw / 2, y + h / 2);
      ctx.quadraticCurveTo(x - bw / 2 - s * 0.08, y, x - tw / 2, y - h / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,238,195,' + (0.9 * a * f) + ')';
      ctx.beginPath(); ctx.ellipse(x, y + h / 2 - s * 0.07, s * 0.16, s * 0.1, 0, 0, 6.2832); ctx.fill();
    }

    function onMove(e) {
      if (embers.length > 80) return;
      for (let i = 0; i < 2; i++) {
        embers.push({
          x: e.clientX + (Math.random() - 0.5) * 6,
          y: e.clientY + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 22,
          vy: -14 - Math.random() * 26,
          t: 0,
          max: 0.6 + Math.random() * 0.7,
          r: 0.7 + Math.random() * 1.5
        });
      }
    }
    if (fine) window.addEventListener('pointermove', onMove, { passive: true });

    let raf = 0, last = performance.now();
    const t0 = last;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      for (let i = lanterns.length - 1; i >= 0; i--) {
        const l = lanterns[i];
        l.y -= l.vy * dt;
        if (l.y < -40) { lanterns.splice(i, 1); lantern(false); continue; }
        drawLantern(l, t);
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const p = embers[i];
        p.t += dt;
        if (p.t > p.max) { embers.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97;
        const k = 1 - p.t / p.max;
        ctx.fillStyle = 'rgba(255,' + (176 + Math.round(64 * k)) + ',' + (90 + Math.round(70 * k)) + ',' + (0.85 * k) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + 0.4 * k), 0, 6.2832); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    function onVis() {
      cancelAnimationFrame(raf);
      if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }
    document.addEventListener('visibilitychange', onVis);

    sky = {
      stop() {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', size);
        window.removeEventListener('pointermove', onMove);
        document.removeEventListener('visibilitychange', onVis);
        c.remove();
        sky = null;
      }
    };
  }

  // ── The switch: "Shubh Deepavali" opens the night-lights map, the state toggles ──
  const pill = document.createElement('div');
  pill.className = 'dw-toggle';
  pill.innerHTML =
    '<a class="dw-toggle-link" href="/#night-lights">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path class="dw-flame" d="M12 3.5c2.1 2.9 3.1 5 3.1 6.8a3.1 3.1 0 0 1-6.2 0c0-1.8 1-3.9 3.1-6.8z" fill="#f2c25c"/>' +
        '<path d="M2.8 14.6h18.4c0 3.3-4.1 5.9-9.2 5.9s-9.2-2.6-9.2-5.9z" fill="#b8924e"/>' +
        '<path d="M7 14.6c1.4-1.1 3.1-1.6 5-1.6s3.6.5 5 1.6" fill="none" stroke="#d4b06a" stroke-width=".9"/>' +
      '</svg>' +
      '<span>Shubh Deepavali</span>' +
    '</a>' +
    '<button type="button" class="dw-toggle-state"></button>';
  const btn = pill.querySelector('.dw-toggle-state');
  const state = btn;

  function apply(on) {
    root.classList.toggle('diwali', on);
    nightLights(on);
    torans(on);
    gilt(on);
    heroLights(on);
    if (on) startSky(); else if (sky) sky.stop();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    pill.classList.toggle('is-off', !on);
    btn.setAttribute('aria-label', on ? 'Diwali lights are on. Switch them off' : 'Diwali lights are off. Switch them on');
    state.textContent = on ? 'Lights on' : 'Lights off';
  }

  btn.addEventListener('click', () => {
    const on = !root.classList.contains('diwali');
    keep(() => {
      if (on) { localStorage.removeItem('seleqt_dw_off'); sessionStorage.setItem('seleqt_dw', 'on'); }
      else { localStorage.setItem('seleqt_dw_off', '1'); sessionStorage.removeItem('seleqt_dw'); }
    });
    apply(on);
    window.seleqtTrack && window.seleqtTrack('diwali_lights', { on: on });
  });

  // ── Gilded words: each heading's gold leaf glints on its own clock ──
  const GILT = '.section-title em, .hero .hero-title em.italic, .hero-title-center em.italic, .principle h3 em, .sub-hero h1 em, ' +
    '.faq-heading em, .about-principle h3 em, .team-title em, .sub-cta-section h3 em, .insight-title em, .article-title em, ' +
    '.xp-title em, .xp-panel h3 em, .gc-hook-head h2 em, .gf-head h2 em, .dw-nl-title em';
  function gilt(on) {
    document.querySelectorAll(GILT).forEach(el => {
      if (!on) { el.style.removeProperty('--gl-d'); el.style.removeProperty('--gl-x'); return; }
      el.style.setProperty('--gl-d', (-Math.random() * 11).toFixed(2) + 's');
      el.style.setProperty('--gl-x', Math.round(Math.random() * 100) + '%');
    });
  }

  // ── Gujarat After Dark: satellite night lights under the homepage hero ──
  // Reads /images/diwali/nightlights/data.json (built from NASA imagery).
  let nlReady = false;
  function nightLights(on) {
    const sec = document.getElementById('night-lights');
    if (!sec) return;
    sec.hidden = !on;
    if (!on || nlReady) return;
    nlReady = true;
    const box = sec.querySelector('[data-nl]');
    const stage = box.querySelector('.dw-nl-stage');
    const slider = box.querySelector('input[type=range]');
    const out = box.querySelector('output');
    const yearEl = box.querySelector('.dw-nl-year');
    const list = box.querySelector('.dw-nl-side ul');
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
        p.className = 'dw-nl-pin' + (c.left ? ' is-left' : '') + (c.minor ? ' is-minor' : '');
        p.style.left = (c.x * 100) + '%';
        p.style.top = (c.y * 100) + '%';
        p.innerHTML = '<span>' + c.name + '</span>';
        stage.appendChild(p);
      });
      list.innerHTML = data.growth.map(g => '<li><span>' + g.name + '</span><b>' + g.label + '</b></li>').join('');
      slider.min = 0; slider.max = years.length - 1; slider.step = 1;
      let cur = -1, timer = 0;
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
      function stop() { clearInterval(timer); timer = 0; play.textContent = 'Play the years'; }
      slider.addEventListener('input', () => { stop(); show(+slider.value); });
      play.addEventListener('click', () => {
        if (timer) return stop();
        if (cur >= years.length - 1) show(0);
        play.textContent = 'Pause';
        timer = setInterval(() => { if (cur >= years.length - 1) stop(); else show(cur + 1); }, 1100);
      });
      show(0);
      // play once when it first comes into view
      new IntersectionObserver((es, o) => {
        if (es[0].isIntersecting && !reduce) { o.disconnect(); play.click(); }
      }, { threshold: 0.5 }).observe(stage);
    }).catch(() => { sec.hidden = true; });
  }

  function init() {
    document.body.appendChild(pill);
    apply(root.classList.contains('diwali'));
    // where a hero carries a photo credit, wait until the hero is scrolled past
    // so the switch never sits on top of the credit line
    if (document.querySelector('.hero-credit')) {
      const show = () => pill.classList.toggle('is-in', window.scrollY > window.innerHeight * 0.5);
      window.addEventListener('scroll', show, { passive: true });
      show();
    } else {
      setTimeout(() => pill.classList.add('is-in'), 1200);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
