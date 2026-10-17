# SELEQT Private Wealth website

Live: **[seleqtwealth.in](https://seleqtwealth.in)**

A static HTML/CSS/JS site with no build step. Edit the files directly, commit, and push to `main`.

## Hosting and deploys

- Hosted on **Vercel**. A push to `main` deploys in about 30 seconds.
- The Git to Vercel webhook has been unreliable. If the live site does not update after a push, trigger the project's **Deploy Hook** (Vercel project Settings, Git, Deploy Hooks). The same URL is stored as the repo secret `VERCEL_DEPLOY_HOOK` for the blog scheduler.
- `vercel.json` turns on clean URLs (`/about` serves `about.html`).
- `.vercelignore` keeps `scripts/`, `_castest/`, `_local/`, `brand/`, `.claude/` and the internal docs off the live site.
- DNS for `seleqtwealth.in` is managed at Hostinger. Email is Zoho: never touch its MX, SPF or verification records.

## Local preview

```
python3 -m http.server 8768 --bind 127.0.0.1
```

Then open `http://localhost:8768/index.html`. Locally, pages need the `.html` suffix (clean URLs only exist on Vercel). Keep `--bind 127.0.0.1` so test statements in `_castest/` are never exposed to the network.

## Pages

| Page | File |
|---|---|
| Home (hero, services carousel, contact form) | `index.html` |
| Services overview (five boxes) | `services.html` |
| Family Office, Investments, Taxation, Insurance, Succession | `family-office.html`, `investments.html`, `taxation.html`, `insurance.html`, `succession.html` |
| GIFT City (for global investors) | `gift-city.html` |
| About and team | `about.html` |
| Blog listing and articles | `blogs.html`, `blogs/*.html` |
| Not found | `404.html` |

**Unlisted pages** (noindex, linked from nowhere, shared by link only): `portfolio-analyser-uguexidh.html` (portfolio analyser), `family-atlas-wp6ghl7s.html` (ATLAS fill-in file), `analyst-test/` (hiring assessments). Never add them to the sitemap or `robots.txt`.

## Shared header and footer

The nav and footer are written out in every page, not injected. A nav or footer change has to be made in every `*.html`, every `blogs/*.html`, and `scripts/blog_template.html` (used for new articles).

## Things that change over time

- **Travel bar:** a gold notice above the nav, built in `main.js` (search "Travel concierge bar"). The city it names follows the `TRIP` dates there (Monaco time); before them it shows the `FALLBACK` city, and after the last date (30 Oct 2026) it hides itself. To take it down sooner, set `MONACO_BAR = false`; for a new trip, edit `TRIP`. "Arrange a private meeting" opens the booking link set in `SELEQT_BOOKING_URL`. On a fresh load it arrives as a small pill that rises into the bar; the close button hides it only until the next load.
- **Blog schedule:** article pages already exist in `blogs/`. `scripts/schedule.json` lists when each one appears on the listing and in the sitemap; `.github/workflows/publish-blog.yml` runs `scripts/publish_next.py` every Wednesday at 09:00 IST and then fires the deploy hook. Add new entries to keep the weekly cadence going.
- **GIFT City figures:** the growth chart (IMF World Economic Outlook) and the rupee chart (US Federal Reserve H.10 via FRED, series `DEXINUS`) are written into `gift-city.html` as static markup and data. Refresh them by hand when the IMF publishes a new outlook.
- **Hero photos:** `images/heroes/` holds the monochrome hero images for GIFT City (Vivek Doshi, Unsplash licence, no credit required) and Family Office (Sidi Saiyyed jali, Bernard Gagnon, CC BY-SA 3.0). The jali requires the credit line shown in the Family Office hero; keep it if the image stays. The gold hover glow is the `[data-glow]` script in `main.js`.
- **Portfolio analyser data:** `data/*.json`, rebuilt by the scripts in `scripts/` (not deployed).

## Integrations

- **Contact form:** Web3Forms (access key in `index.html`; keep it locked to `seleqtwealth.in` in the Web3Forms dashboard).
- **Analytics:** Google Analytics 4 (`G-FF6XR4Q4P1` in `main.js`), loaded only after the visitor accepts the cookie banner.
- **WhatsApp button:** number and default message in `main.js`.

## House style

- No em dashes or en dashes in any copy. Use commas, colons or parentheses.
- "SELEQT" is always written in capitals.

## Brand

- Navy `#0a1a35`, gold `#b8924e`, paper `#f5f1e8`
- Cormorant Garamond (display) and Outfit (body), self-hosted in `fonts/`
