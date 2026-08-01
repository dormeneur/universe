import { describe, expect, it } from 'vitest';
import { makeVerificationCode } from '../testing/fixtures';
import {
  attemptsRemaining,
  canResend,
  checkUsable,
  CODE_TTL_MS,
  expiryFrom,
  isExpired,
  isWellFormedCode,
  markConsumed,
  MAX_ATTEMPTS,
  registerFailedAttempt,
  RESEND_COOLDOWN_MS,
} from './verification-code';

const ISSUED = new Date('2026-07-01T00:00:00.000Z');

describe('isExpired', () => {
  it('is not expired one millisecond before the deadline', () => {
    const code = makeVerificationCode({ issuedAt: ISSUED });
    expect(isExpired(code, new Date(ISSUED.getTime() + CODE_TTL_MS - 1))).toBe(false);
  });

  it('is not expired exactly at the deadline', () => {
    const code = makeVerificationCode({ issuedAt: ISSUED });
    expect(isExpired(code, new Date(ISSUED.getTime() + CODE_TTL_MS))).toBe(false);
  });

  it('is expired one millisecond after the deadline', () => {
    const code = makeVerificationCode({ issuedAt: ISSUED });
    expect(isExpired(code, new Date(ISSUED.getTime() + CODE_TTL_MS + 1))).toBe(true);
  });
});

describe('checkUsable', () => {
  it('permits a fresh unused code', () => {
    const code = makeVerificationCode({ issuedAt: ISSUED });
    expect(checkUsable(code, ISSUED)).toEqual({ ok: true, value: undefined });
  });

  it('refuses a code that has already been used', () => {
    const code = makeVerificationCode({ issuedAt: ISSUED, consumedAt: ISSUED });
    expect(checkUsable(code, ISSUED)).toEqual({
      ok: false,
      error: { kind: 'code_already_used' },
    });
  });

  it('refuses an expired code', () => {
    const code = makeVerificationCode({ issuedAt: ISSUED });
    const later = new Date(ISSUED.getTime() + CODE_TTL_MS + 1);
    expect(checkUsable(code, later)).toEqual({ ok: false, error: { kind: 'code_expired' } });
  });

  it('refuses a code whose attempts are exhausted', () => {
    const code = makeVerificationCode({ issuedAt: ISSUED, attempts: MAX_ATTEMPTS });
    expect(checkUsable(code, ISSUED)).toEqual({
      ok: false,
      error: { kind: 'code_attempts_exhausted' },
    });
  });

  it('reports consumption ahead of expiry, so the reason is the definitive one', () => {
    const code = makeVerificationCode({ issuedAt: ISSUED, consumedAt: ISSUED });
    const later = new Date(ISSUED.getTime() + CODE_TTL_MS + 1);
    expect(checkUsable(code, later)).toEqual({
      ok: false,
      error: { kind: 'code_already_used' },
    });
  });
});

describe('attempt accounting', () => {
  it('counts down remaining attempts', () => {
    const code = makeVerificationCode({ attempts: 2 });
    expect(attemptsRemaining(code)).toBe(MAX_ATTEMPTS - 2);
  });

  it('never reports a negative remaining count', () => {
    expect(attemptsRemaining(makeVerificationCode({ attempts: MAX_ATTEMPTS + 3 }))).toBe(0);
  });

  it('increments without mutating the original', () => {
    const code = makeVerificationCode({ attempts: 1 });
    const next = registerFailedAttempt(code);
    expect(next.attempts).toBe(2);
    expect(code.attempts).toBe(1);
  });

  it('blocks the attempt after the last one is spent', () => {
    let code = makeVerificationCode({ issuedAt: ISSUED });
    for (let i = 0; i < MAX_ATTEMPTS; i++) code = registerFailedAttempt(code);
    expect(checkUsable(code, ISSUED)).toEqual({
      ok: false,
      error: { kind: 'code_attempts_exhausted' },
    });
  });
});

describe('markConsumed', () => {
  it('records the consumption time without mutating the original', () => {
    const code = makeVerificationCode();
    const consumed = markConsumed(code, ISSUED);
    expect(consumed.consumedAt).toEqual(ISSUED);
    expect(code.consumedAt).toBeNull();
  });
});

describe('canResend', () => {
  it('refuses a resend inside the cooldown', () => {
    const code = makeVerificationCode({ issuedAt: ISSUED });
    expect(canResend(code, new Date(ISSUED.getTime() + RESEND_COOLDOWN_MS - 1))).toBe(false);
  });

  it('permits a resend exactly at the cooldown boundary', () => {
    const code = makeVerificationCode({ issuedAt: ISSUED });
    expect(canResend(code, new Date(ISSUED.getTime() + RESEND_COOLDOWN_MS))).toBe(true);
  });
});

describe('expiryFrom', () => {
  it('is the issue time plus the time-to-live', () => {
    expect(expiryFrom(ISSUED)).toEqual(new Date(ISSUED.getTime() + CODE_TTL_MS));
  });
});

describe('isWellFormedCode', () => {
  it('accepts exactly six digits', () => {
    expect(isWellFormedCode('012345')).toBe(true);
  });

  it.each([
    ['too short', '12345'],
    ['too long', '1234567'],
    ['letters', '12a456'],
    ['empty', ''],
    ['spaces', '123 45'],
    ['sign prefix', '+12345'],
  ])('rejects %s', (_label, input) => {
    expect(isWellFormedCode(input)).toBe(false);
  });
});
