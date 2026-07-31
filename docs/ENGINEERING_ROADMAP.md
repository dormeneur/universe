# Uni-verse — Engineering Roadmap

**Capacity:** one developer, ~20 hrs/week
**Horizon:** ~27 working weeks
**Companion docs:** [PRD](PRD.md) · [Architecture](ARCHITECTURE.md)

---

## The sequencing rule

**Build vertical slices, never horizontal layers.**

The tempting order is "all the schemas, then all the repositories, then all the use cases, then the UI." It feels organized and it is a trap: nothing works until everything works, you get no feedback for two months, and every abstraction is designed against imagined requirements.

Every phase below ships one feature end to end — domain through UI, tested, deployed. At the end of any week the app runs and does something real.

Second rule, from the PRD: **phases are gated on the previous phase being used, not merely finished.** Module A getting boring around week six is not a reason to start the gig board.

---

## Phase 0 — Foundation (weeks 1–2)

The only horizontal phase, because boundaries cannot be retrofitted.

### Deliverables

**Toolchain**
- Next.js + TypeScript in `strict` mode, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- ESLint (`no-restricted-imports` for layer rules) + Prettier
- `dependency-cruiser` with the §10 ruleset from ARCHITECTURE.md
- Vitest (unit + integration projects), Playwright harness
- CI: `typecheck → lint → depcruise → test → build`, blocking

**`shared/` kernel**
- `Result<T, E>` with `ok` / `err` / `map` / `andThen`
- Base error types and a `DomainError` discriminant
- `Clock` port + `systemClock` — no direct `Date.now()` anywhere else, so time-dependent rules (expiry, staleness, graduation) stay testable
- `IdGenerator` port + ULID implementation
- Structured logger with correlation IDs
- `config.ts` — Zod-parsed environment, fails fast at boot

**Database**
- Drizzle configured with per-module `pgSchema`
- Migration workflow and a `db:reset` script
- Ephemeral test database + transactional test helper

**Composition**
- `composition/container.ts` — plain factory functions, no DI framework
- In-process event bus (`Map<EventType, Handler[]>`), synchronous
- Sentry wired at the composition root

**Deploy**
- Vercel project, preview deployments per branch, production on `main`
- Health check route

### Definition of done
CI is green on an empty app. A trivial `shared/result.test.ts` passes. A deliberately illegal import (`domain/` importing Drizzle) **fails** `depcruise` — verify this by actually writing one and watching it break, then delete it.

### Trap
Do not build "just a small user table" here. Phase 0 ends with zero business logic.

---

## Phase 1 — `identity` (weeks 3–4)

First vertical slice. Small domain, real complexity in the adapters — a good shape for proving the layering works.

### Deliverables

**domain/**
- `User`, `UserId`, `VerificationStatus`, `Role`, `GradYear`
- Verification state machine: `unverified → pending_email → verified`, plus `→ pending_manual → verified`
- `canPost(user)` policy — verified students only (PRD ID-3)
- Graduation policy: `isAlumni(user, now)` derived from `gradYear`, using injected `Clock`

**application/**
- `startEmailVerification`, `confirmEmailCode`, `requestManualApproval`, `approveUser`, `promoteGraduatedUsers`
- Ports: `UserRepository`, `VerificationCodeStore`, `Mailer`, `DomainAllowlist`

**infrastructure/**
- Drizzle `identity` schema + repository
- Auth.js GitHub provider; OAuth token encrypted at rest (PRD ID-8)
- Resend mailer
- Allowlist from config, editable without deploy (PRD ID-4)

**presentation/**
- Sign-in, verification, pending-approval screens
- Admin approval queue
- Middleware gating unverified users to read-only

**Cross-cutting**
- Rate limiting: 5 codes/address/24h, 20/IP/24h (PRD ID-7)
- Daily job: graduation transitions

### Definition of done
A real GitHub account signs in, verifies a campus email, and reaches a verified state. Contract tests pass against both the Drizzle repository and the in-memory fake. The verification state machine has full unit coverage with zero I/O.

### Risk
GitHub App registration (PRD §5.3) has fiddly callback configuration. Do it in week 3, not week 8 — a blocked afternoon here is much cheaper than a blocked week later.

---

## Phase 2 — `catalog` + `sync` + minimal `moderation` (weeks 5–8)

The heart of the product, and the biggest phase. Budget accordingly.

### Week 5–6: `catalog`

**domain/**
- `Project`, `ProjectStatus`, `Tag`, `ProjectMember`
- `canPublish` (ownership, fork acknowledgement, one-liner present)
- `classifyActivity(lastCommitAt, now)` → `active | dormant` (PRD A-6)
- Membership acceptance rules (PRD A-11) — credit requires consent

**application/**
- `publishProject`, `unpublishProject`, `updateEnrichment`, `createManualProject`
- `inviteMember`, `acceptMemberCredit`
- Emits `catalog.project_published`, `catalog.project_updated`

**infrastructure/** — `catalog` schema, repository, contract tests

**presentation/** — publish flow, enrichment form, project page, member invites

### Week 7–8: `sync`

**domain/** — `SyncRun`, `RateLimitBudget`, backoff policy as a pure function (so it's testable without waiting)

**application/**
- `importCandidateRepositories` — fork and dormancy filtering (PRD A-5, A-6)
- `syncPublishedProjects` — daily batch
- `syncGoodFirstIssues` (PRD A-12)
- Port: `ProjectSourcePort` — the Open/Closed seam. GitHub is one implementation.

**infrastructure/**
- GitHub App client with installation tokens
- Rate-limit-aware batching, exponential backoff on 403/429
- Owner notification after 3 consecutive failures (PRD AR-7)

### `moderation` (minimal, week 8)
Reports exist the moment users can publish. Ship `reportEntity` + an admin queue. Nothing more.

### Definition of done
Sign in → repositories import → publish three → they appear with enrichment → the daily job updates them → good first issues are listed. Sync survives a simulated rate-limit response (test it with a stubbed 403).

### Trap
`sync` will want to reach into `catalog`'s tables for speed. It must not — it goes through `catalog`'s public API and events. This is the first place the boundary rules will genuinely hurt, and holding the line here is what keeps them credible for the rest of the project.

---

## Phase 3 — `discovery` + `profiles` (weeks 9–11)

Where the product becomes usable. At 2000+ students, search quality *is* the product.

### Deliverables

**`discovery`**
- Read model: denormalized projects + owner, rebuilt from events (ARCHITECTURE §6.3)
- `tsvector` column + GIN index over name, one-liner, description, tags, README excerpt
- Ranking as a **pure function** in `domain/`, unit-tested against fixtures:
  - last-commit recency (heaviest)
  - status boost for `seeking_contributors`
  - has-good-first-issues boost
  - profile completeness
  - manual curation override
  - **global stars deliberately excluded** (PRD A-23)
- Faceted filters: language, framework, department, year, status
- "Recently active on campus" default feed (PRD A-24)
- Campus-wide Good First Issues view

**`profiles`**
- Composition module, no tables
- Aggregates identity + catalog through public APIs
- Language breakdown derived from published projects
- Availability flag, defaulting to `not available`
- Public shareable URL with reduced logged-out view (PRD A-19)

**Performance**
- Budget tests: search p95 < 300ms, feed p95 < 200ms
- Seed 2000 synthetic projects and measure. Do this *before* launch, not after someone complains.

### Definition of done
Search over 2000 seeded projects returns relevant results inside budget. Ranking is unit-tested with no database. A profile page is worth sharing with zero other users on the platform (PRD A-18) — the cold-start mechanism.

### 🚪 LAUNCH GATE — PRD §6.6
150 verified users · 200 published projects · 30% 30-day return · 10 traceable contributor connections.

**If unmet, the work is Phase 3, not Phase 4.**

---

## Phase 3.5 — Seeding and launch (weeks 12–13)

Not engineering-heavy, and the highest-risk item in the plan (PRD R-9).

- Admin bulk-import tooling
- Manually index 50–100 known campus projects, with owner permission
- Personally onboard 20 active builders
- Launch: campus Discord/WhatsApp, notice boards, word of mouth

A search product whose first query returns nothing is dead in one session. This phase is what stops that.

---

## Phase 4 — `knowledge` + `archive` (weeks 14–18)

### `knowledge` (weeks 14–16)
- Markdown guides with revision history and attribution
- Propose-edit → author/admin approval
- `last_verified_at`; staleness warning past 12 months (PRD D-4)
- Prompt library: required `target_model` + `last_tested_at`, auto-flag stale past 6 months (PRD D-6)
- Upvotes and "worked for me", one per user
- Full-text search reusing the `discovery` tsvector approach

### `archive` (weeks 17–18)
- Author-only upload, mandatory permanent attribution (PRD A2-1, A2-2)
- Rights confirmation at upload (PRD A2-6)
- One-click author takedown (PRD A2-3)
- Campus-only visibility, `noindex` on all routes (PRD A2-5, AR-4)
- Full metadata in search results so provenance travels with excerpts (PRD A2-9)

### Definition of done
30+ guides or prompts, 20+ archive entries, both actively searched. Attribution cannot be removed by anyone but an author, and removal is immediate.

---

## Phase 5 — `gigs` (weeks 19–22)

- Listings with skills, budget range, deadline
- Interest flow surfacing the interested party's catalog projects (PRD B-2) — the portfolio *is* the credential, and it's the only real advantage over an anonymous freelancing site
- Contact exchange on mutual acceptance; nothing after that is on-platform
- Mutual reviews; **no aggregate rating below 3 reviews** (PRD B-7)
- 30-day auto-expiry (PRD B-5) via scheduled job
- Non-guarantees rendered in the posting and interest UI, not buried in terms (PRD §9.2)
- Acceptable-use enforcement; no assignment-completion category exists anywhere in the schema, UI, or search (PRD B-10..B-12)

**Explicitly absent:** payments, escrow, wallets, payment links. There is no payment table. (PRD AR-2)

### Gate
10+ listings with 5 reaching mutual acceptance in six weeks. **If not, delete the module.** The architecture makes that a clean removal — one directory, one schema, one set of routes. That's a deliberate benefit of the boundaries.

---

## Phase 6 — `tools` (weeks 23–27)

Built in lane order, because the lanes have very different risk and very different value.

### Lane 1 — Free license directory (weeks 23–24)
Maintained content: GitHub Student Pack, Copilot for students, JetBrains, and others, with eligibility and links. Zero risk, highest value, and it removes much of the demand for Lanes 2–3. Ships independently.

### Lane 2 — Group-buy coordination (weeks 25–26)
Listings for pooled legitimate team/education licenses. Coordination only — no transaction, no custody.

### Lane 3 — Peer sharing (week 27, optional)
Ships only after Lanes 1–2 are live, and only with the §10.3 disclosure implemented first — shown per listing to both parties, not as a generic terms checkbox.

**Hard constraint (PRD C-3, AR-1):** no credential field exists in any schema, log, or cache. There is nothing to leak because there is nothing stored.

Lane 3 is removable without touching Lanes 1–2.

---

## Cross-cutting workstreams

Threaded through all phases rather than scheduled as blocks:

| Concern | Practice |
|---|---|
| **Security** | Per-phase checklist: authz on every mutation, ownership checks in `domain/`, rate limits on writes, no secrets in logs |
| **Accessibility** | Keyboard navigation and semantic HTML as features are built. Retrofitting a11y is a rewrite. |
| **Observability** | Every use case logs with correlation ID; every background run records outcome counts |
| **ADRs** | One record per non-obvious decision, written the day it's made |
| **Migrations** | Expand/contract only. Never a destructive migration in one step. |
| **Dependencies** | Weekly `npm audit`; upgrade deliberately, not automatically |

---

## Schedule summary

| Weeks | Phase | Modules | Gate |
|---|---|---|---|
| 1–2 | Foundation | `shared`, tooling | Illegal import fails CI |
| 3–4 | Identity | `identity` | Real sign-in + verification |
| 5–8 | Core | `catalog`, `sync`, `moderation` | Publish → sync → display |
| 9–11 | Discovery | `discovery`, `profiles` | Search in budget @ 2000 projects |
| 12–13 | Seeding & launch | — | **PRD §6.6 launch gate** |
| 14–18 | Knowledge | `knowledge`, `archive` | 30+ entries, actively searched |
| 19–22 | Gigs | `gigs` | 5 accepted gigs / 6 weeks |
| 23–27 | Tools | `tools` | Lane 1 shipped standalone |

---

## What to do when it slips

It will. Some guidance worth writing down now, while the decision is cheap:

- **Phase 0 is not compressible.** Skipping the boundary linter to "save two days" costs weeks in month four. This is the one place to be inflexible.
- **Phase 2 is the likeliest overrun.** If it slips, cut enrichment fields — not sync reliability. A stale index is worse than a sparse one.
- **Phase 3.5 is not optional and not skippable.** Launching to an empty index is the single most likely way this project dies.
- **Phases 4–6 are genuinely optional.** They exist because the PRD promised them. If Module A is thriving and you have limited time, deepening Module A beats starting Module D.
- **If a gate fails twice, delete the module.** The architecture makes removal cheap. Use that.
