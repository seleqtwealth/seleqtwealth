/* ==========================================================================
   Diwali night decorations (6 to 11 November 2026)
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

  // ── Hero photos: towers light up, a lamp glows behind the jali ────────
  function heroLights(on) {
    document.querySelectorAll('.dw-lights, .dw-jali-light').forEach(n => n.remove());
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
    const jali = document.querySelector('.hero-photo--jali .hero-photo');
    if (jali) {
      const lamp = document.createElement('div');
      lamp.className = 'dw-jali-light';
      jali.insertBefore(lamp, jali.querySelector('.hero-photo-glow'));
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

  // ── The switch ────────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dw-toggle';
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path class="dw-flame" d="M12 3.5c2.1 2.9 3.1 5 3.1 6.8a3.1 3.1 0 0 1-6.2 0c0-1.8 1-3.9 3.1-6.8z" fill="#f2c25c"/>' +
      '<path d="M2.8 14.6h18.4c0 3.3-4.1 5.9-9.2 5.9s-9.2-2.6-9.2-5.9z" fill="#b8924e"/>' +
      '<path d="M7 14.6c1.4-1.1 3.1-1.6 5-1.6s3.6.5 5 1.6" fill="none" stroke="#d4b06a" stroke-width=".9"/>' +
    '</svg>' +
    '<span>Shubh Deepavali</span><span class="dw-toggle-state"></span>';
  const state = btn.querySelector('.dw-toggle-state');

  function apply(on) {
    root.classList.toggle('diwali', on);
    torans(on);
    heroLights(on);
    if (on) startSky(); else if (sky) sky.stop();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
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

  function init() {
    document.body.appendChild(btn);
    apply(root.classList.contains('diwali'));
    // where a hero carries a photo credit, wait until the hero is scrolled past
    // so the switch never sits on top of the credit line
    if (document.querySelector('.hero-credit')) {
      const show = () => btn.classList.toggle('is-in', window.scrollY > window.innerHeight * 0.5);
      window.addEventListener('scroll', show, { passive: true });
      show();
    } else {
      setTimeout(() => btn.classList.add('is-in'), 1200);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
