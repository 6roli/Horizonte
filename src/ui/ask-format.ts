/**
 * Formatting of query results on the "Ask the warehouse" page. Values come
 * from DuckDB-WASM as Arrow values: numbers, bigints, strings, null, and
 * dates/timestamps as milliseconds since the epoch (UTC).
 */

/** Text for one cell, given the Arrow type of its column (e.g. "Float64", "Timestamp<MICROSECOND>"). */
export function formatCell(value: unknown, type: string): string {
  if (value === null || value === undefined) return '—';
  if (/^(Date|Timestamp)/.test(type) && (typeof value === 'number' || typeof value === 'bigint' || value instanceof Date)) {
    const iso = new Date(value instanceof Date ? value.getTime() : Number(value)).toISOString();
    return type.startsWith('Date') ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 100) / 100);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** Numbers are right-aligned in the result table. */
export function isNumericType(type: string): boolean {
  return /^(Int|Uint|Float|Decimal)/.test(type);
}

/** "1.2 / 1.3 GB" style download progress. */
export function formatDownload(loaded: number, total: number): string {
  const gb = (bytes: number) => (bytes / 1e9).toFixed(2);
  return `${gb(loaded)} / ${gb(total)} GB`;
}
