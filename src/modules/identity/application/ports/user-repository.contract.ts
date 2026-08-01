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
      const user = makeUser({ id: 'u-github' as UserId, github: null });
      const link = {
        githubUserId: 4242,
        login: 'octocat',
        avatarUrl: 'https://example.test/a.png',
        linkedAt: new Date('2026-03-01T00:00:00.000Z'),
      };

      await repo.save(user);
      // Established through the linking port, not `save` — see below.
      await repo.linkGitHub(user.id, link, 'encrypted-token');

      expect((await repo.byId(user.id))?.github).toEqual(link);
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

    it('returns null when no account holds that GitHub id', async () => {
      const repo = await make();
      expect(await repo.byGitHubUserId(999_999)).toBeNull();
    });

    it('finds an account by the GitHub id it is linked to', async () => {
      const repo = await make();
      const user = makeUser({ id: 'u-gh' as UserId });
      await repo.save(user);
      await repo.linkGitHub(
        user.id,
        {
          githubUserId: 777,
          login: 'octocat',
          avatarUrl: null,
          linkedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        'encrypted-token',
      );

      expect((await repo.byGitHubUserId(777))?.id).toBe('u-gh');
    });

    it('clears the link on unlink, and the account survives', async () => {
      const repo = await make();
      const user = makeUser({ id: 'u-unlink' as UserId });
      await repo.save(user);
      await repo.linkGitHub(
        user.id,
        {
          githubUserId: 888,
          login: 'octocat',
          avatarUrl: null,
          linkedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        'encrypted-token',
      );

      await repo.unlinkGitHub(user.id);

      expect((await repo.byId(user.id))?.github).toBeNull();
      expect(await repo.byGitHubUserId(888)).toBeNull();
      // Unlinking must never remove the account itself (PRD ID-13).
      expect(await repo.byId(user.id)).not.toBeNull();
    });

    it('allows relinking after an unlink', async () => {
      const repo = await make();
      const user = makeUser({ id: 'u-relink' as UserId });
      const link = {
        githubUserId: 555,
        login: 'octocat',
        avatarUrl: null,
        linkedAt: new Date('2026-08-01T00:00:00.000Z'),
      };
      await repo.save(user);
      await repo.linkGitHub(user.id, link, 'token-1');
      await repo.unlinkGitHub(user.id);
      await repo.linkGitHub(user.id, link, 'token-2');

      expect((await repo.byId(user.id))?.github?.githubUserId).toBe(555);
    });

    it('does not clear an existing link when a stale profile is saved', async () => {
      // `save` owns profile fields only. Without this, any code path holding a
      // User loaded before linking — an onboarding edit, say — would write
      // github: null straight over a live link and silently drop the token.
      const repo = await make();
      const user = makeUser({ id: 'u-keep' as UserId, github: null });
      await repo.save(user);
      await repo.linkGitHub(
        user.id,
        {
          githubUserId: 666,
          login: 'octocat',
          avatarUrl: null,
          linkedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        'encrypted-token',
      );

      // Deliberately the pre-link snapshot, with github still null.
      await repo.save({ ...user, displayName: 'Renamed' });

      const after = await repo.byId(user.id);
      expect(after?.displayName).toBe('Renamed');
      expect(after?.github?.githubUserId).toBe(666);
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
