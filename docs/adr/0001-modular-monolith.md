# ADR 0001 — Modular monolith with enforced boundaries

**Status:** Accepted
**Date:** 2026-07-31

## Context

One developer building nine feature areas over roughly six months, deploying to a single campus with 2000+ potential users. The dominant risk is not scale — it's that the codebase becomes unchangeable by month four, when every file imports every other file and no logic can be tested without a database.

## Decision

Build a modular monolith: one deployable, one database, feature modules with a single public entrance (`index.ts`) and hexagonal layering inside each. Enforce the boundaries with `dependency-cruiser` and ESLint in CI.

## Alternatives considered

**Microservices** — rejected. One developer, one database, 2000 users. The distributed-systems overhead (deploys, network failure modes, distributed tracing, data consistency) buys nothing at this scale and would consume the entire time budget.

**Conventional Next.js layout** (`app/`, `components/`, `lib/`) — rejected. It has no concept of a boundary. Everything in `lib/` is importable from everywhere, which is exactly the failure mode this project needs to avoid over a six-month solo build.

**Modules by technical type** (`repositories/`, `services/`, `controllers/`) — rejected. Changing one feature then touches four directories, and nothing tells you which parts belong together. Grouping by feature keeps related change in one place.

## Consequences

**Easier:** deleting a module cleanly (the roadmap gates several on usage and expects some to be removed); testing business rules without I/O; onboarding a second developer later, since the boundaries are documented and machine-checked.

**Harder:** cross-module features need an explicit decision — a public API addition, an event, or a read model — rather than a quick import. This will feel like friction in Phase 2 when `sync` wants to reach into `catalog`'s tables. That friction is the point, and holding the line there is what keeps the rules credible afterward.

**Committed to:** keeping `dependency-cruiser` rules current, and treating a rule change as a real architectural decision rather than a way to make an import legal.
