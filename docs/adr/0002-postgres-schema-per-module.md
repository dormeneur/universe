# ADR 0002 — One Postgres schema per module

**Status:** Accepted
**Date:** 2026-07-31

## Context

ADR 0001 enforces module boundaries in TypeScript. Those rules stop at the database: nothing prevents `gigs` from joining `catalog.projects` directly, and once one query does it, the modules are coupled in a way the linter can't see.

## Decision

Each module owns a Postgres schema (`identity`, `catalog`, `discovery`, …), declared in its own `infrastructure/schema.ts`. Foreign keys within a schema are unrestricted. Cross-schema references store the ID without a constraint, with one exception: `identity.users(id)` may be referenced with a real FK from anywhere.

`discovery` is the sanctioned exception to the no-cross-schema-join rule, maintaining denormalized read models rebuilt from domain events.

## Alternatives considered

**One schema, table-name prefixes** (`catalog_projects`) — rejected. Prefixes are a convention, and conventions decay. Postgres schemas make ownership structural and legible in the database itself.

**Separate databases per module** — rejected. Loses transactional consistency, multiplies connection management and migration overhead, and solves a problem this project doesn't have.

**Full FK integrity across schemas** — rejected as the default. It would force modules to know each other's table structure, reintroducing exactly the coupling the boundaries remove. `identity.users` is exempted because every module references users, it never changes shape, and pretending otherwise costs more than the purity is worth.

## Consequences

**Easier:** seeing which module owns a table; deleting a module (drop one schema); reasoning about blast radius during migrations.

**Harder:** queries that would have been one join now go through a module's public API, which is slower to write and sometimes slower to run. Where that genuinely matters, the answer is a `discovery` read model, not a shortcut.

**Committed to:** referential integrity across schemas being an application concern. Orphaned rows are possible where a module deletes something another still references — modules must handle missing references gracefully rather than assuming the database guarantees them.
