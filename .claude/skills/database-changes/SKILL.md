---
name: database-changes
description: Rules for changing Uni-verse's Postgres schema with Drizzle — per-module schema ownership, expand/contract migrations, cross-schema reference rules, indexing, and the hard constraints on what may never be stored. Use this whenever adding or altering a table or column, writing or reviewing a migration, adding an index, renaming or dropping anything, writing a query that spans modules, or working in any infrastructure/schema.ts file.
---

# Database changes

One Postgres database, one schema per module. The database mirrors the module boundaries so they're enforced in two places rather than one.

## Ownership

Each module declares its own schema in its own `infrastructure/schema.ts`. There is no global schema file — that file always becomes the place modules quietly couple.

```ts
// modules/catalog/infrastructure/schema.ts
export const catalogSchema = pgSchema('catalog');

export const projects = catalogSchema.table('projects', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(), // → identity.users(id)
  name: text('name').notNull(),
  oneLiner: varchar('one_liner', { length: 140 }).notNull(),
  status: text('status').$type<ProjectStatus>().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});
```

## Reference rules

- **Foreign keys within a schema:** use them freely. Same module, same migration, same lifecycle.
- **Across schemas:** store the ID without a constraint. The owning module's API is the integrity boundary.
- **One exception:** `identity.users(id)` may be referenced with a real FK from anywhere. It's universal and stable, and pretending otherwise costs more than it buys.
- **No cross-schema joins** outside `discovery`'s read models. If you need catalog data inside gigs, call `catalog`'s public API.

`discovery` is the sanctioned exception: it maintains denormalized read models joining catalog and identity data, rebuilt from domain events. One-way, explicitly declared, and documented as a read model rather than a shortcut.

## Expand/contract migrations

Never change a column's meaning in one step. Deploys are not atomic with migrations, and a rollback with a dropped column is unrecoverable.

Renaming `one_liner` to `summary`:

1. **Expand** — add `summary`, nullable. Deploy.
2. **Backfill** — copy data in a migration or job. Deploy.
3. **Switch** — write to both, read from `summary`. Deploy.
4. **Stop writing** the old column. Deploy.
5. **Contract** — drop `one_liner` in a later migration, once you're confident.

Steps 1 and 5 must be separate migrations, ideally separate weeks. The cost is a few extra deploys; the alternative is a production incident with no rollback path.

Adding a `NOT NULL` column follows the same shape: add nullable with a default, backfill, then add the constraint.

## Indexes

Add the index in the same migration as the query that needs it, and say why in a comment — an unexplained index is one nobody dares remove.

Known requirements from the roadmap:

- `discovery`: GIN index on the `tsvector` column. Search is the product at 2000+ projects.
- `catalog.projects`: index on `(status, last_commit_at desc)` for the default feed.
- `catalog.projects`: index on `owner_id` for profile aggregation.
- Every foreign key column: index it. Postgres does not do this automatically and the omission surfaces as mysterious slowness later.
- Expiry sweeps (`gigs`, `tools`): index on `expires_at`.

Verify with `EXPLAIN ANALYZE` against seeded data rather than assuming. Phase 3 seeds 2000 synthetic projects specifically so this is measurable before launch.

## Hard constraints

These are architectural, not stylistic. Both come from the PRD and neither has an exception:

**No credentials for third-party services.** No column, log line, or cache may hold a password, API key, or session token for any external service — Copilot, Claude, JetBrains, anything. The tool board coordinates access; it never handles it. The only exception is the user's own GitHub OAuth token, encrypted at rest, used solely for their own sync.

**No payment data.** No wallet, no ledger, no transaction, no payment intent, no stored UPI handle beyond what a user voluntarily puts in free-text contact details. The platform never holds money, and the absence of these tables is what keeps that true under pressure.

If a feature request seems to need either, it's out of scope — check the PRD before writing the migration.

## Timestamps

Always `timestamp with time zone`. Always UTC. Never a bare `timestamp` — a graduation job comparing naive timestamps across a DST boundary fails in ways that take a day to diagnose.

Application code gets time from the injected `Clock`, never `Date.now()`, so time-dependent behaviour stays testable.

## Before writing the migration

- Which module owns this table? If the answer is "both", the boundary is wrong — resolve that first.
- Is this expand or contract? Never both.
- Does it need an index, and can you name the query that justifies it?
- Is it reversible? If not, split it until it is.
- Does it store anything from the hard-constraints list above?

## Testing

Repository tests run against a real Postgres instance in a transaction rolled back after each test — no mocking the database, because the point is to verify the SQL.

Every repository implements a shared contract test suite run against both it and its in-memory fake, so the fake used by fast application tests provably behaves like the real thing. See the `testing-strategy` skill.
