---
name: testing-strategy
description: How Uni-verse tests each architectural layer — pure unit tests for domain logic, in-memory fakes for use cases, contract tests shared between fakes and real repositories, real Postgres for infrastructure, and thin Playwright end-to-end coverage. Use this whenever writing or reviewing tests, adding a port or repository, deciding what kind of test a change needs, setting up a fake or fixture, or when tests are slow, flaky, or hard to write.
---

# Testing strategy

The architecture exists partly to make testing cheap. If tests are painful to write, that's usually a design signal rather than a testing problem.

## What gets tested where

| Layer | Kind | Dependencies | Speed | Aim for |
|---|---|---|---|---|
| `domain/` | Pure unit | None | <1ms | High coverage — the rules live here |
| `application/` | Use case | In-memory fakes | <10ms | High coverage |
| `infrastructure/` | Integration | Real Postgres | ~100ms | Contract + query correctness |
| `presentation/` | Thin | Fakes | fast | Happy path, auth, input validation |
| E2E | Playwright | Full stack | slow | Critical journeys only |

Most of your confidence should come from the top two rows, which run in milliseconds. If it doesn't, logic has probably leaked out of `domain/` into places that need I/O — fix the design rather than adding more slow tests.

## Domain tests

Pure functions, no setup, no mocks. These are the cheapest and most valuable tests in the repo.

```ts
describe('canPublish', () => {
  it('rejects a fork the owner has not acknowledged', () => {
    const result = canPublish(makeProject({ isFork: true, forkAcknowledged: false }), ownerId);
    expect(result).toEqual({ ok: false, error: { kind: 'unacknowledged_fork' } });
  });
});
```

Time-dependent rules take a `Clock`, so you can test the boundary exactly rather than approximately:

```ts
it('flags a prompt stale exactly six months after its last test', () => {
  const clock = fixedClock('2026-07-01T00:00:00Z');
  expect(isStale(makePrompt({ lastTestedAt: '2026-01-01T00:00:00Z' }), clock.now())).toBe(true);
});
```

Testing ranking, expiry, staleness, and verification transitions this way means the interesting behaviour is covered without a database anywhere near it.

## Use case tests

Pass fakes for every port. Assert on the returned `Result` and on observable effects — persisted state and published events.

```ts
it('emits project_published when publication succeeds', async () => {
  const projects = new InMemoryProjectRepository([makeProject({ id: 'p1', ownerId: 'u1' })]);
  const events = new RecordingEventPublisher();
  const publish = makePublishProject({ projects, events, clock: fixedClock('2026-07-01') });

  const result = await publish({ projectId: 'p1', actor: 'u1' });

  expect(result.ok).toBe(true);
  expect(events.published).toContainEqual(
    expect.objectContaining({ type: 'catalog.project_published', projectId: 'p1' }),
  );
});
```

Prefer hand-written fakes over mocking libraries. A fake repository backed by a `Map` is a few lines, reads clearly, and doesn't couple the test to call order the way `expect(mock).toHaveBeenCalledWith(...)` does. Mock-heavy tests tend to assert *how* code works, which makes refactoring expensive — exactly the thing this architecture is trying to make cheap.

## Contract tests — the important one

A fake is only useful if it behaves like the real thing. Guarantee that with one shared suite run against both.

```ts
// application/ports/project-repository.contract.ts
export function projectRepositoryContract(name: string, make: () => Promise<ProjectRepository>) {
  describe(`ProjectRepository contract: ${name}`, () => {
    it('returns null for an unknown id', async () => { /* … */ });
    it('round-trips a saved project', async () => { /* … */ });
    it('excludes dormant projects from listActive', async () => { /* … */ });
    it('orders listActive by last commit, newest first', async () => { /* … */ });
  });
}
```

```ts
// infrastructure/drizzle-project-repository.test.ts
projectRepositoryContract('drizzle', async () => new DrizzleProjectRepository(testDb));

// application/ports/in-memory-project-repository.test.ts
projectRepositoryContract('in-memory', async () => new InMemoryProjectRepository());
```

This is Liskov substitution made verifiable. Without it, fakes drift from the real adapter, fast tests go green while production breaks, and you stop trusting the suite. **Every port gets one**, added when the port is added rather than later.

## Infrastructure tests

Real Postgres, no database mocking — the point is verifying SQL. Each test runs in a transaction rolled back afterward, so tests stay isolated and order-independent.

Beyond the contract suite, cover what's specific to the adapter: index usage on hot queries, `tsvector` search relevance, migration behaviour, rate-limit and backoff handling in HTTP clients (with stubbed responses, not real network calls).

## Presentation tests

Thin, because the layer is thin. Verify that input is parsed and rejected correctly, that unauthenticated and unverified users are refused, and that a `Result` error maps to the right response. Business behaviour is already covered underneath.

## End-to-end tests

Playwright, deliberately few. They're slow and flaky in proportion to their number, and their value is confirming the wiring, not the logic.

Worth covering: sign in → verify → publish a project → find it in search. Post a gig → express interest → accept. That's roughly the ceiling.

## Fixtures

Builder functions with sensible defaults and overrides, so a test states only what it cares about:

```ts
export function makeProject(overrides: Partial<Project> = {}): Project {
  return { id: 'p1', ownerId: 'u1', name: 'test', oneLiner: 'does a thing',
           status: 'active', isFork: false, forkAcknowledged: false, ...overrides };
}
```

A test that sets fifteen fields to assert one behaviour hides its own point.

## Naming

Describe the behaviour and the condition, not the method:

- `it('rejects a fork the owner has not acknowledged')`
- not `it('canPublish returns false')`

A failing test name should tell you what broke without opening the file.

## Performance budgets

From Phase 3, these are tests rather than aspirations — run against 2000 seeded projects:

| Operation | p95 |
|---|---|
| Search | < 300ms |
| Feed | < 200ms |
| Profile | < 250ms |

## When tests are hard to write

Usually a design problem, and worth treating as one:

- **Needs a lot of setup** → the use case is orchestrating too much, or logic belongs in `domain/`.
- **Needs a database for a rule** → the rule is in the wrong layer.
- **Fake needs twenty methods** → the port isn't segregated; split it by consumer.
- **Flaky on timing** → something is calling `Date.now()` instead of taking a `Clock`.
- **Breaks on every refactor** → it's asserting implementation rather than behaviour; prefer fakes and outcome assertions over call-order mocks.
