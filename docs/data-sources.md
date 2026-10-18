# Data sources for Horizonte

Checked on 18 October 2026. Re-check licences and interfaces before changing sources.

## Goal of v1 and what it needs

Show a recent sequence of Meteosat images over Spain and the western Mediterranean **for viewing**.
That needs georeferenced, already-coloured images with exact observation times — not calibrated
numerical data.

## Options evaluated

| Source | Interface | Format | Access | Licence / cost | Fit for v1 |
|---|---|---|---|---|---|
| **EUMETView** (`view.eumetsat.int`) | OGC WMS 1.3.0 (GeoServer), WMTS | Rendered PNG/JPEG for any bbox, size and time; time dimension per layer (MTG every 10 min, MSG every 15 min) | Public, no account. Capabilities report `Fees: none`, `AccessConstraints: none`. Observed limits: 20 req/s per client (excess delayed), 8 concurrent | Image products = *Advanced Image Products* → **Core data, CC BY 4.0** | ✅ **Chosen.** Exactly the visual products needed, cropped server-side |
| **EUMETSAT Data Store** (`data.eumetsat.int`) | REST API + Data Tailor (cropping, reformatting) | Level 1c FCI NetCDF (full disc, hundreds of MB per time step), Level 2 products | Free EUMETSAT account and API keys | Level 1 data < 1 h latency = *Recommended* (licensed, no redistribution of numerical data); hourly / ≥ 1 h latency free | Later, for **analysis** (e.g. cloud-top temperature, detections). Heavy processing, so not needed for viewing |
| **EUMETCast** | Satellite/terrestrial broadcast | Native formats | Reception station + registration | Licensed | ❌ Not proportionate |
| Windy, Zoom Earth and similar viewers | — | — | — | Third-party renderings, not an authorised source | ❌ Excluded by design |

## Layers used

| Id | WMS layer | What it is | Kind |
|---|---|---|---|
| `geocolour` | `mtg_fd:rgb_geocolour` | GeoColour RGB from Meteosat-12 FCI. Day: near-natural colours. Night: IR-based clouds over a **static** land/city-lights background | Observation (composite) |
| `ir105` | `mtg_fd:ir105_hrfi` | FCI IR 10.5 µm, high-resolution (~1 km at nadir), grey scale, cold = bright | Observation |
| overlay | `backgrounds:ne_10m_coastline`, `backgrounds:ne_boundary_lines_land` | Natural Earth coastlines and borders, transparent PNG | Reference |

Other available layers worth considering later: `mtg_fd:rgb_cloudtype`, `mtg_fd:rgb_truecolour` (daytime),
`mtg_fd:rgb_dust`, `mtg_fd:li_afa` (Lightning Imager accumulated flash area), `mtg_fd:frp` (fire radiative
power — a derived product, i.e. an *estimate*, and must be labelled as such).

## Licence and attribution

EUMETSAT Data Policy (amended 2024–2025), Articles 5–6 and Annex definitions:

- *Advanced Image Product*: "the combination of different channels allocating a colour to each channel
  (i.e. RGB), visualisations of individual channels (e.g. used in Web Map Services)…" — these do not contain
  the original numerical data.
- All SEVIRI/FCI Advanced Image Products are **Core**: free and unrestricted under **CC BY 4.0**.
- Attribution required: "[Contains modified] EUMETSAT [Meteosat/Metop] [data/product] [Year]".
  Horizonte crops and reprojects, so it uses **"Contains modified EUMETSAT Meteosat data 2026"**.

## Time correctness

- Frame times are chosen from the layer's own time dimension and requested exactly.
- GeoServer silently returns the *nearest* image when a time does not exist. For single-channel layers it
  says so in a `Warning: 99 Nearest value used` header; the fetch script rejects such frames. RGB layers do
  not send this header, so the script only requests times listed in their capabilities.
- Timestamps are the nominal scan start in UTC.

## Precomputation and caching

- ~37 requests per hourly run, from CI only. Each run uses ~3 MB of images.
- Frames have time-stamped names and are cached for a day by browsers; the manifest is revalidated.
- A failed run keeps the previous deployment; the browser flags data older than 2.5 h (stale) and 6 h (outdated).
