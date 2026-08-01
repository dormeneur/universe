import { describe, expect, it } from 'vitest';
import { makeSession } from '../testing/fixtures';
import {
  absoluteExpiryFrom,
  isIdleTimedOut,
  isPastAbsoluteExpiry,
  revoke,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  touch,
  validate,
} from './session';

const CREATED = new Date('2026-07-01T00:00:00.000Z');
const at = (offsetMs: number) => new Date(CREATED.getTime() + offsetMs);

describe('validate', () => {
  it('accepts a fresh session', () => {
    expect(validate(makeSession({ createdAt: CREATED }), CREATED)).toBeNull();
  });

  it('rejects a revoked session', () => {
    const session = makeSession({ createdAt: CREATED, revokedAt: at(1000) });
    expect(validate(session, at(2000))).toEqual({ kind: 'session_revoked' });
  });

  it('rejects a session past its absolute expiry even if recently used', () => {
    const session = makeSession({
      createdAt: CREATED,
      lastSeenAt: at(SESSION_ABSOLUTE_TTL_MS),
    });
    expect(validate(session, at(SESSION_ABSOLUTE_TTL_MS + 1))).toEqual({
      kind: 'session_expired',
    });
  });

  it('rejects a session idle beyond the idle window', () => {
    const session = makeSession({ createdAt: CREATED, lastSeenAt: CREATED });
    expect(validate(session, at(SESSION_IDLE_TTL_MS + 1))).toEqual({
      kind: 'session_idle_timeout',
    });
  });

  it('accepts a session exactly at the idle boundary', () => {
    const session = makeSession({ createdAt: CREATED, lastSeenAt: CREATED });
    expect(validate(session, at(SESSION_IDLE_TTL_MS))).toBeNull();
  });

  it('reports revocation ahead of expiry, so the logged reason is the real one', () => {
    const session = makeSession({ createdAt: CREATED, revokedAt: at(1000) });
    expect(validate(session, at(SESSION_ABSOLUTE_TTL_MS + 1))).toEqual({
      kind: 'session_revoked',
    });
  });
});

describe('touch', () => {
  it('extends the idle window', () => {
    const session = makeSession({ createdAt: CREATED, lastSeenAt: CREATED });
    const touched = touch(session, at(SESSION_IDLE_TTL_MS - 1));
    expect(isIdleTimedOut(touched, at(SESSION_IDLE_TTL_MS + 1))).toBe(false);
  });

  it('does not extend the absolute expiry', () => {
    const session = makeSession({ createdAt: CREATED });
    const touched = touch(session, at(SESSION_ABSOLUTE_TTL_MS - 1));
    expect(touched.expiresAt).toEqual(session.expiresAt);
    expect(isPastAbsoluteExpiry(touched, at(SESSION_ABSOLUTE_TTL_MS + 1))).toBe(true);
  });
});

describe('revoke', () => {
  it('records the revocation time', () => {
    const revoked = revoke(makeSession({ createdAt: CREATED }), at(500));
    expect(revoked.revokedAt).toEqual(at(500));
  });

  it('keeps the original revocation time when called twice', () => {
    const first = revoke(makeSession({ createdAt: CREATED }), at(500));
    const second = revoke(first, at(9000));
    expect(second.revokedAt).toEqual(at(500));
  });
});

describe('absoluteExpiryFrom', () => {
  it('is creation plus the absolute time-to-live', () => {
    expect(absoluteExpiryFrom(CREATED)).toEqual(at(SESSION_ABSOLUTE_TTL_MS));
  });
});
