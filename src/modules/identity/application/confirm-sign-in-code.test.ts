import { describe, expect, it } from 'vitest';
import { sequentialIds } from '@/shared/testing/id';
import { mutableClock } from '@/shared/testing/clock';
import { RecordingEventPublisher } from '@/shared/testing/events';
import type { CampusEmail } from '../domain/campus-email';
import type { UserId } from '../domain/user';
import { CODE_TTL_MS, MAX_ATTEMPTS } from '../domain/verification-code';
import { makeUser } from '../testing/fixtures';
import {
  FakeHasher,
  FakeSecretGenerator,
  InMemorySessionStore,
  InMemoryUserRepository,
  InMemoryVerificationCodeStore,
} from '../testing/fakes';
import { defaultDisplayName, makeConfirmSignInCode } from './confirm-sign-in-code';

const EMAIL = 'student@college.ac.in';
const ALLOWLIST = ['college.ac.in', '*.college.ac.in'];

function setup(seedUsers = [] as ReturnType<typeof makeUser>[]) {
  const users = new InMemoryUserRepository(seedUsers);
  const codes = new InMemoryVerificationCodeStore();
  const sessions = new InMemorySessionStore();
  const events = new RecordingEventPublisher();
  const clock = mutableClock('2026-07-01T00:00:00.000Z');
  const hasher = new FakeHasher();

  const confirmSignInCode = makeConfirmSignInCode({
    users,
    codes,
    sessions,
    hasher,
    secrets: new FakeSecretGenerator(['123456'], ['tok-1', 'tok-2']),
    ids: sequentialIds('id'),
    events,
    clock,
    allowlist: ALLOWLIST,
  });

  async function issueCode(email = EMAIL, plaintext = '123456') {
    const now = clock.now();
    await codes.save({
      email: email as CampusEmail,
      codeHash: hasher.hash(plaintext),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      consumedAt: null,
    });
  }

  return { confirmSignInCode, users, codes, sessions, events, clock, issueCode };
}

describe('confirmSignInCode', () => {
  it('registers an account on first successful sign-in', async () => {
    const { confirmSignInCode, issueCode, users } = setup();
    await issueCode();

    const result = await confirmSignInCode({ email: EMAIL, code: '123456' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isNewAccount).toBe(true);
      expect(result.value.user.email).toBe(EMAIL);
      expect(result.value.user.status).toBe('active');
    }
    expect(await users.byEmail(EMAIL as CampusEmail)).not.toBeNull();
  });

  it('issues a session token distinct from anything stored', async () => {
    const { confirmSignInCode, issueCode, sessions } = setup();
    await issueCode();

    const result = await confirmSignInCode({ email: EMAIL, code: '123456' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).toBe('tok-1');
    // Only the hash reaches the store, so a database leak yields no session.
    expect(await sessions.byTokenHash('hashed(tok-1)')).not.toBeNull();
    expect(await sessions.byTokenHash('tok-1')).toBeNull();
  });

  it('leaves a new account pending when the domain is not on the allowlist', async () => {
    const { confirmSignInCode, issueCode } = setup();
    await issueCode('student@unknown-college.org');

    const result = await confirmSignInCode({
      email: 'student@unknown-college.org',
      code: '123456',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.user.status).toBe('pending_approval');
  });

  it('signs in an existing user without creating another account', async () => {
    const existing = makeUser({ id: 'u-existing' as UserId, email: EMAIL as CampusEmail });
    const { confirmSignInCode, issueCode } = setup([existing]);
    await issueCode();

    const result = await confirmSignInCode({ email: EMAIL, code: '123456' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isNewAccount).toBe(false);
      expect(result.value.user.id).toBe('u-existing');
    }
  });

  it('starts a new account with no graduation year, to be asked for later', async () => {
    const { confirmSignInCode, issueCode } = setup();
    await issueCode();

    const result = await confirmSignInCode({ email: EMAIL, code: '123456' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.user.gradYear).toBeNull();
  });

  it('consumes the code so it cannot be replayed', async () => {
    const { confirmSignInCode, issueCode } = setup();
    await issueCode();

    await confirmSignInCode({ email: EMAIL, code: '123456' });
    const replay = await confirmSignInCode({ email: EMAIL, code: '123456' });

    expect(replay).toEqual({ ok: false, error: { kind: 'code_already_used' } });
  });

  it('counts a wrong code against the attempt limit and says how many remain', async () => {
    const { confirmSignInCode, issueCode } = setup();
    await issueCode();

    const result = await confirmSignInCode({ email: EMAIL, code: '000000' });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'code_mismatch', attemptsRemaining: MAX_ATTEMPTS - 1 },
    });
  });

  it('locks the code once attempts are exhausted, even if the right code follows', async () => {
    const { confirmSignInCode, issueCode } = setup();
    await issueCode();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await confirmSignInCode({ email: EMAIL, code: '000000' });
    }
    const result = await confirmSignInCode({ email: EMAIL, code: '123456' });

    expect(result).toEqual({ ok: false, error: { kind: 'code_attempts_exhausted' } });
  });

  it('refuses an expired code', async () => {
    const { confirmSignInCode, issueCode, clock } = setup();
    await issueCode();

    clock.advance(CODE_TTL_MS + 1);
    const result = await confirmSignInCode({ email: EMAIL, code: '123456' });

    expect(result).toEqual({ ok: false, error: { kind: 'code_expired' } });
  });

  it('reports a missing code without hinting whether the address is known', async () => {
    const { confirmSignInCode } = setup();
    const result = await confirmSignInCode({ email: EMAIL, code: '123456' });
    expect(result).toEqual({ ok: false, error: { kind: 'code_not_found' } });
  });

  it.each([
    ['too short', '12345'],
    ['letters', 'abcdef'],
    ['empty', ''],
  ])('rejects a %s code before touching the store', async (_label, code) => {
    const { confirmSignInCode } = setup();
    const result = await confirmSignInCode({ email: EMAIL, code });
    expect(result).toEqual({ ok: false, error: { kind: 'code_malformed' } });
  });

  it('tolerates surrounding whitespace from a pasted code', async () => {
    const { confirmSignInCode, issueCode } = setup();
    await issueCode();

    const result = await confirmSignInCode({ email: EMAIL, code: '  123456 ' });

    expect(result.ok).toBe(true);
  });

  it('refuses a suspended account and issues no session', async () => {
    const suspended = makeUser({
      id: 'u-susp' as UserId,
      email: EMAIL as CampusEmail,
      status: 'suspended',
    });
    const { confirmSignInCode, issueCode, sessions } = setup([suspended]);
    await issueCode();

    const result = await confirmSignInCode({ email: EMAIL, code: '123456' });

    expect(result).toEqual({ ok: false, error: { kind: 'account_suspended' } });
    expect(await sessions.byTokenHash('hashed(tok-1)')).toBeNull();
  });

  it('announces registration for a new account', async () => {
    const { confirmSignInCode, issueCode, events } = setup();
    await issueCode();

    await confirmSignInCode({ email: EMAIL, code: '123456' });

    expect(events.published.map((e) => e.type)).toEqual(['identity.user_registered']);
  });

  it('announces a sign-in for a returning account', async () => {
    const existing = makeUser({ id: 'u1' as UserId, email: EMAIL as CampusEmail });
    const { confirmSignInCode, issueCode, events } = setup([existing]);
    await issueCode();

    await confirmSignInCode({ email: EMAIL, code: '123456' });

    expect(events.published.map((e) => e.type)).toEqual(['identity.user_signed_in']);
  });
});

describe('defaultDisplayName', () => {
  it.each([
    ['aditya.bharti@college.ac.in', 'Aditya Bharti'],
    ['rohan_kumar@college.ac.in', 'Rohan Kumar'],
    ['s-patel@college.ac.in', 'S Patel'],
    ['student@college.ac.in', 'Student'],
  ])('turns %s into %s', (email, expected) => {
    expect(defaultDisplayName(email as CampusEmail)).toBe(expected);
  });
});
