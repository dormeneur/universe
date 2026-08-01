import { and, eq, isNull, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Session, SessionId } from '../domain/session';
import type { UserId } from '../domain/user';
import type { SessionStore } from '../application/ports/session-store';
import { sessions } from './schema';

type Row = typeof sessions.$inferSelect;

function toDomain(row: Row): Session {
  return {
    id: row.id as SessionId,
    userId: row.userId as UserId,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

export class DrizzleSessionStore implements SessionStore {
  constructor(private readonly db: PostgresJsDatabase) {}

  async byTokenHash(tokenHash: string): Promise<Session | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async save(session: Session): Promise<void> {
    await this.db
      .insert(sessions)
      .values({
        id: session.id,
        userId: session.userId,
        tokenHash: session.tokenHash,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      })
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          lastSeenAt: session.lastSeenAt,
          expiresAt: session.expiresAt,
          revokedAt: session.revokedAt,
        },
      });
  }

  async revokeAllForUser(userId: UserId, at: Date): Promise<void> {
    // `isNull(revokedAt)` matters: without it a re-revocation would move the
    // timestamp of sessions revoked earlier, losing when they actually ended.
    await this.db
      .update(sessions)
      .set({ revokedAt: at })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async deleteExpired(before: Date): Promise<number> {
    const deleted = await this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, before))
      .returning({ id: sessions.id });

    return deleted.length;
  }
}
