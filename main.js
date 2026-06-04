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
   CORPORATE PAVILION — interactive architectural elevation
   A detailed, near-orthographic elevation of a low-rise corporate HQ rendered
   in gold line-art on navy: podium base, two storeys of curtain-wall glazing
   with mullions/transoms, a cantilevered entrance canopy on columns, glass
   doors with steps, a signage band, a rooftop parapet with plant/penthouse,
   plus landscaping (trees, hedges, path, bollards, scale figures). The glass
   offices light up as the cursor sweeps the facade; the whole composition
   parallaxes gently (building one rate, foreground landscaping faster).
   No library. Pauses off-screen. Bails on prefers-reduced-motion.
   ============================================================================ */
(function officeHero() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  const hosts = Array.from(document.querySelectorAll('.sub-hero'));
  if (!hosts.length) return;

  hosts.forEach(initOffice);

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // Design coordinate system: x from -500..500, y up from ground (0).
  const TOP = 300;            // main parapet height
  const POD = 52;            // podium height
  const F1 = [52, 165];      // floor 1 glazing band
  const SP = [165, 188];     // spandrel / signage band
  const F2 = [188, 296];     // floor 2 glazing band
  const ENT = 116;           // entrance half-width
  const MULL = 47;           // mullion spacing

  function initOffice(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'hero-3d-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.insertBefore(canvas, host.firstChild);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, dpr = 1, scale = 1, cx = 0, groundY = 0;
    let raf = null, t = 0;
    let panels = [];
    const mouse = { x: -9999, y: -9999, active: false };
    const target = { px: 0, py: 0 };
    const current = { px: 0, py: 0 };

    function addPanels(x0, x1, y0, y1, group) {
      const n = Math.max(1, Math.round((x1 - x0) / MULL));
      const w = (x1 - x0) / n;
      for (let i = 0; i < n; i++) {
        panels.push({
          x: x0 + i * w + 2, y: y0 + 2, w: w - 4, h: (y1 - y0) - 4,
          amb: Math.random() < 0.18 ? rnd(0.28, 0.62) : 0,
          tw: Math.random() < 0.1 ? rnd(0.5, 1.4) : 0, ph: rnd(0, 6.28),
          group: group || 'wing'
        });
      }
    }
    function layout() {
      scale = Math.min(W * 0.80, 1120) / 1000;
      groundY = H * 0.93;
      cx = W / 2;
      panels = [];
      addPanels(-500, -ENT, F1[0], F1[1]);
      addPanels(-500, -ENT, F2[0], F2[1]);
      addPanels(ENT, 500, F1[0], F1[1]);
      addPanels(ENT, 500, F2[0], F2[1]);
      addPanels(-150, 150, TOP + 10, TOP + 64, 'penthouse');
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = host.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout();
    }

    // design -> screen, with a per-layer parallax offset
    function T(dx, dy, p) { return { x: cx + dx * scale + p.x, y: groundY - dy * scale + p.y }; }
    function seg(a, b, col, wd) { ctx.strokeStyle = col; ctx.lineWidth = wd || 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    // filled rect given design left x, bottom y, width, height
    function rectF(x, yb, w, h, p, col) { const tl = T(x, yb + h, p); ctx.fillStyle = col; ctx.fillRect(tl.x, tl.y, w * scale, h * scale); }
    function rectS(x, yb, w, h, p, col, wd) { const tl = T(x, yb + h, p); ctx.strokeStyle = col; ctx.lineWidth = wd || 1; ctx.strokeRect(tl.x, tl.y, w * scale, h * scale); }

    const G = 'rgba(200,169,110,';     // gold
    const Gw = 'rgba(228,192,126,';    // warm window gold

    function drawFacadeGrid(p) {
      // transoms (horizontal floor lines), full width
      [F1[0], F1[1], F2[0], F2[1]].forEach(y => seg(T(-500, y, p), T(500, y, p), G + '0.34)', 1));
      // mullions (verticals) across both wings
      ctx.strokeStyle = G + '0.26)'; ctx.lineWidth = 1;
      for (let x = -500 + MULL; x < -ENT; x += MULL) seg(T(x, F1[0], p), T(x, F2[1], p), G + '0.26)', 1);
      for (let x = ENT + MULL; x < 500; x += MULL) seg(T(x, F1[0], p), T(x, F2[1], p), G + '0.26)', 1);
    }
    function drawPodium(p) {
      seg(T(-500, POD, p), T(500, POD, p), G + '0.5)', 1.1);
      seg(T(-500, 26, p), T(500, 26, p), G + '0.2)', 1);
      for (let x = -460; x <= 460; x += 95) seg(T(x, 0, p), T(x, POD, p), G + '0.16)', 1);
    }
    function drawCornice(p) {
      // slight projecting cap
      seg(T(-512, TOP, p), T(512, TOP, p), G + '0.5)', 1.2);
      seg(T(-512, TOP + 9, p), T(512, TOP + 9, p), G + '0.4)', 1);
      seg(T(-512, TOP, p), T(-512, TOP + 9, p), G + '0.4)', 1);
      seg(T(512, TOP, p), T(512, TOP + 9, p), G + '0.4)', 1);
    }
    function drawOutline(p) {
      rectS(-500, 0, 1000, TOP, p, G + '0.55)', 1.2);
      // vertical seam where wings meet entrance bay
      seg(T(-ENT, 0, p), T(-ENT, TOP, p), G + '0.4)', 1);
      seg(T(ENT, 0, p), T(ENT, TOP, p), G + '0.4)', 1);
    }
    function drawEntrance(p) {
      // recess interior warm glow
      const gc = T(0, 60, p);
      const grd = ctx.createRadialGradient(gc.x, gc.y, 4, gc.x, gc.y, 150 * scale);
      grd.addColorStop(0, 'rgba(228,192,126,0.34)');
      grd.addColorStop(1, 'rgba(228,192,126,0)');
      ctx.fillStyle = grd;
      const rb = T(-ENT, F2[0], p);
      ctx.fillRect(rb.x, rb.y, ENT * 2 * scale, F2[0] * scale);
      // columns flanking the entry
      [-(ENT - 16), (ENT - 16)].forEach(x => {
        rectS(x - 5, 0, 10, F1[1], p, G + '0.5)', 1.1);
      });
      // cantilevered canopy slab (projecting), at floor-1 head height
      rectF(-ENT - 26, F1[1], (ENT + 26) * 2, 12, p, 'rgba(9,18,38,0.98)');
      rectS(-ENT - 26, F1[1], (ENT + 26) * 2, 12, p, G + '0.6)', 1.2);
      // glass doors
      rectS(-58, 0, 116, 120, p, G + '0.5)', 1.1);
      for (let x = -58; x <= 58; x += 29) seg(T(x, 0, p), T(x, 120, p), G + '0.3)', 1);
      seg(T(0, 0, p), T(0, 120, p), G + '0.42)', 1); // central door split
      // handles
      seg(T(-6, 58, p), T(-6, 70, p), Gw + '0.8)', 2);
      seg(T(6, 58, p), T(6, 70, p), Gw + '0.8)', 2);
      // steps (below ground, widening)
      for (let i = 1; i <= 3; i++) {
        const w = 86 + i * 22;
        seg(T(-w, -i * 11, p), T(w, -i * 11, p), G + (0.34 - i * 0.06) + ')', 1);
      }
    }
    function drawSignage(p) {
      const s = T(0, (SP[0] + SP[1]) / 2, p);
      ctx.save();
      ctx.fillStyle = G + '0.85)';
      ctx.font = '600 ' + Math.round(15 * scale) + "px 'Cormorant Garamond', serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // manual tracking
      const txt = 'SELEQT', tr = 5 * scale;
      ctx.font = '600 ' + Math.round(15 * scale) + "px 'Cormorant Garamond', serif";
      let total = 0; const widths = [];
      for (const ch of txt) { const w = ctx.measureText(ch).width + tr; widths.push(w); total += w; }
      let xx = s.x - total / 2;
      ctx.textAlign = 'left';
      for (let i = 0; i < txt.length; i++) { ctx.fillText(txt[i], xx, s.y); xx += widths[i]; }
      ctx.restore();
    }
    function drawRooftop(p) {
      // penthouse box
      rectF(-150, TOP, 300, 74, p, 'rgba(11,21,44,0.97)');
      rectS(-150, TOP, 300, 74, p, G + '0.45)', 1);
      // parapet railing along the main roof wings
      [[-500, -150], [150, 500]].forEach(([a, b]) => {
        seg(T(a, TOP + 26, p), T(b, TOP + 26, p), G + '0.3)', 1);
        for (let x = a; x <= b; x += 30) seg(T(x, TOP + 9, p), T(x, TOP + 26, p), G + '0.2)', 1);
      });
      // HVAC units on wing roofs
      [-360, -250, 300, 410].forEach((x, i) => {
        const w = 56 + (i % 2) * 16, h = 30 + (i % 2) * 10;
        rectF(x - w / 2, TOP + 9, w, h, p, 'rgba(7,14,30,0.98)');
        rectS(x - w / 2, TOP + 9, w, h, p, G + '0.34)', 1);
      });
    }
    function drawGround(p) {
      const y = groundY + p.y;
      seg({ x: 0, y }, { x: W, y }, G + '0.16)', 1);
      // soft ground haze
      const hz = ctx.createLinearGradient(0, y - 150, 0, y + 30);
      hz.addColorStop(0, 'rgba(26,58,107,0)');
      hz.addColorStop(1, 'rgba(26,58,107,0.14)');
      ctx.fillStyle = hz; ctx.fillRect(0, y - 150, W, 180);
    }
    function drawPath(p) {
      // converging entry path from bottom centre to the doors
      const bl = T(-150, -36, p), br = T(150, -36, p);
      const tl = T(-66, 0, p), tr = T(66, 0, p);
      ctx.strokeStyle = G + '0.2)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(tl.x, tl.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(br.x, br.y); ctx.lineTo(tr.x, tr.y); ctx.stroke();
    }
    function drawHedges(p) {
      ctx.strokeStyle = G + '0.3)'; ctx.lineWidth = 1;
      for (const [a, b] of [[-500, -150], [150, 500]]) {
        for (let x = a; x < b; x += 26) {
          const c = T(x + 13, 20, p);
          ctx.beginPath(); ctx.arc(c.x, c.y, 9 * scale, Math.PI, 0); ctx.stroke();
        }
      }
    }
    function tree(x, p) {
      const base = T(x, 0, p);
      // trunk
      seg(base, T(x, 46, p), G + '0.45)', 1.4);
      // canopy — layered fine arcs
      const c = T(x, 96, p), R = 52 * scale;
      ctx.strokeStyle = G + '0.32)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x - R * 0.3, c.y + R * 0.15, R * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x + R * 0.32, c.y + R * 0.1, R * 0.55, 0, Math.PI * 2); ctx.stroke();
    }
    function drawTrees(p) { tree(-455, p); tree(458, p); }
    function drawFigures(p) {
      ctx.strokeStyle = G + '0.5)'; ctx.lineWidth = 1.4;
      [[-44, 30], [34, 28]].forEach(([x, h]) => {
        const feet = T(x, 0, p), head = T(x, h, p);
        seg(feet, T(x, h * 0.62, p), G + '0.5)', 1.4);        // legs/torso
        const hd = T(x, h, p);
        ctx.fillStyle = G + '0.5)';
        ctx.beginPath(); ctx.arc(hd.x, hd.y, 3.2 * scale, 0, Math.PI * 2); ctx.fill();
      });
    }
    function drawBollards(p) {
      [-118, 118].forEach(x => {
        seg(T(x, 0, p), T(x, 26, p), G + '0.4)', 1.2);
        const top = T(x, 28, p);
        ctx.fillStyle = Gw + '0.7)';
        ctx.beginPath(); ctx.arc(top.x, top.y, 2.6 * scale, 0, Math.PI * 2); ctx.fill();
      });
    }

    function frame() {
      t++;
      ctx.clearRect(0, 0, W, H);
      current.px += (target.px - current.px) * 0.06;
      current.py += (target.py - current.py) * 0.06;
      const bp = { x: current.px * 0.4, y: current.py * 0.3 };  // building layer
      const fp = { x: current.px * 1.0, y: current.py * 0.6 };  // foreground layer

      drawGround(bp);

      // building solid fills (occlusion)
      rectF(-500, 0, 1000, TOP, bp, 'rgba(9,18,38,0.97)');
      rectF(-ENT, 0, ENT * 2, F2[0], bp, 'rgba(4,9,20,0.98)'); // entrance recess void

      // windows
      const R = 250;
      for (const pn of panels) {
        const gp = T(pn.x, pn.y + pn.h, bp);
        const pw = pn.w * scale, ph = pn.h * scale;
        ctx.fillStyle = 'rgba(120,150,200,0.05)';     // faint glass tint
        ctx.fillRect(gp.x, gp.y, pw, ph);
        let amb = pn.amb;
        if (pn.tw > 0) amb *= (0.5 + 0.5 * Math.sin(t * 0.04 * pn.tw + pn.ph));
        let inten = 0;
        if (mouse.active) {
          const c = { x: gp.x + pw / 2, y: gp.y + ph / 2 };
          const d = Math.hypot(c.x - mouse.x, c.y - mouse.y);
          if (d < R) inten = Math.pow(1 - d / R, 1.6);
        }
        const lvl = Math.max(amb, inten);
        if (lvl > 0.03) {
          ctx.fillStyle = Gw + Math.min(1, lvl * 0.92).toFixed(3) + ')';
          ctx.fillRect(gp.x + 0.5, gp.y + 0.5, pw - 1, ph - 1);
        }
      }

      drawFacadeGrid(bp);
      drawPodium(bp);
      drawOutline(bp);
      drawCornice(bp);
      drawRooftop(bp);
      drawEntrance(bp);
      drawSignage(bp);

      // foreground landscaping (parallaxes more)
      drawPath(fp);
      drawHedges(fp);
      drawBollards(fp);
      drawFigures(fp);
      drawTrees(fp);

      raf = requestAnimationFrame(frame);
    }

    host.addEventListener('mousemove', (e) => {
      const r = host.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.active = true;
      target.px = ((mouse.x / r.width) - 0.5) * -34;
      target.py = ((mouse.y / r.height) - 0.5) * -20;
    });
    host.addEventListener('mouseleave', () => { mouse.active = false; mouse.x = -9999; mouse.y = -9999; target.px = 0; target.py = 0; });

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { if (raf === null) raf = requestAnimationFrame(frame); }
        else if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      });
    }, { threshold: 0 });
    io.observe(host);

    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 200); });

    resize();
    raf = requestAnimationFrame(frame);
  }
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
