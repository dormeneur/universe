import { err, ok, type Result } from '@/shared/result';
import type { Brand } from '@/shared/id';

/**
 * A campus email address, normalized and shape-checked.
 *
 * Normalization matters more than it looks: the same person typing
 * "  Aditya.Bharti@College.AC.IN " and "aditya.bharti@college.ac.in" must land
 * on one account, or they will sign up twice and wonder where their projects
 * went. Normalizing at the boundary means the rest of the system can compare
 * addresses with `===`.
 */
export type CampusEmail = Brand<string, 'CampusEmail'>;

export type EmailError =
  | { readonly kind: 'email_empty' }
  | { readonly kind: 'email_malformed' }
  | { readonly kind: 'email_too_long' };

/** RFC-permitted addresses are wilder than this; institutional ones are not. */
const SHAPE =
  /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

const MAX_LENGTH = 254;

export function parseCampusEmail(raw: string): Result<CampusEmail, EmailError> {
  const normalized = raw.trim().toLowerCase();

  if (normalized.length === 0) return err({ kind: 'email_empty' });
  if (normalized.length > MAX_LENGTH) return err({ kind: 'email_too_long' });
  if (!SHAPE.test(normalized)) return err({ kind: 'email_malformed' });

  return ok(normalized as CampusEmail);
}

/** Everything after the `@`. Safe because the address already parsed. */
export function emailDomain(email: CampusEmail): string {
  const at = email.lastIndexOf('@');
  return email.slice(at + 1);
}

/**
 * Masked form for anything a third party might see — the admin approval queue,
 * a log line, an error message. Enough to recognize your own address, not
 * enough to harvest someone else's.
 */
export function maskEmail(email: CampusEmail): string {
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? ''}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}
