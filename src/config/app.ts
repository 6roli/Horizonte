/**
 * Central configuration. The app name is provisional: change APP_NAME here
 * (and the <title> in index.html) to rename the whole interface.
 *
 * This file must stay free of DOM code: it is also imported by the Node
 * scripts in /scripts.
 */

export const APP_NAME = 'Horizonte';

/** Link back to the portfolio. Update when a custom domain is connected. */
export const PORTFOLIO_URL = 'https://gabriel-olius.pages.dev';
export const PORTFOLIO_LABEL = 'Gabriel Olius — portfolio';

/** Time zone shown next to UTC. Peninsular Spain and the Balearic Islands. */
export const LOCAL_TIME_ZONE = 'Europe/Madrid';

/**
 * Area of interest in degrees (EPSG:4326). Covers mainland Spain, Portugal,
 * the Balearic Islands, southern France, Sardinia/Corsica and northern Algeria.
 * The Canary Islands are outside this first region.
 */
export const REGION = {
  name: 'Spain and the western Mediterranean',
  bbox: { west: -11, south: 34, east: 13, north: 45 },
  /** Output size of each frame; keeps the 24:11 aspect ratio of the bbox. */
  width: 1200,
  height: 550,
} as const;

export type Bbox = { west: number; south: number; east: number; north: number };

/**
 * What kind of information a layer carries. Horizonte v1 only shows
 * observations; the other kinds exist so future layers are labelled honestly.
 */
export type InformationKind = 'observation' | 'estimate' | 'forecast';

export interface LayerDefinition {
  id: string;
  /** Layer name in the EUMETView WMS. */
  wmsLayer: string;
  title: string;
  kind: InformationKind;
  satellite: string;
  instrument: string;
  product: string;
  /** Plain-language explanation shown to visitors. */
  explanation: string;
  /** Caveat specific to this layer, if any. */
  caveat?: string;
}

export const LAYERS: LayerDefinition[] = [
  {
    id: 'geocolour',
    wmsLayer: 'mtg_fd:rgb_geocolour',
    title: 'GeoColour',
    kind: 'observation',
    satellite: 'Meteosat-12 (MTG-I1)',
    instrument: 'Flexible Combined Imager (FCI)',
    product: 'GeoColour RGB composite, full disc, every 10 minutes',
    explanation:
      'By day, an approximation of what the eye would see from space: clouds white, sea dark, land in natural tones. ' +
      'By night, clouds are derived from infrared channels and shown in grey and blue tones.',
    caveat:
      'At night the land surface and city lights come from a fixed background image, not from this observation.',
  },
  {
    id: 'ir105',
    wmsLayer: 'mtg_fd:ir105_hrfi',
    title: 'Infrared 10.5 µm',
    kind: 'observation',
    satellite: 'Meteosat-12 (MTG-I1)',
    instrument: 'Flexible Combined Imager (FCI)',
    product: 'IR 10.5 µm channel, high-resolution (about 1 km at nadir), every 10 minutes',
    explanation:
      'Thermal radiation emitted by clouds and the surface, available day and night. ' +
      'Colder means brighter: high, cold cloud tops — such as those of thunderstorms — appear bright white; ' +
      'the warm sea and land appear dark.',
  },
];

export const DEFAULT_LAYER_ID = 'geocolour';

/** EUMETSAT's public Web Map Service (no account needed). */
export const WMS_ENDPOINT = 'https://view.eumetsat.int/geoserver/wms';

/** Static coastline and border overlay (Natural Earth, served by EUMETView). */
export const OVERLAY_WMS_LAYERS = ['backgrounds:ne_10m_coastline', 'backgrounds:ne_boundary_lines_land'];

/** Required by the EUMETSAT data policy (Article 6.3). */
export function attributionText(year: number): string {
  return `Contains modified EUMETSAT Meteosat data ${year}`;
}

/** Sequence settings used by the update job. */
export const SEQUENCE = {
  frameCount: 18,
  /** Minutes between frames. FCI produces an image every 10 minutes. */
  stepMinutes: 20,
} as const;

/**
 * Freshness thresholds for live data. Updates are scheduled hourly and EUMETView
 * publishes images with some delay, so the newest frame is normally 20–90 minutes old.
 */
export const FRESHNESS = {
  staleAfterMinutes: 150,
  outdatedAfterMinutes: 360,
} as const;
