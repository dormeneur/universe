import type { Clock } from '../clock';

/**
 * A clock frozen at a known instant, so time-dependent rules can be tested at
 * exact boundaries — "stale one millisecond after six months" rather than
 * "stale around six months".
 */
export function fixedClock(iso: string): Clock {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`fixedClock received an invalid timestamp: ${iso}`);
  }
  return { now: () => new Date(instant) };
}

/** A clock the test advances by hand, for multi-step sequences. */
export function mutableClock(iso: string): Clock & { advance(ms: number): void } {
  let instant = new Date(iso).getTime();
  return {
    now: () => new Date(instant),
    advance: (ms: number) => {
      instant += ms;
    },
  };
}
