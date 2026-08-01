import type { Session, SessionId } from '../../domain/session';
import type { UserId } from '../../domain/user';

/**
 * Sessions are looked up by token hash, never by raw token — the store has no
 * way to learn the token itself, which is what keeps a database leak from
 * yielding usable sessions.
 */
export interface SessionStore {
  byTokenHash(tokenHash: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  /** Bulk revocation, used by sign-out-everywhere and by suspension. */
  revokeAllForUser(userId: UserId, at: Date): Promise<void>;
  deleteExpired(before: Date): Promise<number>;
}

export type { SessionId };
