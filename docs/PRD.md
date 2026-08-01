# Uni-verse — Product Requirements Document

| Field                    | Value                                                 |
| ------------------------ | ----------------------------------------------------- |
| **Status**               | Draft for build                                       |
| **Version**              | 1.0                                                   |
| **Date**                 | 2026-07-31                                            |
| **Owner**                | Solo maintainer                                       |
| **Build capacity**       | ~20 hrs/week, one developer                           |
| **Target**               | Single campus, ~2000+ dev-inclined students           |
| **Monetization**         | None. Free utility.                                   |
| **Institutional status** | Unofficial. No faculty or administration involvement. |

---

## 1. Summary

Uni-verse is a free, campus-scoped web application that makes student engineering work **discoverable**. Its core is a searchable index of what people on campus are building, backed by GitHub, with builder profiles that are worth creating before anyone else joins.

Four modules ship in sequence. Module A is the product; the rest are extensions that only get built if A earns them.

| Module                                      | What it is                                                            | Phase |
| ------------------------------------------- | --------------------------------------------------------------------- | ----- |
| **A. Project Discovery & Builder Profiles** | Indexed, searchable catalogue of campus projects + developer profiles | 1     |
| **D1. Knowledge Hub**                       | Campus-authored setup guides, conventions, and a free prompt library  | 2     |
| **A2. Project Archive**                     | Opt-in, attributed archive of completed final-year work               | 2     |
| **B. Peer Gig Board**                       | Bulletin board for paid peer technical work. No fees, no escrow.      | 3     |
| **C. Tool Access Board**                    | Group-buy coordination, free-license directory, and peer tool sharing | 4     |

### 1.1 The central design decision

**Uni-verse does not host git.** It indexes GitHub.

Hosting code would produce a strictly worse GitHub: no Actions, no package registries, no external visibility, and none of the recruiter reach that is the entire point of publishing work. The unmet need on campus is not _storage_ — it is that nobody knows what anybody else is building. Uni-verse solves discovery and leaves hosting to the incumbent.

### 1.2 Business model

There is none, by design. No commission, no listing fees, no paid prompts, no revenue share.

This is a deliberate architectural choice, not just a pricing one. Because the platform never takes a cut and never holds funds:

- No escrow system to build.
- No payment-aggregator licensing obligation (RBI PA/PG framework or equivalent).
- No GST registration, no TDS-on-e-commerce-operator exposure.
- No custody of student money, and therefore no liability for its loss.

All money between students moves **off-platform and directly** — the platform facilitates introductions and nothing else. Retrofitting fees later would invalidate most of this document's compliance posture, so it should be treated as a one-way door.

---

## 2. Problem statement

On a campus with 2000+ students who write code:

1. **Work is invisible.** Students build genuinely interesting things and nobody outside their immediate friend group ever sees it. There is no index. Discovery happens by accident, in corridors.
2. **Collaboration doesn't form.** A student wanting contributors has no channel to reach the ~40 people on campus who'd care. A student wanting to contribute has no way to find an active project matching their stack.
3. **Institutional memory evaporates annually.** Every graduating cohort takes its projects, setup knowledge, hard-won debugging lore, and course-specific conventions out the door in June. The next cohort rediscovers all of it from zero.
4. **Tooling is expensive**, and most students don't know which free education programs they already qualify for.

### 2.1 What already occupies this space

The incumbent is **the WhatsApp group** — free, installed, and already holding the entire network. Discord and Telegram servers cover the rest. Any new surface has to be decisively better at _one_ thing to pull attention out of a group chat.

Uni-verse's one thing is **search over persistent, structured project data**. Group chats are catastrophically bad at this: a project mentioned in March is unrecoverable by May. That is the wedge, and it is the only claim of superiority this document makes.

---

## 3. Goals and non-goals

### 3.1 Goals

- **G1** — Any student can find, in under 60 seconds, what people on campus are building in a given technology, course, or department.
- **G2** — A student's Uni-verse profile is a credible, evidence-backed summary of what they have actually built, useful as a link in an application.
- **G3** — Projects seeking contributors reach students capable of contributing.
- **G4** — Knowledge that currently leaves with each graduating cohort persists in a searchable form.
- **G5** — The product is useful to user #1, before user #2 exists.

### 3.2 Non-goals

Explicit non-goals, each of which was considered and rejected:

- **NG1 — Not a git host.** No repository storage, no server-side git, no CI, no pull-request handling. See §1.1.
- **NG2 — Not a payments platform.** No escrow, no wallet, no custody of funds, no transaction fees. See §1.2.
- **NG3 — Not a dispute resolution service.** The platform introduces parties. It does not arbitrate, guarantee, insure, or mediate. This is stated in the product UI, not just in this document.
- **NG4 — Not multi-campus.** Single-campus scope is the source of the trust model. Expansion would dissolve the differentiator and is out of scope entirely.
- **NG5 — Not a credential store.** The system must never store, transmit, proxy, or display third-party account credentials. This is a hard architectural constraint (see §11.3).
- **NG6 — Not an academic submission service.** Uni-verse does not facilitate the production of graded work for submission under another student's name. See §9.4.
- **NG7 — No mobile app.** Web, mobile-responsive. The audience is on laptops.

### 3.3 Definition of failure

Stated up front so it can be recognized honestly:

- Fewer than 100 verified users by end of Phase 1 + 8 weeks.
- Fewer than 20% of verified users returning in any 30-day window.
- Zero contributor connections made through the platform in a semester.
- Boards (Modules B/C) sitting empty or stale — which, if it happens, is a signal to remove them, not to promote them harder.

---

## 4. Users

| Persona             | Situation                                     | Primary need                                                | Modules |
| ------------------- | --------------------------------------------- | ----------------------------------------------------------- | ------- |
| **The Builder**     | Years 2–4, ships side projects, active GitHub | Visibility, contributors, a portfolio link                  | A, A2   |
| **The Beginner**    | Year 1–2, learning, no projects yet           | See what's possible, find a first issue, find setup guides  | A, D1   |
| **The Contributor** | Competent, wants practice on real code        | Find active campus projects with open issues in their stack | A       |
| **The Finalist**    | Final year, doing a capstone                  | Reference prior work, publish their own, get discovered     | A2      |
| **The Alumnus**     | Graduated within ~2 years                     | Keep their profile, stay reachable, contribute back         | A, D1   |

**Anti-persona:** external recruiters and non-students. Out of scope for all phases. The product is campus-internal.

---

## 5. Identity and verification

No institutional cooperation is available, so verification must be entirely self-serve.

### 5.1 Two-factor campus identity

**Primary: GitHub OAuth.** Chosen because it does three jobs at once — it authenticates, it demonstrates the user is a developer, and it yields the public repository graph that _is_ Module A. No separate password system exists.

**Secondary: campus email verification.** A one-time code sent to an address on an allowlisted institutional domain (`*.ac.in`, `*.edu.in`, `*.edu`, or the specific domains this campus uses). This establishes campus membership.

**Fallback: manual approval.** A queue for students whose institution issues no usable email address. Reviewed by the maintainer.

### 5.2 Requirements

- **ID-1** — Sign-in is GitHub OAuth only. No email/password, no password storage.
- **ID-2** — An account is `unverified` until campus email is confirmed or manual approval is granted.
- **ID-3** — `unverified` accounts have read-only access. They may not create projects, post to any board, or contact other users.
- **ID-4** — The institutional domain allowlist is configuration, editable without a deploy.
- **ID-5** — Users declare an expected graduation year at signup.
- **ID-6** — Accounts transition automatically to `alumni` after their declared graduation year passes. Alumni keep full read access, keep their profile, and may contribute to the Knowledge Hub and Archive, but may not post to the gig or tool boards.
- **ID-7** — Verification emails are rate-limited to 5 per address per 24h and 20 per IP per 24h.
- **ID-8** — GitHub OAuth tokens are encrypted at rest and are never exposed to the client.

### 5.3 GitHub App vs OAuth App

Use a **GitHub App**, not an OAuth App. At 2000+ users the difference is decisive: GitHub Apps get per-installation rate limits that scale with installation count rather than a single shared 5000 req/hr ceiling, and they receive webhooks. An OAuth App will hit rate limits during sync and the product will visibly stall.

Requested scopes: public repository metadata only. **No write scopes, ever, on any phase.**

---

## 6. Module A — Project Discovery & Builder Profiles (Phase 1)

The wedge. Everything else is contingent on this working.

### 6.1 Project ingestion

- **A-1** — On first sign-in, the system imports the user's public GitHub repositories as _candidate_ projects.
- **A-2** — Candidates are **not** published automatically. The user explicitly selects which to publish. This prevents the index filling with tutorial follow-alongs and abandoned scaffolds.
- **A-3** — Users may create projects manually, without a repository, for work that isn't code on GitHub (hardware, design, research, coursework).
- **A-4** — Published projects re-sync from GitHub daily via background job, plus immediately on user login.
- **A-5** — Forks are detected via the GitHub API `fork` flag and are excluded from import by default. A user may publish a fork explicitly, and it is labelled as a fork in the UI. _Rationale: without this, the index fills with forks of popular repos that represent no student work._
- **A-6** — Repositories with no commits from the user in the trailing 12 months are imported as `dormant` and excluded from the default feed.

### 6.2 The enrichment layer

This is what distinguishes Uni-verse from a list of repository links. Each published project carries campus-specific metadata that GitHub does not have:

- **A-7** — Project status, one of: `active`, `seeking contributors`, `looking for teammates`, `complete`, `dormant`.
- **A-8** — Free-text tags plus structured facets: primary language (auto-derived), frameworks, department, academic year, associated course code (optional).
- **A-9** — A one-line "what this actually does" description, required, max 140 characters, written by the student. Distinct from the GitHub description, which is usually empty or useless.
- **A-10** — Optional "help wanted" note describing what kind of contribution is needed.
- **A-11** — Team members can be credited by linking other Uni-verse profiles. Credited members must accept the credit before it appears. _Rationale: prevents both credit theft and unwanted association._

### 6.3 Good First Issues

- **A-12** — For published projects, the daily sync pulls open issues labelled `good first issue`, `good-first-issue`, `help wanted`, or `beginner`.
- **A-13** — A campus-wide "Good First Issues" view aggregates these across all published projects, filterable by language.
- **A-14** — Issue entries link directly to GitHub. Uni-verse does not host discussion, comments, or issue state.

This is the highest-leverage feature for The Beginner persona and the strongest single answer to "why not just browse GitHub" — GitHub cannot filter to _your campus_.

### 6.4 Builder profiles

- **A-15** — Every verified user has a public-within-campus profile: display name, GitHub handle, year, department, avatar.
- **A-16** — Profile aggregates published projects, a language/technology breakdown derived from those projects, and a contribution-activity summary.
- **A-17** — An optional availability flag: `open to collaborating`, `open to paid work`, `not available`. Defaults to `not available`.
- **A-18** — A profile is useful and complete-looking with zero other users on the platform. **This is the cold-start mechanism and is a hard requirement, not a nicety.**
- **A-19** — Profiles have a stable shareable URL that renders correctly for logged-out viewers in a reduced form (name, headline, project titles — no contact details, no board activity).

### 6.5 Search and ranking

At 2000+ users, search quality is the product.

- **A-20** — Full-text search across project name, description, tags, and README excerpt, implemented with **Postgres `tsvector` + GIN index**. Explicitly _not_ Elasticsearch — at this data volume a dedicated search cluster is operational overhead with no user-visible benefit.
- **A-21** — Faceted filtering: language, framework, department, year, status, has-good-first-issues.
- **A-22** — Default feed ranking blends: recency of last commit (heaviest weight), project status (`seeking contributors` boosted), profile completeness, presence of good-first-issues, and manual curation.
- **A-23** — **Global GitHub star count is explicitly excluded as a primary ranking signal.** A campus project with 3 stars is more relevant here than a fork of a 50k-star framework. Stars may appear as displayed metadata but must not dominate ordering.
- **A-24** — A "recently active on campus" feed is the default landing view, not a personalized algorithmic feed. Personalization is out of scope for Phase 1.

### 6.6 Phase 1 exit criteria

Phase 2 does not start until all of these hold:

- 150+ verified users.
- 200+ published projects.
- 30%+ of verified users returning within a 30-day window.
- At least 10 documented contributor connections traceable to the platform.

If these are not met, the correct response is to fix Module A, not to build Module B.

---

## 7. Module D1 — Knowledge Hub (Phase 2)

### 7.1 Skills guides

- **D-1** — Campus-authored markdown guides: environment setup, course-specific toolchains, deployment walkthroughs, coding conventions.
- **D-2** — Guides are versioned with full edit history and attributed authorship.
- **D-3** — Any verified user may propose an edit; the original author or an admin approves it.
- **D-4** — Guides carry a `last verified` date. Guides unverified for 12 months display a staleness warning.

### 7.2 Prompt library

Free and community-owned. There is no prompt marketplace, no sales, no revenue share.

_Rationale for cutting sales:_ prompts are plaintext with no copy protection, they depreciate rapidly as models improve, and there is an infinite supply of excellent free alternatives (vendor documentation, open-source prompt collections, published agent skills). A paid prompt market on a free campus utility would be dead on arrival, and its failure would drag down the modules that work.

- **D-5** — Prompts are stored with required metadata: target model, date last tested, intended task, and author.
- **D-6** — Prompts not re-tested within 6 months are automatically flagged `possibly stale` in the UI. _This directly addresses the depreciation problem that kills prompt collections._
- **D-7** — Upvoting and "worked for me" confirmations, restricted to verified users, one per user per prompt.
- **D-8** — Full-text search across the prompt library.

---

## 8. Module A2 — Project Archive (Phase 2)

An opt-in, attributed archive of completed final-year and capstone work.

### 8.1 Requirements

- **A2-1** — Archive entries are uploaded **only by an author of the work**. No third-party uploads, no bulk import, no scraping.
- **A2-2** — Author attribution is mandatory and permanently displayed. Entries cannot be anonymized.
- **A2-3** — Any author may request removal of their own work at any time; removal is honoured without question and without delay.
- **A2-4** — Entries capture: title, abstract, year, department, technologies, team members, outcome/results, and optional links to repository, report, or demo.
- **A2-5** — Archive entries are visible only to verified campus users. Not publicly indexed, not accessible logged-out, `noindex` on all archive routes.
- **A2-6** — Uploaders confirm at upload time that they hold the right to publish the work — that it is not covered by a sponsorship agreement, NDA, or institutional IP restriction.

### 8.2 The academic integrity design

An accessible archive of completed final-year projects is, without care, a plagiarism index. The mitigation is not a warning banner — those don't work. It is **structural**:

- **A2-7** — Every entry is **permanently and prominently attributed** to its authors, and every entry is **fully searchable by every verified student on campus, including faculty who hold student accounts.**

The reasoning: copying is deterred by detectability, not by disclaimers. A hidden archive enables quiet reuse. A public, attributed, searchable archive makes reuse trivially detectable by anyone — including the original author, who will notice. Visibility is the guardrail.

- **A2-8** — A short, honest notice on archive pages: this material is for reference and inspiration; submitting it as your own work is academic misconduct and, because every entry here is attributed and searchable, it is also easy to catch.
- **A2-9** — Entries display full author and year metadata in search results, so provenance travels with any excerpt.

### 8.3 Risk acknowledgement

This module carries genuine institutional risk. Without faculty backing, an archive of student academic work may be viewed by the institution as facilitating misconduct, regardless of the design above. The author-opt-in, author-attributed, author-removable structure is the strongest available defence, and the takedown policy in A2-3 is what makes the position tenable. This is recorded in the risk register (§12, R-4) rather than hidden.

---

## 9. Module B — Peer Gig Board (Phase 3)

A bulletin board for legitimate paid technical work between students. **Not a marketplace.** The platform introduces parties and then gets out of the way.

### 9.1 Requirements

- **B-1** — Posters create requests with: title, description, required skills, budget range, deadline, and expected scope.
- **B-2** — Interested students express interest; posters see interested profiles with their Module A project history attached. _The portfolio is the credential — this is the main advantage over an anonymous freelancing site._
- **B-3** — On mutual acceptance, the two parties exchange contact details. Everything after that point is off-platform.
- **B-4** — **No payment functionality of any kind.** No escrow, no wallet, no payment links, no fee. Parties settle directly (UPI or otherwise) with no platform involvement.
- **B-5** — Listings auto-expire after 30 days unless renewed. _A visibly stale board is worse than no board; expiry is what prevents the "three listings from six weeks ago" death._
- **B-6** — Mutual reviews after a completed engagement, visible on profiles.
- **B-7** — Review counts are displayed alongside every rating, and no aggregate rating is shown below 3 reviews. _At low volume, ratings are trivially gameable and a 5.0-from-one-review is actively misleading._
- **B-8** — Posting is limited to `verified` + `student` accounts. Alumni may not post or accept.
- **B-9** — Rate limit: 3 active listings per user.

### 9.2 Explicit non-guarantees

Displayed in the product UI at posting time and at interest time, not buried in terms:

- Uni-verse does not vet, endorse, or guarantee any party.
- Uni-verse holds no funds and cannot recover, refund, or reverse any payment.
- Uni-verse does not mediate disputes.
- Both parties are on the same campus and will continue to be. Disagreements here are interpersonal, not procedural, and the platform cannot help.

### 9.3 Realistic expectations

The demand side of this board is structurally weak — students are the least-capitalized segment there is. At 2000+ dev-inclined students, a 2% activation rate yields roughly 40 participants, which is thin but not zero. This module is expected to be **quiet**, and that is acceptable because it costs nothing to run. If it is empty after a full semester, it should be removed rather than promoted.

### 9.4 Prohibited use

**Uni-verse does not support hiring another student to produce graded work submitted as the hirer's own.** This is contract cheating: it is an academic integrity violation at essentially every institution, it is commercially illegal to operate in several jurisdictions, and it would make the entire platform indefensible to anyone at the institution.

- **B-10** — The acceptable-use policy prohibits it explicitly.
- **B-11** — Listings that solicit it are removable on report.
- **B-12** — No listing category, tag, template, or search filter for assignment or coursework completion exists in the product.

Every other use in the original proposal is fully supported: building projects, implementing features, debugging, deployment help, design work, code review, and tutoring — including tutoring on coursework, which is legitimate and distinct from producing submitted work.

---

## 10. Module C — Tool Access Board (Phase 4)

The last thing built, and the part most likely to be cut.

### 10.1 Three lanes, deliberately ordered

**Lane 1 — Free license directory (build first).** A maintained directory of education programs students already qualify for: GitHub Student Developer Pack, GitHub Copilot free for verified students, JetBrains student licenses, and equivalents, with eligibility requirements and application links.

Highest value in this module, fully legal, zero risk, and it makes a substantial fraction of the demand for the other two lanes disappear. Most students paying for these tools do not need to be.

**Lane 2 — Group-buy coordination (build second).** A board for coordinating pooled purchases of legitimate team, group, or education-tier licenses, where the vendor's terms permit multi-seat allocation. Coordination only — the platform does not transact, collect, or hold money.

**Lane 3 — Peer tool sharing (build last, if at all).** Listings for sharing access to personal paid subscriptions.

### 10.2 Requirements

- **C-1** — Lane 1 is a maintained content directory, not user-generated. Entries carry a `last checked` date.
- **C-2** — Group-buy listings capture: tool, license tier, seats needed, cost per seat, organizer, and deadline.
- **C-3** — **The platform never stores, transmits, proxies, displays, or otherwise touches credentials for any third-party service.** Hard architectural constraint (NG5). There is no credential field in the schema, on any lane, in any phase.
- **C-4** — Lane 3 listings require the poster to acknowledge, at posting time, a specific disclosure (§10.3) — not a generic terms checkbox.
- **C-5** — Requesters see the same disclosure before expressing interest.
- **C-6** — Listings auto-expire after 14 days.
- **C-7** — No fee, no revenue share, no platform involvement in any transaction.

### 10.3 Required disclosure for Lane 3

Shown verbatim to both parties, per listing. This exists because the risks are real and the users are entitled to know them before deciding:

> Sharing access to a paid subscription violates the terms of service of every major developer tool — GitHub Copilot, Anthropic's Claude, OpenAI, JetBrains, Cursor, and others all prohibit account sharing and sublicensing. Vendors actively detect this through device fingerprinting and concurrent-session limits, and **accounts found sharing access are suspended or terminated.** The person sharing bears that loss.
>
> Sharing an account also means sharing everything behind it — a GitHub account exposes private repositories and organization memberships; an AI account exposes conversation history and billing details. There is no way to share access without sharing that.
>
> Uni-verse does not facilitate, verify, or take any part in these arrangements, holds no money, and cannot help if something goes wrong. Both parties act entirely at their own risk.

### 10.4 Position

The maintainer has reviewed the risks in §12 (R-1, R-2) and elected to build this module as specified. This section documents that decision and its exposure explicitly so it remains a visible, informed choice rather than an unexamined one.

Two structural facts materially reduce — but do not eliminate — the platform's own exposure relative to the original proposal:

1. **No fee is taken.** The platform does not profit from any arrangement. This is the difference between operating a commercial exchange built on induced breach of contract, and hosting a classifieds board. It is a meaningful legal distinction.
2. **No credentials pass through the system.** The platform has no technical role in any access transfer.

Neither fact protects the _participants_, whose ToS exposure and account-suspension risk are unchanged. That is what §10.3 exists to communicate.

---

## 11. Architecture

### 11.1 Stack

| Layer           | Choice                           | Reasoning                                                        |
| --------------- | -------------------------------- | ---------------------------------------------------------------- |
| Framework       | Next.js (App Router), TypeScript | Single deployable, server components suit a read-heavy catalogue |
| Database        | Postgres (Supabase or Neon)      | Full-text search built in; free tier sufficient at this scale    |
| ORM             | Drizzle                          | Typed, lightweight, transparent SQL                              |
| Auth            | Auth.js with GitHub provider     | GitHub OAuth is a first-class provider                           |
| Background jobs | Vercel Cron or Inngest           | Daily sync, expiry sweeps, staleness flagging                    |
| Hosting         | Vercel free tier                 | Adequate at this scale                                           |
| Email           | Resend or Postmark               | Verification codes only                                          |
| Files           | Supabase Storage                 | Archive attachments only; not needed before Phase 2              |

### 11.2 Data model (core entities)

```
users            id, github_id, github_login, display_name, avatar_url,
                 campus_email, verification_status, role, department,
                 grad_year, availability, created_at
projects         id, owner_id, source (github|manual), github_repo_id,
                 name, one_liner, description, status, is_fork,
                 primary_language, stars, last_commit_at,
                 published_at, search_vector
project_tags     project_id, tag
project_members  project_id, user_id, role, accepted_at
issues           id, project_id, github_issue_id, title, labels, url, synced_at
guides           id, author_id, slug, title, body_md, last_verified_at
guide_revisions  id, guide_id, editor_id, body_md, created_at, approved_at
prompts          id, author_id, title, body, target_model,
                 last_tested_at, upvotes
archive_entries  id, author_id, title, abstract, year, department,
                 technologies, links, created_at
gigs             id, poster_id, title, body, skills, budget_min,
                 budget_max, deadline, status, expires_at
gig_interests    gig_id, user_id, status, created_at
reviews          id, gig_id, reviewer_id, subject_id, rating, body
tool_listings    id, poster_id, lane, tool_name, details,
                 disclosure_ack_at, expires_at
reports          id, reporter_id, entity_type, entity_id, reason,
                 status, created_at
```

Note the absence of any credentials, tokens-for-third-party-services, or payment table. That absence is a requirement (NG2, NG5), not an oversight.

### 11.3 Hard constraints

- **AR-1** — No table, column, log line, or cache may store credentials for any third-party service other than the encrypted GitHub OAuth token used for the user's own sync.
- **AR-2** — No money movement, payment link generation, or fund custody anywhere in the system.
- **AR-3** — GitHub write scopes are never requested, on any phase.
- **AR-4** — All archive routes return `noindex`, and archive content requires an authenticated verified session.

### 11.4 GitHub sync

- **AR-5** — Daily background sync per published project, batched and rate-limit aware, with exponential backoff on 403/429.
- **AR-6** — Sync updates: last commit timestamp, stars, primary language, description, open labelled issues.
- **AR-7** — Sync failures are logged and surfaced to the project owner after 3 consecutive failures — usually meaning the repository was made private or deleted.
- **AR-8** — Projects whose repository becomes inaccessible are marked `unavailable` and hidden from the feed rather than deleted.

---

## 12. Risk register

| ID      | Risk                                                                                               | Severity                 | Mitigation                                                                                                              | Residual                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **R-1** | Module C Lane 3 facilitates ToS breaches; vendors could issue takedown demands                     | High                     | No fee taken, no credentials handled, mandatory disclosure, platform is a bulletin board only                           | **Accepted by maintainer.** Real but reduced. Lane 3 is removable without affecting Lanes 1–2 or any other module. |
| **R-2** | Students using Lane 3 get accounts suspended and lose money                                        | High                     | §10.3 disclosure shown to both parties per listing                                                                      | **Accepted.** Cannot be eliminated; it is inherent to the mechanic.                                                |
| **R-3** | Gig board disputes escalate into interpersonal conflict on a shared campus, blamed on the platform | Medium                   | Explicit non-guarantees in UI, no fee, no custody, portfolio-based reputation                                           | Accepted. Small campus makes this likelier, not less likely.                                                       |
| **R-4** | Institution views the archive as facilitating misconduct                                           | Medium                   | Author-opt-in, mandatory attribution, campus-only visibility, immediate takedown, detectability-based deterrence (§8.2) | Accepted. Faculty backing would resolve this; it isn't available.                                                  |
| **R-5** | Boards sit empty and make the whole product look dead                                              | Medium                   | Auto-expiry (B-5, C-6); boards are phase-gated behind Module A succeeding; removal is an accepted outcome               | Managed                                                                                                            |
| **R-6** | GitHub rate limits stall sync at 2000+ users                                                       | Medium                   | GitHub App rather than OAuth App (§5.3), batching, backoff, daily rather than continuous cadence                        | Managed                                                                                                            |
| **R-7** | Solo moderation doesn't scale; abusive or spam content persists                                    | Medium                   | Verified-only posting, per-user posting caps, report queue on every entity, auto-expiry limiting blast radius           | Managed                                                                                                            |
| **R-8** | 100% annual user churn through graduation                                                          | Low (given free utility) | Alumni role preserves profiles; each cohort onboards independently                                                      | Accepted — structural, and largely harmless for a non-growth product                                               |
| **R-9** | Nobody publishes projects; index stays empty                                                       | High                     | Single-player profile value (A-18); seeded manually by the maintainer at launch (§13.1)                                 | The main product risk. Everything else is secondary.                                                               |

---

## 13. Roadmap

Solo, ~20 hrs/week. Estimates are working weeks.

### Phase 0 — Foundation (weeks 1–2)

Repo setup, schema, GitHub App registration, Auth.js integration, campus email verification, deploy pipeline, admin role.
**Exit:** a user can sign in with GitHub, verify a campus email, and see an empty profile.

### Phase 1 — Discovery & Profiles (weeks 3–9)

GitHub import with fork/dormancy filtering, publish flow, enrichment fields, builder profiles, Postgres full-text search, faceted filters, activity feed, Good First Issues view, daily sync job, report queue.
**Exit:** §6.6 criteria met. **Do not begin Phase 2 before this.**

### Phase 1.5 — Seeding & launch (weeks 10–11)

Manually index 50–100 known campus projects before public launch, with owner permission. Onboard 20 active builders directly. _A search product that returns nothing on its first query is dead on arrival — this step is not optional._

### Phase 2 — Knowledge Hub & Archive (weeks 12–17)

Markdown guides with revisions and staleness flags, prompt library with model/date metadata and stale-flagging, archive with opt-in upload, attribution, and takedown.
**Exit:** 30+ guides or prompts, 20+ archive entries, both actively searched.

### Phase 3 — Gig Board (weeks 18–22)

Listings, interest flow, contact exchange, reviews with count thresholds, expiry, acceptable-use enforcement.
**Exit:** 10+ listings with at least 5 reaching mutual acceptance in the first 6 weeks. If not, remove the module.

### Phase 4 — Tool Board (weeks 23–27)

Lane 1 directory first and shipped independently. Lane 2 group-buy. Lane 3 only after Lanes 1–2 are live, with the §10.3 disclosure implemented before any listing can be created.

### 13.1 Sequencing principle

Each phase is gated on the previous phase's exit criteria. The failure mode this guards against is specific and common: Module A becomes tedious around week 6, Module C sounds more exciting, and the product ends up with four half-built modules and no users. **If a gate isn't met, the work is to fix that phase, not to start the next one.**

---

## 14. Metrics

**Phase 1 (primary):**

- Verified users; published projects; median projects per active user
- Profile completion rate
- Weekly search sessions; searches returning zero results (target: under 15%)
- Click-throughs to GitHub from project pages
- Good First Issue click-throughs
- 30-day return rate
- Contributor connections attributable to the platform (manually tracked at first — this is the metric that actually matters)

**Later phases:** guide/prompt views and edits; archive entries and searches; gig listings, acceptance rate, and completion reviews; tool directory click-throughs and group-buys formed.

**Deliberately not tracked:** page views, time on site, total signups. These will look fine while the product fails.

---

## 15. Open questions

1. Which specific email domains does this campus issue? Determines the §5.1 allowlist.
2. Are there existing campus Discord/WhatsApp communities to seed from in Phase 1.5, and who administers them?
3. Should departments outside CS be in scope at launch, or is CS-only the cleaner start?
4. Is there a friendly faculty member who would engage informally with the archive — not sponsorship, just awareness? Would substantially reduce R-4.
5. What happens to the platform when the maintainer graduates? Succession is unaddressed and, for a campus utility, eventually fatal.

---

## Appendix A — Changes from the original proposal

| Original                                | Now                                                            | Why                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campus GitHub (hosting)                 | GitHub index + discovery layer                                 | A walled-garden git host is strictly worse than GitHub and removes the external visibility that motivates publishing                                      |
| Platform commission on gigs             | No fees                                                        | Free utility; also removes escrow, payment-aggregator licensing, GST, and TDS obligations                                                                 |
| Escrow for peer payments                | No payment handling at all                                     | Follows from the above; parties settle directly                                                                                                           |
| "Or complete assignments"               | Explicitly prohibited (§9.4)                                   | Contract cheating: an integrity violation everywhere, illegal to operate commercially in several jurisdictions, and fatal to the platform's defensibility |
| Paid prompt marketplace                 | Free prompt library with staleness tracking                    | Prompts are uncopyable plaintext that depreciates with each model release, against infinite free supply                                                   |
| Subscription rental as headline feature | Three-lane tool board; free licenses first, sharing last       | Most demand is satisfied by education programs students already qualify for; sharing lane retained per maintainer decision with full disclosure           |
| All four modules at launch              | Strict phase gating on Module A                                | Four simultaneous cold starts is the most reliable way to build nothing                                                                                   |
| `@college.edu` verification             | GitHub OAuth + configurable domain allowlist + manual fallback | No institutional cooperation available; `.edu` is US-only and many institutions issue no usable student email                                             |
