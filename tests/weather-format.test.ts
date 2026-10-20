import { describe, expect, it } from 'vitest';
import {
  formatCalendarDate,
  formatLocalTimeShort,
  formatMillimetres,
  formatTemperature,
  sparkline,
  stationName,
  temperatureColour,
} from '../src/ui/weather-format.ts';

describe('number formats', () => {
  it('formats temperatures and shows a dash for missing values', () => {
    expect(formatTemperature(15.46)).toBe('15.5 °C');
    expect(formatTemperature(-0.04)).toBe('0.0 °C');
    expect(formatTemperature(-2.25, 0)).toBe('-2 °C');
    expect(formatTemperature(null)).toBe('—');
  });

  it('formats rain', () => {
    expect(formatMillimetres(0)).toBe('0 mm');
    expect(formatMillimetres(4.71)).toBe('4.7 mm');
    expect(formatMillimetres(null)).toBe('—');
  });
});

describe('temperatureColour', () => {
  it('returns the exact stop colours', () => {
    expect(temperatureColour(20)).toBe('#fde68a');
    expect(temperatureColour(0)).toBe('#a5b4fc');
  });

  it('clamps values outside the scale', () => {
    expect(temperatureColour(-40)).toBe(temperatureColour(-10));
    expect(temperatureColour(55)).toBe(temperatureColour(40));
  });

  it('interpolates between stops', () => {
    const colour = temperatureColour(17);
    expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    expect(colour).not.toBe(temperatureColour(14));
    expect(colour).not.toBe(temperatureColour(20));
  });
});

describe('sparkline', () => {
  it('spans the box from left to right, highest value at the top', () => {
    const line = sparkline([0, 10, 5], 100, 20, 0);
    expect(line.segments).toEqual(['0,20 50,0 100,10']);
    expect(line.min).toBe(0);
    expect(line.max).toBe(10);
  });

  it('breaks the line where data is missing', () => {
    const line = sparkline([1, 2, null, 3, 4], 40, 10, 0);
    expect(line.segments).toHaveLength(2);
  });

  it('draws a flat series through the middle', () => {
    expect(sparkline([7, 7, 7], 20, 10, 0).segments).toEqual(['0,5 10,5 20,5']);
  });

  it('returns nothing without data', () => {
    expect(sparkline([null, null], 20, 10)).toEqual({ segments: [], min: null, max: null });
    expect(sparkline([], 20, 10).segments).toEqual([]);
  });
});

describe('local times', () => {
  const reference = new Date('2026-10-20T11:25:00Z');

  it('shows only the clock for the same Spanish day', () => {
    expect(formatLocalTimeShort(new Date('2026-10-20T10:00:00Z'), reference, 'Europe/Madrid')).toBe('12:00 CEST');
  });

  it('adds the date for another day, so old observations are obvious', () => {
    expect(formatLocalTimeShort(new Date('2026-10-19T21:00:00Z'), reference, 'Europe/Madrid')).toBe('19 Oct, 23:00 CEST');
  });

  it('uses winter time after the October change', () => {
    const winter = new Date('2026-11-02T10:00:00Z');
    expect(formatLocalTimeShort(winter, winter, 'Europe/Madrid')).toBe('11:00 CET');
  });

  it('formats calendar dates without shifting the day', () => {
    expect(formatCalendarDate('2026-10-19')).toBe('19 Oct 2026');
  });
});

describe('stationName', () => {
  it('turns AEMET upper case into readable names', () => {
    expect(stationName('SANTA CRUZ DE TENERIFE ')).toBe('Santa Cruz de Tenerife');
    expect(stationName('A CORUÑA')).toBe('A Coruña');
    expect(stationName('LAS PALMAS DE GC. PLAZA  DE LA FERIA')).toBe('Las Palmas de Gc. Plaza de la Feria');
  });

  it('leaves mixed-case names alone', () => {
    expect(stationName('Madrid, Retiro')).toBe('Madrid, Retiro');
  });
});
