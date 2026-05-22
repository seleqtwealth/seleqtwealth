/* ============================================
   SELEQT — Main JavaScript
   ============================================ */

// ── Hero Intro (once per session) ──────────
// The <html> element gets .intro-active if the intro should run (set pre-paint
// in <head> based on sessionStorage + prefers-reduced-motion). We add .intro-running
// once everything is ready so the CSS animations begin in sync.
(function setupHeroIntro() {
  const html = document.documentElement;
  if (!html.classList.contains('intro-active')) return;

  function startIntro() {
    // Force a reflow before adding the class so the CSS animations apply cleanly
    void document.body.offsetHeight;
    html.classList.add('intro-running');

    // (Note: the intro now plays on every refresh — the legacy
    // seleqt_intro_played flag was retired with the editorial masthead.)

    // Clean up after the full sequence finishes. Desktop choreography ends at
    // roughly 4350ms (scroll-hint at 3650ms + 700ms duration); mobile is ~3900ms.
    // 4400ms covers both with a small margin before reverting to the steady state.
    setTimeout(() => {
      html.classList.remove('intro-active', 'intro-running');
    }, 4400);
  }

  // Wait for the fonts to load before kicking off — otherwise the stroked SELEQT
  // could draw in fallback font and snap to Cormorant mid-animation.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      // Small additional delay for first-paint settle
      requestAnimationFrame(() => requestAnimationFrame(startIntro));
    });
  } else {
    window.addEventListener('load', startIntro);
  }
})();

// ── Custom Cursor ──────────────────────────
const cursor = document.createElement('div');
cursor.className = 'cursor';
const cursorRing = document.createElement('div');
cursorRing.className = 'cursor-ring';
document.body.appendChild(cursor);
document.body.appendChild(cursorRing);

let mouseX = 0, mouseY = 0;
let ringX = 0, ringY = 0;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  cursor.style.left = mouseX + 'px';
  cursor.style.top = mouseY + 'px';
});

function animateRing() {
  ringX += (mouseX - ringX) * 0.1;
  ringY += (mouseY - ringY) * 0.1;
  cursorRing.style.left = ringX + 'px';
  cursorRing.style.top = ringY + 'px';
  requestAnimationFrame(animateRing);
}
animateRing();

document.querySelectorAll('a, button, .service-card, input, select, textarea').forEach(el => {
  el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
  el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
});

// ── Navbar Scroll ──────────────────────────
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
}

// ── Hamburger Menu ─────────────────────────
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    mobileMenu.classList.toggle('open');
  });
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => mobileMenu.classList.remove('open'));
  });
}

// ── Scroll Reveal ──────────────────────────
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// On mobile, mark every service item as a reveal target with a staggered delay
// so each card slides up into view as the user scrolls.
(function setupMobileServiceReveals() {
  if (window.matchMedia('(min-width: 901px)').matches) return;
  const items = document.querySelectorAll('.sc-item');
  items.forEach((el, i) => {
    el.classList.add('reveal', 'sc-mobile-reveal');
    revealObserver.observe(el);
  });
})();

// ── Parallax Hero Orbs ─────────────────────
const orbs = document.querySelectorAll('.orb');
if (orbs.length) {
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    orbs.forEach((orb, i) => {
      const speed = 0.08 + i * 0.04;
      orb.style.transform = `translateY(${scrollY * speed}px)`;
    });
  }, { passive: true });
}

// ── Hero Title Letter Stagger ──────────────
const heroLines = document.querySelectorAll('.hero-title .line');
heroLines.forEach((line, i) => {
  line.style.animationDelay = `${0.3 + i * 0.18}s`;
});

// ── Smooth section anchor scroll ──────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ── Contact Form ───────────────────────────
// Submits the form to Web3Forms (https://web3forms.com) via fetch so the
// user stays on the page. Shows three states on the submit button:
//   - "Sending…"    while the request is in-flight
//   - "Message Sent ✓" only on confirmed 200 OK from Web3Forms
//   - "Couldn't send — please email us" if anything fails
// On success the form is reset; on failure it's preserved so the visitor
// can copy their message and email it directly.
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = contactForm.querySelector('button[type="submit"]');
    const original = btn.textContent;

    const setState = (label, accent) => {
      btn.textContent = label;
      btn.disabled = true;
      if (accent === 'success') {
        btn.style.background = 'rgba(200,169,110,0.3)';
        btn.style.color = 'var(--gold)';
        btn.style.border = '1px solid var(--gold-dim)';
      } else if (accent === 'error') {
        btn.style.background = 'rgba(180,60,60,0.2)';
        btn.style.color = '#e8a4a4';
        btn.style.border = '1px solid rgba(180,60,60,0.4)';
      } else {
        btn.style.background = '';
        btn.style.color = '';
        btn.style.border = '';
      }
    };
    const resetButton = (delay) => {
      setTimeout(() => {
        btn.textContent = original;
        btn.style.background = '';
        btn.style.color = '';
        btn.style.border = '';
        btn.disabled = false;
      }, delay);
    };

    setState('Sending…', null);

    try {
      const formData = new FormData(contactForm);
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' }
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success !== false) {
        setState('Message Sent ✓', 'success');
        contactForm.reset();
        // Reset the custom-select labels back to placeholder state
        contactForm.querySelectorAll('.custom-select').forEach(sel => {
          const v = sel.querySelector('.cs-value');
          const hidden = sel.querySelector('input[type="hidden"]');
          if (v) {
            v.classList.add('cs-placeholder');
            const original = sel.dataset.name === 'focus' ? 'Select a focus area' : 'Select';
            v.textContent = original;
          }
          if (hidden) hidden.value = '';
          sel.querySelectorAll('.cs-menu li').forEach(o => o.classList.remove('is-selected'));
        });
        resetButton(3500);
      } else {
        console.error('Web3Forms error', data);
        setState("Couldn't send — please email us", 'error');
        resetButton(5000);
      }
    } catch (err) {
      console.error('Contact form network error', err);
      setState("Couldn't send — please email us", 'error');
      resetButton(5000);
    }
  });
}

// ── Service cards stagger on scroll ──────
const serviceCards = document.querySelectorAll('.service-card');
if (serviceCards.length) {
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = parseInt(entry.target.dataset.index || 0) * 80;
        setTimeout(() => entry.target.classList.add('visible'), delay);
        cardObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  serviceCards.forEach(card => {
    card.classList.add('reveal');
    cardObserver.observe(card);
  });
}

// ── Scroll-triggered number counter ───────
function animateCounter(el, target, suffix = '') {
  let start = 0;
  const duration = 1600;
  const step = (timestamp) => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── Pillar cards stagger ───────────────────
const pillars = document.querySelectorAll('.pillar');
if (pillars.length) {
  const pillarObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        pillars.forEach((p, i) => {
          setTimeout(() => {
            p.style.opacity = '1';
            p.style.transform = 'translateY(0)';
          }, i * 100);
        });
        pillarObserver.disconnect();
      }
    });
  }, { threshold: 0.2 });

  pillars.forEach(p => {
    p.style.opacity = '0';
    p.style.transform = 'translateY(30px)';
    p.style.transition = 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)';
  });

  if (pillars[0]) pillarObserver.observe(pillars[0].closest('.why-section') || pillars[0]);
}

// ── Sub-page reveal on load ────────────────
window.addEventListener('load', () => {
  document.querySelectorAll('.reveal').forEach((el, i) => {
    if (isInViewport(el)) {
      setTimeout(() => el.classList.add('visible'), i * 60);
    }
  });
});

function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}

// ── Services: vertical carousel controller ──────────────────────────
(function() {
  const list = document.getElementById('scList');
  if (!list) return;
  const items = Array.from(list.querySelectorAll('.sc-item'));
  if (!items.length) return;

  const indexCurrent = document.getElementById('scIndexCurrent');
  const indexFill = document.getElementById('scIndexFill');
  let lastActive = -1;
  let ticking = false;

  function update() {
    ticking = false;
    const vhMid = window.innerHeight * 0.5;

    // Find item whose center is closest to viewport center
    let bestIdx = 0;
    let bestDist = Infinity;
    const dists = items.map((el, i) => {
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const d = Math.abs(mid - vhMid);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
      return d;
    });

    if (bestIdx !== lastActive) {
      items.forEach((el, i) => {
        el.classList.remove('is-active', 'is-near');
        if (i === bestIdx) el.classList.add('is-active');
        else if (Math.abs(i - bestIdx) === 1) el.classList.add('is-near');
      });
      if (indexCurrent) indexCurrent.textContent = String(bestIdx + 1).padStart(2, '0');
      if (indexFill) {
        const pct = ((bestIdx) / (items.length - 1)) * 100;
        indexFill.style.height = pct.toFixed(1) + '%';
      }
      lastActive = bestIdx;
    }
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  // initial paint after layout settles
  setTimeout(update, 80);
})();


// ── Custom dropdowns ────────────────────────────────────────────────
(function() {
  const selects = document.querySelectorAll('.custom-select');
  selects.forEach(setupSelect);

  // Close any open menus on outside click
  document.addEventListener('click', (e) => {
    selects.forEach(sel => {
      if (!sel.contains(e.target)) closeMenu(sel);
    });
  });

  function setupSelect(sel) {
    const trigger = sel.querySelector('.cs-trigger');
    const menu = sel.querySelector('.cs-menu');
    const value = sel.querySelector('.cs-value');
    const hidden = sel.querySelector('input[type="hidden"]');
    const options = Array.from(menu.querySelectorAll('li'));

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = sel.classList.contains('is-open');
      // close other open menus
      document.querySelectorAll('.custom-select.is-open').forEach(s => { if (s !== sel) closeMenu(s); });
      if (open) closeMenu(sel); else openMenu(sel);
    });

    options.forEach((opt, idx) => {
      opt.addEventListener('click', () => {
        const v = opt.getAttribute('data-value');
        value.textContent = opt.textContent;
        value.classList.remove('cs-placeholder');
        if (hidden) hidden.value = v;
        options.forEach(o => o.classList.remove('is-selected'));
        opt.classList.add('is-selected');
        closeMenu(sel);
        trigger.focus();
      });
    });

    // Keyboard navigation
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(sel);
        highlightOption(sel, 0);
      }
    });
    menu.addEventListener('keydown', (e) => {
      const highlighted = menu.querySelector('li.is-highlighted');
      const i = options.indexOf(highlighted);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightOption(sel, Math.min(options.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightOption(sel, Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlighted) highlighted.click();
      } else if (e.key === 'Escape') {
        closeMenu(sel);
        trigger.focus();
      }
    });
  }

  function openMenu(sel) {
    sel.classList.add('is-open');
    sel.querySelector('.cs-trigger').setAttribute('aria-expanded', 'true');
    sel.querySelector('.cs-menu').focus();
  }
  function closeMenu(sel) {
    sel.classList.remove('is-open');
    sel.querySelector('.cs-trigger').setAttribute('aria-expanded', 'false');
    sel.querySelectorAll('.cs-menu li').forEach(o => o.classList.remove('is-highlighted'));
  }
  function highlightOption(sel, idx) {
    const opts = Array.from(sel.querySelectorAll('.cs-menu li'));
    opts.forEach(o => o.classList.remove('is-highlighted'));
    if (opts[idx]) opts[idx].classList.add('is-highlighted');
  }
})();

// ── Floating back-link: switch tone when over paper sections ────────
(function() {
  const fb = document.querySelector('.floating-back');
  if (!fb) return;
  // Consider the floating-back to be "on paper" whenever its vertical center
  // lies within any element that has a paper background.
  const subContent = document.querySelector('.sub-content');
  const teamSection = document.querySelector('.team-section');
  const paperSurfaces = [subContent, teamSection].filter(Boolean);
  if (!paperSurfaces.length) return;
  let ticking = false;
  function update() {
    ticking = false;
    const fbRect = fb.getBoundingClientRect();
    const fbMidY = fbRect.top + fbRect.height / 2;
    let onPaper = false;
    for (const surface of paperSurfaces) {
      const r = surface.getBoundingClientRect();
      if (fbMidY >= r.top && fbMidY <= r.bottom) {
        onPaper = true;
        break;
      }
    }
    fb.classList.toggle('is-on-paper', onPaper);
  }
  function onScroll() {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
})();


/* ============================================================================
   MOTION ENHANCEMENTS
   Layered on top of the foundational behaviours above. Each block is self-
   contained and bails out gracefully on prefers-reduced-motion or touch-only.
   ============================================================================ */
(function motionEnhancements() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;

  /* ── 1. Magnetic CTAs ─────────────────────────────────────────────────
     Buttons pull subtly toward the cursor. Skipped on touch and reduced
     motion (a CTA shouldn't jitter for users who prefer stillness). */
  if (!isCoarse && !reducedMotion) {
    document.querySelectorAll('.btn-primary, .btn-ghost').forEach(btn => {
      btn.classList.add('magnetic');
      const strength = 0.32;
      const max = 12;
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        let x = (e.clientX - (r.left + r.width / 2)) * strength;
        let y = (e.clientY - (r.top + r.height / 2)) * strength;
        x = Math.max(-max, Math.min(max, x));
        y = Math.max(-max, Math.min(max, y));
        btn.style.transform = `translate(${x}px, ${y}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  /* ── 2. Hero glow + wordmark spotlight follow the cursor ────────────
     Three layers move with the pointer for visible parallax depth:
       a) .hero-glow      drifts up to 95px toward the cursor
       b) .hero-glow-2    drifts up to 140px (further = more parallax)
       c) .hero-wordmark-spotlight gets --spot-x / --spot-y updated so the
          radial mask follows the cursor and 'illuminates' a gold variant
          of the wordmark under it.
     All wrapped in a single mousemove for efficiency. */
  if (!isCoarse && !reducedMotion) {
    const hero = document.getElementById('hero');
    const glow = document.querySelector('.hero-glow');
    const glow2 = document.querySelector('.hero-glow-2');
    const spotlight = document.getElementById('heroWordmarkSpotlight');
    if (hero && (glow || glow2 || spotlight)) {
      hero.addEventListener('mousemove', (e) => {
        const r = hero.getBoundingClientRect();
        const cx = (e.clientX - r.left - r.width / 2) / r.width;
        const cy = (e.clientY - r.top - r.height / 2) / r.height;
        if (glow)  glow.style.transform  = `translate(calc(-50% + ${cx * 95}px), calc(-50% + ${cy * 95}px))`;
        if (glow2) glow2.style.transform = `translate(calc(-50% + ${cx * 140}px), calc(-50% + ${cy * 140}px))`;
        if (spotlight) {
          const sr = spotlight.getBoundingClientRect();
          const sx = e.clientX - sr.left;
          const sy = e.clientY - sr.top;
          spotlight.style.setProperty('--spot-x', sx + 'px');
          spotlight.style.setProperty('--spot-y', sy + 'px');
        }
      });
      hero.addEventListener('mouseleave', () => {
        if (glow)  glow.style.transform = '';
        if (glow2) glow2.style.transform = '';
      });
    }
  }

  /* ── 3. Split-text reveal ───────────────────────────────────────────
     Each word of select titles is wrapped in <span class="split-word">
     <span class="split-word-inner">…</span></span>, with a stagger delay.
     Inner translateY(110%) is released to 0 when the parent .reveal
     becomes visible (handled by the existing IntersectionObserver). */
  function splitElement(el) {
    if (el.dataset.split === '1') return [];
    const wrappers = [];

    function walk(node) {
      const kids = Array.from(node.childNodes);
      kids.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent;
          if (!text.trim()) return;
          const frag = document.createDocumentFragment();
          // Split preserving whitespace between words so layout matches the original.
          text.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(' '));
            } else {
              const outer = document.createElement('span');
              outer.className = 'split-word';
              const inner = document.createElement('span');
              inner.className = 'split-word-inner';
              inner.textContent = part;
              outer.appendChild(inner);
              frag.appendChild(outer);
              wrappers.push(inner);
            }
          });
          child.parentNode.replaceChild(frag, child);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          // Recurse so existing markup like <em> is preserved with its styling.
          walk(child);
        }
      });
    }
    walk(el);
    el.dataset.split = '1';
    wrappers.forEach((w, i) => {
      w.style.transitionDelay = (60 + i * 80) + 'ms';
    });
    return wrappers;
  }
  if (!reducedMotion) {
    const splitTargets = document.querySelectorAll(
      '.about-title, .sc-title, .contact-section .section-title'
    );
    // Fallback observer: releases the split-words when the title itself enters
    // the viewport. Needed because some natural .reveal parents (e.g.
    // .contact-left on mobile, which uses display:contents to reorder children)
    // have no bounding box, so the main reveal observer never fires for them
    // and the words would stay translated below their clip mask forever.
    const splitFallbackObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-text-revealed');
          splitFallbackObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });
    splitTargets.forEach(el => {
      splitElement(el);
      splitFallbackObs.observe(el);
    });
  }

  /* ── 4. Stat counters wired to scroll ───────────────────────────────
     For each .stat-num whose text contains a digit, count up from 0 to
     that number when the strip first scrolls into view. Non-numeric
     placeholders (e.g. "₹X") are left alone. */
  (function() {
    const stats = document.querySelectorAll('.stat-num');
    if (!stats.length) return;
    stats.forEach(el => {
      const m = el.textContent.trim().match(/^([^\d]*)(\d+)(.*)$/);
      if (!m) return;
      el.dataset.prefix = m[1];
      el.dataset.target = m[2];
      el.dataset.suffix = m[3];
    });
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        obs.unobserve(el);
        if (!el.dataset.target) return;
        const target = parseInt(el.dataset.target, 10);
        const prefix = el.dataset.prefix || '';
        const suffix = el.dataset.suffix || '';
        const start = performance.now();
        const duration = 1600;
        function tick(now) {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = prefix + Math.round(eased * target) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.45 });
    stats.forEach(el => obs.observe(el));
  })();

  /* ── 5. Marquee cursor parallax ─────────────────────────────────────
     As the cursor moves across the strip, service labels within a 240px
     radius lift slightly and tint toward gold. Closer = bigger lift +
     stronger tint. Skipped on touch and reduced-motion (no cursor to
     follow). Pause-on-hover (CSS) plus this effect means: hovering the
     strip stops the scroll AND highlights items under the pointer.

     Performance: caches each label's static offsetLeft once at startup,
     then reads only the track's bounding rect per frame (single layout
     read) to compute each label's current screen position. Cheaper than
     getBoundingClientRect() on every label. */
  (function() {
    const wrap = document.querySelector('.marquee-wrap');
    const track = document.querySelector('.marquee-track');
    if (!wrap || !track || reducedMotion || isCoarse) return;
    const items = Array.from(track.querySelectorAll('span:not(.dot)'));
    if (!items.length) return;

    // Wait one frame so the marquee has its final layout before caching.
    requestAnimationFrame(() => {
      const itemOffsets = items.map(item => item.offsetLeft + item.offsetWidth / 2);
      let mouseX = null;
      let raf = null;
      const threshold = 240;
      const maxLift = 10;
      // ink-soft (resting) -> gold (peak) lerp endpoints
      const fromR = 10,  fromG = 26,  fromB = 53,  fromA = 0.62;
      const toR   = 184, toG   = 146, toB   = 78,  toA   = 1;

      function tick() {
        if (mouseX === null) { raf = null; return; }
        const trackLeft = track.getBoundingClientRect().left;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const itemX = trackLeft + itemOffsets[i];
          const dx = Math.abs(mouseX - itemX);
          if (dx < threshold) {
            const t = 1 - dx / threshold; // 0..1
            const lift = -maxLift * t;
            const r = Math.round(fromR + (toR - fromR) * t);
            const g = Math.round(fromG + (toG - fromG) * t);
            const b = Math.round(fromB + (toB - fromB) * t);
            const a = (fromA + (toA - fromA) * t).toFixed(2);
            item.style.transform = `translateY(${lift.toFixed(1)}px)`;
            item.style.color = `rgba(${r}, ${g}, ${b}, ${a})`;
          } else if (item.style.transform) {
            item.style.transform = '';
            item.style.color = '';
          }
        }
        raf = requestAnimationFrame(tick);
      }

      wrap.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        if (raf === null) raf = requestAnimationFrame(tick);
      });
      wrap.addEventListener('mouseleave', () => {
        mouseX = null;
        // Clear immediately so CSS transition smooths the return to rest.
        items.forEach(item => {
          item.style.transform = '';
          item.style.color = '';
        });
      });
    });
  })();

  /* ── 6. Page transition curtain — continuous downward wipe ─────────
     The curtain spans the navigation boundary as one continuous motion:
       • Outbound: a panel slides DOWN from above the viewport to cover the
         screen, then we navigate while it's still covering.
       • Inbound: pre-paint CSS already shows the new page's curtain in the
         covering state (via html.is-page-entering ::before in style.css).
         We add .is-page-entered after a beat so the curtain slides DOWN off
         the bottom — the eye reads it as the same panel continuing through.

     The handoff is carried by sessionStorage flag 'seleqt_transitioning',
     set just before navigation and read by the pre-paint script in <head>. */

  // ── Inbound: if we arrived via the curtain, drop it off the bottom ──
  if (document.documentElement.classList.contains('is-page-entering')) {
    // Hold the curtain visible for one paint, then trigger the slide-out.
    // The double rAF guarantees the browser has rendered the entering state
    // before we add the entered state, so the transition actually animates.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          document.documentElement.classList.add('is-page-entered');
          // After the CSS transition finishes, clear both flags so the page
          // is back to its normal state (scroll unlocked, no pseudo curtain).
          setTimeout(() => {
            document.documentElement.classList.remove('is-page-entering', 'is-page-entered');
          }, 1000);
        }, 120);
      });
    });
  }

  // ── Outbound: drop the curtain on internal link clicks ──
  (function() {
    if (reducedMotion) return;

    // The same abstract floral artwork that style.css inlines as a static
    // background-image on the inbound side. Here it lives as a real SVG in
    // the DOM so its paths can animate via stroke-dasharray.
    const CURTAIN_SVG = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="rgba(200,169,110,0.3)" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M -20,80 Q 100,40 180,100 Q 250,150 280,220 Q 310,290 380,300 Q 460,310 540,280 Q 600,260 620,260"/>
          <path d="M -20,380 Q 80,360 140,300 Q 200,240 260,250 Q 320,260 380,200 Q 440,140 520,140 Q 580,140 620,120"/>
          <path d="M 620,40 Q 560,80 540,140 Q 520,180 480,180"/>
          <g transform="translate(180 100)">
            <circle r="2.5"/>
            <path d="M 0,-7 C -4,-6 -6,-3 -6,1"/><path d="M 6,1 C 6,-3 4,-6 0,-7"/>
            <path d="M -6,1 C -5,4 -2,7 1,7"/><path d="M 1,7 C 4,6 6,4 6,1"/>
            <path d="M -9,-2 C -10,-7 -5,-11 0,-11"/><path d="M 0,-11 C 5,-11 10,-7 9,-2"/>
            <path d="M 9,-2 C 10,3 6,9 1,10"/><path d="M 1,10 C -4,11 -10,8 -9,-2"/>
          </g>
          <g transform="translate(440 320)">
            <circle r="2.2"/>
            <ellipse cx="0" cy="-7" rx="1.4" ry="4.5"/>
            <ellipse cx="0" cy="-7" rx="1.4" ry="4.5" transform="rotate(45)"/>
            <ellipse cx="0" cy="-7" rx="1.4" ry="4.5" transform="rotate(90)"/>
            <ellipse cx="0" cy="-7" rx="1.4" ry="4.5" transform="rotate(135)"/>
            <ellipse cx="0" cy="-7" rx="1.4" ry="4.5" transform="rotate(180)"/>
            <ellipse cx="0" cy="-7" rx="1.4" ry="4.5" transform="rotate(225)"/>
            <ellipse cx="0" cy="-7" rx="1.4" ry="4.5" transform="rotate(270)"/>
            <ellipse cx="0" cy="-7" rx="1.4" ry="4.5" transform="rotate(315)"/>
          </g>
          <g transform="translate(300 240)">
            <path d="M 0,0 C -10,-3 -11,-22 0,-26 C 11,-22 10,-3 0,0 Z"/>
            <path d="M -7,-15 C -3,-19 0,-19 0,-19"/>
            <path d="M 7,-15 C 3,-19 0,-19 0,-19"/>
          </g>
          <g transform="translate(380 200)">
            <circle r="3"/>
            <path d="M -5,-3 C -5,-7 -2,-10 2,-10 C 6,-9 7,-5 5,-2"/>
            <path d="M 5,-2 C 9,-4 12,-1 11,3 C 9,7 5,7 3,5"/>
            <path d="M 3,5 C 6,9 3,12 -1,11 C -5,9 -5,4 -3,3"/>
            <path d="M -3,3 C -7,4 -10,1 -8,-3 C -6,-6 -3,-6 -5,-3"/>
            <ellipse cx="0" cy="-13" rx="3" ry="5"/>
            <ellipse cx="0" cy="-13" rx="3" ry="5" transform="rotate(72)"/>
            <ellipse cx="0" cy="-13" rx="3" ry="5" transform="rotate(144)"/>
            <ellipse cx="0" cy="-13" rx="3" ry="5" transform="rotate(216)"/>
            <ellipse cx="0" cy="-13" rx="3" ry="5" transform="rotate(288)"/>
          </g>
          <path d="M 100,70 C 80,60 70,75 75,85 C 90,82 102,80 100,70 Z"/>
          <path d="M 240,180 C 220,170 205,180 210,195 C 230,192 245,188 240,180 Z"/>
          <path d="M 360,260 C 340,250 325,260 330,275 C 350,272 365,268 360,260 Z"/>
          <path d="M 480,300 C 460,290 445,300 450,315 C 470,312 485,308 480,300 Z"/>
          <path d="M 120,290 C 100,280 85,290 90,305 C 110,302 125,298 120,290 Z"/>
          <path d="M 220,260 C 240,255 255,265 250,278 C 232,275 220,272 220,260 Z"/>
          <path d="M 360,150 C 380,145 393,155 388,168 C 370,165 358,160 360,150 Z"/>
          <path d="M 540,210 C 520,200 505,210 510,225 C 530,222 545,218 540,210 Z"/>
          <ellipse cx="60" cy="120" rx="2" ry="3" transform="rotate(20 60 120)"/>
          <ellipse cx="540" cy="200" rx="2" ry="3" transform="rotate(-15 540 200)"/>
          <ellipse cx="160" cy="350" rx="2" ry="3" transform="rotate(45 160 350)"/>
        </g>
        <g fill="rgba(200,169,110,0.42)">
          <circle cx="500" cy="80" r="2"/>
          <circle cx="80" cy="340" r="2"/>
          <circle cx="350" cy="350" r="1.5"/>
          <circle cx="50" cy="220" r="1.5"/>
          <circle cx="580" cy="350" r="1.5"/>
        </g>
      </svg>`;

    const overlay = document.createElement('div');
    overlay.className = 'page-transition';
    const panel = document.createElement('div');
    panel.className = 'page-transition-panel';

    // Floral artwork as a real DOM SVG so we can animate the paths.
    const art = document.createElement('div');
    art.className = 'page-transition-art';
    art.innerHTML = CURTAIN_SVG;
    panel.appendChild(art);

    const glyph = document.createElement('span');
    glyph.className = 'page-transition-glyph';
    glyph.textContent = 'SELEQT';
    panel.appendChild(glyph);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Live-drawing animation. Sets each strokeable element to its full
    // stroke-dashoffset (= invisible), forces a reflow, then transitions
    // back to 0 with a small stagger per element so the artwork paints
    // on across the duration of the curtain slide.
    function animateCurtainDraw(svgEl) {
      const items = Array.from(svgEl.querySelectorAll('path, circle, ellipse'));
      if (!items.length) return;
      const lastIdx = Math.max(1, items.length - 1);
      const drawMs = 520;
      const staggerMs = 240;

      // Snap every element to its initial invisible state with NO transition.
      items.forEach(el => {
        let len = 0;
        try { len = el.getTotalLength ? el.getTotalLength() : 0; } catch (e) {}
        if (len > 0) {
          el.style.strokeDasharray = len;
          el.style.strokeDashoffset = len;
        }
        el.style.opacity = '0';
        el.style.transition = 'none';
      });

      // Force a reflow so the browser commits the initial state before we
      // change it again — otherwise it would just see the final state and
      // skip the animation.
      void svgEl.getBoundingClientRect();

      // Enable transitions with per-element delay, then set final values.
      items.forEach((el, i) => {
        const delay = (i / lastIdx) * staggerMs;
        el.style.transition =
          'stroke-dashoffset ' + drawMs + 'ms cubic-bezier(0.22, 1, 0.36, 1) ' + delay + 'ms, ' +
          'opacity ' + Math.round(drawMs * 0.55) + 'ms ease ' + delay + 'ms';
        el.style.strokeDashoffset = '0';
        el.style.opacity = '1';
      });
    }

    let leaving = false;
    document.addEventListener('click', (e) => {
      if (leaving) return;
      const a = e.target.closest('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href) return;
      // Skip anchors, mailto/tel, new-tab, and modifier-clicks
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      let url;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      // Only intercept page-to-page navigations
      if (!/\.html?($|\?|#)/.test(url.pathname)) return;
      if (url.pathname === window.location.pathname) return;

      e.preventDefault();
      leaving = true;
      // Hand-off flag for the entering page's pre-paint script
      try { sessionStorage.setItem('seleqt_transitioning', '1'); } catch (err) {}
      overlay.classList.add('is-leaving');
      // Trigger the live drawing of the floral artwork in parallel with
      // the panel slide. The curtain takes ~750ms to cover; the drawing
      // completes in ~520ms + ~240ms stagger ≈ 760ms, so the artwork
      // finishes painting right as the curtain finishes sliding in.
      const svgEl = art.querySelector('svg');
      if (svgEl) animateCurtainDraw(svgEl);
      // 750ms = the panel's transform transition (see .page-transition-panel)
      // plus a tiny breath so the curtain fully covers before we navigate.
      setTimeout(() => { window.location.href = href; }, 770);
    });

    // bfcache: if user comes back via back/forward, drop the curtain instantly
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        overlay.classList.remove('is-leaving');
        try { sessionStorage.removeItem('seleqt_transitioning'); } catch (err) {}
      }
    });
  })();

  /* ── 7. Carousel number flip ────────────────────────────────────────
     The carousel controller above writes a new "01", "02"… into
     #scIndexCurrent on each active-item change. We observe those writes
     and wrap the new text in a span that re-runs a flip-in animation. */
  (function() {
    if (reducedMotion) return;
    const indexEl = document.getElementById('scIndexCurrent');
    if (!indexEl) return;
    let last = indexEl.textContent;
    const mo = new MutationObserver(() => {
      const now = indexEl.textContent;
      if (now === last) return;
      last = now;
      const wrap = document.createElement('span');
      wrap.className = 'sc-index-flip';
      wrap.textContent = now;
      indexEl.textContent = '';
      indexEl.appendChild(wrap);
    });
    mo.observe(indexEl, { childList: true, characterData: true, subtree: true });
  })();
})();
