/**
 * Every displayed time names its time zone explicitly. UTC is the reference
 * because satellite data is timestamped in UTC.
 */

function format(date: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(date);
}

/** "18 Oct 2026, 12:00 UTC" */
export function formatUtc(date: Date, locale = 'en-GB'): string {
  return format(date, 'UTC', locale);
}

/** "18 Oct 2026, 14:00 CEST" for Europe/Madrid. */
export function formatInZone(date: Date, timeZone: string, locale = 'en-GB'): string {
  return format(date, timeZone, locale);
}

/** "12:00" in UTC, for compact timeline labels. */
export function formatUtcClock(date: Date): string {
  return date.toISOString().slice(11, 16);
}

/** The viewer's own IANA time zone, e.g. "America/New_York". */
export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** True when two zones show the same wall-clock time for this instant. */
export function sameOffset(date: Date, zoneA: string, zoneB: string): boolean {
  const clock = (zone: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', day: '2-digit', hourCycle: 'h23' }).format(date);
  return clock(zoneA) === clock(zoneB);
}
