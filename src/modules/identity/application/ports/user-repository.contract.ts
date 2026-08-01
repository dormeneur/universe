import { describe, expect, it } from 'vitest';
import type { CampusEmail } from '../../domain/campus-email';
import type { UserId } from '../../domain/user';
import { makeUser } from '../../testing/fixtures';
import type { UserRepository } from './user-repository';

/**
 * One suite, run against both the in-memory fake and the Drizzle repository.
 *
 * This is what makes the fake trustworthy: without it the two drift, the fast
 * tests stay green, and production breaks on behaviour the fake never modelled.
 */
export function userRepositoryContract(name: string, make: () => Promise<UserRepository>): void {
  describe(`UserRepository contract: ${name}`, () => {
    it('returns null for an unknown id', async () => {
      const repo = await make();
      expect(await repo.byId('missing' as UserId)).toBeNull();
    });

    it('returns null for an unknown email', async () => {
      const repo = await make();
      expect(await repo.byEmail('nobody@college.ac.in' as CampusEmail)).toBeNull();
    });

    it('round-trips a saved user by id', async () => {
      const repo = await make();
      const user = makeUser({ id: 'u-round' as UserId });
      await repo.save(user);
      expect(await repo.byId(user.id)).toEqual(user);
    });

    it('finds a saved user by email', async () => {
      const repo = await make();
      const user = makeUser({
        id: 'u-email' as UserId,
        email: 'finder@college.ac.in' as CampusEmail,
      });
      await repo.save(user);
      expect(await repo.byEmail(user.email)).toEqual(user);
    });

    it('overwrites rather than duplicating when saving an existing id', async () => {
      const repo = await make();
      const user = makeUser({ id: 'u-update' as UserId, displayName: 'Before' });
      await repo.save(user);
      await repo.save({ ...user, displayName: 'After' });

      const found = await repo.byId(user.id);
      expect(found?.displayName).toBe('After');
    });

    it('preserves a null graduation year through a round trip', async () => {
      const repo = await make();
      const user = makeUser({ id: 'u-null-year' as UserId, gradYear: null });
      await repo.save(user);
      expect((await repo.byId(user.id))?.gradYear).toBeNull();
    });

    it('preserves a linked GitHub account through a round trip', async () => {
      const repo = await make();
      const user = makeUser({
        id: 'u-github' as UserId,
        github: {
          githubUserId: 4242,
          login: 'octocat',
          avatarUrl: 'https://example.test/a.png',
          linkedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      });
      await repo.save(user);
      expect((await repo.byId(user.id))?.github).toEqual(user.github);
    });

    it('lists only users awaiting approval', async () => {
      const repo = await make();
      await repo.save(
        makeUser({
          id: 'u-active' as UserId,
          email: 'a@college.ac.in' as CampusEmail,
          status: 'active',
        }),
      );
      await repo.save(
        makeUser({
          id: 'u-pending' as UserId,
          email: 'b@college.ac.in' as CampusEmail,
          status: 'pending_approval',
        }),
      );

      const pending = await repo.listPendingApproval();
      expect(pending.map((u) => u.id)).toEqual(['u-pending']);
    });

    it('lists those awaiting approval oldest first, so nobody is left behind', async () => {
      const repo = await make();
      await repo.save(
        makeUser({
          id: 'u-newer' as UserId,
          email: 'newer@college.ac.in' as CampusEmail,
          status: 'pending_approval',
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
      );
      await repo.save(
        makeUser({
          id: 'u-older' as UserId,
          email: 'older@college.ac.in' as CampusEmail,
          status: 'pending_approval',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );

      const pending = await repo.listPendingApproval();
      expect(pending.map((u) => u.id)).toEqual(['u-older', 'u-newer']);
    });
  });
}
