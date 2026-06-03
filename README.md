# SELEQT — Private Wealth Management Website

Live: **[seleqtwealth.in](https://seleqtwealth.in)**

A static HTML/CSS/JS site for SELEQT, a boutique private wealth firm based in Ahmedabad. Deployed via GitHub Pages on every push to `main`.

## File structure

```
seleqtwealth/
├── index.html             ← Homepage (hero, services carousel, contact form)
├── about.html             ← About the firm + team section
├── investments.html       ← Investments practice page
├── taxation.html          ← Taxation practice page
├── insurance.html         ← Insurance practice page
├── succession.html        ← Succession planning practice page
├── blogs.html          ← Editorial / blog listing page
├── blogs/              ← Individual long-form articles
│   └── fee-only-advisory.html
├── 404.html               ← Custom not-found page (served by GitHub Pages)
├── style.css              ← All styles
├── main.js                ← Interactions, animations, cookie consent, GA4 loader
├── favicon.svg            ← Site favicon
├── sitemap.xml            ← For search engines (Google Search Console)
├── robots.txt             ← Crawler instructions
├── images/team/           ← Team member photos (webp)
├── pattern-floral.svg     ← Decorative asset
├── CNAME                  ← Custom domain mapping for GitHub Pages
├── SEO.md                 ← SEO playbook / checklist
└── README.md
```

## Adding a new Blog article

1. Copy `blogs/fee-only-advisory.html` to `blogs/your-article-slug.html`.
2. Update title, meta description, canonical URL, OG tags, JSON-LD schema, and date.
3. Write the article body inside `<div class="article-body">`. Use `<h2>` for sections, `<blockquote>` for pull quotes, `<ol class="article-ol">` for numbered lists.
4. Add the article to `blogs.html` listing (replace one of the "in development" cards with a real entry, or add a new section).
5. Add the URL to `sitemap.xml`.
6. Commit + push.

## Deployment

The site is hosted on GitHub Pages with the custom domain `seleqtwealth.in` (configured via the `CNAME` file).

Any push to `main` triggers a rebuild — the live site updates within ~1 minute.

## Configuration TODOs

- **Open Graph image**: drop a 1200×630 PNG named `og-image.png` at the repo root for richer link previews on WhatsApp / LinkedIn / Twitter.
- **Team section** in `about.html`: replace the 4 placeholder cards with real names, roles, and bios.

Google Analytics 4 is wired up (Measurement ID `G-FF6XR4Q4P1` in `main.js`) and gated by the cookie consent banner.

## Tech notes

- No build step. Edit HTML/CSS/JS directly, commit, push.
- Contact form submits via [Web3Forms](https://web3forms.com). Form access key is in `index.html`; lock it to `seleqtwealth.in` in the Web3Forms dashboard to prevent off-domain spam.
- WhatsApp click-to-chat number and the GA4 Measurement ID live in `main.js` so they can be updated in one place.
- Cookie consent banner gates GA4 loading — no tracking fires until the user clicks Accept (DPDP Act 2023 safe).

## Features

- Animated hero with cursor-tracking gold spotlight
- Scroll-triggered reveal animations
- Vertical services carousel with active-state index
- Marquee strip of service categories with cursor parallax
- Custom dropdowns with full keyboard navigation
- Page-to-page transition curtain with live SVG drawing
- Custom animated cursor (gold dot + ring) on desktop
- Mobile responsive with hamburger menu
- WhatsApp click-to-chat floating button
- Cookie consent banner + GA4 (when configured)
- `prefers-reduced-motion` honored throughout

## Brand palette

- Navy: `#0a1a35`
- Gold: `#b8924e`
- Paper (cream background): `#f5f1e8`
- Typography: Cormorant Garamond (display) + Outfit (body)
