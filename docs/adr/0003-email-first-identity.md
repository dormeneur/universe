# ADR 0003 — College email is the identity; GitHub is a linked account

**Status:** Accepted
**Date:** 2026-08-01
**Supersedes:** PRD §5.1 as originally written

## Context

The original design made GitHub OAuth the primary sign-in and campus email a secondary verification step. Two problems surfaced before any code was written.

**Most students' GitHub accounts are not tied to their college email.** They were created in school with a personal Gmail. So GitHub OAuth proves the person is a developer; it proves nothing about campus membership. The original flow signed someone in, then asked for a college address afterwards — leaving a half-registered state for anyone who abandoned the second step, and requiring the two identities to be reconciled after the fact.

**It excluded the persona the product most wants.** A first-year with no GitHub account could not sign up at all, and therefore could not browse the campus-wide Good First Issues view that exists specifically to help them start contributing.

The underlying error was conflating two claims — "I am a developer" and "I am on this campus" — into one credential that only ever supported the first.

## Decision

College email is the account. Sign-up and sign-in are a one-time code sent to an institutional address. GitHub is an optional, independently linked account that can be connected, disconnected, and reconnected at any time without affecting sign-in.

A user with no GitHub link is a full member: they can browse, search, view profiles, and use the boards. Linking GitHub unlocks project import and the builder profile.

Sign-in uses a **six-digit code**, not a magic link:

- Students routinely open email on a phone while signed up on a laptop. A code crosses devices; a link strands them.
- Institutional mail systems commonly run link scanners that pre-fetch URLs in incoming messages. A single-use magic link can be consumed by the scanner before the student ever clicks it, producing an "invalid link" error nobody can debug. A code is inert to scanners.
- The action is self-evident, which matters when the audience includes people who have never used passwordless auth.

## Alternatives considered

**GitHub OAuth primary, email secondary** — the original design. Rejected for the reasons above.

**Either as a sign-in method, linked afterwards** — rejected. Allowing GitHub to create a session makes a GitHub compromise sufficient to take over a Uni-verse account, and it reintroduces the identity-reconciliation problem. Keeping GitHub strictly link-only means a compromised GitHub account can be unlinked but never used to sign in.

**Password accounts** — rejected. Passwords mean hashing, reset flows, breach exposure, and reuse risk, in exchange for nothing an emailed code does not already provide.

**Magic links** — rejected for the scanner and cross-device problems above.

## Consequences

**Easier:** campus membership is established by the credential itself rather than inferred afterwards; non-developers and first-years become first-class users; GitHub can be unlinked without any risk of account lockout; there is no password surface at all.

**Harder:** email deliverability becomes a hard dependency — a student whose college mail is broken cannot sign in, which is what the manual approval path exists for. Institutional spam filtering must be monitored, since a code that never arrives is indistinguishable from a broken product.

**Committed to:** GitHub is never a sign-in path, in any phase. Its OAuth token is used solely for the linking user's own repository sync.
