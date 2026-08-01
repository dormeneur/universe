import type { DomainEvent } from '@/shared/events';
import type { UserId } from './user';
import type { UserStatus } from './user';

/**
 * Events other modules may subscribe to. Names are namespaced by this module,
 * and these payload types are re-exported from the module's index.ts — nobody
 * outside reaches in for them.
 */

export type UserRegisteredEvent = DomainEvent & {
  readonly type: 'identity.user_registered';
  readonly userId: UserId;
  readonly status: UserStatus;
};

export type UserSignedInEvent = DomainEvent & {
  readonly type: 'identity.user_signed_in';
  readonly userId: UserId;
};

export type UserApprovedEvent = DomainEvent & {
  readonly type: 'identity.user_approved';
  readonly userId: UserId;
};

export type IdentityEvent = UserRegisteredEvent | UserSignedInEvent | UserApprovedEvent;

export function userRegistered(
  userId: UserId,
  status: UserStatus,
  occurredAt: Date,
): UserRegisteredEvent {
  return { type: 'identity.user_registered', userId, status, occurredAt };
}

export function userSignedIn(userId: UserId, occurredAt: Date): UserSignedInEvent {
  return { type: 'identity.user_signed_in', userId, occurredAt };
}

export function userApproved(userId: UserId, occurredAt: Date): UserApprovedEvent {
  return { type: 'identity.user_approved', userId, occurredAt };
}
