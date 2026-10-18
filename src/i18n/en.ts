/**
 * English interface strings. A Spanish file must export the same keys
 * (enforced by the `Strings` type); then select it in src/i18n/index.ts.
 */
export const en = {
  tagline: 'Meteosat imagery · Spain and the western Mediterranean',
  backToPortfolio: 'Portfolio',

  loading: 'Loading the latest image sequence…',
  errorTitle: 'The images could not be loaded.',
  errorRetry: 'Try again',
  sampleTitle: 'Historical sample — not current data.',
  sampleBody: 'Live data is not available right now, so a fixed example sequence is shown.',
  sampleReason: 'Reason',
  staleTitle: 'These images are older than expected.',
  staleBody: 'The newest observation is {age} old. The hourly update may be delayed.',
  outdatedTitle: 'Old data.',
  outdatedBody: 'The newest observation is {age} old. Do not use these images to judge current conditions.',
  frameUnavailable: 'This frame could not be loaded and is skipped during playback.',

  observedAt: 'Observation time',
  localTimeLabel: 'Spain (peninsula and Balearic Islands)',
  yourTimeLabel: 'Your time zone',
  frameOf: 'Frame {current} of {total}',
  age: '{age} ago',

  play: 'Play',
  pause: 'Pause',
  previous: 'Previous frame',
  next: 'Next frame',
  timeline: 'Observation time',
  speed: 'Speed',
  speedSlow: 'Slow',
  speedNormal: 'Normal',
  speedFast: 'Fast',

  layer: 'Layer',
  kindObservation: 'Observation',
  kindEstimate: 'Estimate',
  kindForecast: 'Forecast',

  source: 'Source',
  satellite: 'Satellite',
  instrument: 'Instrument',
  product: 'Product',
  service: 'Service',
  licence: 'Licence',
  lastUpdate: 'Last update',
  sequenceKindLive: 'Recent sequence (updated hourly)',
  sequenceKindSample: 'Historical sample',

  mapLabel: 'Satellite image map. Use the controls below to change the time.',
  cursor: 'Cursor',

  notOfficial:
    'Horizonte shows satellite observations only. It does not issue warnings or forecasts. For official warnings in Spain see AEMET (aemet.es) and Meteoalarm (meteoalarm.org).',
} as const;

export type StringKey = keyof typeof en;
export type Strings = Record<StringKey, string>;
