/**
 * Presentation helpers for the weather page: number formats, the temperature
 * colour scale and sparkline geometry. No DOM code, so they can be unit-tested.
 */

/** "15.5 °C", or an em dash when there is no value. */
export function formatTemperature(value: number | null, digits = 1): string {
  if (value === null) return '—';
  // Avoid "-0.0 °C" for values that round to zero.
  const text = value.toFixed(digits).replace(/^-(0(\.0+)?)$/, '$1');
  return `${text} °C`;
}

/** "4.7 mm", "0 mm" for zero, or an em dash when there is no value. */
export function formatMillimetres(value: number | null): string {
  if (value === null) return '—';
  return value === 0 ? '0 mm' : `${value.toFixed(1)} mm`;
}

/**
 * Temperature colour scale (°C → hex), interpolated between these stops.
 * Light colours throughout so dark text stays readable on every marker.
 */
const TEMPERATURE_STOPS: readonly [number, [number, number, number]][] = [
  [-10, [196, 181, 253]],
  [0, [165, 180, 252]],
  [8, [125, 211, 252]],
  [14, [94, 234, 212]],
  [20, [253, 230, 138]],
  [26, [253, 186, 116]],
  [32, [248, 113, 113]],
  [40, [244, 63, 94]],
];

export function temperatureColour(value: number): string {
  const stops = TEMPERATURE_STOPS;
  const clamped = Math.min(Math.max(value, stops[0][0]), stops[stops.length - 1][0]);
  let i = 1;
  while (i < stops.length - 1 && clamped > stops[i][0]) i += 1;
  const [t0, c0] = stops[i - 1];
  const [t1, c1] = stops[i];
  const f = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
  const channel = (k: number) => Math.round(c0[k] + (c1[k] - c0[k]) * f).toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

export interface Sparkline {
  /** Polyline segments ("x,y x,y …"); a gap in the data starts a new segment. */
  segments: string[];
  min: number | null;
  max: number | null;
}

/** Scales hourly values into a width × height box, leaving `padding` px around the line. */
export function sparkline(values: readonly (number | null)[], width: number, height: number, padding = 2): Sparkline {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) return { segments: [], min: null, max: null };
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - 2 * padding) / (values.length - 1) : 0;

  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) segments.push(current.join(' '));
      current = [];
      return;
    }
    const x = padding + index * step;
    // A flat series is drawn through the middle.
    const y = max === min ? height / 2 : height - padding - ((value - min) / span) * (height - 2 * padding);
    current.push(`${round(x)},${round(y)}`);
  });
  if (current.length > 0) segments.push(current.join(' '));
  return { segments, min, max };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return { day: `${get('day')} ${get('month')}`, clock: `${get('hour')}:${get('minute')}`, zone: get('timeZoneName') };
}

/**
 * Compact local time for table cells: "12:00 CEST" when it is on the same local
 * day as `reference`, otherwise "19 Oct, 23:00 CEST", so an old observation
 * never looks current.
 */
export function formatLocalTimeShort(time: Date, reference: Date, timeZone: string): string {
  const value = partsInZone(time, timeZone);
  const ref = partsInZone(reference, timeZone);
  return value.day === ref.day ? `${value.clock} ${value.zone}` : `${value.day}, ${value.clock} ${value.zone}`;
}

/** "19 Oct 2026" for a YYYY-MM-DD date (calendar date, no time zone shift). */
export function formatCalendarDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

const SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en']);

/** "SANTA CRUZ DE TENERIFE " → "Santa Cruz de Tenerife"; AEMET publishes station names in upper case. */
export function stationName(raw: string): string {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (text !== text.toUpperCase()) return text;
  return text
    .toLocaleLowerCase('es')
    .split(' ')
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word)
        ? word
        : word.replace(/(^|[(/-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase('es')),
    )
    .join(' ');
}
