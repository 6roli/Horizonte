/**
 * English interface strings. A Spanish file must export the same keys
 * (enforced by the `Strings` type); then select it in src/i18n/index.ts.
 */
export const en = {
  backToPortfolio: 'Portfolio',
  modulesNav: 'Horizonte modules',

  loading: 'Loading the latest image sequence…',
  errorTitle: 'The images could not be loaded.',
  errorRetry: 'Try again',
  sampleTitle: 'Historical sample — not current data.',
  sampleBody: 'Live data is not available right now, so a fixed example sequence is shown.',
  sampleReason: 'Reason',
  staleTitle: 'These images are older than expected.',
  staleBody: 'The newest observation is {age} old. EUMETSAT may be publishing images late.',
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
  checkedAt: 'Checked for new images',
  sampleCreated: 'Sample created',
  newestObservation: 'Newest observation',
  sequenceKindLive: 'Latest images from EUMETSAT (reload the page to update)',
  sequenceKindSample: 'Historical sample',

  mapLabel: 'Satellite image map. Use the controls below to change the time.',
  cursor: 'Cursor',

  hubData: 'Data: {source}',
  hubOpen: 'Open →',

  weatherLoading: 'Loading the latest weather snapshot…',
  weatherErrorTitle: 'The weather data could not be loaded.',
  weatherErrorBody: 'Reason: {reason}. The page shows nothing rather than old or invented numbers.',
  weatherStaleTitle: 'This snapshot is older than expected.',
  weatherStaleBody: 'It was produced {age} ago; the warehouse normally updates every hour.',
  weatherOutdatedTitle: 'Old data.',
  weatherOutdatedBody: 'This snapshot was produced {age} ago. Do not use it to judge current conditions.',
  weatherSkipped: '{count} malformed entries were left out.',
  weatherUpdated: 'Snapshot produced {time} ({age} ago). Forecast issued {issued}.',
  weatherTileCapitals: 'Capitals',
  weatherTileCapitalsNote: 'Provincial capitals plus Ceuta and Melilla',
  weatherTileObserved: 'With a station observation',
  weatherTileObservedNote: 'Linked AEMET station reported a temperature',
  weatherTileSkill: 'Forecast error, 1–6 h ahead',
  weatherTileSkillNote: 'Mean absolute temperature error on {date}, {count} capitals',
  weatherTileSkillMissing: 'Not available in this snapshot',
  weatherTileAge: 'Data age',
  weatherTileAgeNote: 'Produced {time}',
  weatherSortBy: 'Sort by {column}',
  weatherNoObservation: 'No observation',
  weatherSparklineLabel: 'Next 24 hours: {min} to {max}',
  weatherSparklineMissing: 'No hourly forecast',

  notOfficial:
    'Horizonte shows satellite observations only. It does not issue warnings or forecasts. For official warnings in Spain see AEMET (aemet.es) and Meteoalarm (meteoalarm.org).',
} as const;

export type StringKey = keyof typeof en;
export type Strings = Record<StringKey, string>;
