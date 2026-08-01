import type { CampusEmail } from '../domain/campus-email';
import type { GitHubLink, User, UserId } from '../domain/user';
import type { Session, SessionId } from '../domain/session';
import type { VerificationCode } from '../domain/verification-code';

/**
 * Fixture builders with sensible defaults, so a test states only what it cares
 * about. A test that sets twelve fields to assert one behaviour hides its own
 * point.
 */

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1' as UserId,
    email: 'student@college.ac.in' as CampusEmail,
    displayName: 'Test Student',
    status: 'active',
    role: 'student',
    gradYear: 2028,
    github: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeGitHubLink(overrides: Partial<GitHubLink> = {}): GitHubLink {
  return {
    githubUserId: 12345,
    login: 'teststudent',
    avatarUrl: null,
    linkedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  const createdAt = overrides.createdAt ?? new Date('2026-07-01T00:00:00.000Z');
  return {
    id: 's1' as SessionId,
    userId: 'u1' as UserId,
    tokenHash: 'hash-of-token',
    createdAt,
    lastSeenAt: createdAt,
    expiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    ...overrides,
  };
}

export function makeVerificationCode(overrides: Partial<VerificationCode> = {}): VerificationCode {
  const issuedAt = overrides.issuedAt ?? new Date('2026-07-01T00:00:00.000Z');
  return {
    email: 'student@college.ac.in' as CampusEmail,
    codeHash: 'hash-of-123456',
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + 10 * 60 * 1000),
    attempts: 0,
    consumedAt: null,
    ...overrides,
  };
}
