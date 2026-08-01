import { describe, expect, it } from 'vitest';
import { mutableClock } from '@/shared/testing/clock';
import type { CampusEmail } from '../domain/campus-email';
import { CODE_LENGTH, RESEND_COOLDOWN_MS } from '../domain/verification-code';
import {
  CountingRateLimiter,
  FakeHasher,
  FakeSecretGenerator,
  InMemoryVerificationCodeStore,
  PermissiveRateLimiter,
  RecordingMailer,
} from '../testing/fakes';
import {
  CODES_PER_EMAIL_PER_DAY,
  CODES_PER_IP_PER_DAY,
  makeRequestSignInCode,
} from './request-sign-in-code';

const EMAIL = 'student@college.ac.in';
const IP = '203.0.113.7';

function setup(overrides: { limiter?: CountingRateLimiter; codes?: readonly string[] } = {}) {
  const codes = new InMemoryVerificationCodeStore();
  const mailer = new RecordingMailer();
  const clock = mutableClock('2026-07-01T00:00:00.000Z');
  const limiter = overrides.limiter ?? new PermissiveRateLimiter();

  const requestSignInCode = makeRequestSignInCode({
    codes,
    mailer,
    hasher: new FakeHasher(),
    secrets: new FakeSecretGenerator(overrides.codes ?? ['123456', '654321']),
    limiter,
    clock,
  });

  return { requestSignInCode, codes, mailer, clock };
}

describe('requestSignInCode', () => {
  it('emails a code to a valid address', async () => {
    const { requestSignInCode, mailer } = setup();

    const result = await requestSignInCode({ email: EMAIL, ipAddress: IP });

    expect(result.ok).toBe(true);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe(EMAIL);
    expect(mailer.lastCode).toBe('123456');
  });

  it('stores only the hash of the code, never the code itself', async () => {
    const { requestSignInCode, codes, mailer } = setup();

    await requestSignInCode({ email: EMAIL, ipAddress: IP });

    const stored = await codes.byEmail(EMAIL as CampusEmail);
    expect(stored?.codeHash).toBe('hashed(123456)');
    expect(JSON.stringify(stored)).not.toContain(`"${mailer.lastCode}"`);
  });

  it('succeeds identically for an address with no account, revealing nothing', async () => {
    const { requestSignInCode, mailer } = setup();

    const result = await requestSignInCode({ email: 'stranger@college.ac.in', ipAddress: IP });

    expect(result.ok).toBe(true);
    expect(mailer.sent).toHaveLength(1);
  });

  it('rejects a malformed address before sending anything', async () => {
    const { requestSignInCode, mailer } = setup();

    const result = await requestSignInCode({ email: 'not-an-email', ipAddress: IP });

    expect(result).toEqual({ ok: false, error: { kind: 'email_malformed' } });
    expect(mailer.sent).toHaveLength(0);
  });

  it('normalizes the address so casing does not create a second code', async () => {
    const { requestSignInCode, codes, clock } = setup();

    await requestSignInCode({ email: 'Student@College.AC.IN', ipAddress: IP });
    clock.advance(RESEND_COOLDOWN_MS);
    await requestSignInCode({ email: EMAIL, ipAddress: IP });

    expect(await codes.byEmail(EMAIL as CampusEmail)).not.toBeNull();
  });

  it('refuses a resend inside the cooldown window', async () => {
    const { requestSignInCode, clock, mailer } = setup();
    await requestSignInCode({ email: EMAIL, ipAddress: IP });

    clock.advance(RESEND_COOLDOWN_MS - 1);
    const result = await requestSignInCode({ email: EMAIL, ipAddress: IP });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('resend_too_soon');
    expect(mailer.sent).toHaveLength(1);
  });

  it('allows a resend once the cooldown has passed, replacing the old code', async () => {
    const { requestSignInCode, clock, mailer, codes } = setup();
    await requestSignInCode({ email: EMAIL, ipAddress: IP });

    clock.advance(RESEND_COOLDOWN_MS);
    const result = await requestSignInCode({ email: EMAIL, ipAddress: IP });

    expect(result.ok).toBe(true);
    expect(mailer.sent).toHaveLength(2);
    // The previous code must no longer be valid — one live code per address.
    expect((await codes.byEmail(EMAIL as CampusEmail))?.codeHash).toBe('hashed(654321)');
  });

  it('stops sending once the per-address daily limit is spent', async () => {
    const limiter = new CountingRateLimiter();
    const { requestSignInCode, clock, mailer } = setup({ limiter });

    for (let i = 0; i < CODES_PER_EMAIL_PER_DAY; i++) {
      clock.advance(RESEND_COOLDOWN_MS);
      await requestSignInCode({ email: EMAIL, ipAddress: IP });
    }

    clock.advance(RESEND_COOLDOWN_MS);
    const result = await requestSignInCode({ email: EMAIL, ipAddress: IP });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('rate_limited');
    expect(mailer.sent).toHaveLength(CODES_PER_EMAIL_PER_DAY);
  });

  it('stops an address sweep from one machine via the per-IP limit', async () => {
    const limiter = new CountingRateLimiter();
    const { requestSignInCode, clock } = setup({ limiter });

    for (let i = 0; i < CODES_PER_IP_PER_DAY; i++) {
      clock.advance(RESEND_COOLDOWN_MS);
      await requestSignInCode({ email: `victim${i}@college.ac.in`, ipAddress: IP });
    }

    const result = await requestSignInCode({ email: 'onemore@college.ac.in', ipAddress: IP });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('rate_limited');
  });

  it('spends the IP budget before the target address budget', async () => {
    // A sweep from one machine must not burn through an individual victim's
    // own daily allowance on their behalf.
    const limiter = new CountingRateLimiter();
    const { requestSignInCode, clock } = setup({ limiter });

    for (let i = 0; i < CODES_PER_IP_PER_DAY; i++) {
      clock.advance(RESEND_COOLDOWN_MS);
      await requestSignInCode({ email: `victim${i}@college.ac.in`, ipAddress: IP });
    }
    await requestSignInCode({ email: EMAIL, ipAddress: IP });

    // From a different machine the victim still has their full allowance.
    const fresh = await requestSignInCode({ email: EMAIL, ipAddress: '198.51.100.9' });
    expect(fresh.ok).toBe(true);
  });

  it('asks for a code of the agreed length', async () => {
    const { requestSignInCode, mailer } = setup();
    await requestSignInCode({ email: EMAIL, ipAddress: IP });
    expect(mailer.lastCode).toHaveLength(CODE_LENGTH);
  });
});
