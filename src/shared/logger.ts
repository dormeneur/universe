/**
 * Structured logging.
 *
 * Every log line is JSON so it stays queryable once there is more than one
 * of them. `child()` carries a correlation ID through a request or background
 * run, which is the difference between "a sync failed somewhere last night"
 * and "sync run 01J... failed on project 01K... after 3 retries".
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger that includes `fields` on every line it writes. */
  child(fields: LogFields): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(minLevel: LogLevel = 'info', base: LogFields = {}): Logger {
  const write = (level: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

    const line = JSON.stringify({
      level,
      message,
      time: new Date().toISOString(),
      ...base,
      ...fields,
    });

    // The console is the transport: Vercel captures stdout/stderr and both
    // are already structured, so a logging library would add a dependency
    // without adding capability.
    if (level === 'error' || level === 'warn') console.error(line);
    else console.log(line);
  };

  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    child: (fields) => createLogger(minLevel, { ...base, ...fields }),
  };
}

/** Discards everything. Used by tests that do not assert on log output. */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};
