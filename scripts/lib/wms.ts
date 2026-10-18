/**
 * Small, dependency-free helpers for the OGC WMS 1.3.0 requests Horizonte needs.
 * Pure functions only, so they can be unit-tested without network access.
 */
import type { Bbox } from '../../src/config/app.ts';

/** One availability entry from a WMS time dimension. */
export type TimeAvailability =
  | { type: 'instant'; time: number }
  | { type: 'interval'; start: number; end: number; stepMs: number };

/** Parses ISO 8601 durations limited to days, hours, minutes and seconds (e.g. "PT10M"). */
export function parseIsoDuration(text: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(text.trim());
  if (!match || text.trim() === 'P' || text.trim() === 'PT') throw new Error(`Unsupported ISO 8601 duration: "${text}"`);
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60_000 + Number(seconds) * 1000;
}

function parseTime(text: string): number {
  const value = Date.parse(text.trim());
  if (Number.isNaN(value)) throw new Error(`Invalid time in WMS dimension: "${text}"`);
  return value;
}

/** Parses the text of a <Dimension name="time"> element: comma-separated instants and/or start/end/period. */
export function parseTimeDimension(text: string): TimeAvailability[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item): TimeAvailability => {
      const parts = item.split('/');
      if (parts.length === 1) return { type: 'instant', time: parseTime(parts[0]) };
      if (parts.length === 3) {
        return { type: 'interval', start: parseTime(parts[0]), end: parseTime(parts[1]), stepMs: parseIsoDuration(parts[2]) };
      }
      throw new Error(`Unsupported time dimension entry: "${item}"`);
    });
}

export function latestAvailableTime(availability: TimeAvailability[]): number {
  if (availability.length === 0) throw new Error('The layer reports no available times');
  return Math.max(...availability.map((entry) => (entry.type === 'instant' ? entry.time : entry.end)));
}

/** True when the server holds an image for exactly this time (not just a nearby one). */
export function isTimeAvailable(availability: TimeAvailability[], time: number): boolean {
  return availability.some((entry) => {
    if (entry.type === 'instant') return entry.time === time;
    return time >= entry.start && time <= entry.end && (time - entry.start) % entry.stepMs === 0;
  });
}

/**
 * Picks up to `count` times, `stepMinutes` apart, ending at `end` and going
 * back in time. Only times that every layer has are kept. Result is oldest first.
 */
export function selectFrameTimes(
  availabilityByLayer: TimeAvailability[][],
  end: number,
  count: number,
  stepMinutes: number,
): number[] {
  const stepMs = stepMinutes * 60_000;
  const times: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const time = end - i * stepMs;
    if (availabilityByLayer.every((availability) => isTimeAvailable(availability, time))) times.push(time);
  }
  return times.reverse();
}

/** Extracts the time dimension text for each requested layer from a GetCapabilities document. */
export function extractTimeDimensions(capabilitiesXml: string, layerNames: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const layerName of layerNames) {
    const nameTag = `<Name>${layerName}</Name>`;
    const nameIndex = capabilitiesXml.indexOf(nameTag);
    if (nameIndex === -1) throw new Error(`Layer "${layerName}" not found in GetCapabilities`);
    // The <Dimension> belongs to the same <Layer>; stop before the next layer starts.
    const rest = capabilitiesXml.slice(nameIndex);
    const nextLayer = rest.indexOf('<Layer', nameTag.length);
    const scope = nextLayer === -1 ? rest : rest.slice(0, nextLayer);
    const match = /<Dimension[^>]*name="time"[^>]*>([^<]+)<\/Dimension>/.exec(scope);
    if (!match) throw new Error(`Layer "${layerName}" has no time dimension`);
    result.set(layerName, match[1].trim());
  }
  return result;
}

export interface GetMapOptions {
  endpoint: string;
  layers: string[];
  bbox: Bbox;
  width: number;
  height: number;
  format: 'image/jpeg' | 'image/png';
  time?: string;
  transparent?: boolean;
}

/** Builds a WMS 1.3.0 GetMap URL. Note: EPSG:4326 in WMS 1.3.0 uses lat,lon axis order. */
export function buildGetMapUrl(options: GetMapOptions): string {
  const { south, west, north, east } = options.bbox;
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: options.layers.join(','),
    styles: '',
    crs: 'EPSG:4326',
    bbox: [south, west, north, east].join(','),
    width: String(options.width),
    height: String(options.height),
    format: options.format,
  });
  if (options.time) params.set('time', options.time);
  if (options.transparent) params.set('transparent', 'true');
  return `${options.endpoint}?${params.toString()}`;
}

/** Reads GeoServer's "Warning: 99 Nearest value used: time=…" header, if present. */
export function nearestTimeFromWarning(warning: string | null): number | undefined {
  if (!warning) return undefined;
  const match = /Nearest value used:\s*time=([0-9T:\-.]+Z)/.exec(warning);
  return match ? Date.parse(match[1]) : undefined;
}

/** "2026-10-18T12:00:00Z" → "20261018T1200Z" (safe for file names on every OS). */
export function compactTime(time: number): string {
  return new Date(time).toISOString().replace(/[-:]/g, '').replace(/\d{2}\.\d{3}Z$/, 'Z');
}
