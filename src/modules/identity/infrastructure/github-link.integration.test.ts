import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDatabase, testDatabase, truncate } from '@/shared/testing/database';
import type { CampusEmail } from '../domain/campus-email';
import { linkStateExpiryFrom } from '../domain/github-link';
import type { UserId } from '../domain/user';
import { makeUser } from '../testing/fixtures';
import { DrizzleOAuthStateStore } from './drizzle-oauth-state-store';
import { DrizzleUserRepository } from './drizzle-user-repository';
import { AesGcmTokenCipher, NodePkceGenerator } from './node-crypto';

const TABLES = ['identity.oauth_states', 'identity.sessions', 'identity.users'];
const CREATED = new Date('2026-08-01T00:00:00.000Z');

beforeEach(async () => {
  await truncate(TABLES);
});

afterAll(async () => {
  await closeTestDatabase();
});

async function seedUser(id: string): Promise<UserId> {
  const userId = id as UserId;
  await new DrizzleUserRepository(testDatabase()).save(
    makeUser({ id: userId, email: `${id}@college.ac.in` as CampusEmail }),
  );
  return userId;
}

function state(
  userId: UserId,
  overrides: Partial<{ state: string; consumedAt: Date | null }> = {},
) {
  return {
    state: overrides.state ?? 'state-1',
    userId,
    codeVerifier: 'verifier-1',
    createdAt: CREATED,
    expiresAt: linkStateExpiryFrom(CREATED),
    consumedAt: overrides.consumedAt ?? null,
  };
}

describe('DrizzleOAuthStateStore', () => {
  it('round-trips a saved state', async () => {
    const store = new DrizzleOAuthStateStore(testDatabase());
    const userId = await seedUser('u1');

    await store.save(state(userId));

    expect(await store.byState('state-1')).toEqual(state(userId));
  });

  it('returns null for an unknown state', async () => {
    const store = new DrizzleOAuthStateStore(testDatabase());
    expect(await store.byState('nope')).toBeNull();
  });

  it('records consumption on a second save', async () => {
    const store = new DrizzleOAuthStateStore(testDatabase());
    const userId = await seedUser('u1');
    await store.save(state(userId));

    const consumedAt = new Date('2026-08-01T00:01:00.000Z');
    await store.save(state(userId, { consumedAt }));

    expect((await store.byState('state-1'))?.consumedAt).toEqual(consumedAt);
  });

  it('does not let a re-save replace the verifier', async () => {
    // A replayed callback must not be able to substitute its own verifier and
    // redeem the code it holds.
    const store = new DrizzleOAuthStateStore(testDatabase());
    const userId = await seedUser('u1');
    await store.save(state(userId));

    await store.save({ ...state(userId), codeVerifier: 'attacker-verifier' });

    expect((await store.byState('state-1'))?.codeVerifier).toBe('verifier-1');
  });

  it('refuses a state for a user that does not exist', async () => {
    const store = new DrizzleOAuthStateStore(testDatabase());
    await expect(store.save(state('ghost' as UserId))).rejects.toThrow();
  });

  it('drops pending states when the user is deleted', async () => {
    const store = new DrizzleOAuthStateStore(testDatabase());
    const userId = await seedUser('u-cascade');
    await store.save(state(userId));

    await testDatabase().execute(`delete from identity.users where id = 'u-cascade'`);

    expect(await store.byState('state-1')).toBeNull();
  });

  it('sweeps expired states', async () => {
    const store = new DrizzleOAuthStateStore(testDatabase());
    const userId = await seedUser('u1');
    await store.save(state(userId));

    const removed = await store.deleteExpired(new Date('2026-08-02T00:00:00.000Z'));

    expect(removed).toBe(1);
    expect(await store.byState('state-1')).toBeNull();
  });

  it('keeps states that are still live', async () => {
    const store = new DrizzleOAuthStateStore(testDatabase());
    const userId = await seedUser('u1');
    await store.save(state(userId));

    expect(await store.deleteExpired(CREATED)).toBe(0);
  });
});

describe('DrizzleUserRepository — GitHub token storage', () => {
  it('stores the token encrypted and never in the clear', async () => {
    const repo = new DrizzleUserRepository(testDatabase());
    const cipher = new AesGcmTokenCipher(Buffer.alloc(32, 7).toString('base64'));
    const userId = await seedUser('u-token');

    await repo.linkGitHub(
      userId,
      { githubUserId: 4242, login: 'octocat', avatarUrl: null, linkedAt: CREATED },
      cipher.encrypt('gho_secret_value'),
    );

    const rows = await testDatabase().execute(
      `select github_access_token from identity.users where id = 'u-token'`,
    );
    const stored = (rows as unknown as { github_access_token: string }[])[0]?.github_access_token;

    expect(stored).toBeTruthy();
    expect(stored).not.toContain('gho_secret_value');
    expect(cipher.decrypt(stored!)).toBe('gho_secret_value');
  });

  it('clears the token on unlink, so no live credential is left behind', async () => {
    const repo = new DrizzleUserRepository(testDatabase());
    const userId = await seedUser('u-clear');

    await repo.linkGitHub(
      userId,
      { githubUserId: 4343, login: 'octocat', avatarUrl: null, linkedAt: CREATED },
      'encrypted',
    );
    await repo.unlinkGitHub(userId);

    const rows = await testDatabase().execute(
      `select github_access_token from identity.users where id = 'u-clear'`,
    );
    expect(
      (rows as unknown as { github_access_token: string | null }[])[0]?.github_access_token,
    ).toBeNull();
  });
});

describe('AesGcmTokenCipher', () => {
  const key = Buffer.alloc(32, 3).toString('base64');

  it('round-trips a value', () => {
    const cipher = new AesGcmTokenCipher(key);
    expect(cipher.decrypt(cipher.encrypt('gho_abc123'))).toBe('gho_abc123');
  });

  it('produces different ciphertext for the same input', () => {
    // A fresh IV per encryption — otherwise identical tokens would be
    // recognisable as identical in the database.
    const cipher = new AesGcmTokenCipher(key);
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('refuses tampered ciphertext instead of returning garbage', () => {
    const cipher = new AesGcmTokenCipher(key);
    const payload = cipher.encrypt('gho_abc123');
    const parts = payload.split('.');
    const tampered = [parts[0], parts[1], Buffer.from('evil').toString('base64')].join('.');

    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => new AesGcmTokenCipher(Buffer.alloc(16, 1).toString('base64'))).toThrow(/32 bytes/);
  });

  it('cannot decrypt with a different key', () => {
    const written = new AesGcmTokenCipher(key).encrypt('gho_abc123');
    const other = new AesGcmTokenCipher(Buffer.alloc(32, 9).toString('base64'));
    expect(() => other.decrypt(written)).toThrow();
  });
});

describe('NodePkceGenerator', () => {
  it('produces a verifier in the RFC 7636 length range', () => {
    const { verifier } = new NodePkceGenerator().generate();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('produces a challenge that is not the verifier', () => {
    const { verifier, challenge } = new NodePkceGenerator().generate();
    expect(challenge).not.toBe(verifier);
  });

  it('produces a fresh pair each time', () => {
    const generator = new NodePkceGenerator();
    expect(generator.generate().verifier).not.toBe(generator.generate().verifier);
  });

  it('uses url-safe characters, so nothing needs escaping in a query string', () => {
    const { verifier, challenge } = new NodePkceGenerator().generate();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
