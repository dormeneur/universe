import type { Brand } from '@/shared/id';
import type { UserId } from './user';

export type SessionId = Brand<string, 'SessionId'>;

/**
 * Two expiry clocks, because they answer different questions.
 *
 * Idle expiry logs out a shared lab machine somebody walked away from. Absolute
 * expiry bounds how long a stolen token stays useful no matter how actively it
 * is used — without it, an attacker who keeps a session warm keeps it forever.
 */
export const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Only the hash of the token is held. A database dump therefore yields nothing
 * an attacker can present as a session — the token itself exists only in the
 * user's cookie.
 */
export type Session = {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
};

export type SessionRejection =
  | { readonly kind: 'session_not_found' }
  | { readonly kind: 'session_revoked' }
  | { readonly kind: 'session_expired' }
  | { readonly kind: 'session_idle_timeout' };

export function absoluteExpiryFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS);
}

export function isRevoked(session: Session): boolean {
  return session.revokedAt !== null;
}

export function isPastAbsoluteExpiry(session: Session, now: Date): boolean {
  return now.getTime() > session.expiresAt.getTime();
}

export function isIdleTimedOut(session: Session, now: Date): boolean {
  return now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_TTL_MS;
}

/**
 * Ordered so the cheapest and most definitive reason wins. A revoked session
 * reports as revoked even if it also happens to be expired, which makes
 * "why was I signed out" answerable from the logs.
 */
export function validate(session: Session, now: Date): SessionRejection | null {
  if (isRevoked(session)) return { kind: 'session_revoked' };
  if (isPastAbsoluteExpiry(session, now)) return { kind: 'session_expired' };
  if (isIdleTimedOut(session, now)) return { kind: 'session_idle_timeout' };
  return null;
}

/**
 * Touching on each request keeps an active session alive against the idle
 * clock, but never extends the absolute one.
 */
export function touch(session: Session, now: Date): Session {
  return { ...session, lastSeenAt: now };
}

export function revoke(session: Session, now: Date): Session {
  return session.revokedAt === null ? { ...session, revokedAt: now } : session;
}
