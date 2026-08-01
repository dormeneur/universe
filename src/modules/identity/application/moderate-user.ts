import type { Clock } from '@/shared/clock';
import type { EventPublisher } from '@/shared/events';
import { err, ok, type Result } from '@/shared/result';
import { userApproved } from '../domain/events';
import type { User, UserId } from '../domain/user';
import type { SessionStore } from './ports/session-store';
import type { UserDirectory, UserReader, UserWriter } from './ports/user-repository';

export type ModerationError =
  | { readonly kind: 'user_not_found' }
  | { readonly kind: 'actor_not_admin' }
  | { readonly kind: 'not_awaiting_approval' };

/** Admits a user whose email domain was not on the allowlist (PRD ID-2). */
export function makeApproveUser(deps: {
  users: UserReader & UserWriter;
  events: EventPublisher;
  clock: Clock;
}) {
  return async function approveUser(input: {
    userId: UserId;
    actorId: UserId;
  }): Promise<Result<User, ModerationError>> {
    const actor = await deps.users.byId(input.actorId);
    if (!actor || actor.role !== 'admin') return err({ kind: 'actor_not_admin' });

    const user = await deps.users.byId(input.userId);
    if (!user) return err({ kind: 'user_not_found' });
    if (user.status !== 'pending_approval') return err({ kind: 'not_awaiting_approval' });

    const approved: User = { ...user, status: 'active' };
    await deps.users.save(approved);
    await deps.events.publish(userApproved(approved.id, deps.clock.now()));
    return ok(approved);
  };
}

/**
 * Suspension revokes every session as part of the same operation.
 *
 * Leaving that to a separate call would mean a suspended user keeps browsing
 * until someone remembers to run it — the two belong together.
 */
export function makeSuspendUser(deps: {
  users: UserReader & UserWriter;
  sessions: SessionStore;
  clock: Clock;
}) {
  return async function suspendUser(input: {
    userId: UserId;
    actorId: UserId;
  }): Promise<Result<User, ModerationError>> {
    const actor = await deps.users.byId(input.actorId);
    if (!actor || actor.role !== 'admin') return err({ kind: 'actor_not_admin' });

    const user = await deps.users.byId(input.userId);
    if (!user) return err({ kind: 'user_not_found' });

    const now = deps.clock.now();
    const suspended: User = { ...user, status: 'suspended' };
    await deps.users.save(suspended);
    await deps.sessions.revokeAllForUser(user.id, now);
    return ok(suspended);
  };
}

export function makeListPendingApproval(deps: { users: UserDirectory }) {
  return function listPendingApproval(): Promise<readonly User[]> {
    return deps.users.listPendingApproval();
  };
}
