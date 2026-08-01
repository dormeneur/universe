import { defineConfig } from 'drizzle-kit';

/**
 * Each module declares its own tables in its own infrastructure/schema.ts and
 * owns a Postgres schema (see ADR 0002). Drizzle discovers them by glob rather
 * than through a central schema file, because a central file is exactly where
 * modules quietly start coupling.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/infrastructure/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  verbose: true,
  strict: true,
});
