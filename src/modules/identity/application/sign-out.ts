import type { Clock } from '@/shared/clock';
import { ok, type Result } from '@/shared/result';
import { revoke } from '../domain/session';
import type { UserId } from '../domain/user';
import type { Hasher } from './ports/crypto';
import type { SessionStore } from './ports/session-store';

/**
 * Signing out always reports success, including for a token that was already
 * invalid. There is nothing useful to tell the caller — and a distinct "that
 * token wasn't real" response would let someone probe token validity.
 */
export function makeSignOut(deps: { sessions: SessionStore; hasher: Hasher; clock: Clock }) {
  return async function signOut(token: string): Promise<Result<void, never>> {
    const session = await deps.sessions.byTokenHash(deps.hasher.hash(token));
    if (session) await deps.sessions.save(revoke(session, deps.clock.now()));
    return ok();
  };
}

/** Used by "sign out everywhere" and, more importantly, by suspension. */
export function makeSignOutEverywhere(deps: { sessions: SessionStore; clock: Clock }) {
  return async function signOutEverywhere(userId: UserId): Promise<Result<void, never>> {
    await deps.sessions.revokeAllForUser(userId, deps.clock.now());
    return ok();
  };
}
