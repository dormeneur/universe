/**
 * The identity module's public API.
 *
 * Nothing outside this module may import past this file. Keeping it small is
 * the point — everything exported here becomes something that cannot be
 * changed freely, so each addition should be a deliberate decision rather
 * than a convenience.
 */

export type { CampusEmail } from './domain/campus-email';
export { maskEmail } from './domain/campus-email';
export type { GitHubLink, Role, User, UserId, UserStatus } from './domain/user';
export { canPost, canRead, deriveRole, isAlumni, isProfileComplete } from './domain/user';

export type {
  IdentityEvent,
  UserApprovedEvent,
  UserRegisteredEvent,
  UserSignedInEvent,
} from './domain/events';

export { SESSION_ABSOLUTE_TTL_MS } from './domain/session';
export { CODE_LENGTH } from './domain/verification-code';
