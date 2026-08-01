import { asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { CampusEmail } from '../domain/campus-email';
import type { GitHubLink, User, UserId } from '../domain/user';
import type { UserRepository } from '../application/ports/user-repository';
import { users } from './schema';

type Row = typeof users.$inferSelect;

/**
 * The GitHub columns are nullable as a group: either all four are set or none
 * are. Reconstructing the link object here keeps that shape detail in the
 * adapter rather than leaking a four-nullable-fields model into the domain.
 */
function toGitHubLink(row: Row): GitHubLink | null {
  if (row.githubUserId === null || row.githubLogin === null || row.githubLinkedAt === null) {
    return null;
  }
  return {
    githubUserId: row.githubUserId,
    login: row.githubLogin,
    avatarUrl: row.githubAvatarUrl,
    linkedAt: row.githubLinkedAt,
  };
}

function toDomain(row: Row): User {
  return {
    id: row.id as UserId,
    email: row.email as CampusEmail,
    displayName: row.displayName,
    status: row.status,
    role: row.role,
    gradYear: row.gradYear,
    github: toGitHubLink(row),
    createdAt: row.createdAt,
  };
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: PostgresJsDatabase) {}

  async byId(id: UserId): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async byEmail(email: CampusEmail): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? toDomain(row) : null;
  }

  async save(user: User): Promise<void> {
    const values = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      role: user.role,
      gradYear: user.gradYear,
      githubUserId: user.github?.githubUserId ?? null,
      githubLogin: user.github?.login ?? null,
      githubAvatarUrl: user.github?.avatarUrl ?? null,
      githubLinkedAt: user.github?.linkedAt ?? null,
      createdAt: user.createdAt,
    };

    // Upsert rather than insert-or-update: `save` is the port's only write, so
    // callers do not have to know whether the row already exists.
    //
    // githubAccessToken is deliberately absent from the update set — it is
    // written only by the linking flow, so an ordinary profile save cannot
    // clobber it with a null.
    await this.db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: values.email,
          displayName: values.displayName,
          status: values.status,
          role: values.role,
          gradYear: values.gradYear,
          githubUserId: values.githubUserId,
          githubLogin: values.githubLogin,
          githubAvatarUrl: values.githubAvatarUrl,
          githubLinkedAt: values.githubLinkedAt,
        },
      });
  }

  async listPendingApproval(): Promise<readonly User[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.status, 'pending_approval'))
      // Oldest first, so nobody waits indefinitely behind newer arrivals.
      .orderBy(asc(users.createdAt));

    return rows.map(toDomain);
  }
}
