import { describe, expect, it } from 'vitest';
import {
  buildGetMapUrl,
  compactTime,
  extractTimeDimensions,
  isTimeAvailable,
  latestAvailableTime,
  nearestTimeFromWarning,
  parseIsoDuration,
  parseTimeDimension,
  selectFrameTimes,
} from '../scripts/lib/wms.ts';

const at = (iso: string) => Date.parse(iso);

describe('time dimension parsing', () => {
  it('parses durations', () => {
    expect(parseIsoDuration('PT10M')).toBe(600_000);
    expect(parseIsoDuration('PT1H30M')).toBe(5_400_000);
    expect(parseIsoDuration('P1D')).toBe(86_400_000);
    expect(() => parseIsoDuration('P1Y')).toThrow();
    expect(() => parseIsoDuration('PT')).toThrow();
  });

  it('parses intervals and instants', () => {
    const availability = parseTimeDimension('2024-09-23T00:00:00.000Z/2026-10-18T13:20:00.000Z/PT10M,2026-10-18T13:25:00Z');
    expect(availability).toHaveLength(2);
    expect(latestAvailableTime(availability)).toBe(at('2026-10-18T13:25:00Z'));
    expect(isTimeAvailable(availability, at('2026-10-18T13:10:00Z'))).toBe(true);
    expect(isTimeAvailable(availability, at('2026-10-18T13:15:00Z'))).toBe(false); // off the 10-min grid
    expect(isTimeAvailable(availability, at('2026-10-18T13:25:00Z'))).toBe(true);
    expect(isTimeAvailable(availability, at('2026-10-18T13:30:00Z'))).toBe(false); // after the end
  });
});

describe('selectFrameTimes', () => {
  it('returns common times, oldest first', () => {
    const a = parseTimeDimension('2026-10-18T00:00:00Z/2026-10-18T13:20:00Z/PT10M');
    const b = parseTimeDimension('2026-10-18T00:00:00Z/2026-10-18T13:00:00Z/PT10M');
    const times = selectFrameTimes([a, b], at('2026-10-18T13:00:00Z'), 3, 20);
    expect(times.map((time) => new Date(time).toISOString())).toEqual([
      '2026-10-18T12:20:00.000Z',
      '2026-10-18T12:40:00.000Z',
      '2026-10-18T13:00:00.000Z',
    ]);
  });

  it('skips times a layer does not have', () => {
    const a = parseTimeDimension('2026-10-18T12:00:00Z/2026-10-18T13:00:00Z/PT10M');
    const b = parseTimeDimension('2026-10-18T12:40:00Z/2026-10-18T13:00:00Z/PT10M');
    expect(selectFrameTimes([a, b], at('2026-10-18T13:00:00Z'), 4, 20)).toHaveLength(2);
  });
});

describe('capabilities and requests', () => {
  const xml = `
    <Layer><Name>mtg_fd:a</Name><Dimension name="time" units="ISO8601">2026-01-01T00:00:00Z/2026-01-02T00:00:00Z/PT10M</Dimension></Layer>
    <Layer><Name>mtg_fd:b</Name></Layer>
    <Layer><Name>mtg_fd:c</Name><Dimension name="time">2026-01-01T00:00:00Z</Dimension></Layer>`;

  it('reads the time dimension that belongs to each layer', () => {
    expect(extractTimeDimensions(xml, ['mtg_fd:a']).get('mtg_fd:a')).toContain('PT10M');
    expect(() => extractTimeDimensions(xml, ['mtg_fd:b'])).toThrow(/no time dimension/);
    expect(() => extractTimeDimensions(xml, ['missing'])).toThrow(/not found/);
  });

  it('builds GetMap URLs with WMS 1.3.0 lat,lon axis order', () => {
    const url = new URL(
      buildGetMapUrl({
        endpoint: 'https://view.eumetsat.int/geoserver/wms',
        layers: ['mtg_fd:a'],
        bbox: { west: -11, south: 34, east: 13, north: 45 },
        width: 1200,
        height: 550,
        format: 'image/jpeg',
        time: '2026-10-18T12:00:00Z',
      }),
    );
    expect(url.searchParams.get('bbox')).toBe('34,-11,45,13');
    expect(url.searchParams.get('crs')).toBe('EPSG:4326');
    expect(url.searchParams.get('time')).toBe('2026-10-18T12:00:00Z');
  });

  it('reads the nearest-value warning header', () => {
    const warning = '99 Nearest value used: time=2026-10-18T10:00:00.000Z ISO8601 (mtg_fd:ir105_hrfi)';
    expect(nearestTimeFromWarning(warning)).toBe(at('2026-10-18T10:00:00Z'));
    expect(nearestTimeFromWarning(null)).toBeUndefined();
  });

  it('makes file-name-safe timestamps', () => {
    expect(compactTime(at('2026-10-18T12:00:00Z'))).toBe('20261018T1200Z');
  });
});
