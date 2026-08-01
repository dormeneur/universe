import { describe, expect, it } from 'vitest';
import type { ConfirmCodeError } from '../application/confirm-sign-in-code';
import type { RequestCodeError } from '../application/request-sign-in-code';
import { describeConfirmCodeError, describeRequestCodeError } from './messages';

describe('describeRequestCodeError', () => {
  it('rounds a retry delay up to whole minutes', () => {
    const message = describeRequestCodeError({ kind: 'rate_limited', retryAfterMs: 90_000 });
    expect(message).toContain('2 minutes');
  });

  it('says "a minute" rather than "1 minutes"', () => {
    const message = describeRequestCodeError({ kind: 'resend_too_soon', retryAfterMs: 30_000 });
    expect(message).toContain('a minute');
    expect(message).not.toContain('1 minutes');
  });

  it.each<RequestCodeError>([
    { kind: 'email_empty' },
    { kind: 'email_malformed' },
    { kind: 'email_too_long' },
    { kind: 'rate_limited', retryAfterMs: 1000 },
    { kind: 'resend_too_soon', retryAfterMs: 1000 },
  ])('produces a non-empty message for $kind', (error) => {
    expect(describeRequestCodeError(error).length).toBeGreaterThan(0);
  });
});

describe('describeConfirmCodeError', () => {
  it('singularises the last remaining attempt', () => {
    const message = describeConfirmCodeError({ kind: 'code_mismatch', attemptsRemaining: 1 });
    expect(message).toContain('One attempt left');
  });

  it('counts down remaining attempts', () => {
    const message = describeConfirmCodeError({ kind: 'code_mismatch', attemptsRemaining: 3 });
    expect(message).toContain('3 attempts left');
  });

  it('never reveals whether the address has an account', () => {
    // Every failure before a correct code must read the same way regardless of
    // whether the address is known, or the flow becomes a membership oracle.
    const messages: ConfirmCodeError[] = [
      { kind: 'code_not_found' },
      { kind: 'code_expired' },
      { kind: 'code_already_used' },
    ];
    for (const error of messages) {
      const text = describeConfirmCodeError(error).toLowerCase();
      expect(text).not.toContain('account');
      expect(text).not.toContain('registered');
      expect(text).not.toContain('exists');
    }
  });

  it.each<ConfirmCodeError>([
    { kind: 'code_malformed' },
    { kind: 'code_not_found' },
    { kind: 'code_expired' },
    { kind: 'code_already_used' },
    { kind: 'code_attempts_exhausted' },
    { kind: 'account_suspended' },
    { kind: 'email_malformed' },
  ])('produces a non-empty message for $kind', (error) => {
    expect(describeConfirmCodeError(error).length).toBeGreaterThan(0);
  });
});
