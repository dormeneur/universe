import { z } from 'zod';
import { InvariantViolation } from './errors';

/**
 * Environment is parsed once, at the boundary, and trusted afterwards.
 *
 * Parsing is lazy rather than at import time so a production build does not
 * require production secrets. The composition root calls `getConfig()` during
 * server startup, so a missing variable still fails at boot rather than
 * surfacing inside a background job at 3am.
 */

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  /** Postgres connection string. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

export type Config = z.infer<typeof ConfigSchema>;

let cached: Config | undefined;

export function getConfig(): Config {
  if (cached) return cached;

  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    // Misconfiguration is not an expected failure a caller can handle — it
    // means the process should not be running at all.
    throw new InvariantViolation(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test-only escape hatch so suites can run without a real environment. */
export function setConfigForTesting(config: Config): void {
  cached = config;
}

export function resetConfigForTesting(): void {
  cached = undefined;
}
