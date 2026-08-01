import { systemClock } from '@/shared/clock';
import { getConfig } from '@/shared/config';
import { ulidGenerator } from '@/shared/id';
import { createLogger } from '@/shared/logger';
import { createIdentityModule } from '@/modules/identity/composition';
import { getDatabase } from './db';
import { createEventBus } from './event-bus';

/**
 * The composition root: the only place concrete adapters are constructed.
 *
 * Everywhere else depends on interfaces, which is what lets a use case be
 * tested with fakes and run in production with Postgres without knowing the
 * difference. Plain factory functions do this job — a DI framework would add
 * indirection and a dependency without adding capability at this size.
 */
export function createContainer() {
  const config = getConfig();
  const logger = createLogger(config.LOG_LEVEL, { env: config.NODE_ENV });
  const events = createEventBus(logger);
  const db = getDatabase();

  const identity = createIdentityModule({
    db,
    clock: systemClock,
    ids: ulidGenerator,
    events,
    logger,
    allowlist: config.CAMPUS_EMAIL_DOMAINS,
    resend: config.RESEND_API_KEY
      ? { apiKey: config.RESEND_API_KEY, from: config.RESEND_FROM }
      : null,
    // Permitted outside production, or wherever it has been asked for
    // explicitly — an end-to-end run against a production build, for instance.
    allowConsoleMail: config.NODE_ENV !== 'production' || config.ALLOW_CONSOLE_MAIL,
    devMailSink: config.DEV_MAIL_SINK,
  });

  return {
    config,
    logger,
    events,
    clock: systemClock,
    ids: ulidGenerator,
    identity,
  } as const;
}

export type Container = ReturnType<typeof createContainer>;

let instance: Container | undefined;

/**
 * Lazily built and cached for the process lifetime.
 *
 * The first call parses the environment, so a missing variable surfaces at
 * server startup rather than inside a background job hours later.
 */
export function getContainer(): Container {
  instance ??= createContainer();
  return instance;
}
