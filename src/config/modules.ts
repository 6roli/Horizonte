/**
 * The modules of the Horizonte hub. Each one is a separate page (its own HTML
 * entry in vite.config.ts) that shares the top bar, styles and data helpers.
 *
 * Only list modules that exist and work: no placeholders. To add a module,
 * see "Add a module" in the README.
 *
 * No DOM code here: tests import this file in Node.
 */

export interface HubModule {
  id: string;
  /** Absolute path of the module's page, with a trailing slash. */
  path: string;
  /** Short name for the navigation. */
  navLabel: string;
  title: string;
  /** One or two sentences for the hub card. */
  summary: string;
  /** Where the data comes from, shown on the card. */
  dataSource: string;
  /** What kind of information it shows, in plain words. */
  tags: string[];
  /** Decorative preview for the hub card (static file in public/, 1200×550). */
  preview: string;
}

export const HUB_MODULES: readonly HubModule[] = [
  {
    id: 'viewer',
    path: '/viewer/',
    navLabel: 'Satellite',
    title: 'Satellite viewer',
    summary:
      'The last six hours of Meteosat-12 imagery over Spain and the western Mediterranean, in natural colour and infrared, with exact observation times.',
    dataSource: 'EUMETSAT EUMETView',
    tags: ['Observations', 'Every 20 min'],
    preview: '/images/modules/viewer.jpg',
  },
  {
    id: 'weather',
    path: '/weather/',
    navLabel: 'Weather',
    title: 'Weather now',
    summary:
      'Forecast for the current hour and the next 24 hours in the 52 Spanish provincial capitals, next to the latest station observation and yesterday’s forecast error.',
    dataSource: 'Open-Meteo · AEMET, via the weather warehouse',
    tags: ['Forecasts', 'Observations', 'Hourly'],
    preview: '/images/modules/weather.jpg',
  },
  {
    id: 'ask',
    path: '/ask/',
    navLabel: 'Ask',
    title: 'Ask the weather warehouse',
    summary:
      'Ask about the weather in the 52 capitals in Spanish or English: a fine-tuned language model writes the SQL in your browser and DuckDB runs it on the live data.',
    dataSource: 'Weather warehouse · fine-tuned Qwen2.5-Coder-1.5B in your browser',
    tags: ['Forecasts', 'Observations', 'AI model'],
    preview: '/images/modules/ask.jpg',
  },
];

