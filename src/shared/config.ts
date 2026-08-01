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

  /**
   * Institutional domains that grant immediate access. Comma-separated;
   * entries may be exact (`college.ac.in`) or suffix wildcards (`*.ac.in`).
   * Anything outside the list goes to manual review rather than being
   * rejected, so this can be edited without a deploy (PRD ID-4).
   */
  CAMPUS_EMAIL_DOMAINS: z
    .string()
    .default('')
    .transform((raw) =>
      raw
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d.length > 0),
    ),

  /** Omit in development and sign-in codes are logged instead of emailed. */
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default('Uni-verse <onboarding@resend.dev>'),

  /**
   * Explicit permission to log sign-in codes instead of emailing them.
   *
   * Required whenever RESEND_API_KEY is absent. It exists so that a deploy
   * missing its mail configuration fails loudly at startup rather than
   * quietly writing every account's sign-in code to the log.
   */
  ALLOW_CONSOLE_MAIL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  /**
   * A file the console mailer appends sign-in codes to, so local work and
   * end-to-end tests can read them without a real inbox — the same idea as
   * running Mailpit.
   */
  DEV_MAIL_SINK: z.string().optional(),

  /** Public origin, used to build the GitHub OAuth callback URL. */
  APP_URL: z.string().default('http://localhost:3000'),

  /**
   * GitHub OAuth app credentials. All three are optional together: without
   * them, linking is simply unavailable and the rest of the product works
   * unchanged — a student can sign in, browse, and use the boards with no
   * GitHub account at all (PRD ID-11).
   */
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  /**
   * 32 bytes, base64, for encrypting stored GitHub access tokens at rest.
   * Generate with:
   *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   */
  GITHUB_TOKEN_ENCRYPTION_KEY: z.string().optional(),
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
