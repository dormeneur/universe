# Uni-verse

Campus-scoped project discovery for student developers. Free utility, single campus, no monetization.

**Read before building anything:**

| Doc                                                        | What it settles                                   |
| ---------------------------------------------------------- | ------------------------------------------------- |
| [docs/PRD.md](docs/PRD.md)                                 | Scope, requirements, non-goals, risk register     |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)               | Module map, layering, boundaries, SOLID/DRY rules |
| [docs/ENGINEERING_ROADMAP.md](docs/ENGINEERING_ROADMAP.md) | Build order, phase gates, definition of done      |
| [docs/adr/](docs/adr/)                                     | Why non-obvious decisions were made               |

## Skills

Four project skills carry the working rules. They trigger on relevant work automatically; invoke them directly when in doubt.

- `module-architecture` — where code goes, import rules, crossing module boundaries
- `code-standards` — SOLID, DRY, `Result` errors, Zod boundaries, naming
- `database-changes` — schema ownership, expand/contract migrations, indexing
- `testing-strategy` — what to test at each layer, contract tests, fakes

## Stack

Next.js (App Router) · TypeScript strict · Postgres · Drizzle · Auth.js (GitHub) · Vitest · Playwright · Vercel

## Non-negotiables

These come from the PRD and are enforced in CI or schema. Treat a request that needs one broken as out of scope until the PRD changes.

1. **No git hosting.** The app indexes GitHub; it never stores repositories.
2. **No payment handling.** No escrow, wallet, ledger, or transaction table anywhere.
3. **No third-party credentials.** Nothing may store, log, or proxy credentials for external services. The only exception is the user's own GitHub OAuth token, encrypted, used solely for their own sync.
4. **GitHub read scopes only.** Never request write access, in any phase.
5. **No assignment-completion feature.** No category, tag, template, or filter for producing graded coursework. See PRD §9.4.
6. **Archive is author-controlled.** Opt-in upload, permanent attribution, immediate takedown, campus-only visibility, `noindex`.

## Working rules

- Boundaries are enforced by `dependency-cruiser`. If it fails, fix the design rather than the ruleset.
- Phases are gated on usage, not completion. Do not start the next module because the current one got boring.
- Time comes from the injected `Clock`, never `Date.now()` outside `infrastructure/`.
- Expected failures return `Result`. `throw` is for bugs only.
- Record non-obvious decisions in `docs/adr/` the day you make them.

## Commands

```
npm run dev          Start dev server
npm run typecheck    tsc --noEmit
npm run lint         ESLint
npm run depcruise    Architecture boundary check
npm run test         Vitest (unit + integration)
npm run test:e2e     Playwright
npm run db:migrate   Apply migrations
npm run db:reset     Drop and recreate local database
```

CI runs `typecheck → lint → depcruise → test → build`. All must pass to merge.
