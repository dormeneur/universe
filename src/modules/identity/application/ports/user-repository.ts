import type { CampusEmail } from '../../domain/campus-email';
import type { GitHubLink, User, UserId } from '../../domain/user';

/**
 * Split by direction so a use case that only reads cannot accidentally write,
 * and so its test needs a fake with two methods rather than six.
 */

export interface UserReader {
  byId(id: UserId): Promise<User | null>;
  byEmail(email: CampusEmail): Promise<User | null>;
  /** Keyed on GitHub's numeric id, which is stable across handle renames. */
  byGitHubUserId(githubUserId: number): Promise<User | null>;
}

export interface UserWriter {
  save(user: User): Promise<void>;
}

/**
 * Linking is its own port because it writes something `save` deliberately
 * cannot: the encrypted access token.
 *
 * Keeping the token off the `User` domain object means it cannot leak through
 * a serialized user, and keeping it out of `save` means an ordinary profile
 * update can never clobber it.
 */
export interface GitHubLinkWriter {
  linkGitHub(userId: UserId, link: GitHubLink, encryptedToken: string): Promise<void>;
  unlinkGitHub(userId: UserId): Promise<void>;
}

/** Admin-facing reads, kept separate because ordinary flows never need them. */
export interface UserDirectory {
  listPendingApproval(): Promise<readonly User[]>;
}

export type UserRepository = UserReader & UserWriter & UserDirectory & GitHubLinkWriter;
