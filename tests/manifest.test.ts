import { describe, expect, it } from 'vitest';
import { ManifestError, parseManifest } from '../src/data/manifest.ts';
import { assessFreshness, formatAge } from '../src/data/freshness.ts';

const LAYER_IDS = ['geocolour', 'ir105'];

function validManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    kind: 'live',
    generatedAt: '2026-10-18T14:00:00Z',
    source: {
      provider: 'EUMETSAT',
      service: 'EUMETView WMS',
      endpoint: 'https://view.eumetsat.int/geoserver/wms',
      licence: 'CC BY 4.0',
      attribution: 'Contains modified EUMETSAT Meteosat data 2026',
    },
    region: { name: 'Test', bbox: { west: -11, south: 34, east: 13, north: 45 }, crs: 'EPSG:4326', width: 1200, height: 550 },
    overlay: 'overlay.png',
    layerIds: LAYER_IDS,
    frames: [
      { time: '2026-10-18T12:00:00Z', images: { geocolour: 'frames/g1.jpg', ir105: 'frames/i1.jpg' } },
      { time: '2026-10-18T12:20:00Z', images: { geocolour: 'frames/g2.jpg', ir105: 'frames/i2.jpg' } },
    ],
    ...overrides,
  };
}

describe('parseManifest', () => {
  it('accepts a valid manifest', () => {
    const manifest = parseManifest(validManifest(), LAYER_IDS);
    expect(manifest.frames).toHaveLength(2);
    expect(manifest.kind).toBe('live');
  });

  it('rejects non-objects and wrong schema versions', () => {
    expect(() => parseManifest(null, LAYER_IDS)).toThrow(ManifestError);
    expect(() => parseManifest(validManifest({ schemaVersion: 2 }), LAYER_IDS)).toThrow(/schemaVersion/);
  });

  it('rejects times without an explicit UTC designator', () => {
    const manifest = validManifest({
      frames: [{ time: '2026-10-18T12:00:00', images: { geocolour: 'a.jpg', ir105: 'b.jpg' } }],
    });
    expect(() => parseManifest(manifest, LAYER_IDS)).toThrow(/UTC/);
  });

  it('rejects frames out of order or duplicated', () => {
    const frames = validManifest().frames;
    expect(() => parseManifest(validManifest({ frames: [...frames].reverse() }), LAYER_IDS)).toThrow(/sorted/);
    expect(() => parseManifest(validManifest({ frames: [frames[0], frames[0]] }), LAYER_IDS)).toThrow(/sorted/);
  });

  it('rejects image paths that leave the data folder or point to other hosts', () => {
    for (const path of ['https://example.com/x.jpg', '/etc/x.jpg', '../x.jpg', 'javascript:alert(1)']) {
      const manifest = validManifest({
        frames: [{ time: '2026-10-18T12:00:00Z', images: { geocolour: path, ir105: 'b.jpg' } }],
      });
      expect(() => parseManifest(manifest, LAYER_IDS)).toThrow(/relative path/);
    }
  });

  it('rejects unknown layers and frames missing a layer', () => {
    expect(() => parseManifest(validManifest({ layerIds: ['radar'] }), LAYER_IDS)).toThrow(/unknown layer/);
    const manifest = validManifest({ frames: [{ time: '2026-10-18T12:00:00Z', images: { geocolour: 'a.jpg' } }] });
    expect(() => parseManifest(manifest, LAYER_IDS)).toThrow(/ir105/);
  });

  it('rejects an inverted bounding box', () => {
    const region = { ...validManifest().region, bbox: { west: 13, south: 34, east: -11, north: 45 } };
    expect(() => parseManifest(validManifest({ region }), LAYER_IDS)).toThrow(/inverted/);
  });
});

describe('assessFreshness', () => {
  const manifest = parseManifest(validManifest(), LAYER_IDS); // newest frame 12:20 UTC

  it('classifies live data by the age of the newest observation', () => {
    expect(assessFreshness(manifest, new Date('2026-10-18T13:00:00Z'))).toEqual({ status: 'fresh', ageMinutes: 40 });
    expect(assessFreshness(manifest, new Date('2026-10-18T15:00:00Z')).status).toBe('stale');
    expect(assessFreshness(manifest, new Date('2026-10-18T20:00:00Z')).status).toBe('outdated');
  });

  it('always reports samples as samples, never as fresh', () => {
    const sample = { ...manifest, kind: 'sample' as const };
    expect(assessFreshness(sample, new Date('2026-10-18T12:30:00Z')).status).toBe('sample');
  });

  it('formats ages compactly', () => {
    expect(formatAge(45)).toBe('45 min');
    expect(formatAge(185)).toBe('3 h 05 min');
    expect(formatAge(120)).toBe('2 h');
    expect(formatAge(3 * 24 * 60)).toBe('3 days');
  });
});
