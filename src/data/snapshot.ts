/**
 * The weather warehouse publishes a small JSON snapshot every hour
 * (gold/web/snapshot.json): for each Spanish provincial capital, the forecast
 * for the current hour and the next 24 hours, and the latest observation at the
 * linked AEMET station. This module validates that untrusted JSON.
 *
 * Rules: the overall structure must be right or the snapshot is rejected; a
 * single malformed capital is skipped (and counted) instead of breaking the
 * page; physically impossible values become null ("no data"), never a number
 * shown as if it were real.
 *
 * No DOM code here: this module also runs in Node (tests).
 */

export interface Observation {
  temperatureC: number | null;
  /** ISO 8601 UTC. */
  observedAt: string;
  /** AEMET station name, as published (often upper case). */
  station: string;
}

export interface CapitalWeather {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** When the forecast was issued (ISO 8601 UTC). */
  issuedAt: string;
  /** Forecast for the current hour. */
  temperatureC: number | null;
  windKmh: number | null;
  cloudPct: number | null;
  /** Forecast precipitation over the next 24 hours. */
  precipitation24hMm: number | null;
  /** Hourly forecast temperatures, starting with the current hour. */
  next24hTemperatureC: (number | null)[];
  /** Latest observation at the linked AEMET station, if any. */
  observed: Observation | null;
}

export interface ForecastSkill {
  /** Day the forecasts were verified (YYYY-MM-DD). */
  date: string;
  /** Number of capitals in the verification. */
  capitals: number;
  /** Mean absolute temperature error in °C per lead-time band, e.g. lead_1_6h. */
  temperatureMaeC: Record<string, number | null>;
}

export interface WeatherSnapshot {
  generatedAt: string;
  forecastIssuedAt: string;
  source: string;
  skill: ForecastSkill | null;
  capitals: CapitalWeather[];
  /** Capitals left out because their entry was malformed. */
  skipped: number;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(`Invalid weather snapshot: ${message}`);
    this.name = 'SnapshotError';
  }
}

/** Plausible ranges; anything outside is treated as missing. */
const LIMITS = {
  temperatureC: [-60, 60],
  windKmh: [0, 400],
  cloudPct: [0, 100],
  precipitationMm: [0, 2000],
} as const;

const MAX_CAPITALS = 500;
const MAX_HOURS = 72;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoUtc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function requireIsoUtc(value: unknown, field: string): string {
  if (!isIsoUtc(value)) throw new SnapshotError(`"${field}" must be an ISO 8601 UTC time ending in "Z"`);
  return value;
}

function requireText(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maxLength) {
    throw new SnapshotError(`"${field}" must be a non-empty string`);
  }
  return value.trim();
}

/** A finite number inside [min, max], or null for null/missing/implausible values. */
function measurement(value: unknown, [min, max]: readonly [number, number]): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value >= min && value <= max ? value : null;
}

function parseObservation(input: unknown, field: string): Observation | null {
  if (input === null || input === undefined) return null;
  if (!isRecord(input)) throw new SnapshotError(`"${field}" must be an object or null`);
  return {
    temperatureC: measurement(input.temperature_c, LIMITS.temperatureC),
    observedAt: requireIsoUtc(input.observed_at, `${field}.observed_at`),
    station: requireText(input.station, `${field}.station`),
  };
}

function parseCapital(input: unknown, index: number): CapitalWeather {
  const field = `capitals[${index}]`;
  if (!isRecord(input)) throw new SnapshotError(`${field} must be an object`);

  const id = requireText(input.id, `${field}.id`, 80);
  if (!/^[a-z0-9-]+$/.test(id)) throw new SnapshotError(`${field}.id must be lower-case letters, digits and dashes`);

  const lat = input.lat;
  const lon = input.lon;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new SnapshotError(`${field}.lat must be a latitude`);
  }
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new SnapshotError(`${field}.lon must be a longitude`);
  }

  const hours = input.next_24h_temperature_c;
  if (!Array.isArray(hours) || hours.length > MAX_HOURS) {
    throw new SnapshotError(`${field}.next_24h_temperature_c must be an array of at most ${MAX_HOURS} values`);
  }

  return {
    id,
    name: requireText(input.name, `${field}.name`, 80),
    lat,
    lon,
    issuedAt: requireIsoUtc(input.issued_at, `${field}.issued_at`),
    temperatureC: measurement(input.temperature_c, LIMITS.temperatureC),
    windKmh: measurement(input.wind_kmh, LIMITS.windKmh),
    cloudPct: measurement(input.cloud_pct, LIMITS.cloudPct),
    precipitation24hMm: measurement(input.precipitation_24h_mm, LIMITS.precipitationMm),
    next24hTemperatureC: hours.map((value) => measurement(value, LIMITS.temperatureC)),
    observed: parseObservation(input.observed, `${field}.observed`),
  };
}

/** The verification block is optional: anything malformed is treated as "not available". */
function parseSkill(input: unknown): ForecastSkill | null {
  if (!isRecord(input) || !isRecord(input.temperature_mae_c)) return null;
  if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) {
    return null;
  }
  const capitals = input.capitals;
  if (typeof capitals !== 'number' || !Number.isInteger(capitals) || capitals < 0) return null;

  const temperatureMaeC: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(input.temperature_mae_c)) {
    if (!/^lead_\d+_\d+h$/.test(key)) continue;
    temperatureMaeC[key] = measurement(value, [0, 50]);
  }
  return { date: input.date, capitals, temperatureMaeC };
}

/** Validates the warehouse's snapshot.json and returns typed data. */
export function parseSnapshot(input: unknown): WeatherSnapshot {
  if (!isRecord(input)) throw new SnapshotError('expected a JSON object');

  const generatedAt = requireIsoUtc(input.generated_at, 'generated_at');
  const forecastIssuedAt = requireIsoUtc(input.forecast_issued_at, 'forecast_issued_at');
  const source = requireText(input.source, 'source', 300);

  if (!Array.isArray(input.capitals) || input.capitals.length === 0) {
    throw new SnapshotError('"capitals" must be a non-empty array');
  }
  if (input.capitals.length > MAX_CAPITALS) throw new SnapshotError('"capitals" is unexpectedly long');

  const capitals: CapitalWeather[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  input.capitals.forEach((entry, index) => {
    try {
      const capital = parseCapital(entry, index);
      if (seen.has(capital.id)) {
        skipped += 1;
        return;
      }
      seen.add(capital.id);
      capitals.push(capital);
    } catch (error) {
      if (!(error instanceof SnapshotError)) throw error;
      skipped += 1;
    }
  });
  if (capitals.length === 0) throw new SnapshotError('no capital entry is valid');

  return { generatedAt, forecastIssuedAt, source, skill: parseSkill(input.skill), capitals, skipped };
}

/** Thresholds for an hourly product: one missed run is "stale", several are "outdated". */
export const SNAPSHOT_FRESHNESS = {
  staleAfterMinutes: 120,
  outdatedAfterMinutes: 360,
} as const;

export interface SnapshotAge {
  status: 'fresh' | 'stale' | 'outdated';
  ageMinutes: number;
}

export function assessSnapshotAge(snapshot: Pick<WeatherSnapshot, 'generatedAt'>, now: Date): SnapshotAge {
  const ageMinutes = Math.max(0, Math.round((now.getTime() - Date.parse(snapshot.generatedAt)) / 60_000));
  if (ageMinutes >= SNAPSHOT_FRESHNESS.outdatedAfterMinutes) return { status: 'outdated', ageMinutes };
  if (ageMinutes >= SNAPSHOT_FRESHNESS.staleAfterMinutes) return { status: 'stale', ageMinutes };
  return { status: 'fresh', ageMinutes };
}

/** Capitals with a station observation that has a temperature. */
export function countObserved(capitals: readonly CapitalWeather[]): number {
  return capitals.filter((capital) => capital.observed?.temperatureC != null).length;
}

export type SortKey = 'name' | 'forecast' | 'rain' | 'observed';
export type SortDirection = 'ascending' | 'descending';

const SORT_VALUE: Record<Exclude<SortKey, 'name'>, (capital: CapitalWeather) => number | null> = {
  forecast: (capital) => capital.temperatureC,
  rain: (capital) => capital.precipitation24hMm,
  observed: (capital) => capital.observed?.temperatureC ?? null,
};

/** Returns a sorted copy. Missing values always go last, whatever the direction. */
export function sortCapitals(
  capitals: readonly CapitalWeather[],
  key: SortKey,
  direction: SortDirection,
): CapitalWeather[] {
  const sign = direction === 'ascending' ? 1 : -1;
  const byName = (a: CapitalWeather, b: CapitalWeather) => a.name.localeCompare(b.name, 'es');
  if (key === 'name') return [...capitals].sort((a, b) => sign * byName(a, b));

  const value = SORT_VALUE[key];
  return [...capitals].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return byName(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    return sign * (va - vb) || byName(a, b);
  });
}
