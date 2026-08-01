import type { CampusEmail } from '../domain/campus-email';
import type { GitHubLinkState } from '../domain/github-link';
import type { Session } from '../domain/session';
import type { GitHubLink, User, UserId } from '../domain/user';
import type { VerificationCode } from '../domain/verification-code';
import { ok, type Result } from '@/shared/result';
import type { Hasher, SecretGenerator } from '../application/ports/crypto';
import type {
  GitHubIdentity,
  GitHubOAuthClient,
  OAuthExchangeFailure,
  PkceGenerator,
  PkcePair,
} from '../application/ports/github-oauth';
import type { Mailer, SignInCodeMessage } from '../application/ports/mailer';
import type { OAuthStateStore } from '../application/ports/oauth-state-store';
import type { RateLimiter, RateLimitVerdict } from '../application/ports/rate-limiter';
import type { SessionStore } from '../application/ports/session-store';
import type { TokenCipher } from '../application/ports/token-cipher';
import type { UserRepository } from '../application/ports/user-repository';
import type { VerificationCodeStore } from '../application/ports/verification-code-store';

export class InMemoryUserRepository implements UserRepository {
  private readonly byIdIndex = new Map<string, User>();
  /** Mirrors the column the domain model deliberately does not carry. */
  private readonly tokens = new Map<string, string>();

  constructor(seed: readonly User[] = []) {
    for (const user of seed) this.byIdIndex.set(user.id, user);
  }

  byId(id: UserId): Promise<User | null> {
    return Promise.resolve(this.byIdIndex.get(id) ?? null);
  }

  byEmail(email: CampusEmail): Promise<User | null> {
    for (const user of this.byIdIndex.values()) {
      if (user.email === email) return Promise.resolve(user);
    }
    return Promise.resolve(null);
  }

  byGitHubUserId(githubUserId: number): Promise<User | null> {
    for (const user of this.byIdIndex.values()) {
      if (user.github?.githubUserId === githubUserId) return Promise.resolve(user);
    }
    return Promise.resolve(null);
  }

  save(user: User): Promise<void> {
    // Profile fields only. The link and token belong to linkGitHub/unlinkGitHub,
    // so a caller holding a pre-link snapshot cannot wipe them by saving it.
    const existing = this.byIdIndex.get(user.id);
    this.byIdIndex.set(user.id, { ...user, github: existing ? existing.github : user.github });
    return Promise.resolve();
  }

  linkGitHub(userId: UserId, link: GitHubLink, encryptedToken: string): Promise<void> {
    const user = this.byIdIndex.get(userId);
    if (!user) return Promise.resolve();
    this.byIdIndex.set(userId, { ...user, github: link });
    this.tokens.set(userId, encryptedToken);
    return Promise.resolve();
  }

  unlinkGitHub(userId: UserId): Promise<void> {
    const user = this.byIdIndex.get(userId);
    if (!user) return Promise.resolve();
    this.byIdIndex.set(userId, { ...user, github: null });
    this.tokens.delete(userId);
    return Promise.resolve();
  }

  /** Test-only window onto the token, which no port exposes. */
  storedToken(userId: UserId): string | undefined {
    return this.tokens.get(userId);
  }

  listPendingApproval(): Promise<readonly User[]> {
    const pending = [...this.byIdIndex.values()]
      .filter((u) => u.status === 'pending_approval')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return Promise.resolve(pending);
  }
}

export class InMemoryVerificationCodeStore implements VerificationCodeStore {
  private readonly codes = new Map<string, VerificationCode>();

  byEmail(email: CampusEmail): Promise<VerificationCode | null> {
    return Promise.resolve(this.codes.get(email) ?? null);
  }

  save(code: VerificationCode): Promise<void> {
    this.codes.set(code.email, code);
    return Promise.resolve();
  }

  delete(email: CampusEmail): Promise<void> {
    this.codes.delete(email);
    return Promise.resolve();
  }
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();

  byTokenHash(tokenHash: string): Promise<Session | null> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) return Promise.resolve(session);
    }
    return Promise.resolve(null);
  }

  save(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
    return Promise.resolve();
  }

  revokeAllForUser(userId: UserId, at: Date): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.userId === userId && session.revokedAt === null) {
        this.sessions.set(id, { ...session, revokedAt: at });
      }
    }
    return Promise.resolve();
  }

  deleteExpired(before: Date): Promise<number> {
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (session.expiresAt.getTime() < before.getTime()) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return Promise.resolve(removed);
  }
}

export class RecordingMailer implements Mailer {
  readonly sent: SignInCodeMessage[] = [];

  sendSignInCode(message: SignInCodeMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  get lastCode(): string | undefined {
    return this.sent.at(-1)?.code;
  }
}

/**
 * A reversible stand-in for a real digest, so a test can see what was hashed.
 * The real implementation is verified separately against the same port
 * contract — this exists to make assertions readable, not to model SHA-256.
 */
export class FakeHasher implements Hasher {
  hash(value: string): string {
    return `hashed(${value})`;
  }

  equals(a: string, b: string): boolean {
    return a === b;
  }
}

export class FakeSecretGenerator implements SecretGenerator {
  private codeIndex = 0;
  private tokenIndex = 0;

  constructor(
    private readonly codes: readonly string[] = ['123456'],
    private readonly tokens: readonly string[] = ['session-token-1'],
  ) {}

  numericCode(length: number): string {
    const next = this.codes[this.codeIndex % this.codes.length] ?? '0'.repeat(length);
    this.codeIndex++;
    return next;
  }

  sessionToken(): string {
    const next = this.tokens[this.tokenIndex % this.tokens.length] ?? 'fallback-token';
    this.tokenIndex++;
    return next;
  }
}

/** Counts against real limits, so rate-limit behaviour can be tested. */
export class CountingRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  consume(key: string, limit: number, windowMs: number): Promise<RateLimitVerdict> {
    const used = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, used);

    return Promise.resolve(
      used > limit
        ? { allowed: false, retryAfterMs: windowMs }
        : { allowed: true, remaining: limit - used },
    );
  }
}

/** For tests where rate limiting is not the subject. */
export class PermissiveRateLimiter implements RateLimiter {
  consume(_key: string, limit: number): Promise<RateLimitVerdict> {
    return Promise.resolve({ allowed: true, remaining: limit });
  }
}

export class InMemoryOAuthStateStore implements OAuthStateStore {
  private readonly states = new Map<string, GitHubLinkState>();

  byState(state: string): Promise<GitHubLinkState | null> {
    return Promise.resolve(this.states.get(state) ?? null);
  }

  save(state: GitHubLinkState): Promise<void> {
    this.states.set(state.state, state);
    return Promise.resolve();
  }

  deleteExpired(before: Date): Promise<number> {
    let removed = 0;
    for (const [key, value] of this.states) {
      if (value.expiresAt.getTime() < before.getTime()) {
        this.states.delete(key);
        removed++;
      }
    }
    return Promise.resolve(removed);
  }
}

/** Reversible stand-in, so tests can see what was encrypted. */
export class FakeTokenCipher implements TokenCipher {
  encrypt(plaintext: string): string {
    return `enc(${plaintext})`;
  }

  decrypt(payload: string): string {
    return payload.replace(/^enc\(/, '').replace(/\)$/, '');
  }
}

export class FakePkceGenerator implements PkceGenerator {
  constructor(private readonly pair: PkcePair = { verifier: 'v-1', challenge: 'c-1' }) {}

  generate(): PkcePair {
    return this.pair;
  }
}

/**
 * A scriptable GitHub. Records what it was asked so a test can assert the
 * verifier travelled with the exchange — without that, PKCE would be
 * decorative.
 */
export class FakeGitHubOAuthClient implements GitHubOAuthClient {
  readonly authorizeCalls: { state: string; codeChallenge: string }[] = [];
  readonly exchangeCalls: { code: string; codeVerifier: string }[] = [];

  constructor(
    private readonly outcome: Result<GitHubIdentity, OAuthExchangeFailure> = ok({
      githubUserId: 4242,
      login: 'octocat',
      avatarUrl: 'https://example.test/octocat.png',
      accessToken: 'gho_secret',
    }),
  ) {}

  authorizeUrl(params: { state: string; codeChallenge: string }): string {
    this.authorizeCalls.push(params);
    return `https://github.test/login/oauth/authorize?state=${params.state}&code_challenge=${params.codeChallenge}`;
  }

  exchangeCode(params: {
    code: string;
    codeVerifier: string;
  }): Promise<Result<GitHubIdentity, OAuthExchangeFailure>> {
    this.exchangeCalls.push(params);
    return Promise.resolve(this.outcome);
  }
}
