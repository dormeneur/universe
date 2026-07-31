---
name: code-standards
description: Uni-verse's TypeScript conventions — SOLID applied concretely, when DRY helps and when it hurts, Result-based error handling instead of exceptions, Zod validation at boundaries, naming, and function design. Use this whenever writing, refactoring, or reviewing TypeScript in this repo; when deciding whether to extract a shared abstraction; when handling an error or failure case; when a file or function is growing large; or when a code review flags duplication, coupling, or complexity.
---

# Code standards

Conventions that keep this codebase changeable by one person over six months. Architecture and file placement live in the `module-architecture` skill; this is about the code itself.

## Errors are values

Expected failures return `Result`. Exceptions are for bugs.

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Domain errors are typed unions, so the compiler catches unhandled cases when a new failure mode appears:

```ts
export type PublishError =
  | { kind: 'not_owner' }
  | { kind: 'unacknowledged_fork' }
  | { kind: 'missing_one_liner' };
```

`throw` is reserved for the genuinely unreachable — a missing environment variable, a corrupt row, a violated invariant. Those should crash loudly and get fixed, not be caught and logged.

The practical payoff: a caller reading the signature knows every way the call can fail, and the failure paths get the same type-checking as the happy path. `try/catch` around business logic hides that.

## Parse at the boundary, trust inside

Zod schemas sit at every edge: server action inputs, route handler bodies, GitHub API responses, environment variables. Parse once, then trust the types.

```ts
const Input = z.object({ projectId: z.string().ulid(), status: ProjectStatusSchema });

export async function publishAction(raw: unknown) {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: { kind: 'invalid_input' } };
  return container.catalog.publishProject(parsed.data);
}
```

Never re-validate deeper in. If a domain function is defensively checking whether a string is empty, the parse happened in the wrong place.

Environment config is parsed at boot and fails fast. Finding a missing variable at startup beats finding it in a 3am background job.

## SOLID, as practiced here

**Single responsibility** — one use case per file, one exported factory. The test: "what would make me edit this file?" Two answers means split it. Prefer `publish-project.ts` and `import-repositories.ts` over a `project-service.ts` that accumulates fourteen methods.

**Open/closed** — extend through new adapters, not edits to existing use cases. Adding GitLab means a new `ProjectSourcePort` implementation; `importRepositories` doesn't change. If you're adding a branch to a conditional over source types, a port is missing.

**Liskov** — every port implementation must be interchangeable, verified by contract tests run against both the real adapter and the fake. Without that, fakes drift and green tests start lying.

**Interface segregation** — ports are narrow and named for the consumer's need: `ProjectReader`, `ProjectWriter`, `ProjectSearchIndex`. A read-only use case depending on a one-method port needs a one-method fake, which is what keeps writing tests cheap enough to keep doing.

**Dependency inversion** — use cases declare interfaces and receive implementations as arguments. Concrete adapters are constructed only in `composition/container.ts`.

## DRY, and where it turns harmful

Duplication costs something. The wrong abstraction costs more, because it couples things that merely looked alike, and every later change has to satisfy both callers.

- **Inside a module:** deduplicate freely. Same lifecycle, cheap to undo.
- **Across modules:** wait for the third occurrence. Two similar things are a coincidence.
- **Similar shape is not shared meaning.** `gigs.expiresAt` and `tools.expiresAt` are both timestamps that will diverge — 30 days for liquidity, 14 for safety. A shared `Expirable` couples two unrelated policies and makes each harder to change.
- **`shared/` is for the genuinely universal only:** `Result`, `Clock`, `Logger`, IDs, formatting. If it names a domain concept, it doesn't belong there.

The question before extracting: *will these call sites change for the same reason?* If not, leave the duplication.

## Functions

- Prefer pure functions. If it can be pure, make it pure — it becomes testable without setup.
- No hidden time. Take a `Clock`; never call `Date.now()` outside `infrastructure/`. Expiry, staleness, and graduation rules are all time-dependent and all need to be testable at arbitrary instants.
- No hidden randomness. Take an `IdGenerator`.
- Prefer early returns to nested conditionals.
- Arguments objects past two parameters — positional booleans at a call site are unreadable.
- Return types are explicit on exported functions. Inference is fine internally.

## Naming

- Use cases read as commands: `publishProject`, `confirmEmailCode`, `promoteGraduatedUsers`.
- Ports read as roles: `ProjectReader`, `Mailer`, `ProjectSourcePort`.
- Adapters name their technology: `DrizzleProjectRepository`, `GitHubProjectSource`, `ResendMailer`.
- Domain types avoid the word `Data`, `Info`, `Manager`, or `Helper` — each is a sign the concept hasn't been named yet.
- Branded ID types (`ProjectId`, `UserId`) rather than bare `string`, so the compiler catches argument-order mistakes.

## Types

- `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- No `any`. Use `unknown` at boundaries and parse.
- No non-null assertions (`!`). If you know it's there, prove it with a check or restructure.
- No type assertions (`as`) except immediately after a Zod parse or in a test fixture.
- Discriminated unions over optional-field soup — make illegal states unrepresentable.

## Comments

Explain *why*, never *what*. A comment restating the code is maintenance debt; a comment explaining why global stars are excluded from ranking, or why cross-schema FKs are avoided, saves a future reader real time.

Anything non-obvious enough to need a paragraph belongs in `docs/adr/` with a pointer from the code.

## Size signals

Not hard limits — signals worth investigating:

- Function past ~40 lines: probably doing two things.
- File past ~250 lines: probably more than one responsibility.
- More than 4 constructor dependencies: the use case is orchestrating too much.
- More than 3 levels of nesting: extract or invert.
- `index.ts` growing steadily: the module is leaking internals.
