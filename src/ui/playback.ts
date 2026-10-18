/**
 * Playback rules, without DOM code so they can be tested directly.
 * Frames that failed to load are skipped while playing.
 */

export const SPEEDS = {
  slow: 1200,
  normal: 600,
  fast: 250,
} as const;

export type Speed = keyof typeof SPEEDS;

/**
 * Index of the next playable frame after `current`, wrapping around.
 * Returns `current` if no other frame is playable.
 */
export function nextPlayableIndex(current: number, total: number, isUnavailable: (index: number) => boolean): number {
  for (let step = 1; step <= total; step += 1) {
    const candidate = (current + step) % total;
    if (!isUnavailable(candidate)) return candidate;
  }
  return current;
}

/** Index of the previous playable frame before `current`, wrapping around. */
export function previousPlayableIndex(current: number, total: number, isUnavailable: (index: number) => boolean): number {
  for (let step = 1; step <= total; step += 1) {
    const candidate = (current - step + total) % total;
    if (!isUnavailable(candidate)) return candidate;
  }
  return current;
}

/** Clamps a requested index into the valid range (e.g. from the slider). */
export function clampIndex(index: number, total: number): number {
  if (!Number.isFinite(index) || total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, Math.round(index)));
}
