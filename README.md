# Horizonte

A hub of small, honest tools for **Earth observation, weather and satellites over Spain and the western
Mediterranean**. The tools share one design, one top bar and the same data helpers, and each one states its
sources, times and limitations. *Horizonte* is a provisional name, defined once in `src/config/app.ts`
(`APP_NAME`) and in the `<title>` of each page.

| | |
|---|---|
| Live app | https://horizonte.gabriel-olius.workers.dev |
| Hosting | Cloudflare (Workers static assets), Free plan, connected to this repository |
| Monthly cost | €0 — no server, no database, no API keys |

## Modules

| Route | Module | Data | What it shows |
|---|---|---|---|
| `/` | **Hub** | — | Introduction and one card per module |
| `/viewer/` | **Satellite viewer** | EUMETSAT EUMETView WMS — Meteosat-12 (MTG-I1) FCI | The last 6 hours of GeoColour and infrared 10.5 µm images, with exact observation times and a labelled historical sample as fallback. Observations only. |
| `/weather/` | **Weather now** | [Weather warehouse](https://github.com/6roli/weather-warehouse) snapshot: Open-Meteo forecasts + AEMET observations | Forecast now and for the next 24 h in the 52 provincial capitals, the latest AEMET station observation, yesterday's forecast error, a map and a sortable table. |

Every page has the shared top bar: the Horizonte name (links to the hub), the module navigation and
"← Portfolio" (Horizonte's page in the portfolio). Only modules that exist and work are listed — no placeholders.

## Technologies: what, where, why

| Technology | Runs where | Why it is needed |
|---|---|---|
| **HTML + CSS** | Browser | Page structure and styling. No CSS framework. |
| **TypeScript** | Compiled at build time; runs in the browser as JavaScript | Type checking catches mistakes in data handling (times, URLs, JSON fields). |
| **Vite** | Your computer and Cloudflare's build server | Development server with live reload; bundles one entry per page into static files. |
| **Leaflet** | Browser | Zoom, pan, scale bar and coordinates on the satellite image and the weather map, in a latitude/longitude projection, without third-party map tiles. |
| **Inter** (`@fontsource-variable/inter`, OFL) | Browser | The portfolio's typeface, self-hosted with the site (no font CDN). |
| **Vitest** | Your computer and Cloudflare's build server | Unit tests for the logic that matters: time handling, data validation, sorting, playback, site settings. |
| **Node.js + npm** | Your computer and Cloudflare's build server | Installs the tools above and runs the build. Node also runs `scripts/make-sample.ts` directly (built-in TypeScript support, Node 24+). |
| **EUMETView WMS** (EUMETSAT) | EUMETSAT's servers | Renders the Meteosat images for the requested area and time. |
| **Weather warehouse** snapshot | Hugging Face (public bucket) | Hourly JSON with forecasts and observations for the capitals, built by a separate project. |
| **Cloudflare** (Workers static assets) | Cloudflare | Builds the site on every push and serves the static files over HTTPS. |
| **Python** | Not used here | Reserved for future analyses (see below). |

## How it works

There is no Horizonte server, database or scheduled job: every page is a static file, and the browser fetches
the public data directly.

### Satellite viewer (`/viewer/`)

```
Browser opens /viewer/
  1. asks EUMETView which observation times exist   (1 small XML request per layer, ~7 kB)
  2. picks the last 18 times common to both layers, 20 minutes apart (6 hours)
  3. loads each 1200×550 image from EUMETView, 3 at a time, newest first (browser-cached)
  4. if EUMETView cannot be reached → loads /data/sample/ (committed, labelled "Historical sample")
```

EUMETView is a public service designed for this kind of use; its responses carry `Access-Control-Allow-Origin: *`
and are cacheable for 7 days. Each visit makes about 20 requests to EUMETSAT (~2 MB); the app never retries in a
loop and keeps parallel requests below EUMETView's limit.

### Weather now (`/weather/`)

```
Browser opens /weather/
  1. fetches https://huggingface.co/buckets/groli/weather-warehouse/resolve/gold/web/snapshot.json
     (~30 kB, rewritten every hour; Hugging Face redirects it to its CDN, *.hf.co)
  2. validates it (src/data/snapshot.ts): malformed capitals are skipped and counted, impossible values
     become "no data"; if the file is unusable the page says why and shows no numbers
  3. shows the data age, summary tiles, a map of the capitals and a sortable table, in Spanish local time
```

**Gotcha:** Hugging Face answers **404** when the request carries a `Referer` from a `*.workers.dev` page. The fetch
uses `referrerPolicy: 'no-referrer'`, and `public/_headers` sets `Referrer-Policy: no-referrer` for the whole site.
The Content-Security-Policy allows `connect-src https://huggingface.co https://*.hf.co` for the redirect.

### Code layout

```
index.html                 Hub page (/)
viewer/index.html          Satellite viewer page and its "About these images" text
weather/index.html         Weather page and its "About these numbers" text
vite.config.ts             One build entry per page (PAGES)
src/config/app.ts          App name, portfolio links, region, layers, time zone, thresholds, data URLs
src/config/modules.ts      The hub's module list: drives the hub cards and the top bar navigation
src/pages/                 One entry script per page: hub.ts, viewer.ts, weather.ts
src/data/                  Data access and validation (no DOM):
  wms.ts                     WMS helpers: time dimension parsing, URL building
  sequence.ts                Builds the satellite sequence (live from WMS, or from the sample manifest)
  load.ts                    Fetches live satellite data, falls back to the sample
  manifest.ts                Schema and validation of the sample manifest
  freshness.ts               fresh / stale / outdated / sample
  preload.ts                 Image preloading with a concurrency limit
  snapshot.ts                Schema, validation, age and sorting of the weather snapshot
  load-snapshot.ts           Fetches the weather snapshot (without a referrer)
src/ui/                    Presentation: top bar, Leaflet maps, playback, time and weather formatting
src/styles/                tokens.css (design tokens shared with the portfolio), base.css (shared
                           components), one CSS file per page
src/i18n/en.ts             Interface strings (Spanish: add es.ts with the same keys)
scripts/make-sample.ts     Regenerates the historical satellite sample (run by hand)
public/data/sample/        Committed sample: 18 frames × 2 layers at 800 px (~1.7 MB)
public/overlay/            Coastline images (Natural Earth, rendered once by EUMETView): region + Canary Islands
public/images/modules/     Hub card previews (screenshots)
tests/                     Vitest unit tests (fixtures/ holds a real, trimmed weather snapshot)
docs/data-sources.md       Source evaluation: interfaces, formats, licence, costs
```

### Add a module

1. Create `<module>/index.html` with `<header class="topbar" id="topbar">`, the page content and
   `<script type="module" src="/src/pages/<module>.ts">` — no inline scripts: the CSP only allows `script-src 'self'`.
2. Create `src/pages/<module>.ts`: import `@fontsource-variable/inter`, `tokens.css`, `base.css` and the module's
   own CSS, then call `mountTopBar('<module id>')`.
3. Add the page to `PAGES` in `vite.config.ts` and an entry to `HUB_MODULES` in `src/config/modules.ts`
   (title, summary, data source, tags, a 1200×550 preview in `public/images/modules/`).
4. Put fetching and validation in `src/data/` (no DOM, unit-tested) and formatting in `src/ui/`.
5. If the module calls a new host, add it to the Content-Security-Policy in `public/_headers`, and show the
   source's attribution on the page.
6. Run `npm run verify`. `tests/site.test.ts` checks that every module has a page, a build entry, a preview and
   the top bar.

Only add a module to the hub when it works: no "coming soon" cards.

## Design

The look matches the portfolio's dark "liquid" style: near-black background, hairline borders, white pill buttons,
Inter, radii of 14–22 px and soft radial glows. Horizonte uses the portfolio's **sky** theme
(`--accent: #4cc9f0`, `--accent-2: #4361ee`); the tokens live in `src/styles/tokens.css` and are copied from
`portfolio/src/styles/global.css` (keep them in sync). Animations stop with `prefers-reduced-motion`, and every
page works at phone width.

## Develop locally (VS Code)

Requirements: **Node.js 24 LTS**, **Git** and **VS Code**.

```bash
git clone https://github.com/6roli/Horizonte.git
cd horizonte
npm ci            # installs exact versions from package-lock.json
npm run dev       # http://localhost:5173 — reloads on save
```

| Command | Purpose |
|---|---|
| `npm run dev` | Development server (`/`, `/viewer/`, `/weather/`) |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript check (app, scripts and tests) |
| `npm run build` | Type check + tests + production build into `dist/` |
| `npm run preview` | Serve `dist/` locally (does not apply `public/_headers`) |
| `npm run verify` | Type check + tests + build — same as `npm run build` |
| `npm run make:sample -- --end 2026-10-18T12:00:00Z --note "…"` | Regenerate the historical sample (`--width`, default 800) |

No secrets or `.env` file are needed: all data sources are public.

To change the region, layers, sequence length or thresholds, edit `src/config/app.ts`. Layer names come from
`https://view.eumetsat.int/geoserver/wms?service=WMS&request=GetCapabilities`; give each new layer an honest
`kind` (`observation`, `estimate` or `forecast`) and a plain-language explanation.

## Publish

Cloudflare (Workers static assets, Free plan) is connected to this GitHub repository through its Git integration:

- push to `main` → Cloudflare runs `npm run build` (all checks + build); if every check passes, the new version goes live;
- push to another branch or open a pull request → a preview URL, shown in GitHub next to the commit;
- if a check fails, nothing is deployed and the previous version stays online.

Cloudflare project settings (*Workers & Pages → project → Settings → Build*):

| Setting | Value |
|---|---|
| Build command | `npm run build` (runs every check before building) |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` (preview URLs) |
| Production branch | `main` |

`wrangler.jsonc` tells Cloudflare the site is **only static files** in `dist/`: no Worker code and no server.
Static requests are free and unlimited. `/viewer` and `/weather` are served from their `index.html` files (Cloudflare
adds the trailing slash). The empty `"previews": {}` block lets branch previews use the same settings.

`public/_headers` sets security headers and caching. The Content-Security-Policy allows images only from this
site and `view.eumetsat.int`, network requests only to this site, `view.eumetsat.int`, `huggingface.co` and
`*.hf.co`, fonts only from this site and scripts only from this site. `Referrer-Policy: no-referrer` is required
by Hugging Face (see the gotcha above).

## Data and licence

| Data | Used by | Licence and attribution |
|---|---|---|
| Meteosat-12 images via EUMETView WMS | Satellite viewer | EUMETSAT Core data (Advanced Image Products), CC BY 4.0: "Contains modified EUMETSAT Meteosat data 2026" |
| Open-Meteo forecasts (via the weather warehouse) | Weather now | CC BY 4.0: "Forecasts: Open-Meteo (CC BY 4.0)" |
| AEMET OpenData observations (via the weather warehouse) | Weather now | AEMET reuse conditions: "Fuente: AEMET" |
| Natural Earth coastlines and borders (rendered by EUMETView) | Both maps | Public domain |
| Inter typeface | All pages | SIL Open Font License 1.1 |

Under the EUMETSAT Data Policy, RGB composites and single-channel visualisations served via WMS are
*Advanced Image Products*: **Core data, free and unrestricted under CC BY 4.0**, whatever their latency.
These are **images for viewing, not scientific data**: stretched, compressed and reprojected. Analysis needs
the original numerical data from the EUMETSAT Data Store (free account). Numerical Level 1 data with less than
1 hour latency is "Recommended" data and may not be redistributed. See [docs/data-sources.md](docs/data-sources.md).
No imagery is taken from Windy or other third-party viewers.

The weather data is prepared by [6roli/weather-warehouse](https://github.com/6roli/weather-warehouse), which
documents its sources, schedule and quality rules.

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
| Hosting | €0 | Cloudflare Free (Workers static assets): static requests are free and unlimited; no payment method needed |
| Builds | €0 | Cloudflare Workers Builds free quota; ~1 build minute per push |
| Data | €0 | EUMETView is public (`Fees: none`); the weather snapshot is a public Hugging Face file |
| Domain | — | Not purchased (see the portfolio's `docs/domain.md`) |

## Limitations

Satellite viewer:

- Images, not measurements: colours cannot be converted back to physical values.
- The time shown is the nominal scan start; a full-disc scan takes ~10 minutes.
- Parallax: high clouds appear shifted north by roughly 10 km or more at these latitudes.
- EUMETView publishes each image ~15–30 minutes after the scan starts; data older than 1 h is flagged as stale, older than 3 h as outdated.
- GeoColour at night uses a fixed background for land and city lights.
- The Canary Islands are outside the region.
- Depends on EUMETView's availability; otherwise the labelled sample is shown.

Weather now:

- Forecasts are model output for each capital's coordinates; observations come from one AEMET station per
  capital, often at an airport, and arrive one or two hours late.
- The snapshot is flagged when it is more than 2 hours old, and marked outdated after 6 hours.
- Depends on the weather warehouse and Hugging Face; if the snapshot cannot be loaded, the page says so.

Neither module is an official service. For warnings in Spain use [AEMET](https://www.aemet.es) and
[Meteoalarm](https://meteoalarm.org).
