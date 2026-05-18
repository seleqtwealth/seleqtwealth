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
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = contactForm.querySelector('button[type="submit"]');
    const original = btn.textContent;
    btn.textContent = 'Message Sent ✓';
    btn.style.background = 'rgba(200,169,110,0.3)';
    btn.style.color = 'var(--gold)';
    btn.style.border = '1px solid var(--gold-dim)';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.style.background = '';
      btn.style.color = '';
      btn.style.border = '';
      btn.disabled = false;
      contactForm.reset();
    }, 3500);
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
    document.querySelectorAll(
      '.about-title, .sc-title, .contact-section .section-title'
    ).forEach(splitElement);
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

  /* ── 5. Marquee tunes to scroll velocity ────────────────────────────
     Fast scrolling temporarily shortens the marquee duration so the
     bottom-strip feels reactive. Reverts on scroll idle. Pause-on-hover
     is handled in CSS. */
  (function() {
    const track = document.querySelector('.marquee-track');
    if (!track || reducedMotion) return;
    let lastY = window.scrollY;
    let lastT = performance.now();
    let fastTimer;
    window.addEventListener('scroll', () => {
      const now = performance.now();
      const v = Math.abs(window.scrollY - lastY) / Math.max(now - lastT, 1);
      lastY = window.scrollY;
      lastT = now;
      if (v > 0.45) {
        track.style.setProperty('--marquee-duration', '20s');
        clearTimeout(fastTimer);
        fastTimer = setTimeout(() => {
          track.style.setProperty('--marquee-duration', '48s');
        }, 700);
      }
    }, { passive: true });
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
    const overlay = document.createElement('div');
    overlay.className = 'page-transition';
    const panel = document.createElement('div');
    panel.className = 'page-transition-panel';
    const glyph = document.createElement('span');
    glyph.className = 'page-transition-glyph';
    glyph.textContent = 'SELEQT';
    panel.appendChild(glyph);
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
