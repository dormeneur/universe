import type { Brand } from '@/shared/id';
import type { CampusEmail } from './campus-email';

export type UserId = Brand<string, 'UserId'>;

/**
 * `pending_approval` is the entry state for an address whose domain is not on
 * the allowlist. `suspended` is a moderation outcome and revokes every session.
 */
export type UserStatus = 'pending_approval' | 'active' | 'suspended';

/**
 * `alumni` is derived from the graduation year rather than set by hand, so it
 * cannot drift out of date. Admins are appointed manually.
 */
export type Role = 'student' | 'alumni' | 'admin';

/**
 * A linked GitHub account.
 *
 * `githubUserId` is GitHub's stable numeric ID and is what uniqueness is keyed
 * on. `login` is the current handle and can be renamed at any time — treating
 * it as an identifier means a rename silently orphans the link, or worse,
 * lets someone claim a freed-up handle and inherit the association.
 *
 * The OAuth token deliberately does not live here: the domain has no business
 * holding a secret, and keeping it out means it cannot leak through a
 * serialized user object.
 */
export type GitHubLink = {
  readonly githubUserId: number;
  readonly login: string;
  readonly avatarUrl: string | null;
  readonly linkedAt: Date;
};

export type User = {
  readonly id: UserId;
  readonly email: CampusEmail;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly role: Role;
  /**
   * Null until onboarding is finished.
   *
   * The sign-in flow is identical for new and returning users — email, code,
   * done — because branching on "does this account exist" before the code is
   * entered would leak campus membership to anyone with an address list. A new
   * user is therefore created the moment their code checks out, before they
   * have told us anything about themselves, and is asked for the details
   * afterwards while already authenticated. An abandoned onboarding leaves a
   * real account they can return to, not a dead half-registration.
   */
  readonly gradYear: number | null;
  readonly github: GitHubLink | null;
  readonly createdAt: Date;
};

/** Whether the user has finished onboarding and can be shown the full product. */
export function isProfileComplete(user: Pick<User, 'gradYear'>): boolean {
  return user.gradYear !== null;
}

/**
 * Graduation is treated as 30 June of the declared year — after the academic
 * year ends but before the next intake arrives. Deriving the role from a date
 * rather than storing it means nobody has to remember to run a migration in
 * June, and a user who mistyped their year can fix it and see the right role
 * immediately.
 */
export function deriveRole(user: Pick<User, 'gradYear' | 'role'>, now: Date): Role {
  if (user.role === 'admin') return 'admin';
  // Nobody can have graduated in a year we do not know.
  if (user.gradYear === null) return 'student';
  const graduationInstant = Date.UTC(user.gradYear, 5, 30, 23, 59, 59, 999);
  return now.getTime() > graduationInstant ? 'alumni' : 'student';
}

export function isAlumni(user: Pick<User, 'gradYear' | 'role'>, now: Date): boolean {
  return deriveRole(user, now) === 'alumni';
}

/**
 * Posting to the gig and tool boards is limited to current students (PRD ID-6).
 * Alumni keep full read access and may still contribute to the Knowledge Hub
 * and Archive — those are governed by their own rules, not this one.
 */
export function canPost(user: User, now: Date): boolean {
  if (user.status !== 'active') return false;
  const role = deriveRole(user, now);
  return role === 'student' || role === 'admin';
}

/** Only a fully active account may attach a GitHub identity to itself. */
export function canLinkGitHub(user: User): boolean {
  return user.status === 'active';
}

/**
 * Read access covers everyone who is not suspended, including
 * `pending_approval`. Letting someone browse while their domain is reviewed is
 * what makes the review queue tolerable rather than a dead end.
 */
export function canRead(user: User): boolean {
  return user.status !== 'suspended';
}

/** A graduation year that could plausibly belong to a current or recent member. */
export function isPlausibleGradYear(year: number, now: Date): boolean {
  const current = now.getUTCFullYear();
  return Number.isInteger(year) && year >= current - 10 && year <= current + 8;
}
