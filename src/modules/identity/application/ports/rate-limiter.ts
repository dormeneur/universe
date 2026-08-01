/**
 * Two independent limits guard code requests (PRD ID-7): one per address, so a
 * single account cannot be mail-bombed, and one per IP, so an attacker cannot
 * walk a list of addresses from one machine.
 */
export interface RateLimiter {
  /**
   * Records an attempt and reports whether it is permitted.
   *
   * Consuming and checking in one call avoids the gap between "asked if I may"
   * and "did it", which under concurrency is how limits get exceeded.
   */
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitVerdict>;
}

export type RateLimitVerdict =
  | { readonly allowed: true; readonly remaining: number }
  | { readonly allowed: false; readonly retryAfterMs: number };
