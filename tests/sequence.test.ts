import { describe, expect, it } from 'vitest';
import { LAYERS, SEQUENCE } from '../src/config/app.ts';
import { parseManifest } from '../src/data/manifest.ts';
import { buildLiveSequence, sequenceFromManifest } from '../src/data/sequence.ts';
import { layerCapabilitiesUrl } from '../src/data/wms.ts';

const dims = (geoEnd: string, irEnd: string) =>
  new Map([
    ['mtg_fd:rgb_geocolour', `2024-09-23T00:00:00.000Z/${geoEnd}/PT10M`],
    ['mtg_fd:ir105_hrfi', `2024-09-23T00:00:00.000Z/${irEnd}/PT10M`],
  ]);

describe('buildLiveSequence', () => {
  const now = new Date('2026-10-18T14:05:00Z');

  it('ends at the newest time both layers have, oldest frame first', () => {
    const sequence = buildLiveSequence(dims('2026-10-18T13:50:00.000Z', '2026-10-18T13:40:00.000Z'), now);
    expect(sequence.kind).toBe('live');
    expect(sequence.frames).toHaveLength(SEQUENCE.frameCount);
    expect(sequence.frames.at(-1)!.time).toBe('2026-10-18T13:40:00Z');
    expect(sequence.frames[0].time).toBe('2026-10-18T08:00:00Z');
    expect(sequence.retrievedAt).toBe('2026-10-18T14:05:00Z');
  });

  it('builds one EUMETView GetMap URL per layer and frame with the exact time', () => {
    const sequence = buildLiveSequence(dims('2026-10-18T13:40:00.000Z', '2026-10-18T13:40:00.000Z'), now);
    const url = new URL(sequence.frames.at(-1)!.images.ir105);
    expect(url.origin).toBe('https://view.eumetsat.int');
    expect(url.searchParams.get('layers')).toBe('mtg_fd:ir105_hrfi');
    expect(url.searchParams.get('time')).toBe('2026-10-18T13:40:00Z');
    expect(Object.keys(sequence.frames[0].images).sort()).toEqual(LAYERS.map((l) => l.id).sort());
    expect(sequence.source.attribution).toBe('Contains modified EUMETSAT Meteosat data 2026');
  });

  it('honours a fixed end time and width (used for the sample)', () => {
    const end = Date.parse('2026-10-18T12:00:00Z');
    const sequence = buildLiveSequence(dims('2026-10-18T13:40:00.000Z', '2026-10-18T13:40:00.000Z'), now, { end, width: 800 });
    const url = new URL(sequence.frames.at(-1)!.images.geocolour);
    expect(sequence.frames.at(-1)!.time).toBe('2026-10-18T12:00:00Z');
    expect(url.searchParams.get('width')).toBe('800');
    expect(url.searchParams.get('height')).toBe('367');
  });

  it('fails clearly when a layer has no time information', () => {
    const partial = new Map([['mtg_fd:rgb_geocolour', '2026-10-18T13:40:00Z']]);
    expect(() => buildLiveSequence(partial, now)).toThrow(/no time information/);
  });
});

describe('sequenceFromManifest', () => {
  it('resolves relative image paths against the manifest URL', () => {
    const manifest = parseManifest(
      {
        schemaVersion: 1,
        kind: 'sample',
        generatedAt: '2026-10-18T14:00:00Z',
        source: { provider: 'EUMETSAT', service: 'WMS', endpoint: 'x', licence: 'CC BY 4.0', attribution: 'a' },
        region: { name: 'r', bbox: { west: -11, south: 34, east: 13, north: 45 }, crs: 'EPSG:4326', width: 800, height: 367 },
        overlay: 'overlay.png',
        layerIds: ['geocolour', 'ir105'],
        frames: [{ time: '2026-10-18T12:00:00Z', images: { geocolour: 'frames/g.jpg', ir105: 'frames/i.jpg' } }],
      },
      ['geocolour', 'ir105'],
    );
    const sequence = sequenceFromManifest(manifest, new URL('https://horizonte.pages.dev/data/sample/manifest.json'));
    expect(sequence.frames[0].images.geocolour).toBe('https://horizonte.pages.dev/data/sample/frames/g.jpg');
    expect(sequence.overlayUrl).toBe('https://horizonte.pages.dev/data/sample/overlay.png');
    expect(sequence.kind).toBe('sample');
  });
});

describe('layerCapabilitiesUrl', () => {
  it('uses the per-layer GeoServer endpoint', () => {
    expect(layerCapabilitiesUrl('https://view.eumetsat.int/geoserver', 'mtg_fd:rgb_geocolour')).toBe(
      'https://view.eumetsat.int/geoserver/mtg_fd/rgb_geocolour/ows?service=WMS&version=1.3.0&request=GetCapabilities',
    );
    expect(() => layerCapabilitiesUrl('x', 'no-workspace')).toThrow();
  });
});
