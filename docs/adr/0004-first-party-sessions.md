# ADR 0004 — First-party sessions and a direct GitHub OAuth client

**Status:** Accepted
**Date:** 2026-08-01

## Context

ADR 0003 makes email codes the only sign-in path and GitHub a link-only account. Auth.js was the assumed library, but that shape fits it poorly:

- Auth.js's email provider issues magic links, not codes. Codes would need a Credentials provider, which forces JWT sessions and rules out database-backed ones.
- Auth.js models account linking as "sign in with the provider, then associate". Making GitHub link-only — never able to create a session — means working against the library's core model rather than with it.
- JWT sessions cannot be revoked before expiry. Suspending an account through moderation would not take effect until the token aged out.

## Decision

Implement sessions first-party, and call GitHub's OAuth endpoints directly.

**Sessions:** a 256-bit random token in an `httpOnly`, `secure`, `sameSite=lax` cookie. Only a SHA-256 hash is stored, so a database leak does not yield usable sessions. Absolute and idle expiry, revocable individually or in bulk.

**GitHub OAuth:** the authorization-code flow with PKCE and a signed `state` parameter, used only for linking. It never creates a session, so the sign-in path and the linking path share no code.

## Alternatives considered

**Auth.js with a Credentials provider** — rejected. Forces JWT sessions, losing instant revocation, and still requires custom code for the OTP lifecycle (hashing, attempt limits, resend cooldowns) since the library does not model it.

**Auth.js with a custom adapter** — rejected. More total code than a first-party implementation, spent on satisfying an interface designed around a different flow.

**A hosted identity provider** (Clerk, WorkOS, Auth0) — rejected. Cost and a third-party dependency holding the campus user list, for a free single-campus utility whose auth requirements are one email code and one OAuth link.

## Consequences

**Easier:** the model fits exactly — codes are codes, links are links; suspension takes effect immediately; "sign out everywhere" is one query; there is no library upgrade path to track.

**Harder — and this is the real cost:** session correctness becomes our responsibility. "Don't roll your own auth" is sound advice, and it is being set aside deliberately. What makes that defensible here is scope: there are no passwords, so the highest-risk component does not exist. What remains is a random token in a cookie compared against a hash — a small, well-understood design rather than novel cryptography.

The specific risks accepted, and how each is handled:

| Risk                     | Handling                                                             |
| ------------------------ | -------------------------------------------------------------------- |
| Session fixation         | A fresh token is generated on every sign-in; nothing is carried over |
| CSRF                     | `sameSite=lax` plus Next.js server actions' built-in origin checking |
| Token leakage at rest    | Only the SHA-256 hash is stored                                      |
| Timing attacks on lookup | Hash-then-index-lookup does constant work regardless of validity     |
| Indefinite sessions      | Absolute expiry (30 days) and idle expiry (14 days)                  |
| Stolen token             | Revocable immediately; suspension invalidates every session          |

**Committed to:** these properties are covered by tests, not assumed. If session handling ever grows beyond this shape, revisit rather than extend.
