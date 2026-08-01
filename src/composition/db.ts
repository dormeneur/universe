import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getConfig } from '@/shared/config';

export type Database = ReturnType<typeof createDatabase>;

/**
 * The Postgres client lives in the composition root and is passed into
 * repositories, rather than being imported by them.
 *
 * That is what makes a repository testable against a throwaway database and
 * runnable against production without knowing the difference — and it keeps
 * the connection a single, countable resource instead of something each module
 * opens for itself.
 */
export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    // Serverless functions are short-lived and numerous; a large per-instance
    // pool multiplies into connection exhaustion on the Postgres side.
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return drizzle(client);
}

let instance: Database | undefined;

export function getDatabase(): Database {
  instance ??= createDatabase(getConfig().DATABASE_URL);
  return instance;
}
