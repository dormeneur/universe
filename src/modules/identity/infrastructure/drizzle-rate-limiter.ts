import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Clock } from '@/shared/clock';
import type { RateLimiter, RateLimitVerdict } from '../application/ports/rate-limiter';
import { rateLimitBuckets } from './schema';

/**
 * A fixed-window counter in Postgres.
 *
 * Postgres rather than an in-memory map because the app runs as multiple
 * serverless instances — a per-instance counter would multiply the effective
 * limit by however many instances happen to be warm, which is not a limit at
 * all. Redis would be faster, but this runs a handful of times per sign-in,
 * not per request, and one fewer piece of infrastructure is worth more here
 * than the microseconds.
 *
 * Fixed windows allow a burst across a boundary — up to 2× the limit if
 * requests cluster either side of a reset. For "5 emails a day" that is an
 * acceptable imprecision; a sliding window would cost more than the accuracy
 * is worth.
 */
export class DrizzleRateLimiter implements RateLimiter {
  constructor(
    private readonly db: PostgresJsDatabase,
    private readonly clock: Clock,
  ) {}

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitVerdict> {
    const now = this.clock.now();
    const windowStart = new Date(now.getTime() - windowMs);

    // A single atomic statement: read-then-write would let concurrent requests
    // interleave between the check and the increment, which is exactly when a
    // limit needs to hold. The upsert resets the counter when the stored
    // window has aged out, and increments otherwise.
    const [row] = await this.db
      .insert(rateLimitBuckets)
      .values({ key, count: 1, windowStartedAt: now })
      .onConflictDoUpdate({
        target: rateLimitBuckets.key,
        set: {
          count: sql`case
            when ${rateLimitBuckets.windowStartedAt} < ${windowStart.toISOString()}
            then 1
            else ${rateLimitBuckets.count} + 1
          end`,
          windowStartedAt: sql`case
            when ${rateLimitBuckets.windowStartedAt} < ${windowStart.toISOString()}
            then ${now.toISOString()}
            else ${rateLimitBuckets.windowStartedAt}
          end`,
        },
      })
      .returning({
        count: rateLimitBuckets.count,
        windowStartedAt: rateLimitBuckets.windowStartedAt,
      });

    if (!row) return { allowed: true, remaining: limit - 1 };

    if (row.count > limit) {
      const elapsed = now.getTime() - row.windowStartedAt.getTime();
      return { allowed: false, retryAfterMs: Math.max(0, windowMs - elapsed) };
    }

    return { allowed: true, remaining: limit - row.count };
  }
}
