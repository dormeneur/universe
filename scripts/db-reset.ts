/**
 * Drops and recreates every module schema, then reapplies migrations.
 *
 * Local development only — it refuses to run against anything that is not
 * obviously a local or test database, because "reset the database" is the one
 * command you never want to fire at the wrong connection string.
 */
import { execSync } from 'node:child_process';
import postgres from 'postgres';

const MODULE_SCHEMAS = [
  'identity',
  'catalog',
  'sync',
  'discovery',
  'knowledge',
  'archive',
  'gigs',
  'tools',
  'moderation',
] as const;

function assertSafeTarget(url: string): void {
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal|postgres)[:/]/.test(url);
  const looksLikeTest = /_test(\?|$)/.test(url);

  if (!isLocal && !looksLikeTest) {
    console.error(
      'Refusing to reset: DATABASE_URL is neither local nor a *_test database.\n' +
        'If you really mean it, do it by hand — this script will not guess.',
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  assertSafeTarget(url);

  const sql = postgres(url, { max: 1 });
  try {
    for (const schema of MODULE_SCHEMAS) {
      await sql.unsafe(`drop schema if exists "${schema}" cascade`);
    }
    await sql.unsafe('drop table if exists "__drizzle_migrations" cascade');
    console.log(`Dropped ${MODULE_SCHEMAS.length} module schemas.`);
  } finally {
    await sql.end();
  }

  execSync('npx drizzle-kit migrate', { stdio: 'inherit' });
  console.log('Database reset complete.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
