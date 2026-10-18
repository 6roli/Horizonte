import { FRESHNESS } from '../config/app.ts';
import type { SequenceKind } from './manifest.ts';

/** Anything with a kind and time-ordered frames: a sample manifest or a live sequence. */
interface TimedFrames {
  kind: SequenceKind;
  frames: { time: string }[];
}

/**
 * - fresh: recent enough to be called "latest".
 * - stale: EUMETView is publishing late (or the sample is old); show a warning.
 * - outdated: treat as old data; show a prominent warning.
 * - sample: a fixed historical example, never presented as current.
 */
export type Freshness = 'fresh' | 'stale' | 'outdated' | 'sample';

export interface FreshnessReport {
  status: Freshness;
  /** Minutes between `now` and the newest frame's observation time. */
  ageMinutes: number;
}

export function latestFrameTime(sequence: TimedFrames): Date {
  return new Date(sequence.frames[sequence.frames.length - 1].time);
}

export function assessFreshness(sequence: TimedFrames, now: Date): FreshnessReport {
  const ageMinutes = Math.max(0, Math.round((now.getTime() - latestFrameTime(sequence).getTime()) / 60_000));
  if (sequence.kind === 'sample') return { status: 'sample', ageMinutes };
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
