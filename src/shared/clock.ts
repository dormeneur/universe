/**
 * Time is injected, never read directly.
 *
 * Expiry (gigs, tool listings), staleness (prompts, guides), graduation
 * transitions, and activity classification are all time-dependent rules. If
 * they call `Date.now()` they can only be tested approximately, and tests that
 * assert "roughly now" are the ones that fail at midnight on a Tuesday.
 *
 * Production wiring passes `systemClock` from `composition/`. Tests pass a
 * fixed clock from `shared/testing/clock` and assert exact boundaries.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
