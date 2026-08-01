import { describe, expect, it } from 'vitest';
import { err, ok } from '@/shared/result';
import { mutableClock } from '@/shared/testing/clock';
import { sequentialIds } from '@/shared/testing/id';
import { LINK_STATE_TTL_MS } from '../domain/github-link';
import type { UserId } from '../domain/user';
import { makeGitHubLink, makeUser } from '../testing/fixtures';
import {
  FakeGitHubOAuthClient,
  FakePkceGenerator,
  FakeTokenCipher,
  InMemoryOAuthStateStore,
  InMemoryUserRepository,
} from '../testing/fakes';
import { makeCompleteGitHubLink, makeStartGitHubLink, makeUnlinkGitHub } from './link-github';
import type { CampusEmail } from '../domain/campus-email';

const ACTOR = 'u1' as UserId;

function setup(
  options: { users?: ReturnType<typeof makeUser>[]; oauth?: FakeGitHubOAuthClient } = {},
) {
  const users = new InMemoryUserRepository(options.users ?? [makeUser({ id: ACTOR })]);
  const states = new InMemoryOAuthStateStore();
  const oauth = options.oauth ?? new FakeGitHubOAuthClient();
  const cipher = new FakeTokenCipher();
  const clock = mutableClock('2026-08-01T00:00:00.000Z');

  return {
    users,
    states,
    oauth,
    cipher,
    clock,
    startGitHubLink: makeStartGitHubLink({
      users,
      states,
      oauth,
      pkce: new FakePkceGenerator({ verifier: 'verifier-1', challenge: 'challenge-1' }),
      ids: sequentialIds('state'),
      clock,
    }),
    completeGitHubLink: makeCompleteGitHubLink({ users, states, oauth, cipher, clock }),
    unlinkGitHub: makeUnlinkGitHub({ users }),
  };
}

describe('startGitHubLink', () => {
  it('returns an authorize URL carrying the state and PKCE challenge', async () => {
    const { startGitHubLink, oauth } = setup();

    const result = await startGitHubLink({ userId: ACTOR });

    expect(result.ok).toBe(true);
    expect(oauth.authorizeCalls).toHaveLength(1);
    expect(oauth.authorizeCalls[0]?.codeChallenge).toBe('challenge-1');
  });

  it('keeps the verifier server-side, never in the URL', async () => {
    // The whole point of PKCE: only the hash travels.
    const { startGitHubLink } = setup();

    const result = await startGitHubLink({ userId: ACTOR });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.authorizeUrl).not.toContain('verifier-1');
  });

  it('binds the state to the user who started the flow', async () => {
    const { startGitHubLink, states } = setup();

    await startGitHubLink({ userId: ACTOR });

    expect((await states.byState('state-1'))?.userId).toBe(ACTOR);
  });

  it('refuses a user awaiting approval', async () => {
    const { startGitHubLink } = setup({
      users: [makeUser({ id: ACTOR, status: 'pending_approval' })],
    });

    expect(await startGitHubLink({ userId: ACTOR })).toEqual({
      ok: false,
      error: { kind: 'link_not_permitted' },
    });
  });
});

describe('completeGitHubLink', () => {
  async function begun() {
    const harness = setup();
    await harness.startGitHubLink({ userId: ACTOR });
    return harness;
  }

  it('links the account and records the handle', async () => {
    const { completeGitHubLink, users } = await begun();

    const result = await completeGitHubLink({ state: 'state-1', code: 'gh-code', actorId: ACTOR });

    expect(result.ok).toBe(true);
    const stored = await users.byId(ACTOR);
    expect(stored?.github?.githubUserId).toBe(4242);
    expect(stored?.github?.login).toBe('octocat');
  });

  it('sends the stored verifier with the exchange', async () => {
    // Without this the PKCE pair is decorative — GitHub would accept the code
    // from anyone who intercepted it.
    const { completeGitHubLink, oauth } = await begun();

    await completeGitHubLink({ state: 'state-1', code: 'gh-code', actorId: ACTOR });

    expect(oauth.exchangeCalls[0]).toEqual({ code: 'gh-code', codeVerifier: 'verifier-1' });
  });

  it('stores the access token encrypted, never in the clear', async () => {
    const { completeGitHubLink, users } = await begun();

    await completeGitHubLink({ state: 'state-1', code: 'gh-code', actorId: ACTOR });

    expect(users.storedToken(ACTOR)).toBe('enc(gho_secret)');
    expect(users.storedToken(ACTOR)).not.toBe('gho_secret');
  });

  it('never exposes the token on the returned user', async () => {
    const { completeGitHubLink } = await begun();

    const result = await completeGitHubLink({ state: 'state-1', code: 'gh-code', actorId: ACTOR });

    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.stringify(result.value)).not.toContain('gho_secret');
  });

  it('refuses an unknown state', async () => {
    const { completeGitHubLink } = await begun();

    expect(await completeGitHubLink({ state: 'not-a-state', code: 'c', actorId: ACTOR })).toEqual({
      ok: false,
      error: { kind: 'link_state_unknown' },
    });
  });

  it('refuses a state replayed after it has been used', async () => {
    const { completeGitHubLink } = await begun();
    await completeGitHubLink({ state: 'state-1', code: 'gh-code', actorId: ACTOR });

    expect(await completeGitHubLink({ state: 'state-1', code: 'gh-code', actorId: ACTOR })).toEqual(
      {
        ok: false,
        error: { kind: 'link_state_already_used' },
      },
    );
  });

  it('refuses an expired state', async () => {
    const { completeGitHubLink, clock } = await begun();
    clock.advance(LINK_STATE_TTL_MS + 1);

    expect(await completeGitHubLink({ state: 'state-1', code: 'c', actorId: ACTOR })).toEqual({
      ok: false,
      error: { kind: 'link_state_expired' },
    });
  });

  it('refuses redemption by a different signed-in user', async () => {
    // A stolen state must not be usable from someone else's browser to attach
    // their GitHub account to this profile.
    const { completeGitHubLink } = await begun();

    expect(
      await completeGitHubLink({ state: 'state-1', code: 'c', actorId: 'someone-else' as UserId }),
    ).toEqual({ ok: false, error: { kind: 'link_state_belongs_to_another_user' } });
  });

  it('consumes the state even when the exchange fails, so it cannot be retried', async () => {
    const oauth = new FakeGitHubOAuthClient(err({ kind: 'exchange_failed', detail: 'bad_code' }));
    const harness = setup({ oauth });
    await harness.startGitHubLink({ userId: ACTOR });

    const first = await harness.completeGitHubLink({
      state: 'state-1',
      code: 'c',
      actorId: ACTOR,
    });
    expect(first).toEqual({
      ok: false,
      error: { kind: 'github_exchange_failed', detail: 'bad_code' },
    });

    expect(
      await harness.completeGitHubLink({ state: 'state-1', code: 'c', actorId: ACTOR }),
    ).toEqual({ ok: false, error: { kind: 'link_state_already_used' } });
  });

  it('refuses a GitHub account already linked elsewhere', async () => {
    const other = makeUser({
      id: 'u-other' as UserId,
      email: 'other@college.ac.in' as CampusEmail,
      github: makeGitHubLink({ githubUserId: 4242 }),
    });
    const harness = setup({ users: [makeUser({ id: ACTOR }), other] });
    await harness.startGitHubLink({ userId: ACTOR });

    expect(
      await harness.completeGitHubLink({ state: 'state-1', code: 'c', actorId: ACTOR }),
    ).toEqual({ ok: false, error: { kind: 'github_account_already_linked' } });
  });

  it('allows relinking the same GitHub account to the same user', async () => {
    const harness = setup({
      users: [makeUser({ id: ACTOR, github: makeGitHubLink({ githubUserId: 4242 }) })],
    });
    await harness.startGitHubLink({ userId: ACTOR });

    const result = await harness.completeGitHubLink({
      state: 'state-1',
      code: 'c',
      actorId: ACTOR,
    });

    expect(result.ok).toBe(true);
  });
});

describe('unlinkGitHub', () => {
  it('clears the link and the stored token', async () => {
    const harness = setup();
    await harness.startGitHubLink({ userId: ACTOR });
    await harness.completeGitHubLink({ state: 'state-1', code: 'c', actorId: ACTOR });

    const result = await harness.unlinkGitHub({ userId: ACTOR });

    expect(result.ok).toBe(true);
    expect((await harness.users.byId(ACTOR))?.github).toBeNull();
    expect(harness.users.storedToken(ACTOR)).toBeUndefined();
  });

  it('leaves the account intact, since sign-in never depended on GitHub', async () => {
    const harness = setup();
    await harness.unlinkGitHub({ userId: ACTOR });

    const user = await harness.users.byId(ACTOR);
    expect(user).not.toBeNull();
    expect(user?.email).toBe('student@college.ac.in');
  });

  it('is harmless on an account with no link', async () => {
    const harness = setup();
    expect((await harness.unlinkGitHub({ userId: ACTOR })).ok).toBe(true);
  });
});

describe('an ordinary profile save', () => {
  it('does not disturb an existing link', async () => {
    const harness = setup();
    await harness.startGitHubLink({ userId: ACTOR });
    await harness.completeGitHubLink({ state: 'state-1', code: 'c', actorId: ACTOR });

    // A caller holding the pre-link snapshot writes it back.
    await harness.users.save(makeUser({ id: ACTOR, displayName: 'Renamed', github: null }));

    const after = await harness.users.byId(ACTOR);
    expect(after?.displayName).toBe('Renamed');
    expect(after?.github?.githubUserId).toBe(4242);
  });
});

describe('FakeGitHubOAuthClient', () => {
  it('can be scripted to succeed', async () => {
    const client = new FakeGitHubOAuthClient(
      ok({ githubUserId: 1, login: 'a', avatarUrl: null, accessToken: 't' }),
    );
    const result = await client.exchangeCode({ code: 'c', codeVerifier: 'v' });
    expect(result.ok).toBe(true);
  });
});
