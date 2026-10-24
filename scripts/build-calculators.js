#!/usr/bin/env node
/* Builds the SELEQT calculator pages from the registry in calculators/calc.js.

   Writes:
     calculators/<slug>.html            one public page per calculator
     calculator-links-<key>.html        the unlisted internal list of every link
     sitemap.xml                        the block between the calculator markers
     images/calculators/<slug>.jpg      LinkedIn / social preview cards (--og)

   Run from the repo root:
     node scripts/build-calculators.js          pages + links page + sitemap
     node scripts/build-calculators.js --og     also re-render the preview images

   To add a calculator: add it to CALCS, GROUPS and SLUGS in calculators/calc.js,
   then run this with --og. Never rename an existing slug: posted links break. */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://seleqtwealth.in";
const LINKS_PAGE = "calculator-links-lxq4dncm"; // unlisted; never link it or put it in the sitemap
const { CALCS, GROUPS, byId, related, DISC } = require(path.join(ROOT, "calculators/calc.js"));
const today = new Date().toISOString().slice(0, 10);

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function title(c) { return c.name + " Calculator"; }
function firstSentence(s) { const m = s.match(/^.*?[.!?](\s|$)/); return (m ? m[0] : s).trim(); }
function description(c) {
  let d = firstSentence(c.about);
  if (d.length < 120) d += " Free, instant, no sign-up.";
  return d;
}
function lead(c) { return c.tag.charAt(0).toUpperCase() + c.tag.slice(1) + "."; }

const HEAD_COMMON = `  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="/style.css" />
  <link rel="stylesheet" href="/calculators/calc.css" />
  <link rel="preload" href="/fonts/outfit-300-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/cormorant-garamond-500-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
  <!-- Page-transition pre-paint: applies entering-curtain class if the user
       just clicked through from another page on the site. Cleared by main.js. -->
  <script>
    (function() {
      if (sessionStorage.getItem('seleqt_transitioning')) {
        document.documentElement.classList.add('is-page-entering');
        sessionStorage.removeItem('seleqt_transitioning');
      }
    })();
  </script>`;

const NAV = `  <!-- NAV -->
  <nav id="navbar">
    <div class="nav-inner">
      <a href="/" class="logo">SELEQT</a>
      <div class="nav-links">
        <a href="/services">Services</a>
        <a href="/gift-city">GIFT City</a>
        <a href="/blogs">Blogs</a>
        <a href="/about">About</a>
        <a href="/#contact" class="nav-cta">Speak With Us</a>
      </div>
      <button class="hamburger" id="hamburger" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
    <div class="mobile-menu" id="mobileMenu">
      <a href="/services">Services</a>
      <a href="/gift-city">GIFT City</a>
      <a href="/blogs">Blogs</a>
      <a href="/about">About</a>
      <a href="/#contact">Speak With Us</a>
    </div>
  </nav>`;

const FOOTER = `  <!-- FOOTER -->
  <footer class="footer">
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand">
          <a href="/" class="logo">SELEQT</a>
          <p>Private wealth, considered from every angle.</p>
        </div>
        <div class="footer-col">
          <h2>Practice</h2>
          <a href="/investments">Investments</a>
          <a href="/taxation">Taxation</a>
          <a href="/insurance">Insurance</a>
          <a href="/succession">Succession Planning</a>
          <a href="/family-office">Family Office</a>
        </div>
        <div class="footer-col">
          <h2>Firm</h2>
          <a href="/about">About</a>
          <a href="/gift-city">GIFT City</a>
          <a href="/blogs">Blogs</a>
          <a href="/#contact">Contact</a>
        </div>
        <div class="footer-col">
          <h2>Reach</h2>
          <span>contact@seleqtwealth.in</span>
          <span>+91 99981 39596</span>
          <span>313, Arista Business Space, Ahmedabad, Gujarat, 380059</span>
        </div>
      </div>

      <div class="footer-wordmark">SELEQT</div>

      <div class="footer-bottom">
        <p>&copy; <span class="footer-year">2026</span> SELEQT Private Wealth. All rights reserved.</p>
        <p class="disclaimer">
          Calculators are for illustration only and are not investment advice. Returns, rates and inflation are assumptions you choose, not guarantees. Mutual fund investments are subject to market risks, read all scheme related documents carefully. Past performance is not indicative of future results.
        </p>
      </div>
    </div>
  </footer>`;

function page(c) {
  const url = SITE + c.url;
  const t = title(c);
  const d = description(c);
  const og = SITE + "/images/calculators/" + c.slug + ".jpg";
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: t,
    url: url,
    description: d,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    provider: { "@type": "Organization", name: "SELEQT", url: SITE + "/" }
  };
  const how = c.how.map(function (s) { return "            <li>" + esc(s) + "</li>"; }).join("\n");
  const more = related(c.id, 3).map(function (r) {
    return `          <a class="cx-card" href="${r.url}">
            <span class="cx-card-ico" aria-hidden="true">${r.icon}</span>
            <span class="cx-card-name">${esc(r.name)}</span>
            <span class="cx-card-tag">${esc(lead(r))}</span>
            <span class="cx-card-go">Open calculator &rarr;</span>
          </a>`;
  }).join("\n");
  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0a1a35" />
  <title>${esc(t)} · SELEQT</title>
  <meta name="description" content="${esc(d)}" />
  <link rel="canonical" href="${url}" />

  <!-- Open Graph / social sharing (LinkedIn reads these) -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="SELEQT" />
  <meta property="og:title" content="${esc(t)} · SELEQT" />
  <meta property="og:description" content="${esc(d)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${og}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="SELEQT ${esc(t)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(t)} · SELEQT" />
  <meta name="twitter:description" content="${esc(d)}" />
  <meta name="twitter:image" content="${og}" />

  <script type="application/ld+json">
  ${JSON.stringify(ld)}
  </script>

${HEAD_COMMON}
</head>
<body class="cx-body">
${NAV}

  <!-- Generated by scripts/build-calculators.js from calculators/calc.js. Edit those, not this file. -->
  <section class="sub-hero cx-hero">
    <div class="container sub-hero-content">
      <span class="cx-hero-ico" aria-hidden="true">${c.icon}</span><br />
      <p class="section-tag">Free calculator</p>
      <h1>${esc(c.name)} <em>Calculator</em></h1>
      <p class="lead">${esc(lead(c))}</p>
    </div>
  </section>

  <section class="cx-section">
    <div class="container">
      <div class="cx-wrap">
        <div id="cx" data-calc="${c.id}">
          <noscript><p class="cx-noscript">This calculator needs JavaScript switched on.</p></noscript>
        </div>
        <p class="cx-note">${esc(c.note || DISC)}</p>
      </div>
    </div>
  </section>

  <section class="cx-explain">
    <div class="container">
      <div class="cx-wrap cx-explain-grid">
        <div>
          <h2>What it <em>is</em></h2>
          <p>${esc(c.about)}</p>
        </div>
        <div>
          <h2>How to <em>use it</em></h2>
          <ol class="cx-how">
${how}
          </ol>
        </div>
      </div>
    </div>
  </section>

  <section class="cx-more">
    <div class="container">
      <div class="cx-wrap">
        <p class="cx-more-title">Try another calculator</p>
        <div class="cx-more-grid">
${more}
        </div>
      </div>
    </div>
  </section>

  <section class="sub-cta-section">
    <div class="container">
      <h3>Turn the numbers<br/><em>into a plan</em></h3>
      <p>A calculator shows one path. We build the whole picture around your goals, your tax position and your family.</p>
      <a href="/#contact" class="btn-primary">Speak With Us</a>
    </div>
  </section>

${FOOTER}

  <script src="/calculators/calc.js"></script>
  <script src="/main.js"></script>
</body>
</html>
`;
}

function linksPage() {
  const data = CALCS.map(function (c) {
    return { id: c.id, name: c.name, url: SITE + c.url, keys: c.inputs.map(function (f) { return f.id; }) };
  });
  const groups = GROUPS.map(function (g) {
    const rows = g.ids.map(function (id) {
      const c = byId[id];
      const full = SITE + c.url;
      return `        <div class="cl-row" data-q="${esc((c.name + " " + c.tag + " " + c.slug).toLowerCase())}">
          <span class="cl-ico" aria-hidden="true">${c.icon}</span>
          <div>
            <span class="cl-name">${esc(c.name)}</span> <span class="cl-tag">&middot; ${esc(c.tag)}</span>
            <a class="cl-url" href="${c.url}" target="_blank" rel="noopener">${full.replace("https://", "")}</a>
            <span class="cl-keys">Presets: ${c.inputs.map(function (f) { return esc(f.id); }).join(", ")}</span>
          </div>
          <div class="cl-row-actions">
            <button type="button" class="cl-btn is-primary" data-copy="${full}">Copy link</button>
            <button type="button" class="cl-btn" data-copy="${full}?utm_source=linkedin&amp;utm_medium=social&amp;utm_campaign=calculators&amp;utm_content=${c.slug}">Copy LinkedIn link</button>
            <a class="cl-btn" href="${c.url}" target="_blank" rel="noopener">Open</a>
          </div>
        </div>`;
    }).join("\n");
    return `      <div class="cl-group">
        <p class="cl-group-title">${esc(g.title)} <span>${g.ids.length}</span></p>
${rows}
      </div>`;
  }).join("\n");
  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0a1a35" />
  <title>Calculator links · SELEQT</title>
  <!-- Unlisted internal page: every calculator link in one place. Not linked from
       the site, not in the sitemap, kept out of search results. -->
  <meta name="robots" content="noindex, nofollow" />
${HEAD_COMMON}
</head>
<body>
${NAV}

  <!-- Generated by scripts/build-calculators.js. Edit that, not this file. -->
  <main class="cl-page">
    <div class="container">
      <div class="cl-wrap">
        <div class="cl-top">
          <div>
            <h1>Calculator <em>links</em></h1>
            <p>All ${CALCS.length} calculators, each on its own page on seleqtwealth.in. This page is not linked anywhere on the site and is hidden from search engines.</p>
          </div>
          <div class="cl-actions">
            <input type="search" class="cl-search" id="clSearch" placeholder="Search calculators" aria-label="Search calculators" />
            <button type="button" class="cl-btn" id="clCopyAll">Copy all links</button>
          </div>
        </div>
${groups}
        <p class="cl-foot">
          <b>Copy LinkedIn link</b> adds a tag so visits from each post show up in Google Analytics under the campaign <code>calculators</code>.<br />
          <b>Presets:</b> add numbers to any link to open it already filled in, for example <code>seleqtwealth.in/calculators/sip?monthly=10000&amp;years=20</code>. The names you can use are listed under each calculator. On every calculator page, the &ldquo;Copy a link to these numbers&rdquo; button builds this for you.
        </p>
      </div>
    </div>
  </main>

  <script>
  (function () {
    var DATA = ${JSON.stringify(data)};
    function copy(text, btn) {
      var label = btn.textContent;
      function done(ok) {
        btn.textContent = ok ? "Copied" : "Copy failed";
        btn.classList.add("is-done");
        setTimeout(function () { btn.textContent = label; btn.classList.remove("is-done"); }, 1800);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else done(false);
    }
    document.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () { copy(b.getAttribute("data-copy"), b); });
    });
    document.getElementById("clCopyAll").addEventListener("click", function () {
      copy(DATA.map(function (d) { return d.name + ": " + d.url; }).join("\\n"), this);
    });
    var q = document.getElementById("clSearch");
    q.addEventListener("input", function () {
      var v = q.value.trim().toLowerCase();
      document.querySelectorAll(".cl-group").forEach(function (g) {
        var shown = 0;
        g.querySelectorAll(".cl-row").forEach(function (r) {
          var hit = !v || r.getAttribute("data-q").indexOf(v) > -1;
          r.hidden = !hit; if (hit) shown++;
        });
        g.hidden = shown === 0;
      });
    });
  })();
  </script>
  <script src="/main.js"></script>
</body>
</html>
`;
}

function updateSitemap() {
  const file = path.join(ROOT, "sitemap.xml");
  let xml = fs.readFileSync(file, "utf8");
  const block = "  <!-- calculators:start (generated by scripts/build-calculators.js) -->\n" +
    CALCS.map(function (c) {
      return "  <url>\n    <loc>" + SITE + c.url + "</loc>\n    <lastmod>" + today + "</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>";
    }).join("\n") + "\n  <!-- calculators:end -->";
  const re = /  <!-- calculators:start[\s\S]*?<!-- calculators:end -->/;
  if (re.test(xml)) xml = xml.replace(re, block);
  else xml = xml.replace("</urlset>", block + "\n</urlset>");
  fs.writeFileSync(file, xml);
}

/* ---- social preview cards, rendered with headless Chrome ---- */
function ogHtml(c) {
  const font = function (f) { return "file://" + path.join(ROOT, "fonts", f); };
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face { font-family: CG; font-weight: 400; src: url('${font("cormorant-garamond-400-normal-latin.woff2")}'); }
@font-face { font-family: CG; font-weight: 500; src: url('${font("cormorant-garamond-500-normal-latin.woff2")}'); }
@font-face { font-family: CG; font-weight: 400; font-style: italic; src: url('${font("cormorant-garamond-400-italic-latin.woff2")}'); }
@font-face { font-family: OF; font-weight: 300; src: url('${font("outfit-300-normal-latin.woff2")}'); }
@font-face { font-family: OF; font-weight: 400; src: url('${font("outfit-400-normal-latin.woff2")}'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body {
  position: relative; color: #f4f1ea;
  background: radial-gradient(ellipse 70% 80% at 32% 38%, #13284d 0%, #0a1a35 42%, #030a17 100%);
  font-family: OF, sans-serif;
}
.grid { position: absolute; inset: 0;
  background-image: linear-gradient(rgba(244,241,234,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(244,241,234,0.035) 1px, transparent 1px);
  background-size: 60px 60px; }
.frame { position: absolute; inset: 34px; border: 1px solid rgba(184,146,78,0.35); }
.c { position: absolute; width: 22px; height: 22px; border-color: #b8924e; border-style: solid; }
.c1 { top: 34px; left: 34px; border-width: 2px 0 0 2px; } .c2 { top: 34px; right: 34px; border-width: 2px 2px 0 0; }
.c3 { bottom: 34px; left: 34px; border-width: 0 0 2px 2px; } .c4 { bottom: 34px; right: 34px; border-width: 0 2px 2px 0; }
.brand { position: absolute; top: 82px; left: 96px; font-family: CG; font-weight: 500; font-size: 34px; letter-spacing: 0.42em; }
.kicker { position: absolute; top: 202px; left: 96px; font-size: 19px; letter-spacing: 0.36em; text-transform: uppercase; color: #c8a96e; }
h1 { position: absolute; top: 240px; left: 92px; width: 760px; font-family: CG; font-weight: 400; font-size: ${c.name.length > 14 ? 84 : 100}px; line-height: 1.02; letter-spacing: -0.01em; }
h1 em { font-style: italic; color: #d4b06a; }
.tag { position: absolute; left: 96px; bottom: 150px; font-size: 27px; font-weight: 300; color: rgba(244,241,234,0.72); }
.url { position: absolute; left: 96px; bottom: 82px; font-size: 20px; letter-spacing: 0.08em; color: #b8924e; }
.ico { position: absolute; right: 110px; top: 50%; transform: translateY(-50%); width: 230px; height: 230px; border: 1px solid rgba(184,146,78,0.4); border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: #b8924e; }
.ico svg { width: 104px; height: 104px; stroke-width: 1.4; }
</style></head><body>
<div class="grid"></div><div class="frame"></div><div class="c c1"></div><div class="c c2"></div><div class="c c3"></div><div class="c c4"></div>
<div class="brand">SELEQT</div>
<div class="kicker">Free calculator</div>
<h1>${esc(c.name)}<br><em>Calculator</em></h1>
<div class="tag">${esc(lead(c))}</div>
<div class="url">seleqtwealth.in/calculators/${c.slug}</div>
<div class="ico">${c.icon}</div>
</body></html>`;
}

function buildOg() {
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const outDir = path.join(ROOT, "images/calculators");
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seleqt-og-"));
  CALCS.forEach(function (c) {
    const html = path.join(tmp, c.slug + ".html");
    const png = path.join(tmp, c.slug + ".png");
    fs.writeFileSync(html, ogHtml(c));
    execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      "--allow-file-access-from-files", "--virtual-time-budget=1500", "--window-size=1200,630",
      "--screenshot=" + png, "file://" + html], { stdio: "ignore" });
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "84", png, "--out", path.join(outDir, c.slug + ".jpg")], { stdio: "ignore" });
  });
  fs.rmSync(tmp, { recursive: true, force: true });
}

CALCS.forEach(function (c) {
  fs.writeFileSync(path.join(ROOT, "calculators", c.slug + ".html"), page(c));
});
fs.writeFileSync(path.join(ROOT, LINKS_PAGE + ".html"), linksPage());
updateSitemap();
if (process.argv.indexOf("--og") > -1) buildOg();
console.log("Built " + CALCS.length + " calculator pages, /" + LINKS_PAGE + ", sitemap" + (process.argv.indexOf("--og") > -1 ? ", preview images" : ""));
