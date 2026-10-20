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
];

