import type { CampusEmail } from '../../domain/campus-email';
import type { User, UserId } from '../../domain/user';

/**
 * Split by direction so a use case that only reads cannot accidentally write,
 * and so its test needs a fake with two methods rather than six.
 */

export interface UserReader {
  byId(id: UserId): Promise<User | null>;
  byEmail(email: CampusEmail): Promise<User | null>;
}

export interface UserWriter {
  save(user: User): Promise<void>;
}

/** Admin-facing reads, kept separate because ordinary flows never need them. */
export interface UserDirectory {
  listPendingApproval(): Promise<readonly User[]>;
}

export type UserRepository = UserReader & UserWriter & UserDirectory;
