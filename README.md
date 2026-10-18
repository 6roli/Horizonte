# Horizonte

Recent Meteosat image sequences over Spain and the western Mediterranean, with explicit observation
times, sources and limitations. First app of a wider project on weather, extreme events, the ocean and the
coast. *Horizonte* is a provisional name, defined once in `src/config/app.ts` (`APP_NAME`) and in `index.html`.

| | |
|---|---|
| Live app | https://horizonte.pages.dev *(final address confirmed after the first deployment)* |
| Data | EUMETSAT EUMETView WMS — Meteosat-12 (MTG-I1) FCI. Public, no account, CC BY 4.0 |
| Hosting | Cloudflare Pages, Free plan, connected to this repository |
| Monthly cost | €0 |

**Scope of v1:** observations only. No forecasts, estimates, detections, alerts or warnings.

## Technologies: what, where, why

| Technology | Runs where | Why it is needed |
|---|---|---|
| **HTML + CSS** | Browser | Page structure and styling. No CSS framework. |
| **TypeScript** | Compiled at build time; runs in the browser as JavaScript | Type checking catches mistakes in data handling (times, URLs, manifest fields). |
| **Vite** | Your computer and Cloudflare's build server | Development server with live reload; bundles the TypeScript into one static JS file. |
| **Leaflet** (only runtime library) | Browser | Zoom, pan, scale bar and coordinates on the satellite image, in a latitude/longitude projection. |
| **Vitest** | Your computer and Cloudflare's build server | Unit tests for the logic that matters: time handling, data validation, playback. |
| **Node.js + npm** | Your computer and Cloudflare's build server | Installs the tools above and runs the build. Node also runs `scripts/make-sample.ts` directly (built-in TypeScript support, Node 24+). |
| **EUMETView WMS** (EUMETSAT) | EUMETSAT's servers | Renders the Meteosat images for the requested area and time. |
| **Cloudflare Pages** | Cloudflare | Builds the site on every push and serves the static files over HTTPS. |
| **Python** | Not used yet | Reserved for future analyses (see below). |

## How it works

```
Browser opens the page (static files from Cloudflare Pages)
  1. asks EUMETView which observation times exist   (1 small XML request per layer, ~7 kB)
  2. picks the last 18 times common to both layers, 20 minutes apart (6 hours)
  3. loads each 1200×550 image from EUMETView, 3 at a time, newest first (browser-cached)
  4. if EUMETView cannot be reached → loads data/sample/ (committed, labelled "Historical sample")
```

There is no Horizonte server, database or scheduled job. EUMETView is a public service designed for this kind
of use; its responses carry `Access-Control-Allow-Origin: *` and are cacheable for 7 days. Each visit makes about
20 requests to EUMETSAT (~2 MB); the app never retries in a loop and keeps parallel requests below EUMETView's limit.

### Code layout

```
index.html               Page structure and the "About these images" text
src/config/app.ts        App name, portfolio link, region, layers, time zone, thresholds
src/data/                Data access (no DOM):
  wms.ts                   WMS helpers: time dimension parsing, URL building
  sequence.ts              Builds the sequence to play (live from WMS, or from the sample manifest)
  load.ts                  Fetches live data, falls back to the sample
  manifest.ts              Schema and validation of the sample manifest
  freshness.ts             fresh / stale / outdated / sample
  preload.ts               Image preloading with a concurrency limit
src/ui/                  Presentation: Leaflet map, playback rules, time formatting
src/main.ts              Connects data and UI
src/i18n/en.ts           Interface strings (Spanish: add es.ts with the same keys)
scripts/make-sample.ts   Regenerates the historical sample (run by hand)
public/data/sample/      Committed sample: 18 frames × 2 layers at 800 px (~1.7 MB)
tests/                   Vitest unit tests
docs/data-sources.md     Source evaluation: interfaces, formats, licence, costs
```

## Develop locally (VS Code)

Requirements: **Node.js 24 LTS**, **Git** and **VS Code**.

```bash
git clone https://github.com/6roli/horizonte.git
cd horizonte
npm ci            # installs exact versions from package-lock.json
npm run dev       # http://localhost:5173 — reloads on save
```

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript check (app, scripts and tests) |
| `npm run build` | Type check + production build into `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run verify` | Type check + tests + build — the same command Cloudflare runs |
| `npm run make:sample -- --end 2026-10-18T12:00:00Z --note "…"` | Regenerate the historical sample (`--width`, default 800) |

No secrets or `.env` file are needed: all data sources are public.

To change the region, layers, sequence length or thresholds, edit `src/config/app.ts`. Layer names come from
`https://view.eumetsat.int/geoserver/wms?service=WMS&request=GetCapabilities`; give each new layer an honest
`kind` (`observation`, `estimate` or `forecast`) and a plain-language explanation.

## Publish

Cloudflare Pages is connected to this GitHub repository (Git integration):

- push to `main` → Cloudflare runs `npm run verify`; if every check passes, the new version goes live;
- push to another branch or open a pull request → a preview URL, shown in GitHub next to the commit;
- if a check fails, nothing is deployed and the previous version stays online.

Cloudflare Pages project settings:

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run verify` |
| Build output directory | `dist` |
| Production branch | `main` |
| Node.js version | from `.nvmrc` (24) |

`public/_headers` sets security headers (the Content-Security-Policy allows images only from this site and
`view.eumetsat.int`) and caching.

## Data and licence

Under the EUMETSAT Data Policy, RGB composites and single-channel visualisations served via WMS are
*Advanced Image Products*: **Core data, free and unrestricted under CC BY 4.0**, whatever their latency.
Required attribution, shown on the map and in the footer:

> Contains modified EUMETSAT Meteosat data 2026

These are **images for viewing, not scientific data**: stretched, compressed and reprojected. Analysis needs
the original numerical data from the EUMETSAT Data Store (free account). Numerical Level 1 data with less than
1 hour latency is "Recommended" data and may not be redistributed. See [docs/data-sources.md](docs/data-sources.md).
No imagery is taken from Windy or other third-party viewers.

## Adding Python analyses later

When an analysis needs numerical data (e.g. cloud-top temperatures from Level 1c NetCDF), add it in its own folder
so the web app stays unchanged:

```
analysis/
  pyproject.toml     # dependencies declared here (e.g. xarray, netCDF4, eumdac)
  src/…
```

```bash
cd analysis
python -m venv .venv
.venv\Scripts\activate          # Windows;  source .venv/bin/activate on macOS/Linux
pip install -e .
```

Publish only the small results the app needs (images, JSON) into `public/data/`, never raw satellite files
(they are excluded in `.gitignore`). Data Store credentials go in a local `.env` file, never in Git.

## Costs

| Item | Cost | Notes |
|---|---|---|
| Hosting | €0 | Cloudflare Pages Free: static requests and bandwidth are unlimited; no payment method needed |
| Builds | €0 | 500 builds/month per Cloudflare account on the Free plan; one build per push |
| Data | €0 | EUMETView is public; its capabilities state `Fees: none` |
| Domain | — | Not purchased (see the portfolio's `docs/domain.md`) |

## Limitations

- Images, not measurements: colours cannot be converted back to physical values.
- The time shown is the nominal scan start; a full-disc scan takes ~10 minutes.
- Parallax: high clouds appear shifted north by roughly 10 km or more at these latitudes.
- EUMETView publishes each image ~15–30 minutes after the scan starts; data older than 1 h is flagged as stale, older than 3 h as outdated.
- GeoColour at night uses a fixed background for land and city lights.
- The Canary Islands are outside the region.
- Depends on EUMETView's availability; otherwise the labelled sample is shown.
- Not an official service. For warnings in Spain use [AEMET](https://www.aemet.es) and [Meteoalarm](https://meteoalarm.org).
