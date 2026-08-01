import type { Clock } from '@/shared/clock';
import { err, ok, type Result } from '@/shared/result';
import { touch, validate, type SessionRejection } from '../domain/session';
import { canRead, type User } from '../domain/user';
import type { Hasher } from './ports/crypto';
import type { SessionStore } from './ports/session-store';
import type { UserReader } from './ports/user-repository';

export type AuthFailure =
  | SessionRejection
  | { readonly kind: 'session_user_missing' }
  | { readonly kind: 'account_suspended' };

/**
 * How often a valid session's `lastSeenAt` is written back.
 *
 * Updating on every request would mean a database write per page view for no
 * behavioural gain. Fifteen minutes keeps the idle clock accurate to well
 * inside its fourteen-day window while making the write rare.
 */
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Resolves a session token to the user behind it.
 *
 * Called on every authenticated request, so it deliberately does the minimum:
 * one indexed lookup by hash, one user lookup, and a write only when the idle
 * timestamp is genuinely stale.
 */
export function makeAuthenticate(deps: {
  users: UserReader;
  sessions: SessionStore;
  hasher: Hasher;
  clock: Clock;
}) {
  return async function authenticate(token: string): Promise<Result<User, AuthFailure>> {
    const now = deps.clock.now();

    // Looking up by hash rather than scanning means an invalid token costs the
    // same as a valid one, and the raw token never reaches the database.
    const session = await deps.sessions.byTokenHash(deps.hasher.hash(token));
    if (!session) return err({ kind: 'session_not_found' });

    const rejection = validate(session, now);
    if (rejection) return err(rejection);

    const user = await deps.users.byId(session.userId);
    // A session outliving its user means data was deleted underneath us. Treat
    // it as unauthenticated rather than crashing a page render.
    if (!user) return err({ kind: 'session_user_missing' });

    // Checked on every request so suspension takes effect immediately rather
    // than whenever the token happens to expire.
    if (!canRead(user)) return err({ kind: 'account_suspended' });

    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await deps.sessions.save(touch(session, now));
    }

    return ok(user);
  };
}
