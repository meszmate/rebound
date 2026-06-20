import { describe, it, expect } from 'vitest';
import units from '../client/js/core/units.js';

describe('units.parseTime', () => {
  it('parses explicit time units to seconds', () => {
    expect(units.parseTime('1s', 24)).toBe(1);
    expect(units.parseTime('250ms', 24)).toBeCloseTo(0.25, 6);
    expect(units.parseTime('2m', 24)).toBe(120);
    expect(units.parseTime('1h', 24)).toBe(3600);
  });

  it('parses frames against fps', () => {
    expect(units.parseTime('12f', 24)).toBeCloseTo(0.5, 6);
    expect(units.parseTime('30f', 30)).toBe(1);
  });

  it('uses the default unit for bare numbers', () => {
    expect(units.parseTime('2', 24)).toBe(2); // default seconds
    expect(units.parseTime('6', 24, 'f')).toBeCloseTo(0.25, 6);
  });

  it('returns null on garbage', () => {
    expect(units.parseTime('abc', 24)).toBeNull();
    expect(units.parseTime('', 24)).toBeNull();
  });
});

describe('units.parseFrames', () => {
  it('rounds to whole frames', () => {
    expect(units.parseFrames('0.5s', 24)).toBe(12);
    expect(units.parseFrames('10f', 24)).toBe(10);
  });
});

describe('units.parseLength', () => {
  it('parses px and % with optional basis', () => {
    expect(units.parseLength('24px')).toEqual({ value: 24, unit: 'px', absolute: 24 });
    expect(units.parseLength('50%', 200)).toEqual({ value: 50, unit: '%', absolute: 100 });
    expect(units.parseLength('10').unit).toBe('px');
  });
});

describe('units.formatTime', () => {
  it('formats back into the requested unit', () => {
    expect(units.formatTime(1, 24, 's')).toBe('1s');
    expect(units.formatTime(0.5, 24, 'f')).toBe('12f');
    expect(units.formatTime(0.25, 24, 'ms')).toBe('250ms');
  });
});

describe('units.clamp/round', () => {
  it('clamps and rounds', () => {
    expect(units.clamp(5, 0, 3)).toBe(3);
    expect(units.clamp(-1, 0, 3)).toBe(0);
    expect(units.round(3.14159, 2)).toBe(3.14);
  });
});
