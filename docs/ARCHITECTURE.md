# Uni-verse — Architecture

**Style:** Modular monolith, hexagonal layering, machine-enforced boundaries.
**Stack:** Next.js (App Router) · TypeScript (strict) · Postgres · Drizzle · Auth.js · Vitest · Playwright

---

## 1. Why this shape

One developer is going to build nine feature areas over roughly six months. The failure mode is not "wrong framework" — it's that by month four every file imports every other file, changing the sync job breaks search, and nothing can be tested without a database.

Three decisions prevent that:

1. **Modules with a single public entrance.** Each feature area is a directory with an `index.ts`. Nothing outside may import past it. Internals stay free to change.
2. **Dependencies point inward.** Business rules never import Drizzle, React, or `next/*`. That keeps the interesting logic testable in milliseconds and survivable across framework churn.
3. **A linter enforces both.** Architecture rules that live only in a document are decoration. These live in `dependency-cruiser` and ESLint, and they fail CI.

Microservices are explicitly rejected: one developer, one database, 2000 users. The modular monolith gives the boundaries without the distributed-systems tax, and it can be split later if it ever needs to be — which it won't.

---

## 2. Module map

```
src/
  shared/                  Framework-free kernel. Depends on nothing.
  modules/
    identity/              Users, GitHub OAuth, campus verification, roles, graduation
    catalog/               Projects, publication, enrichment, tags, membership
    sync/                  GitHub App client, repo + issue import, rate limiting
    discovery/             Search, ranking, feeds, facets
    profiles/              Builder profiles (composition module — owns no tables)
    knowledge/             Guides, revisions, prompt library, staleness
    archive/               Final-year entries, attribution, takedown
    gigs/                  Listings, interests, reviews, expiry
    tools/                 License directory, group-buy, sharing lanes
    moderation/            Reports, review queue, admin actions
  composition/             Wiring. The only place concrete adapters are constructed.
  app/                     Next.js routes. Thin — delegates to module presentation layers.
```

### 2.1 Module ownership

| Module | Owns | Depends on | Phase |
|---|---|---|---|
| `identity` | Users, verification, sessions, roles | — | 1 |
| `catalog` | Projects, tags, members | `identity` | 2 |
| `sync` | GitHub install state, sync runs | `catalog` (via events) | 2 |
| `moderation` | Reports, actions | `identity` | 2 |
| `discovery` | Search index, ranking config | `catalog`, `identity` | 3 |
| `profiles` | *nothing* | `identity`, `catalog` | 3 |
| `knowledge` | Guides, revisions, prompts | `identity` | 4 |
| `archive` | Archive entries | `identity` | 4 |
| `gigs` | Listings, interests, reviews | `identity` | 5 |
| `tools` | Directory, group-buys, listings | `identity` | 6 |

`profiles` is deliberately a **composition module**: it owns no tables and no domain state. It assembles a view from `identity` and `catalog` public APIs. Worth naming explicitly, because the instinct will be to give it a table — and the moment it has one, user data lives in two places and they drift.

The dependency graph is acyclic. `dependency-cruiser` enforces that; a cycle fails the build.

---

## 3. Layers inside a module

```
modules/<name>/
  domain/           Entities, value objects, domain events, errors, pure policy
  application/      Use cases + port interfaces
  infrastructure/   Adapters: Drizzle repositories, HTTP clients, mailers
  presentation/     Server actions, route handlers, Zod schemas, React components
  index.ts          Public API — the only legal import target from outside
```

### 3.1 The dependency rule

```
domain  ←  application  ←  infrastructure
                       ←  presentation
```

Arrows are the *only* permitted direction.

- `domain/` imports nothing but `shared/kernel`. No Drizzle, no React, no `next/*`, no other module.
- `application/` imports `domain/` and its own port interfaces. Never a concrete adapter.
- `infrastructure/` and `presentation/` may import inward freely, and never from each other.

The payoff is concrete: your ranking rules, verification state machine, and expiry policy become pure functions you can test without booting Postgres or Next.

### 3.2 What lives where

**domain/** — the rules that would still be true if you rewrote the app in Go.

```ts
// modules/catalog/domain/project.ts
export type ProjectStatus =
  | 'active' | 'seeking_contributors' | 'looking_for_teammates'
  | 'complete' | 'dormant';

export function canPublish(p: Project, actor: UserId): Result<void, PublishError> {
  if (p.ownerId !== actor) return err({ kind: 'not_owner' });
  if (p.isFork && !p.forkAcknowledged) return err({ kind: 'unacknowledged_fork' });
  if (p.oneLiner.trim().length === 0) return err({ kind: 'missing_one_liner' });
  return ok(undefined);
}
```

No I/O. No framework. Trivially testable.

**application/** — orchestration. Fetch, apply domain rules, persist, emit.

```ts
// modules/catalog/application/publish-project.ts
export function makePublishProject(deps: {
  projects: ProjectWriter & ProjectReader;
  events: EventPublisher;
  clock: Clock;
}) {
  return async function publishProject(
    input: { projectId: ProjectId; actor: UserId },
  ): Promise<Result<Project, PublishError | NotFoundError>> {
    const project = await deps.projects.byId(input.projectId);
    if (!project) return err({ kind: 'not_found' });

    const allowed = canPublish(project, input.actor);
    if (!allowed.ok) return allowed;

    const published = { ...project, publishedAt: deps.clock.now() };
    await deps.projects.save(published);
    await deps.events.publish({ type: 'catalog.project_published', projectId: published.id });
    return ok(published);
  };
}
```

Dependencies arrive as arguments. That is dependency inversion doing real work: the test passes fakes, `composition/` passes Drizzle.

**infrastructure/** — the only place Drizzle appears.

**presentation/** — server actions and route handlers. Parse input with Zod, call the use case, map `Result` to a response. No business logic.

**index.ts** — the public contract, curated by hand:

```ts
// modules/catalog/index.ts
export type { Project, ProjectStatus, ProjectId } from './domain/project';
export { publishProject, getProject, listProjectsByOwner } from './composition';
export type { ProjectPublishedEvent } from './domain/events';
```

If it isn't in `index.ts`, no other module may touch it. Keeping this file small is the single highest-leverage maintenance habit in the codebase.

---

## 4. SOLID, concretely

Applied, not recited.

### Single Responsibility
One use case per file, one exported factory. The test is "what would make me edit this file?" — if there are two answers, split it.

`publish-project.ts`, `import-repositories.ts`, `sync-issues.ts` — not `project-service.ts` with fourteen methods, which is where this always ends up otherwise.

### Open/Closed
Behaviour extends through new adapters, not edits to existing use cases.

Adding GitLab support means writing `GitLabSourceAdapter implements ProjectSourcePort` and registering it. `importRepositories` does not change and does not grow a `switch`. If you find yourself adding a case to a conditional over source types, the port is missing.

### Liskov Substitution
Every implementation of a port must be interchangeable — and this is verified, not assumed.

**Contract tests** are the mechanism: one shared suite, run against both the real Drizzle repository and the in-memory fake.

```ts
// modules/catalog/application/ports/project-repository.contract.ts
export function projectRepositoryContract(name: string, make: () => ProjectRepository) {
  describe(`ProjectRepository contract: ${name}`, () => {
    it('returns null for an unknown id', async () => { /* ... */ });
    it('round-trips a saved project', async () => { /* ... */ });
    it('excludes dormant projects from listActive', async () => { /* ... */ });
  });
}
```

Run it from both `drizzle-project-repository.test.ts` and `in-memory-project-repository.test.ts`. This is what makes fast tests trustworthy — without it, fakes drift from reality and green tests start lying.

### Interface Segregation
Ports are narrow and named for what the consumer needs:

```ts
export interface ProjectReader { byId(id: ProjectId): Promise<Project | null>; }
export interface ProjectWriter { save(p: Project): Promise<void>; }
export interface ProjectSearchIndex { reindex(id: ProjectId): Promise<void>; }
```

A read-only use case depends on `ProjectReader` alone. Its test then needs a fake with one method instead of twenty, which is what keeps writing tests cheap enough that you keep doing it.

### Dependency Inversion
Use cases depend on interfaces they declare. Concrete adapters are constructed in exactly one place:

```ts
// composition/container.ts
export const container = {
  catalog: makeCatalogModule({
    projects: new DrizzleProjectRepository(db),
    events: eventBus,
    clock: systemClock,
  }),
  // ...
};
```

`composition/` is the only directory allowed to import a module's `infrastructure/`. Everything else sees interfaces.

---

## 5. DRY — and where it turns harmful

Duplication is a real cost. The wrong abstraction is a bigger one, because it couples things that only *looked* alike and every future change has to satisfy both callers.

Working rules:

- **Inside a module: deduplicate freely.** Same team, same lifecycle, cheap to refactor.
- **Across modules: wait for the third occurrence.** Two similar things are a coincidence. Three is a pattern.
- **Similar shape is not shared meaning.** `gigs.expiresAt` and `tools.expiresAt` are both timestamps and will diverge — the tool board's expiry is 14 days for safety reasons, the gig board's is 30 for liquidity reasons. A shared `Expirable` base couples two unrelated policies.
- **Only genuinely universal code goes in `shared/`.** `Result`, `Clock`, `Logger`, ID generation, date formatting. If it mentions a domain concept, it isn't shared.

Before extracting an abstraction, ask whether the two call sites will change *for the same reason*. If not, leave the duplication.

---

## 6. Cross-module communication

Three mechanisms, in order of preference.

### 6.1 Direct call through the public API
For synchronous reads. `profiles` calls `catalog.listProjectsByOwner(userId)`.

```ts
import { listProjectsByOwner } from '@/modules/catalog';   // legal
import { DrizzleProjectRepository } from '@/modules/catalog/infrastructure/...'; // fails lint
```

### 6.2 Domain events
For side effects, so the emitter never learns who cares.

```ts
// modules/catalog emits
{ type: 'catalog.project_published', projectId, ownerId, at }

// discovery subscribes → reindex
// moderation subscribes → scan for policy violations
```

In-process, synchronous, transactional. No queue, no broker — at this scale a `Map<EventType, Handler[]>` is the correct amount of infrastructure. Event names are namespaced by owning module and their payload types are exported from that module's `index.ts`.

### 6.3 Read models
`discovery` maintains a denormalized search table joining catalog and identity data, rebuilt on events. This is the *only* sanctioned place data crosses module lines in the database, and it's one-way.

### 6.4 Forbidden
- Importing another module's `domain/`, `application/`, or `infrastructure/`
- Querying another module's tables directly
- Cross-schema joins outside `discovery`'s read models
- Circular dependencies of any kind

---

## 7. Data ownership

Each module owns a **Postgres schema**. The database enforces the boundary that the linter enforces in TypeScript.

```ts
export const identitySchema = pgSchema('identity');
export const catalogSchema  = pgSchema('catalog');

export const users    = identitySchema.table('users', { /* ... */ });
export const projects = catalogSchema.table('projects', { /* ... */ });
```

Rules:

- A module's Drizzle schema file lives in its own `infrastructure/schema.ts`. No global schema file.
- Foreign keys are free **within** a schema.
- Cross-schema references store the ID **without** an FK constraint — except `identity.users(id)`, which is the one permitted global reference. Universal, stable, and pretending otherwise costs more than it's worth.
- Migrations are additive by default. Renames and drops go through expand/contract: add the new column, backfill, switch reads, drop later in a separate migration.

---

## 8. Errors and validation

### Result over exceptions
Expected failures are values. Exceptions are for bugs.

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Domain errors are typed unions per module, so the compiler tells you when a new failure mode goes unhandled:

```ts
export type PublishError =
  | { kind: 'not_owner' }
  | { kind: 'unacknowledged_fork' }
  | { kind: 'missing_one_liner' };
```

`throw` is reserved for invariants that should be unreachable — a missing environment variable, a corrupt row. Those crash loudly and get fixed.

### Parse, don't validate
Zod schemas sit at every boundary: server action inputs, route handler bodies, GitHub API responses, environment variables. Past the boundary, types are trusted because they were parsed once.

Environment config is parsed at startup and fails fast. Discovering a missing variable at boot beats discovering it in a background job at 3am.

---

## 9. Testing

| Layer | Kind | Dependencies | Speed | Coverage target |
|---|---|---|---|---|
| `domain/` | Pure unit | None | <1ms | High — this is where the rules are |
| `application/` | Use case | In-memory fakes | <10ms | High |
| `infrastructure/` | Integration | Real Postgres | ~100ms | Contract tests + queries |
| `presentation/` | Thin | Fakes | fast | Happy path + auth |
| E2E | Playwright | Full stack | slow | Critical journeys only |

The shape follows from the architecture: if `domain/` is genuinely pure, most of your confidence comes from tests that finish before you lift your finger off the keyboard. If tests are slow, that's a signal logic has leaked out of `domain/` into places that need I/O.

Every port gets a contract test suite run against both its fake and its real implementation (§4, Liskov). This is non-negotiable if fakes are going to be trusted.

---

## 10. Enforcement

Rules nobody checks are rules nobody follows.

### dependency-cruiser
```js
forbidden: [
  { name: 'domain-is-pure',
    from: { path: '^src/modules/[^/]+/domain' },
    to:   { pathNot: '^(src/modules/[^/]+/domain|src/shared)' } },

  { name: 'application-no-infrastructure',
    from: { path: '^src/modules/[^/]+/application' },
    to:   { path: '^src/modules/[^/]+/infrastructure' } },

  { name: 'modules-use-public-api',
    from: { path: '^src/modules/([^/]+)' },
    to:   { path: '^src/modules/(?!$1)[^/]+/(domain|application|infrastructure|presentation)' } },

  { name: 'no-cycles', from: {}, to: { circular: true } },

  { name: 'domain-no-frameworks',
    from: { path: '^src/modules/[^/]+/domain' },
    to:   { dependencyTypes: ['npm'],
            pathNot: '^(zod|date-fns)$' } },
]
```

### ESLint
`no-restricted-imports` blocks deep paths into other modules, and blocks `drizzle-orm` and `next/*` outside their permitted layers.

### CI gate
`typecheck → lint → depcruise → test → build`. Any failure blocks merge. The boundary check runs on every commit from week one — retrofitting boundaries onto a codebase that grew without them is a rewrite, and it never happens.

---

## 11. Observability and budgets

From Phase 0, not later:

- Structured JSON logs with a correlation ID per request and per background job run.
- Error tracking (Sentry) wired in the composition root.
- Every background sync run records: started, finished, projects processed, API calls used, failures.

Performance budgets, enforced as tests once Phase 3 lands:

| Operation | p95 |
|---|---|
| Search query | < 300ms |
| Feed load | < 200ms |
| Profile page | < 250ms |
| Daily sync (2000 users) | < 30 min |

---

## 12. Decision records

Non-obvious choices go in `docs/adr/` as short numbered records — context, decision, consequences. When you return in month five wondering why cross-schema FKs are banned, the answer should be findable in under a minute.

See `docs/adr/0000-template.md`.
