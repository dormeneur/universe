import { describe, expect, it } from 'vitest';
import { systemClock } from './clock';
import { fixedClock, mutableClock } from './testing/clock';

describe('systemClock', () => {
  it('returns the current time', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
  });
});

describe('fixedClock', () => {
  it('always returns the same instant', () => {
    const clock = fixedClock('2026-07-01T12:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-07-01T12:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });

  it('hands out a fresh Date each call so callers cannot mutate it', () => {
    const clock = fixedClock('2026-07-01T12:00:00.000Z');
    const first = clock.now();
    first.setFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });

  it('rejects an invalid timestamp rather than silently returning NaN', () => {
    expect(() => fixedClock('not a date')).toThrow(/invalid timestamp/i);
  });
});

describe('mutableClock', () => {
  it('advances by the requested number of milliseconds', () => {
    const clock = mutableClock('2026-07-01T00:00:00.000Z');
    clock.advance(90 * 60 * 1000);
    expect(clock.now().toISOString()).toBe('2026-07-01T01:30:00.000Z');
  });
});
