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

    /* ── Indian monuments — line-art SVGs ─────────────────────────────
       Each transition picks one at random from this set. Single-stroke
       paths drawn live via stroke-dasharray as the curtain covers the
       screen. Designed at viewBox 600x400 with the architecture
       centred so the line art sits at the middle of the curtain. */
    const MONUMENTS = [
      // 1 — Taj Mahal
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet">
        <g fill="none" stroke="rgba(200,169,110,0.92)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M 70,355 L 530,355"/>
          <path d="M 100,335 L 500,335"/>
          <path d="M 144,335 L 144,182 L 166,182 L 166,335 Z"/>
          <path d="M 141,182 Q 155,145 169,182"/>
          <path d="M 155,142 L 155,120"/>
          <path d="M 434,335 L 434,182 L 456,182 L 456,335 Z"/>
          <path d="M 431,182 Q 445,145 459,182"/>
          <path d="M 445,142 L 445,120"/>
          <path d="M 200,335 L 200,248 L 400,248 L 400,335"/>
          <path d="M 260,335 L 260,278 Q 260,255 300,255 Q 340,255 340,278 L 340,335"/>
          <path d="M 245,248 L 245,228 L 355,228 L 355,248"/>
          <path d="M 245,228 Q 245,148 300,105 Q 355,148 355,228"/>
          <path d="M 300,105 L 300,72"/>
          <path d="M 192,248 Q 192,212 213,202 Q 234,212 234,248"/>
          <path d="M 213,202 L 213,188"/>
          <path d="M 366,248 Q 366,212 387,202 Q 408,212 408,248"/>
          <path d="M 387,202 L 387,188"/>
        </g>
      </svg>`,

      // 2 — India Gate
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet">
        <g fill="none" stroke="rgba(200,169,110,0.92)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M 80,358 L 520,358"/>
          <path d="M 128,358 L 128,338 L 472,338 L 472,358"/>
          <path d="M 150,338 L 150,313 L 450,313 L 450,338"/>
          <path d="M 178,313 L 178,180"/>
          <path d="M 422,313 L 422,180"/>
          <path d="M 228,313 L 228,180"/>
          <path d="M 372,313 L 372,180"/>
          <path d="M 228,180 Q 228,108 300,108 Q 372,108 372,180"/>
          <path d="M 168,180 L 432,180 L 432,162 L 168,162 Z"/>
          <path d="M 193,162 L 407,162 L 407,140 L 193,140 Z"/>
          <path d="M 210,140 L 210,118 L 390,118 L 390,140"/>
          <path d="M 286,118 L 286,95 L 314,95 L 314,118"/>
          <path d="M 300,95 L 300,75"/>
        </g>
      </svg>`,

      // 3 — Qutub Minar
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet">
        <g fill="none" stroke="rgba(200,169,110,0.92)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M 170,365 L 430,365"/>
          <path d="M 210,365 L 210,342 L 390,342 L 390,365"/>
          <path d="M 232,342 L 244,275 L 356,275 L 368,342 Z"/>
          <path d="M 240,275 L 360,275"/>
          <path d="M 244,265 L 356,265"/>
          <path d="M 250,265 L 258,202 L 342,202 L 350,265"/>
          <path d="M 254,202 L 346,202"/>
          <path d="M 258,193 L 342,193"/>
          <path d="M 262,193 L 268,145 L 332,145 L 338,193"/>
          <path d="M 265,145 L 335,145"/>
          <path d="M 269,136 L 331,136"/>
          <path d="M 272,136 L 278,92 L 322,92 L 328,136"/>
          <path d="M 278,92 Q 278,70 300,60 Q 322,70 322,92"/>
          <path d="M 300,60 L 300,40"/>
        </g>
      </svg>`,

      // 4 — Lotus Temple
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet">
        <g fill="none" stroke="rgba(200,169,110,0.92)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M 60,358 L 540,358"/>
          <path d="M 100,335 L 500,335"/>
          <path d="M 132,335 L 132,313 L 468,313 L 468,335"/>
          <path d="M 282,305 Q 268,205 300,128 Q 332,205 318,305"/>
          <path d="M 252,313 Q 232,225 272,140 Q 295,225 282,305"/>
          <path d="M 348,313 Q 368,225 328,140 Q 305,225 318,305"/>
          <path d="M 215,320 Q 170,250 222,158 Q 254,238 252,313"/>
          <path d="M 385,320 Q 430,250 378,158 Q 346,238 348,313"/>
          <path d="M 178,325 Q 125,270 162,198"/>
          <path d="M 422,325 Q 475,270 438,198"/>
          <path d="M 148,328 Q 138,318 144,308"/>
          <path d="M 452,328 Q 462,318 456,308"/>
        </g>
      </svg>`
    ];

    function pickMonument() {
      // Avoid repeating the same one back-to-back if we can help it.
      const last = parseInt(sessionStorage.getItem('seleqt_last_monument') || '-1', 10);
      let idx = Math.floor(Math.random() * MONUMENTS.length);
      if (MONUMENTS.length > 1 && idx === last) {
        idx = (idx + 1) % MONUMENTS.length;
      }
      const svg = MONUMENTS[idx];
      try {
        sessionStorage.setItem('seleqt_last_monument', String(idx));
        // Hand the chosen SVG to the entering page so its inbound curtain
        // can render the same monument as a background-image until the
        // curtain slides off (otherwise the art would visibly vanish at
        // the moment of navigation).
        sessionStorage.setItem('seleqt_monument', svg);
      } catch (e) {}
      return svg;
    }

    const overlay = document.createElement('div');
    overlay.className = 'page-transition';
    const panel = document.createElement('div');
    panel.className = 'page-transition-panel';

    // The art div is empty at startup; a fresh monument SVG is injected
    // on each click so each transition shows a different one.
    const art = document.createElement('div');
    art.className = 'page-transition-art';
    panel.appendChild(art);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Live-drawing animation. Uses Web Animations API (Element.animate)
    // rather than CSS transitions — necessary because the SVG is injected
    // via innerHTML on every click. CSS transitions on freshly-inserted
    // elements suffer from the "initial state never paints" problem where
    // the browser collapses the invisible→visible writes into one frame,
    // skipping the animation. Element.animate sidesteps that entirely:
    // the animation is registered with the compositor and runs regardless
    // of style commit ordering.
    //
    // Total draw time (drawMs + staggerMs) ≈ 800ms — finishes ~300ms
    // BEFORE the 1100ms curtain finishes covering, so the monument sits
    // "completed" for a beat before navigation fires.
    function animateCurtainDraw(svgEl) {
      const items = Array.from(svgEl.querySelectorAll('path, circle, ellipse'));
      if (!items.length) return;
      const lastIdx = Math.max(1, items.length - 1);
      const drawMs = 500;
      const staggerMs = 300;

      items.forEach((el, i) => {
        let len = 0;
        try { len = el.getTotalLength ? el.getTotalLength() : 0; } catch (e) {}
        // Fallback for elements where getTotalLength returns 0. 2000 is
        // longer than any path in our monument set, so the dash still
        // fully hides it at full offset.
        if (!len || len <= 0) len = 2000;

        // CRITICAL: set BOTH dasharray AND dashoffset as presentation
        // attributes. dasharray alone (with default dashoffset=0) leaves
        // the path fully visible — the dash pattern starts at the beginning
        // of the stroke. Setting dashoffset=len shifts the visible portion
        // out into the gap, making the path invisible from the very first
        // paint frame. Inline opacity=0 belt-and-braces.
        el.setAttribute('stroke-dasharray', String(len));
        el.setAttribute('stroke-dashoffset', String(len));
        el.style.opacity = '0';

        const delay = (i / lastIdx) * staggerMs;

        // Animate from invisible to fully drawn. fill: 'forwards' keeps the
        // last keyframe (dashoffset=0, opacity=1) applied after the
        // animation ends, so the path stays drawn. Before delay elapses,
        // there's no fill, so the attribute / inline-style initial state
        // (invisible) applies.
        try {
          el.animate(
            [
              { strokeDashoffset: len, opacity: 0 },
              { strokeDashoffset: 0,   opacity: 1 }
            ],
            {
              duration: drawMs,
              delay: delay,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'forwards'
            }
          );
        } catch (e) {
          // Last-resort fallback for ancient browsers without
          // Element.animate — just show the path.
          el.style.opacity = '1';
          el.removeAttribute('stroke-dashoffset');
        }
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
      // Inject a fresh random monument SVG into the art container so each
      // transition shows a different piece. pickMonument also persists
      // the chosen SVG to sessionStorage so the entering page can render
      // the same monument on its inbound curtain.
      art.innerHTML = pickMonument();
      overlay.classList.add('is-leaving');
      // Trigger the live drawing in parallel with the panel slide.
      // Curtain slide: 1100ms. Drawing: ~800ms (500ms draw + 300ms stagger).
      // So the monument finishes ~300ms before the curtain fully covers.
      const svgEl = art.querySelector('svg');
      if (svgEl) animateCurtainDraw(svgEl);
      // 1100ms slide + 50ms breath so the curtain fully covers before we
      // navigate. Inbound page picks up the same monument as background.
      setTimeout(() => { window.location.href = href; }, 1150);
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
