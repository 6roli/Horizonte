import { describe, expect, it } from 'vitest';
import { clampIndex, nextPlayableIndex, previousPlayableIndex } from '../src/ui/playback.ts';
import { formatInZone, formatUtc, sameOffset } from '../src/ui/time-format.ts';

describe('playback', () => {
  const none = () => false;

  it('wraps around in both directions', () => {
    expect(nextPlayableIndex(4, 5, none)).toBe(0);
    expect(previousPlayableIndex(0, 5, none)).toBe(4);
  });

  it('skips frames that failed to load', () => {
    const failed = new Set([1, 2]);
    expect(nextPlayableIndex(0, 5, (i) => failed.has(i))).toBe(3);
    expect(previousPlayableIndex(3, 5, (i) => failed.has(i))).toBe(0);
  });

  it('stays put when nothing else is playable', () => {
    expect(nextPlayableIndex(2, 5, (i) => i !== 2)).toBe(2);
  });

  it('clamps slider values', () => {
    expect(clampIndex(-3, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(Number.NaN, 5)).toBe(0);
  });
});

describe('time formatting', () => {
  const summer = new Date('2026-07-01T12:00:00Z');
  const winter = new Date('2026-12-01T12:00:00Z');

  it('always labels UTC', () => {
    expect(formatUtc(summer)).toMatch(/12:00.*UTC/);
  });

  it('shows Spanish summer and winter time with their abbreviations', () => {
    expect(formatInZone(summer, 'Europe/Madrid')).toMatch(/14:00.*CEST/);
    expect(formatInZone(winter, 'Europe/Madrid')).toMatch(/13:00.*CET/);
  });

  it('detects equal offsets', () => {
    expect(sameOffset(summer, 'Europe/Madrid', 'Europe/Paris')).toBe(true);
    expect(sameOffset(summer, 'Europe/Madrid', 'UTC')).toBe(false);
  });
});
