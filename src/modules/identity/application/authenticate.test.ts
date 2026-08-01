import { describe, expect, it } from 'vitest';
import { mutableClock } from '@/shared/testing/clock';
import type { SessionId } from '../domain/session';
import { SESSION_ABSOLUTE_TTL_MS, SESSION_IDLE_TTL_MS } from '../domain/session';
import type { UserId } from '../domain/user';
import { makeSession, makeUser } from '../testing/fixtures';
import { FakeHasher, InMemorySessionStore, InMemoryUserRepository } from '../testing/fakes';
import { makeAuthenticate } from './authenticate';
import { makeSignOut, makeSignOutEverywhere } from './sign-out';

const CREATED = '2026-07-01T00:00:00.000Z';

function setup(seed: { user?: ReturnType<typeof makeUser> } = {}) {
  const user = seed.user ?? makeUser({ id: 'u1' as UserId });
  const users = new InMemoryUserRepository([user]);
  const sessions = new InMemorySessionStore();
  const hasher = new FakeHasher();
  const clock = mutableClock(CREATED);

  const deps = { users, sessions, hasher, clock };
  return {
    user,
    sessions,
    clock,
    authenticate: makeAuthenticate(deps),
    signOut: makeSignOut(deps),
    signOutEverywhere: makeSignOutEverywhere(deps),
    // An arrow property rather than a method, so destructuring it from the
    // returned object does not detach `this`.
    giveSession: async (overrides: Partial<Parameters<typeof makeSession>[0]> = {}) => {
      const session = makeSession({
        id: 's1' as SessionId,
        userId: user.id,
        tokenHash: hasher.hash('tok'),
        createdAt: new Date(CREATED),
        ...overrides,
      });
      await sessions.save(session);
      return session;
    },
  };
}

describe('authenticate', () => {
  it('resolves a valid token to its user', async () => {
    const { authenticate, giveSession, user } = setup();
    await giveSession();

    const result = await authenticate('tok');

    expect(result).toEqual({ ok: true, value: user });
  });

  it('rejects an unknown token', async () => {
    const { authenticate } = setup();
    expect(await authenticate('nonsense')).toEqual({
      ok: false,
      error: { kind: 'session_not_found' },
    });
  });

  it('rejects a revoked session', async () => {
    const { authenticate, giveSession, clock } = setup();
    await giveSession({ revokedAt: clock.now() });

    expect(await authenticate('tok')).toEqual({
      ok: false,
      error: { kind: 'session_revoked' },
    });
  });

  it('rejects a session past its absolute expiry', async () => {
    const { authenticate, giveSession, clock } = setup();
    await giveSession();

    clock.advance(SESSION_ABSOLUTE_TTL_MS + 1);

    expect(await authenticate('tok')).toEqual({
      ok: false,
      error: { kind: 'session_expired' },
    });
  });

  it('rejects a session left idle too long', async () => {
    const { authenticate, giveSession, clock } = setup();
    await giveSession();

    clock.advance(SESSION_IDLE_TTL_MS + 1);

    expect(await authenticate('tok')).toEqual({
      ok: false,
      error: { kind: 'session_idle_timeout' },
    });
  });

  it('refuses a suspended user immediately, without waiting for token expiry', async () => {
    const { authenticate, giveSession } = setup({
      user: makeUser({ id: 'u1' as UserId, status: 'suspended' }),
    });
    await giveSession();

    expect(await authenticate('tok')).toEqual({
      ok: false,
      error: { kind: 'account_suspended' },
    });
  });

  it('admits a user awaiting approval, who may read but not post', async () => {
    const { authenticate, giveSession } = setup({
      user: makeUser({ id: 'u1' as UserId, status: 'pending_approval' }),
    });
    await giveSession();

    const result = await authenticate('tok');
    expect(result.ok).toBe(true);
  });

  it('refreshes the idle timestamp once the touch interval has passed', async () => {
    const { authenticate, giveSession, sessions, clock } = setup();
    const session = await giveSession();

    clock.advance(16 * 60 * 1000);
    await authenticate('tok');

    const stored = await sessions.byTokenHash(session.tokenHash);
    expect(stored?.lastSeenAt).toEqual(clock.now());
  });

  it('does not write on every request', async () => {
    const { authenticate, giveSession, sessions, clock } = setup();
    const session = await giveSession();

    clock.advance(60 * 1000);
    await authenticate('tok');

    const stored = await sessions.byTokenHash(session.tokenHash);
    expect(stored?.lastSeenAt).toEqual(new Date(CREATED));
  });
});

describe('signOut', () => {
  it('revokes the session behind the token', async () => {
    const { authenticate, signOut, giveSession } = setup();
    await giveSession();

    await signOut('tok');

    expect(await authenticate('tok')).toEqual({
      ok: false,
      error: { kind: 'session_revoked' },
    });
  });

  it('reports success for a token that was never valid', async () => {
    const { signOut } = setup();
    expect(await signOut('never-existed')).toEqual({ ok: true, value: undefined });
  });
});

describe('signOutEverywhere', () => {
  it('revokes every session the user holds', async () => {
    const { authenticate, signOutEverywhere, giveSession, user } = setup();
    await giveSession({ id: 's1' as SessionId, tokenHash: 'hashed(tok)' });
    await giveSession({ id: 's2' as SessionId, tokenHash: 'hashed(other)' });

    await signOutEverywhere(user.id);

    expect(await authenticate('tok')).toEqual({
      ok: false,
      error: { kind: 'session_revoked' },
    });
    expect(await authenticate('other')).toEqual({
      ok: false,
      error: { kind: 'session_revoked' },
    });
  });
});
