import { FRESHNESS } from '../config/app.ts';
import type { Manifest } from './manifest.ts';

/**
 * - fresh: recent enough to be called "latest".
 * - stale: the update job is probably delayed; show a warning.
 * - outdated: treat as old data; show a prominent warning.
 * - sample: a fixed historical example, never presented as current.
 */
export type Freshness = 'fresh' | 'stale' | 'outdated' | 'sample';

export interface FreshnessReport {
  status: Freshness;
  /** Minutes between `now` and the newest frame's observation time. */
  ageMinutes: number;
}

export function latestFrameTime(manifest: Manifest): Date {
  return new Date(manifest.frames[manifest.frames.length - 1].time);
}

export function assessFreshness(manifest: Manifest, now: Date): FreshnessReport {
  const ageMinutes = Math.max(0, Math.round((now.getTime() - latestFrameTime(manifest).getTime()) / 60_000));
  if (manifest.kind === 'sample') return { status: 'sample', ageMinutes };
  if (ageMinutes >= FRESHNESS.outdatedAfterMinutes) return { status: 'outdated', ageMinutes };
  if (ageMinutes >= FRESHNESS.staleAfterMinutes) return { status: 'stale', ageMinutes };
  return { status: 'fresh', ageMinutes };
}

/** "45 min", "3 h 05 min", "2 days" — compact and unambiguous. */
export function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')} min`;
  }
  return `${Math.floor(minutes / (24 * 60))} days`;
}
