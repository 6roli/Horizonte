import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assessSnapshotAge,
  countObserved,
  parseSnapshot,
  SnapshotError,
  sortCapitals,
  type CapitalWeather,
} from '../src/data/snapshot.ts';

/** A real snapshot from the weather warehouse (2026-10-20), trimmed to four capitals. */
const fixture = JSON.parse(readFileSync(new URL('./fixtures/weather-snapshot.json', import.meta.url), 'utf8'));

function snapshot(overrides: Record<string, unknown> = {}) {
  return { ...structuredClone(fixture), ...overrides };
}

function capital(overrides: Record<string, unknown> = {}) {
  return { ...structuredClone(fixture.capitals[0]), ...overrides };
}

describe('parseSnapshot', () => {
  it('accepts a real snapshot', () => {
    const parsed = parseSnapshot(snapshot());
    expect(parsed.generatedAt).toBe('2026-10-20T11:25:57Z');
    expect(parsed.capitals).toHaveLength(4);
    expect(parsed.skipped).toBe(0);
    expect(parsed.skill?.temperatureMaeC.lead_1_6h).toBe(1.22);
    expect(parsed.skill?.temperatureMaeC.lead_49_72h).toBeNull();

    const coruna = parsed.capitals.find((c) => c.id === 'a-coruna')!;
    expect(coruna.name).toBe('A Coruña');
    expect(coruna.next24hTemperatureC).toHaveLength(24);
    expect(coruna.observed).toEqual({ temperatureC: 13.9, observedAt: '2026-10-20T10:00:00Z', station: 'A CORUÑA' });
  });

  it('keeps capitals without an observation', () => {
    const palma = parseSnapshot(snapshot()).capitals.find((c) => c.id === 'palma')!;
    expect(palma.observed).toBeNull();
  });

  it('rejects anything that is not a snapshot', () => {
    expect(() => parseSnapshot(null)).toThrow(SnapshotError);
    expect(() => parseSnapshot([])).toThrow(SnapshotError);
    expect(() => parseSnapshot(snapshot({ capitals: [] }))).toThrow(/capitals/);
    expect(() => parseSnapshot(snapshot({ source: '' }))).toThrow(/source/);
  });

  it('requires explicit UTC times', () => {
    expect(() => parseSnapshot(snapshot({ generated_at: '2026-10-20T11:25:57' }))).toThrow(/generated_at/);
    expect(() => parseSnapshot(snapshot({ forecast_issued_at: '2026-10-20 11:00' }))).toThrow(/forecast_issued_at/);
  });

  it('skips malformed or duplicate capitals instead of failing', () => {
    const parsed = parseSnapshot(
      snapshot({
        capitals: [
          capital(),
          capital({ id: 'bad-lat', lat: 123 }),
          capital({ id: 'Bad Id' }),
          capital({ id: 'bad-time', issued_at: 'yesterday' }),
          capital({ id: 'bad-hours', next_24h_temperature_c: 'warm' }),
          capital({ id: 'bad-observed', observed: { temperature_c: 10, observed_at: '2026-10-20T10:00:00Z' } }),
          capital(), // duplicate id
        ],
      }),
    );
    expect(parsed.capitals.map((c) => c.id)).toEqual(['a-coruna']);
    expect(parsed.skipped).toBe(6);
  });

  it('fails when no capital is valid', () => {
    expect(() => parseSnapshot(snapshot({ capitals: [capital({ name: '' })] }))).toThrow(/no capital/);
  });

  it('turns missing or impossible measurements into null', () => {
    const [parsed] = parseSnapshot(
      snapshot({
        capitals: [
          capital({
            temperature_c: 99,
            wind_kmh: -3,
            cloud_pct: null,
            precipitation_24h_mm: 'lots',
            next_24h_temperature_c: [12, null, 'x', 80, 13.5],
            observed: { temperature_c: Number.NaN, observed_at: '2026-10-20T10:00:00Z', station: 'X' },
          }),
        ],
      }),
    ).capitals;
    expect(parsed.temperatureC).toBeNull();
    expect(parsed.windKmh).toBeNull();
    expect(parsed.cloudPct).toBeNull();
    expect(parsed.precipitation24hMm).toBeNull();
    expect(parsed.next24hTemperatureC).toEqual([12, null, null, null, 13.5]);
    expect(parsed.observed?.temperatureC).toBeNull();
  });

  it('treats a missing or malformed skill block as not available', () => {
    expect(parseSnapshot(snapshot({ skill: null })).skill).toBeNull();
    expect(parseSnapshot(snapshot({ skill: { date: 'yesterday', capitals: 52, temperature_mae_c: {} } })).skill).toBeNull();
    const odd = parseSnapshot(
      snapshot({ skill: { date: '2026-10-19', capitals: 52, temperature_mae_c: { lead_1_6h: 1.5, other: 3 } } }),
    ).skill;
    expect(odd?.temperatureMaeC).toEqual({ lead_1_6h: 1.5 });
  });
});

describe('snapshot age', () => {
  const generatedAt = '2026-10-20T11:25:00Z';

  it('is fresh within two hours of an hourly product', () => {
    expect(assessSnapshotAge({ generatedAt }, new Date('2026-10-20T12:30:00Z'))).toEqual({ status: 'fresh', ageMinutes: 65 });
  });

  it('flags stale and outdated snapshots', () => {
    expect(assessSnapshotAge({ generatedAt }, new Date('2026-10-20T13:30:00Z')).status).toBe('stale');
    expect(assessSnapshotAge({ generatedAt }, new Date('2026-10-20T18:00:00Z')).status).toBe('outdated');
  });

  it('never reports a negative age (clock skew)', () => {
    expect(assessSnapshotAge({ generatedAt }, new Date('2026-10-20T11:00:00Z')).ageMinutes).toBe(0);
  });
});

describe('capital table helpers', () => {
  const capitals = parseSnapshot(snapshot()).capitals;

  const withValues = (name: string, temperatureC: number | null, rain: number | null): CapitalWeather => ({
    ...capitals[0],
    id: name.toLowerCase(),
    name,
    temperatureC,
    precipitation24hMm: rain,
  });

  it('counts capitals with an observed temperature', () => {
    expect(countObserved(capitals)).toBe(3);
  });

  it('sorts names in Spanish order', () => {
    const list = [withValues('Ávila', 1, 0), withValues('Zamora', 1, 0), withValues('Albacete', 1, 0)];
    expect(sortCapitals(list, 'name', 'ascending').map((c) => c.name)).toEqual(['Albacete', 'Ávila', 'Zamora']);
    expect(sortCapitals(list, 'name', 'descending').map((c) => c.name)).toEqual(['Zamora', 'Ávila', 'Albacete']);
  });

  it('sorts numbers and keeps missing values last in both directions', () => {
    const list = [withValues('B', 20, null), withValues('A', null, 3), withValues('C', 10, 0)];
    expect(sortCapitals(list, 'forecast', 'descending').map((c) => c.name)).toEqual(['B', 'C', 'A']);
    expect(sortCapitals(list, 'forecast', 'ascending').map((c) => c.name)).toEqual(['C', 'B', 'A']);
    expect(sortCapitals(list, 'rain', 'ascending').map((c) => c.name)).toEqual(['C', 'A', 'B']);
  });

  it('does not modify the original list', () => {
    const list = [withValues('B', 2, 0), withValues('A', 1, 0)];
    sortCapitals(list, 'name', 'ascending');
    expect(list.map((c) => c.name)).toEqual(['B', 'A']);
  });

  it('sorts by observed temperature', () => {
    const sorted = sortCapitals(capitals, 'observed', 'descending').map((c) => c.id);
    expect(sorted[sorted.length - 1]).toBe('palma'); // no observation
  });
});
