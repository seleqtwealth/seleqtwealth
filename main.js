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

    /* Outbound curtain — a deep-navy panel with a centred SELEQT wordmark
       that travels as one piece with the panel (no separate fade-in for
       the logo; it inherits the panel's transform). Inbound curtain on
       the entering page is a CSS pseudo-element (see is-page-entering
       ::before) that mirrors the same layout. */
    const overlay = document.createElement('div');
    overlay.className = 'page-transition';
    const panel = document.createElement('div');
    panel.className = 'page-transition-panel';
    const logo = document.createElement('span');
    logo.className = 'page-transition-logo';
    logo.textContent = 'SELEQT';
    panel.appendChild(logo);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

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
      // Choreography:
      //   0ms    — panel begins sliding down (transition: 750ms)
      //   750ms  — panel fully covers screen
      //   900ms  — navigate (150ms hold so the panel settles before the
      //            new page takes over and inbound slide-off begins)
      setTimeout(() => { window.location.href = href; }, 900);
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

/* ============================================================================
   PREMIUM 3D — site-wide depth & cursor interactivity
   Subtle 3D tilt on cards, cursor-following gold glow on section headers,
   and a parallax shadow on sub-page H1s. Designed to feel "luxury brand"
   rather than "gimmick" — small angles, soft glows, smooth easing.
   Bails on touch and prefers-reduced-motion.
   ============================================================================ */
(function premium3D() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  if (reducedMotion || isCoarse) return;

  /* ── Universal card tilt ────────────────────────────────────────────
     Cards across the site get a subtle 3D rotation following the cursor,
     plus a small lift. Max ~5–6° feels refined; anything more reads as
     a toy. Combined inline transform keeps the existing hover lift while
     adding the rotation on top. */
  function applyTilt(card, maxTilt, liftPx) {
    let rect = null;
    let rafId = null;
    let cx = 0, cy = 0;

    function update() {
      const rotY = (cx - 0.5) * maxTilt * 2;
      const rotX = -(cy - 0.5) * maxTilt * 2;
      card.style.transform =
        'perspective(1200px) rotateX(' + rotX.toFixed(2) + 'deg)' +
        ' rotateY(' + rotY.toFixed(2) + 'deg)' +
        ' translateY(' + liftPx + 'px) translateZ(0)';
      rafId = null;
    }

    card.addEventListener('mouseenter', () => {
      rect = card.getBoundingClientRect();
      // Faster transition when entering so the tilt tracks the cursor
      // tightly; slower transition on leave so the reset feels smooth.
      card.style.transition = 'transform 0.16s var(--ease-out), box-shadow 0.4s var(--ease-out)';
    });
    card.addEventListener('mousemove', (e) => {
      if (!rect) rect = card.getBoundingClientRect();
      cx = (e.clientX - rect.left) / rect.width;
      cy = (e.clientY - rect.top) / rect.height;
      if (rafId === null) rafId = requestAnimationFrame(update);
    });
    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.55s var(--ease-out), box-shadow 0.55s var(--ease-out)';
      card.style.transform = '';
      rect = null;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    });
  }

  // Each tilt-target gets a tuned maxTilt (degrees) and liftPx (-px to lift).
  [
    ['.team-card',                 5, -4],
    ['.feature-item',              5, -3],
    ['.about-principle',           5, -3],
    ['.insight-card--featured',    4, -6],
    ['.insight-upcoming',          4, -2],
    ['.stat',                      4, -2]
  ].forEach(([selector, maxTilt, liftPx]) => {
    document.querySelectorAll(selector).forEach(card => applyTilt(card, maxTilt, liftPx));
  });

  /* ── Sub-hero H1 depth shadow ───────────────────────────────────────
     The home hero already has a cursor-tracking spotlight on its
     wordmark. Sub-page H1s (about, investments, etc.) get a softer
     version — a gold drop-shadow whose offset shifts subtly with the
     cursor. Adds depth without competing with the heading itself. */
  document.querySelectorAll('.sub-hero').forEach(hero => {
    const h1 = hero.querySelector('h1');
    if (!h1) return;
    let rafId = null;
    let tx = 0, ty = 0;

    function commit() {
      h1.style.textShadow =
        tx.toFixed(1) + 'px ' + ty.toFixed(1) + 'px 36px rgba(184, 146, 78, 0.18)';
      rafId = null;
    }

    hero.addEventListener('mousemove', (e) => {
      const r = hero.getBoundingClientRect();
      const cx = ((e.clientX - r.left) - r.width / 2) / r.width;   // -0.5..0.5
      const cy = ((e.clientY - r.top) - r.height / 2) / r.height;
      tx = cx * 14;
      ty = cy * 14;
      if (rafId === null) rafId = requestAnimationFrame(commit);
    });
    hero.addEventListener('mouseleave', () => {
      h1.style.textShadow = '';
    });
  });
})();

/* ============================================================================
   HERO HAIRLINE — minimal cursor interaction
   A single thin gold vertical line that glides across each sub-page hero,
   following the cursor like a precision ruler, with a small leading node dot.
   The line eases (trails) while the dot tracks closely, giving a quiet sense
   of motion. Fades in on hover, out on leave. No canvas, nothing heavy.
   Disabled on touch and prefers-reduced-motion.
   ============================================================================ */
(function heroHairline() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  if (reducedMotion || isCoarse) return;

  document.querySelectorAll('.sub-hero').forEach(hero => {
    const vline = document.createElement('div');
    vline.className = 'hero-hairline';
    const hline = document.createElement('div');
    hline.className = 'hero-hairline hero-hairline--h';
    const dot = document.createElement('div');
    dot.className = 'hero-hairline-dot';
    hero.appendChild(vline);
    hero.appendChild(hline);
    hero.appendChild(dot);

    hero.addEventListener('mousemove', (e) => {
      const r = hero.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      vline.style.transform = 'translateX(' + x + 'px)';
      hline.style.transform = 'translateY(' + y + 'px)';
      dot.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      hero.classList.add('hairline-on');
    });
    hero.addEventListener('mouseleave', () => hero.classList.remove('hairline-on'));
  });
})();

/* ── Hero grid: click a square to flash its borders gold ────────────
   The sub-hero background grid is a CSS pattern (96px cells). We can't
   target a cell directly, so on click we work out which cell the cursor
   landed in from the coordinates and drop a temporary gold-bordered square
   over it that fades out. Ignores clicks on links/buttons. */
(function heroGridFlash() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;
  const CELL = 96; // matches .sub-hero::before background-size

  document.querySelectorAll('.sub-hero').forEach(hero => {
    hero.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return; // don't flash on real controls
      const r = hero.getBoundingClientRect();
      const col = Math.floor((e.clientX - r.left) / CELL);
      const row = Math.floor((e.clientY - r.top) / CELL);
      const sq = document.createElement('div');
      sq.className = 'grid-square-flash';
      sq.style.left = (col * CELL) + 'px';
      sq.style.top = (row * CELL) + 'px';
      hero.appendChild(sq);
      sq.addEventListener('animationend', () => sq.remove());
      setTimeout(() => { if (sq.parentNode) sq.remove(); }, 2000);
    });
  });
})();

/* ── Hero grid shooting-star streaks ─────────────────────
   Injects gold "comet" lines that travel ALONG the grid lines. Each comet
   rides one horizontal or vertical grid line; positions are snapped to the
   96px grid so they sit exactly on a line. A mix of axes, lines, directions,
   lengths and speeds keeps the motion abstract, not a tidy parallel sweep.
   Rebuilds on resize so the comets stay aligned to the grid. Disabled under
   prefers-reduced-motion (CSS hides them too). */
(function heroGridStreaks() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const CELL = 96; // matches .sub-hero::before background-size
  const snap = v => Math.round(v / CELL) * CELL;

  document.querySelectorAll('.sub-hero').forEach(hero => {
    function build() {
      hero.querySelectorAll('.grid-streak').forEach(n => n.remove());
      const r = hero.getBoundingClientRect();
      const W = r.width, H = r.height;
      // axis: 'h' rides a horizontal line (pos = top), 'v' a vertical line (pos = left)
      const configs = [
        { axis: 'h', pos: snap(H * 0.22), len: 180, dur: 7.5, delay: 0,   rev: false },
        { axis: 'h', pos: snap(H * 0.62), len: 140, dur: 6,   delay: 2.4, rev: true  },
        { axis: 'v', pos: snap(W * 0.34), len: 200, dur: 8.5, delay: 1,   rev: false },
        { axis: 'v', pos: snap(W * 0.66), len: 150, dur: 6.5, delay: 3.6, rev: true  },
        { axis: 'h', pos: snap(H * 0.82), len: 120, dur: 5.5, delay: 4.5, rev: false }
      ];
      configs.forEach(c => {
        const s = document.createElement('div');
        s.className = 'grid-streak grid-streak--' + c.axis + (c.rev ? ' is-rev' : '');
        if (c.axis === 'h') s.style.top = c.pos + 'px';
        else s.style.left = c.pos + 'px';
        s.style.setProperty('--len', c.len + 'px');
        s.style.animationDuration = c.dur + 's';
        s.style.animationDelay = c.delay + 's';
        hero.appendChild(s);
      });
    }
    build();
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(build, 250); });
  });
})();

/* ── Sub-hero scroll cue ─────────────────────
   Injects a small "Scroll" affordance at the bottom of each full-viewport
   sub-hero so visitors know there's more below the fold. The pulse
   animation is defined in CSS and disabled under prefers-reduced-motion. */
(function subHeroScrollCue() {
  document.querySelectorAll('.sub-hero').forEach(hero => {
    const cue = document.createElement('div');
    cue.className = 'sub-hero-scroll';
    cue.innerHTML = '<span>Scroll</span><span class="sub-hero-scroll-line"></span>';
    hero.appendChild(cue);
  });
})();

/* ── Practice chips — signature colours + section wash ───────────────
   Gives each capability chip a deep jewel-tone signature colour (cycled
   from a curated palette). On hover the chip fills with its colour and the
   whole .sub-content section background washes toward that colour. CSS
   handles the visuals; this just assigns colours and toggles the wash. */
(function practiceChips() {
  const palette = ['#1f4d45', '#4a2230', '#243a6b', '#4a3618', '#3a2545', '#234a2c'];
  document.querySelectorAll('.feature-list').forEach(list => {
    const section = list.closest('.sub-content');
    Array.from(list.querySelectorAll('.feature-item')).forEach((item, i) => {
      const color = palette[i % palette.length];
      item.style.setProperty('--chip', color);
      item.addEventListener('mouseenter', () => {
        if (!section) return;
        section.style.setProperty('--wash', color);
        section.classList.add('is-washing');
      });
      item.addEventListener('mouseleave', () => {
        if (section) section.classList.remove('is-washing');
      });
    });
  });
})();

/* ── FAQ accordion ───────────────────────────
   Click a question to reveal its answer; opening one closes the others in
   the same list (single-open). Toggles .open + aria-expanded. */
(function faqAccordion() {
  document.querySelectorAll('.faq-list').forEach(list => {
    const items = Array.from(list.querySelectorAll('.faq-item'));
    items.forEach(item => {
      const btn = item.querySelector('.faq-q');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        items.forEach(other => {
          other.classList.remove('open');
          const b = other.querySelector('.faq-q');
          if (b) b.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  });
})();

// ── Auto-year copyright ─────────────────────
// Every footer has <span class="footer-year">2026</span> — keep the year
// fresh automatically so it doesn't go stale on Jan 1.
(function() {
  const year = new Date().getFullYear();
  document.querySelectorAll('.footer-year').forEach(el => { el.textContent = year; });
})();

// ── WhatsApp floating button ────────────────
// Injected here rather than in HTML so we only have to update the number /
// default message in one place. Hidden by CSS in reduced-motion print views.
(function() {
  const phone = '919998139596'; // E.164 without +
  const message = encodeURIComponent("Hi SELEQT, I'd like to learn more about your services.");
  const a = document.createElement('a');
  a.className = 'whatsapp-fab';
  a.href = `https://wa.me/${phone}?text=${message}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-label', 'Chat with us on WhatsApp');
  a.innerHTML = `
    <svg viewBox="0 0 32 32" width="28" height="28" fill="currentColor" aria-hidden="true">
      <path d="M16.001 3C9.373 3 3.998 8.375 3.998 15c0 2.385.7 4.605 1.9 6.482L3 29l7.78-2.04A12.94 12.94 0 0 0 16.001 27C22.628 27 28 21.626 28 15S22.628 3 16.001 3zm0 21.818c-1.97 0-3.81-.54-5.382-1.476l-.385-.226-4.616 1.21 1.232-4.5-.252-.395A9.79 9.79 0 0 1 6.18 15c0-5.42 4.4-9.82 9.82-9.82 5.42 0 9.82 4.4 9.82 9.82 0 5.418-4.4 9.818-9.82 9.818zm5.39-7.36c-.295-.148-1.748-.862-2.018-.96-.27-.099-.467-.148-.664.148-.196.295-.762.96-.934 1.157-.172.197-.345.222-.64.074-.295-.148-1.245-.46-2.371-1.467-.876-.78-1.467-1.745-1.64-2.04-.172-.296-.018-.456.13-.604.133-.132.295-.345.443-.517.148-.173.197-.296.295-.493.099-.197.05-.37-.025-.518-.074-.148-.664-1.6-.91-2.193-.24-.576-.484-.498-.664-.508-.172-.008-.369-.01-.566-.01a1.087 1.087 0 0 0-.787.37c-.27.296-1.034 1.01-1.034 2.46s1.058 2.852 1.206 3.05c.148.197 2.084 3.18 5.05 4.46.706.305 1.257.487 1.687.624.708.225 1.353.193 1.863.117.568-.085 1.748-.715 1.994-1.405.246-.69.246-1.282.172-1.406-.073-.123-.27-.197-.566-.345z"/>
    </svg>
  `;
  document.body.appendChild(a);
})();

// ── Cookie consent + Google Analytics 4 loader ──────────────────────
// GA4 only fires AFTER the user clicks Accept (DPDP Act 2023 safe).
// To turn on tracking: replace GA_MEASUREMENT_ID below with your real
// "G-XXXXXXXXXX" Measurement ID from Google Analytics → Admin → Data
// Streams → your web stream.
(function() {
  const GA_MEASUREMENT_ID = 'G-FF6XR4Q4P1';
  const CONSENT_KEY = 'seleqt_consent';

  function loadGA() {
    if (!GA_MEASUREMENT_ID || GA_MEASUREMENT_ID === 'G-XXXXXXXXXX') return;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
  }

  const stored = localStorage.getItem(CONSENT_KEY);
  if (stored === 'granted') { loadGA(); return; }
  if (stored === 'denied') return;

  // First-visit banner
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Cookie consent');
  banner.innerHTML = `
    <p class="cookie-text">
      We use a single analytics cookie to understand how visitors use the site. No personal data is sold or shared.
    </p>
    <div class="cookie-actions">
      <button type="button" class="cookie-btn cookie-decline">Decline</button>
      <button type="button" class="cookie-btn cookie-accept">Accept</button>
    </div>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('is-visible'));

  banner.querySelector('.cookie-accept').addEventListener('click', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    banner.classList.remove('is-visible');
    loadGA();
    setTimeout(() => banner.remove(), 400);
  });
  banner.querySelector('.cookie-decline').addEventListener('click', () => {
    localStorage.setItem(CONSENT_KEY, 'denied');
    banner.classList.remove('is-visible');
    setTimeout(() => banner.remove(), 400);
  });
})();
