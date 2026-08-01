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

  /**
   * Writes profile fields only.
   *
   * The GitHub columns are deliberately absent from the update set: they are
   * owned by linkGitHub/unlinkGitHub. Otherwise any caller holding a User
   * loaded before linking — an onboarding edit, say — would write null over a
   * live link and drop the access token with it.
   *
   * Upsert rather than insert-or-update, so callers need not know whether the
   * row already exists. On insert the GitHub columns are null anyway.
   */
  async save(user: User): Promise<void> {
    const values = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      role: user.role,
      gradYear: user.gradYear,
      createdAt: user.createdAt,
    };

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
        },
      });
  }

  async byGitHubUserId(githubUserId: number): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.githubUserId, githubUserId))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async linkGitHub(userId: UserId, link: GitHubLink, encryptedToken: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        githubUserId: link.githubUserId,
        githubLogin: link.login,
        githubAvatarUrl: link.avatarUrl,
        githubLinkedAt: link.linkedAt,
        githubAccessToken: encryptedToken,
      })
      .where(eq(users.id, userId));
  }

  async unlinkGitHub(userId: UserId): Promise<void> {
    // The token is cleared in the same statement as the link — leaving it
    // behind would mean an "unlinked" account still holds a live credential.
    await this.db
      .update(users)
      .set({
        githubUserId: null,
        githubLogin: null,
        githubAvatarUrl: null,
        githubLinkedAt: null,
        githubAccessToken: null,
      })
      .where(eq(users.id, userId));
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
