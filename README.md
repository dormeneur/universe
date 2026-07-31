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

| Is | Isn't |
|---|---|
| A search engine for campus projects | A git host |
| A portfolio that's useful before anyone else joins | A social network |
| A bulletin board that introduces people | A marketplace — no fees, no escrow, no custody |
| Free, forever, for one campus | A startup |

No commission, no wallet, no payment handling anywhere in the system. Money between students moves directly between students. That's a design decision with teeth: it removes escrow, payment-aggregator licensing, GST, and TDS from the build in one stroke.

---

## Status

**No code yet. That's on purpose.**

The [PRD](docs/PRD.md) is done — scope, data model, architecture, risk register, and a phased roadmap with hard gates between phases. It exists because the original pitch was four simultaneous marketplaces on one campus, which is the most reliable way to build nothing at all.

The four-modules-at-once version got argued down to one wedge that has to earn the rest.

---

## Roadmap

Each phase is gated on the last one working. Not on it being finished — on it being *used*.

| Phase | What ships | Gate to advance |
|---|---|---|
| **1** | Project discovery, builder profiles, campus-wide Good First Issues | 150 users · 200 projects · 30% return · 10 real connections |
| **1.5** | Manual seeding before launch | A search that returns nothing is dead on arrival |
| **2** | Knowledge hub, final-year archive | Actively searched, not just filled |
| **3** | Peer gig board | 5 accepted gigs in 6 weeks, or it gets deleted |
| **4** | Tool board — free student licenses first | — |

If a gate isn't met, the work is to fix that phase. Not to start the next one.

---

## Stack

Next.js (App Router) · TypeScript · Postgres · Drizzle · Auth.js — GitHub OAuth, read scopes only, forever.

No credentials for any third-party service are stored anywhere in this system. There is no table for them. That absence is a requirement, not an oversight.

---

## Read the PRD

Everything real is in **[docs/PRD.md](docs/PRD.md)** — including [Appendix A](docs/PRD.md#appendix-a--changes-from-the-original-proposal), which lists every feature that got cut and exactly why.
