import { eq, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { GitHubLinkState } from '../domain/github-link';
import type { UserId } from '../domain/user';
import type { OAuthStateStore } from '../application/ports/oauth-state-store';
import { oauthStates } from './schema';

type Row = typeof oauthStates.$inferSelect;

function toDomain(row: Row): GitHubLinkState {
  return {
    state: row.state,
    userId: row.userId as UserId,
    codeVerifier: row.codeVerifier,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
  };
}

export class DrizzleOAuthStateStore implements OAuthStateStore {
  constructor(private readonly db: PostgresJsDatabase) {}

  async byState(state: string): Promise<GitHubLinkState | null> {
    const [row] = await this.db
      .select()
      .from(oauthStates)
      .where(eq(oauthStates.state, state))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async save(state: GitHubLinkState): Promise<void> {
    await this.db
      .insert(oauthStates)
      .values({
        state: state.state,
        userId: state.userId,
        codeVerifier: state.codeVerifier,
        createdAt: state.createdAt,
        expiresAt: state.expiresAt,
        consumedAt: state.consumedAt,
      })
      .onConflictDoUpdate({
        target: oauthStates.state,
        // Only consumption changes after creation; rewriting the verifier
        // would let a replayed callback substitute its own.
        set: { consumedAt: state.consumedAt },
      });
  }

  async deleteExpired(before: Date): Promise<number> {
    const deleted = await this.db
      .delete(oauthStates)
      .where(lt(oauthStates.expiresAt, before))
      .returning({ state: oauthStates.state });

    return deleted.length;
  }
}
