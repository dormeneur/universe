import { err, ok, type Result } from '@/shared/result';
import type { CampusEmail } from './campus-email';

/**
 * The lifecycle rules for a sign-in code. Hashing and comparison live in the
 * application layer behind a `Hasher` port — the domain decides *whether* an
 * attempt is permitted, not how a secret is compared.
 */

export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

/**
 * A short window between resends. Long enough to stop a mistyped-address
 * mail storm, short enough that someone who genuinely did not receive the
 * first code is not left stranded.
 */
export const RESEND_COOLDOWN_MS = 60 * 1000;

export type VerificationCode = {
  readonly email: CampusEmail;
  /** Only ever the hash. The plaintext exists in the email and nowhere else. */
  readonly codeHash: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly consumedAt: Date | null;
};

export type CodeAttemptError =
  | { readonly kind: 'code_not_found' }
  | { readonly kind: 'code_expired' }
  | { readonly kind: 'code_already_used' }
  | { readonly kind: 'code_attempts_exhausted' }
  | { readonly kind: 'code_mismatch'; readonly attemptsRemaining: number };

export function isExpired(code: VerificationCode, now: Date): boolean {
  return now.getTime() > code.expiresAt.getTime();
}

export function isConsumed(code: VerificationCode): boolean {
  return code.consumedAt !== null;
}

export function attemptsRemaining(code: VerificationCode): number {
  return Math.max(0, MAX_ATTEMPTS - code.attempts);
}

/**
 * Whether this code may be tried at all, before any comparison happens.
 *
 * Checking usability first means an expired or exhausted code costs the same
 * whether the submitted digits were right or wrong, so the response cannot be
 * used to learn anything about the real code.
 */
export function checkUsable(code: VerificationCode, now: Date): Result<void, CodeAttemptError> {
  if (isConsumed(code)) return err({ kind: 'code_already_used' });
  if (isExpired(code, now)) return err({ kind: 'code_expired' });
  if (attemptsRemaining(code) <= 0) return err({ kind: 'code_attempts_exhausted' });
  return ok();
}

/**
 * Records a failed attempt. Callers persist the result so the attempt count
 * survives — otherwise the limit is trivially bypassed by retrying.
 */
export function registerFailedAttempt(code: VerificationCode): VerificationCode {
  return { ...code, attempts: code.attempts + 1 };
}

export function markConsumed(code: VerificationCode, now: Date): VerificationCode {
  return { ...code, consumedAt: now };
}

export function canResend(code: VerificationCode, now: Date): boolean {
  return now.getTime() - code.issuedAt.getTime() >= RESEND_COOLDOWN_MS;
}

export function expiryFrom(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + CODE_TTL_MS);
}

/**
 * Rejects anything that is not exactly six digits before it reaches a hash
 * comparison, so malformed input is cheap and produces a clear error.
 */
export function isWellFormedCode(candidate: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(candidate);
}
