import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/**
 * Integration tests run against a real Postgres instance, never a mock — the
 * whole point of these tests is to verify the SQL, and a mocked database
 * verifies only that the code calls the mock.
 */

let client: ReturnType<typeof postgres> | undefined;
let db: PostgresJsDatabase | undefined;

function connectionString(): string {
  const url = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Integration tests need a throwaway database — ' +
        'see .env.example.',
    );
  }
  return url;
}

export function testDatabase(): PostgresJsDatabase {
  if (!db) {
    // One connection: these tests run serially by design, and a pool would
    // let a stray connection see a half-truncated schema between tests.
    client = postgres(connectionString(), { max: 1, onnotice: () => {} });
    db = drizzle(client);
  }
  return db;
}

export async function closeTestDatabase(): Promise<void> {
  await client?.end();
  client = undefined;
  db = undefined;
}

/**
 * Empties the tables a suite touches, so each test starts from a known state
 * and order between tests cannot matter.
 *
 * TRUNCATE with CASCADE rather than DELETE: it resets identity sequences and
 * is not slowed down by foreign keys.
 */
export async function truncate(tables: readonly string[]): Promise<void> {
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.split('.')[0]}"."${t.split('.')[1]}"`).join(', ');
  await testDatabase().execute(`truncate table ${list} restart identity cascade` as never);
}
