import { CODE_LENGTH } from '../domain/verification-code';
import type { ConfirmCodeError } from '../application/confirm-sign-in-code';
import type { OnboardingError } from '../application/complete-onboarding';
import type { RequestCodeError } from '../application/request-sign-in-code';

/**
 * Turns typed errors into something a student can act on.
 *
 * Two rules shape the wording. Messages say what to do next rather than what
 * went wrong internally — "that code has expired, ask for a new one" beats
 * "code_expired". And nothing here distinguishes a known address from an
 * unknown one, because the sign-in flow deliberately cannot tell the
 * difference (PRD ID-9).
 */

function minutes(ms: number): string {
  const value = Math.max(1, Math.ceil(ms / 60_000));
  return value === 1 ? 'a minute' : `${value} minutes`;
}

export function describeRequestCodeError(error: RequestCodeError): string {
  switch (error.kind) {
    case 'email_empty':
      return 'Enter your college email address.';
    case 'email_malformed':
      return "That doesn't look like an email address. Check it and try again.";
    case 'email_too_long':
      return 'That address is too long to be real. Check it and try again.';
    case 'rate_limited':
      return `Too many codes requested. Try again in ${minutes(error.retryAfterMs)}.`;
    case 'resend_too_soon':
      return `A code was just sent. You can ask for another in ${minutes(error.retryAfterMs)}.`;
  }
}

export function describeConfirmCodeError(error: ConfirmCodeError): string {
  switch (error.kind) {
    case 'email_empty':
    case 'email_malformed':
    case 'email_too_long':
      return 'Something went wrong with your address. Start again.';
    case 'code_malformed':
      return `Enter the ${CODE_LENGTH}-digit code from your email.`;
    case 'code_not_found':
      return 'That code is no longer valid. Ask for a new one.';
    case 'code_expired':
      return 'That code has expired. Ask for a new one.';
    case 'code_already_used':
      return 'That code has already been used. Ask for a new one.';
    case 'code_attempts_exhausted':
      return 'Too many incorrect attempts. Ask for a new code.';
    case 'code_mismatch':
      return error.attemptsRemaining === 1
        ? 'That code is incorrect. One attempt left before you need a new one.'
        : `That code is incorrect. ${error.attemptsRemaining} attempts left.`;
    case 'account_suspended':
      return 'This account has been suspended. Contact the maintainer.';
  }
}

export function describeOnboardingError(error: OnboardingError): string {
  switch (error.kind) {
    case 'user_not_found':
      return 'Your session has expired. Sign in again.';
    case 'display_name_empty':
      return 'Enter the name you want other students to see.';
    case 'display_name_too_long':
      return 'That name is too long. Keep it under 60 characters.';
    case 'grad_year_implausible':
      return 'Enter the year you expect to graduate.';
  }
}
