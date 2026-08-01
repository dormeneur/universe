import type { Clock } from '@/shared/clock';
import { err, ok, type Result } from '@/shared/result';
import { parseCampusEmail, type EmailError } from '../domain/campus-email';
import {
  CODE_LENGTH,
  CODE_TTL_MS,
  canResend,
  expiryFrom,
  RESEND_COOLDOWN_MS,
} from '../domain/verification-code';
import type { Hasher, SecretGenerator } from './ports/crypto';
import type { Mailer } from './ports/mailer';
import type { RateLimiter } from './ports/rate-limiter';
import type { VerificationCodeStore } from './ports/verification-code-store';

export const CODES_PER_EMAIL_PER_DAY = 5;
export const CODES_PER_IP_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RequestCodeInput = {
  readonly email: string;
  /** Used only for rate limiting; never stored against the account. */
  readonly ipAddress: string;
};

export type RequestCodeError =
  | EmailError
  | { readonly kind: 'rate_limited'; readonly retryAfterMs: number }
  | { readonly kind: 'resend_too_soon'; readonly retryAfterMs: number };

export type RequestCodeSuccess = {
  readonly expiresInMinutes: number;
};

/**
 * Issues a sign-in code.
 *
 * Deliberately returns the same success shape whether or not an account exists
 * (PRD ID-9). Reporting "no such user" here would turn the endpoint into a
 * membership oracle: anyone with a list of names could discover who is on
 * campus. The account is created later, when a code is actually proven.
 */
export function makeRequestSignInCode(deps: {
  codes: VerificationCodeStore;
  mailer: Mailer;
  hasher: Hasher;
  secrets: SecretGenerator;
  limiter: RateLimiter;
  clock: Clock;
}) {
  return async function requestSignInCode(
    input: RequestCodeInput,
  ): Promise<Result<RequestCodeSuccess, RequestCodeError>> {
    const parsedEmail = parseCampusEmail(input.email);
    if (!parsedEmail.ok) return parsedEmail;
    const email = parsedEmail.value;

    const now = deps.clock.now();

    // IP first: an attacker walking an address list should be stopped before
    // their target's own per-address budget is spent on their behalf.
    const byIp = await deps.limiter.consume(
      `signin:ip:${input.ipAddress}`,
      CODES_PER_IP_PER_DAY,
      DAY_MS,
    );
    if (!byIp.allowed) {
      return err({ kind: 'rate_limited', retryAfterMs: byIp.retryAfterMs });
    }

    const byEmail = await deps.limiter.consume(
      `signin:email:${email}`,
      CODES_PER_EMAIL_PER_DAY,
      DAY_MS,
    );
    if (!byEmail.allowed) {
      return err({ kind: 'rate_limited', retryAfterMs: byEmail.retryAfterMs });
    }

    const existing = await deps.codes.byEmail(email);
    if (existing && !canResend(existing, now)) {
      const elapsed = now.getTime() - existing.issuedAt.getTime();
      return err({ kind: 'resend_too_soon', retryAfterMs: RESEND_COOLDOWN_MS - elapsed });
    }

    const code = deps.secrets.numericCode(CODE_LENGTH);

    // Replacing rather than appending: one live code per address means a
    // rate-limit window yields one guessable secret, not several.
    await deps.codes.save({
      email,
      codeHash: deps.hasher.hash(code),
      issuedAt: now,
      expiresAt: expiryFrom(now),
      attempts: 0,
      consumedAt: null,
    });

    await deps.mailer.sendSignInCode({
      to: email,
      code,
      expiresInMinutes: CODE_TTL_MS / 60_000,
    });

    return ok({ expiresInMinutes: CODE_TTL_MS / 60_000 });
  };
}
