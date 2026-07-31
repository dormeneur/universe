---
name: module-architecture
description: Rules for adding or changing code inside Uni-verse's modular monolith — where files go, which layer may import what, how modules talk to each other, and how to wire dependencies. Use this whenever you are creating a new module, adding a use case or repository, writing a server action, wiring a dependency, deciding where a piece of logic belongs, or touching anything under src/modules/ or src/composition/. Also use it when a change seems to need code from two modules at once, when you are tempted to import across module internals, or when dependency-cruiser fails.
---

# Module architecture

Uni-verse is a modular monolith with hexagonal layering. The boundaries are enforced by `dependency-cruiser` and ESLint in CI, so violations fail the build rather than accumulating quietly.

Full rationale lives in `docs/ARCHITECTURE.md`. This skill is the working procedure.

## Layout

```
src/modules/<name>/
  domain/           Entities, value objects, events, errors, pure policy
  application/      Use cases + the port interfaces they depend on
  infrastructure/   Drizzle repositories, HTTP clients, mailers
  presentation/     Server actions, route handlers, Zod schemas, components
  index.ts          Public API — the only import target from outside
```

## The dependency rule

```
domain  ←  application  ←  infrastructure
                       ←  presentation
```

- `domain/` imports only `shared/` (plus `zod` and `date-fns`). No Drizzle, no React, no `next/*`, no other module.
- `application/` imports `domain/` and its own ports. Never a concrete adapter.
- `infrastructure/` and `presentation/` import inward, never from each other.
- Only `composition/` may import a module's `infrastructure/`.

The reason this matters day to day: business rules that don't import a framework can be tested in under a millisecond without a database. When tests start needing setup, logic has usually leaked out of `domain/`.

## Deciding where code goes

Ask what the code actually is:

| The code… | Goes in |
|---|---|
| would still be true if the app were rewritten in Go | `domain/` |
| coordinates fetch → decide → persist → emit | `application/` |
| talks to Postgres, GitHub, or email | `infrastructure/` |
| parses a request or renders UI | `presentation/` |
| constructs concrete adapters | `composition/` |

When unsure between `domain/` and `application/`: if it needs to `await` anything, it belongs in `application/`.

## Adding a use case

Work outside-in, and stop at each layer to check the dependency rule.

1. **Domain first.** Add or extend the entity and write the rule as a pure function returning `Result`. Unit test it with no I/O.
2. **Declare the port** in `application/ports/` — narrow, named for what this use case needs (`ProjectReader`, not `ProjectRepository` with twenty methods). A use case that only reads should not be able to write.
3. **Write the use case** as a factory taking its dependencies as an argument object:

```ts
export function makePublishProject(deps: {
  projects: ProjectReader & ProjectWriter;
  events: EventPublisher;
  clock: Clock;
}) {
  return async function publishProject(input: PublishInput): Promise<Result<Project, PublishError>> {
    // fetch → apply domain rule → persist → emit
  };
}
```

Taking dependencies as arguments is what lets the test pass fakes and `composition/` pass Drizzle, without the use case knowing either exists.

4. **Implement the adapter** in `infrastructure/`, then run the port's contract test against both it and the in-memory fake (see the `testing-strategy` skill).
5. **Add the entry point** in `presentation/` — parse with Zod, call the use case, map `Result` to a response. No business logic here.
6. **Wire it** in `composition/container.ts`.
7. **Export it** from `index.ts` only if another module genuinely needs it. Keeping `index.ts` small is the highest-leverage habit in this codebase — everything exported becomes something you can't freely change.

## Crossing module boundaries

Three mechanisms, in order of preference.

**Direct call through the public API** — for synchronous reads.

```ts
import { listProjectsByOwner } from '@/modules/catalog';                      // legal
import { DrizzleProjectRepository } from '@/modules/catalog/infrastructure/…'; // fails lint
```

**Domain events** — for side effects, so the emitter never learns who cares.

```ts
await deps.events.publish({ type: 'catalog.project_published', projectId, ownerId, at });
```

Event names are namespaced by the owning module; payload types are exported from its `index.ts`. The bus is in-process and synchronous — no queue.

**Read models** — `discovery` maintains a denormalized table rebuilt from events. This is the only sanctioned place data crosses module lines in the database, and it flows one way.

Never: importing another module's internals, querying its tables, or cross-schema joins outside `discovery`.

## When a change seems to need two modules

This usually means the boundary is in the wrong place or a module is missing. Before reaching across:

- Can the second module subscribe to an event instead of being called?
- Is this a read that belongs in a `discovery` read model?
- Is it a composition concern? `profiles` owns no tables and exists purely to assemble a view from `identity` and `catalog` — that pattern is available for other cross-cutting views.
- Does the data belong to neither module, meaning a new one is warranted?

If you genuinely need to widen a module's public API, do that deliberately: add the export to `index.ts` and note why. That's a real decision, not an accident.

## Database ownership

Each module owns a Postgres schema (`identity`, `catalog`, …), declared in its own `infrastructure/schema.ts`. There is no global schema file. Foreign keys are free within a schema; cross-schema references store the ID without a constraint, except `identity.users(id)` which is the one permitted global reference.

See the `database-changes` skill before touching schema or migrations.

## Before committing

Run `npm run depcruise`. If it fails, fix the design rather than the rule — the ruleset is the architecture, and editing it to make an import legal is how the boundaries erode. If you believe a rule is genuinely wrong, change it deliberately and record why in `docs/adr/`.
