import type { Clock } from '@/shared/clock';
import type { EventPublisher } from '@/shared/events';
import type { IdGenerator } from '@/shared/id';
import { err, ok, type Result } from '@/shared/result';
import { classifyEmail } from '../domain/allowlist';
import { parseCampusEmail, type CampusEmail, type EmailError } from '../domain/campus-email';
import { userSignedIn, userRegistered } from '../domain/events';
import { absoluteExpiryFrom, type SessionId } from '../domain/session';
import type { User, UserId } from '../domain/user';
import {
  checkUsable,
  isWellFormedCode,
  markConsumed,
  registerFailedAttempt,
  attemptsRemaining,
  type CodeAttemptError,
} from '../domain/verification-code';
import type { Hasher, SecretGenerator } from './ports/crypto';
import type { SessionStore } from './ports/session-store';
import type { UserReader, UserWriter } from './ports/user-repository';
import type { VerificationCodeStore } from './ports/verification-code-store';

export type ConfirmCodeInput = {
  readonly email: string;
  readonly code: string;
};

export type ConfirmCodeError =
  | EmailError
  | CodeAttemptError
  | { readonly kind: 'code_malformed' }
  | { readonly kind: 'account_suspended' };

export type ConfirmCodeSuccess = {
  readonly user: User;
  /** The raw session token. Returned once, to be set as a cookie, never stored. */
  readonly token: string;
  readonly expiresAt: Date;
  readonly isNewAccount: boolean;
};

/**
 * Verifies a code and establishes a session, registering the account if this
 * is the address's first successful sign-in.
 *
 * Creating the account here rather than at request time is what lets the flow
 * be identical for new and returning users: nothing is written until someone
 * proves they control the address, so the request endpoint has nothing to leak.
 */
export function makeConfirmSignInCode(deps: {
  users: UserReader & UserWriter;
  codes: VerificationCodeStore;
  sessions: SessionStore;
  hasher: Hasher;
  secrets: SecretGenerator;
  ids: IdGenerator;
  events: EventPublisher;
  clock: Clock;
  allowlist: readonly string[];
}) {
  return async function confirmSignInCode(
    input: ConfirmCodeInput,
  ): Promise<Result<ConfirmCodeSuccess, ConfirmCodeError>> {
    const parsedEmail = parseCampusEmail(input.email);
    if (!parsedEmail.ok) return parsedEmail;
    const email = parsedEmail.value;

    const submitted = input.code.trim();
    if (!isWellFormedCode(submitted)) return err({ kind: 'code_malformed' });

    const now = deps.clock.now();

    const stored = await deps.codes.byEmail(email);
    if (!stored) return err({ kind: 'code_not_found' });

    // Usability is settled before any comparison, so an expired or exhausted
    // code costs the same whether the digits were right or wrong.
    const usable = checkUsable(stored, now);
    if (!usable.ok) return usable;

    if (!deps.hasher.equals(deps.hasher.hash(submitted), stored.codeHash)) {
      const failed = registerFailedAttempt(stored);
      await deps.codes.save(failed);
      return err({ kind: 'code_mismatch', attemptsRemaining: attemptsRemaining(failed) });
    }

    await deps.codes.save(markConsumed(stored, now));

    const existing = await deps.users.byEmail(email);
    if (existing?.status === 'suspended') return err({ kind: 'account_suspended' });

    const user = existing ?? (await registerUser(email, now));
    if (!existing) await deps.users.save(user);

    const token = deps.secrets.sessionToken();
    await deps.sessions.save({
      id: deps.ids.next() as SessionId,
      userId: user.id,
      tokenHash: deps.hasher.hash(token),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: absoluteExpiryFrom(now),
      revokedAt: null,
    });

    await deps.events.publish(
      existing ? userSignedIn(user.id, now) : userRegistered(user.id, user.status, now),
    );

    return ok({
      user,
      token,
      expiresAt: absoluteExpiryFrom(now),
      isNewAccount: existing === null,
    });
  };

  function registerUser(email: CampusEmail, now: Date): Promise<User> {
    // An unrecognized domain is reviewed, not rejected — institutions issue
    // addresses on subdomains nobody anticipated (PRD ID-2).
    const verdict = classifyEmail(email, deps.allowlist);

    return Promise.resolve({
      id: deps.ids.next() as UserId,
      email,
      // A placeholder drawn from the address, replaced during onboarding. It
      // exists so the account is never nameless in an admin queue or a log.
      displayName: defaultDisplayName(email),
      status: verdict === 'allowed' ? 'active' : 'pending_approval',
      role: 'student',
      gradYear: null,
      github: null,
      createdAt: now,
    });
  }
}

/** `aditya.bharti@college.ac.in` → `Aditya Bharti`. */
export function defaultDisplayName(email: CampusEmail): string {
  const local = email.slice(0, email.lastIndexOf('@'));
  const words = local
    .split(/[._-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

  return words.length > 0 ? words.join(' ') : local;
}
