import { index, integer, pgSchema, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { Role, UserStatus } from '../domain/user';

/**
 * The `identity` module owns this Postgres schema (ADR 0002). No other module
 * queries these tables; they go through this module's public API.
 */
export const identitySchema = pgSchema('identity');

export const users = identitySchema.table(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').$type<UserStatus>().notNull(),
    role: text('role').$type<Role>().notNull(),

    /** Null until onboarding is finished — see the note on User.gradYear. */
    gradYear: integer('grad_year'),

    /**
     * GitHub's stable numeric ID, not the renameable login. Uniqueness is
     * keyed on this so a handle rename cannot orphan the link, and a freed-up
     * handle cannot be claimed to inherit somebody else's association.
     */
    githubUserId: integer('github_user_id'),
    githubLogin: text('github_login'),
    githubAvatarUrl: text('github_avatar_url'),
    githubLinkedAt: timestamp('github_linked_at', { withTimezone: true }),

    /**
     * Encrypted at rest and never sent to the client (PRD ID-12). It lives on
     * the row rather than in the domain model precisely so it cannot leak
     * through a serialized User.
     */
    githubAccessToken: text('github_access_token'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // Sign-in looks up by address on every attempt, and the account must be
    // unique per address — one index serves both.
    uniqueIndex('users_email_unique').on(table.email),
    // Enforces one Uni-verse account per GitHub account (PRD ID-10). Postgres
    // treats NULLs as distinct, so unlinked users do not collide.
    uniqueIndex('users_github_user_id_unique').on(table.githubUserId),
    // The admin approval queue filters on status and orders by age.
    index('users_status_created_at_idx').on(table.status, table.createdAt),
  ],
);

export const verificationCodes = identitySchema.table('verification_codes', {
  /**
   * Keyed by address rather than a surrogate id: at most one live code per
   * address, so a rate-limit window yields one guessable secret, not several.
   */
  email: text('email').primaryKey(),
  codeHash: text('code_hash').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
});

export const sessions = identitySchema.table(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Only the hash. The token itself exists solely in the user's cookie. */
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    // Every authenticated request resolves a session by token hash.
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    // Bulk revocation on sign-out-everywhere and on suspension.
    index('sessions_user_id_idx').on(table.userId),
    // The expired-session sweep.
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const rateLimitBuckets = identitySchema.table('rate_limit_buckets', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
});
