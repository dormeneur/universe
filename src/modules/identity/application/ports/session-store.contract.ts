import { describe, expect, it } from 'vitest';
import type { SessionId } from '../../domain/session';
import type { UserId } from '../../domain/user';
import { makeSession } from '../../testing/fixtures';
import type { SessionStore } from './session-store';

/**
 * A session belongs to a user, and a real database enforces that with a
 * foreign key. The contract therefore takes a setup hook that can bring the
 * referenced users into existence — stating the precondition rather than
 * assuming sessions float free.
 *
 * That assumption is precisely what an earlier version of this suite got
 * wrong: it passed against the in-memory fake, which has no constraints, and
 * failed the moment it met Postgres. Contract tests earn their keep here.
 */
export type SessionStoreHarness = {
  readonly store: SessionStore;
  /** Ensures a user row exists so sessions may reference it. */
  ensureUser(userId: UserId): Promise<void>;
};

export function sessionStoreContract(name: string, make: () => Promise<SessionStoreHarness>): void {
  describe(`SessionStore contract: ${name}`, () => {
    /** Sets up the harness with the given users already present. */
    async function withUsers(...userIds: readonly UserId[]): Promise<SessionStore> {
      const harness = await make();
      for (const id of userIds) await harness.ensureUser(id);
      return harness.store;
    }

    it('returns null for an unknown token hash', async () => {
      const store = await withUsers();
      expect(await store.byTokenHash('nope')).toBeNull();
    });

    it('round-trips a saved session by token hash', async () => {
      const store = await withUsers('u1' as UserId);
      const session = makeSession({ id: 's-round' as SessionId, tokenHash: 'hash-a' });
      await store.save(session);
      expect(await store.byTokenHash('hash-a')).toEqual(session);
    });

    it('overwrites rather than duplicating when saving an existing id', async () => {
      const store = await withUsers('u1' as UserId);
      const session = makeSession({ id: 's-touch' as SessionId, tokenHash: 'hash-b' });
      await store.save(session);

      const later = new Date(session.lastSeenAt.getTime() + 60_000);
      await store.save({ ...session, lastSeenAt: later });

      expect((await store.byTokenHash('hash-b'))?.lastSeenAt).toEqual(later);
    });

    it('revokes every live session for a user', async () => {
      const store = await withUsers('u1' as UserId);
      const at = new Date('2026-07-02T00:00:00.000Z');
      await store.save(
        makeSession({ id: 's1' as SessionId, userId: 'u1' as UserId, tokenHash: 'h1' }),
      );
      await store.save(
        makeSession({ id: 's2' as SessionId, userId: 'u1' as UserId, tokenHash: 'h2' }),
      );

      await store.revokeAllForUser('u1' as UserId, at);

      expect((await store.byTokenHash('h1'))?.revokedAt).toEqual(at);
      expect((await store.byTokenHash('h2'))?.revokedAt).toEqual(at);
    });

    it('leaves other users’ sessions alone when revoking', async () => {
      const store = await withUsers('u1' as UserId, 'u2' as UserId);
      await store.save(
        makeSession({ id: 's1' as SessionId, userId: 'u1' as UserId, tokenHash: 'h1' }),
      );
      await store.save(
        makeSession({ id: 's2' as SessionId, userId: 'u2' as UserId, tokenHash: 'h2' }),
      );

      await store.revokeAllForUser('u1' as UserId, new Date('2026-07-02T00:00:00.000Z'));

      expect((await store.byTokenHash('h2'))?.revokedAt).toBeNull();
    });

    it('does not move the revocation time of an already-revoked session', async () => {
      const store = await withUsers('u1' as UserId);
      const first = new Date('2026-07-02T00:00:00.000Z');
      await store.save(
        makeSession({
          id: 's1' as SessionId,
          userId: 'u1' as UserId,
          tokenHash: 'h1',
          revokedAt: first,
        }),
      );

      await store.revokeAllForUser('u1' as UserId, new Date('2026-07-03T00:00:00.000Z'));

      expect((await store.byTokenHash('h1'))?.revokedAt).toEqual(first);
    });

    it('deletes sessions that expired before the cutoff', async () => {
      const store = await withUsers('u1' as UserId);
      const created = new Date('2026-01-01T00:00:00.000Z');
      await store.save(
        makeSession({
          id: 's-old' as SessionId,
          tokenHash: 'h-old',
          createdAt: created,
          expiresAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      const removed = await store.deleteExpired(new Date('2026-03-01T00:00:00.000Z'));

      expect(removed).toBe(1);
      expect(await store.byTokenHash('h-old')).toBeNull();
    });

    it('keeps sessions that have not yet expired', async () => {
      const store = await withUsers('u1' as UserId);
      await store.save(
        makeSession({
          id: 's-live' as SessionId,
          tokenHash: 'h-live',
          expiresAt: new Date('2026-12-01T00:00:00.000Z'),
        }),
      );

      const removed = await store.deleteExpired(new Date('2026-03-01T00:00:00.000Z'));

      expect(removed).toBe(0);
      expect(await store.byTokenHash('h-live')).not.toBeNull();
    });
  });
}
