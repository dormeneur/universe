import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDatabase, testDatabase, truncate } from '@/shared/testing/database';
import { sessionStoreContract } from '../application/ports/session-store.contract';
import { userRepositoryContract } from '../application/ports/user-repository.contract';
import type { CampusEmail } from '../domain/campus-email';
import type { SessionId } from '../domain/session';
import type { UserId } from '../domain/user';
import { makeSession, makeUser } from '../testing/fixtures';
import { DrizzleSessionStore } from './drizzle-session-store';
import { DrizzleUserRepository } from './drizzle-user-repository';
import { DrizzleVerificationCodeStore } from './drizzle-verification-code-store';

const TABLES = [
  'identity.sessions',
  'identity.users',
  'identity.verification_codes',
  'identity.rate_limit_buckets',
];

beforeEach(async () => {
  await truncate(TABLES);
});

afterAll(async () => {
  await closeTestDatabase();
});

/**
 * The same contract the in-memory fakes satisfy. If these two implementations
 * ever diverge, the fast tests that rely on the fake are lying, and this is
 * where that shows up.
 */
userRepositoryContract('drizzle', () => Promise.resolve(new DrizzleUserRepository(testDatabase())));

sessionStoreContract('drizzle', () =>
  Promise.resolve({
    store: new DrizzleSessionStore(testDatabase()),
    ensureUser: async (userId) => {
      await new DrizzleUserRepository(testDatabase()).save(
        makeUser({ id: userId, email: `${userId}@college.ac.in` as CampusEmail }),
      );
    },
  }),
);

/**
 * Postgres error codes rather than message matching: `23505` is unique
 * violation and `23503` is foreign key violation, and both are stable across
 * versions. Drizzle wraps the driver error, so the cause has to be unwrapped.
 */
async function expectPostgresError(operation: Promise<unknown>, code: string): Promise<void> {
  await expect(operation).rejects.toThrow();
  try {
    await operation;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    expect(cause?.code).toBe(code);
  }
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

describe('DrizzleUserRepository — persistence specifics', () => {
  it('refuses two accounts on the same email address', async () => {
    const repo = new DrizzleUserRepository(testDatabase());
    await repo.save(makeUser({ id: 'u1' as UserId, email: 'dup@college.ac.in' as CampusEmail }));

    await expectPostgresError(
      repo.save(makeUser({ id: 'u2' as UserId, email: 'dup@college.ac.in' as CampusEmail })),
      UNIQUE_VIOLATION,
    );
  });

  it('refuses two accounts linked to the same GitHub account', async () => {
    const repo = new DrizzleUserRepository(testDatabase());
    const link = {
      githubUserId: 999,
      login: 'octocat',
      avatarUrl: null,
      linkedAt: new Date('2026-03-01T00:00:00.000Z'),
    };

    await repo.save(
      makeUser({ id: 'u1' as UserId, email: 'a@college.ac.in' as CampusEmail, github: link }),
    );

    await expectPostgresError(
      repo.save(
        makeUser({ id: 'u2' as UserId, email: 'b@college.ac.in' as CampusEmail, github: link }),
      ),
      UNIQUE_VIOLATION,
    );
  });

  it('allows many unlinked accounts, since nulls do not collide', async () => {
    const repo = new DrizzleUserRepository(testDatabase());
    await repo.save(
      makeUser({ id: 'u1' as UserId, email: 'a@college.ac.in' as CampusEmail, github: null }),
    );
    await repo.save(
      makeUser({ id: 'u2' as UserId, email: 'b@college.ac.in' as CampusEmail, github: null }),
    );

    expect(await repo.byId('u2' as UserId)).not.toBeNull();
  });

  it('round-trips timestamps without losing the timezone', async () => {
    const repo = new DrizzleUserRepository(testDatabase());
    const createdAt = new Date('2026-03-01T09:15:30.000Z');
    await repo.save(makeUser({ id: 'u-tz' as UserId, createdAt }));

    expect((await repo.byId('u-tz' as UserId))?.createdAt.toISOString()).toBe(
      createdAt.toISOString(),
    );
  });
});

describe('DrizzleSessionStore — persistence specifics', () => {
  it('cascades session deletion when the user is removed', async () => {
    const users = new DrizzleUserRepository(testDatabase());
    const sessions = new DrizzleSessionStore(testDatabase());

    await users.save(makeUser({ id: 'u-cascade' as UserId }));
    await sessions.save(
      makeSession({
        id: 's-cascade' as SessionId,
        userId: 'u-cascade' as UserId,
        tokenHash: 'h-cascade',
      }),
    );

    await testDatabase().execute(`delete from identity.users where id = 'u-cascade'`);

    expect(await sessions.byTokenHash('h-cascade')).toBeNull();
  });

  it('refuses a session for a user that does not exist', async () => {
    const sessions = new DrizzleSessionStore(testDatabase());

    await expectPostgresError(
      sessions.save(
        makeSession({ id: 's-orphan' as SessionId, userId: 'ghost' as UserId, tokenHash: 'h' }),
      ),
      FOREIGN_KEY_VIOLATION,
    );
  });
});

describe('DrizzleVerificationCodeStore', () => {
  it('keeps only one live code per address', async () => {
    const store = new DrizzleVerificationCodeStore(testDatabase());
    const email = 'codes@college.ac.in' as CampusEmail;
    const issuedAt = new Date('2026-07-01T00:00:00.000Z');

    await store.save({
      email,
      codeHash: 'first',
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 600_000),
      attempts: 0,
      consumedAt: null,
    });
    await store.save({
      email,
      codeHash: 'second',
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 600_000),
      attempts: 0,
      consumedAt: null,
    });

    expect((await store.byEmail(email))?.codeHash).toBe('second');
  });

  it('persists the attempt count so the limit survives a retry', async () => {
    const store = new DrizzleVerificationCodeStore(testDatabase());
    const email = 'attempts@college.ac.in' as CampusEmail;
    const issuedAt = new Date('2026-07-01T00:00:00.000Z');
    const base = {
      email,
      codeHash: 'h',
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 600_000),
      consumedAt: null,
    };

    await store.save({ ...base, attempts: 0 });
    await store.save({ ...base, attempts: 3 });

    expect((await store.byEmail(email))?.attempts).toBe(3);
  });

  it('deletes a code', async () => {
    const store = new DrizzleVerificationCodeStore(testDatabase());
    const email = 'gone@college.ac.in' as CampusEmail;
    const issuedAt = new Date('2026-07-01T00:00:00.000Z');

    await store.save({
      email,
      codeHash: 'h',
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 600_000),
      attempts: 0,
      consumedAt: null,
    });
    await store.delete(email);

    expect(await store.byEmail(email)).toBeNull();
  });
});
