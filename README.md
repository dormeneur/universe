# Uni-verse

**Find out what your campus is actually building.**

Two thousand people here write code. You know about six of them. Someone in the next block shipped the exact thing you spent last weekend failing to build, and you will never find out.

Group chats are where campus projects go to be forgotten. Something mentioned in March is unrecoverable by May. Uni-verse is the index that isn't.

---

## The one idea

**Uni-verse does not host your code. GitHub already does that better than we ever will.**

It indexes GitHub, then adds the context GitHub can't have — which course this was for, which department, who's stuck, who's looking for contributors, who graduated and left this behind. Then it makes all of it searchable by the people sitting three rows away from you.

A campus-only git host would be a worse GitHub with fewer eyeballs. The problem was never storage. It was that nobody can find anything.

---

## What it is, and isn't

| Is                                                 | Isn't                                          |
| -------------------------------------------------- | ---------------------------------------------- |
| A search engine for campus projects                | A git host                                     |
| A portfolio that's useful before anyone else joins | A social network                               |
| A bulletin board that introduces people            | A marketplace — no fees, no escrow, no custody |
| Free, forever, for one campus                      | A startup                                      |

No commission, no wallet, no payment handling anywhere in the system. Money between students moves directly between students. That's a design decision with teeth: it removes escrow, payment-aggregator licensing, GST, and TDS from the build in one stroke.

---

## Status

**Phase 0 complete — foundation only, zero business logic.**

The toolchain, the `shared/` kernel, and the boundary enforcement are in and green. Phase 1 (`identity`) is next.

The plan came first on purpose. The original pitch was four simultaneous marketplaces on one campus, which is the most reliable way to build nothing at all — it got argued down to one wedge that has to earn the rest.

```
npm install && npm run verify     # typecheck → lint → boundaries → tests
```

| Doc                                                | What it settles                                      |
| -------------------------------------------------- | ---------------------------------------------------- |
| [PRD](docs/PRD.md)                                 | Scope, requirements, non-goals, risk register        |
| [Architecture](docs/ARCHITECTURE.md)               | Modules, layering, boundaries, SOLID/DRY in practice |
| [Engineering roadmap](docs/ENGINEERING_ROADMAP.md) | Build order, phase gates, definition of done         |
| [ADRs](docs/adr/)                                  | Why the non-obvious calls were made                  |

---

## Roadmap

Each phase is gated on the last one working. Not on it being finished — on it being _used_.

| Phase   | What ships                                                         | Gate to advance                                             |
| ------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| **1**   | Project discovery, builder profiles, campus-wide Good First Issues | 150 users · 200 projects · 30% return · 10 real connections |
| **1.5** | Manual seeding before launch                                       | A search that returns nothing is dead on arrival            |
| **2**   | Knowledge hub, final-year archive                                  | Actively searched, not just filled                          |
| **3**   | Peer gig board                                                     | 5 accepted gigs in 6 weeks, or it gets deleted              |
| **4**   | Tool board — free student licenses first                           | —                                                           |

If a gate isn't met, the work is to fix that phase. Not to start the next one.

---

## Stack

Next.js (App Router) · TypeScript strict · Postgres · Drizzle · Auth.js — GitHub OAuth, read scopes only, forever.

Modular monolith. Ten feature modules, each with one public entrance and hexagonal layering inside. Business rules import no framework, so they test in under a millisecond. Boundaries are enforced by `dependency-cruiser` in CI — architecture that lives only in a document is decoration.

No credentials for any third-party service are stored anywhere in this system. There is no table for them. That absence is a requirement, not an oversight.

Four project skills in [`.claude/skills/`](.claude/skills/) carry the working rules — module architecture, code standards, database changes, testing strategy — so they apply while code is being written rather than at review time.

---

## Read the PRD

Everything real is in **[docs/PRD.md](docs/PRD.md)** — including [Appendix A](docs/PRD.md#appendix-a--changes-from-the-original-proposal), which lists every feature that got cut and exactly why.
