import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Clock } from '@/shared/clock';
import type { EventPublisher } from '@/shared/events';
import type { IdGenerator } from '@/shared/id';
import type { Logger } from '@/shared/logger';
import { makeAuthenticate } from './application/authenticate';
import { makeCompleteOnboarding } from './application/complete-onboarding';
import { makeConfirmSignInCode } from './application/confirm-sign-in-code';
import {
  makeApproveUser,
  makeListPendingApproval,
  makeSuspendUser,
} from './application/moderate-user';
import {
  makeCompleteGitHubLink,
  makeStartGitHubLink,
  makeUnlinkGitHub,
} from './application/link-github';
import { makeRequestSignInCode } from './application/request-sign-in-code';
import { makeSignOut, makeSignOutEverywhere } from './application/sign-out';
import { GitHubOAuthHttpClient } from './infrastructure/github-oauth-client';
import { DrizzleOAuthStateStore } from './infrastructure/drizzle-oauth-state-store';
import { DrizzleRateLimiter } from './infrastructure/drizzle-rate-limiter';
import { DrizzleSessionStore } from './infrastructure/drizzle-session-store';
import { DrizzleUserRepository } from './infrastructure/drizzle-user-repository';
import { DrizzleVerificationCodeStore } from './infrastructure/drizzle-verification-code-store';
import { ConsoleMailer, ResendMailer } from './infrastructure/mailer';
import {
  AesGcmTokenCipher,
  NodeHasher,
  NodePkceGenerator,
  NodeSecretGenerator,
} from './infrastructure/node-crypto';
import type { Mailer } from './application/ports/mailer';

export type IdentityModuleConfig = {
  readonly db: PostgresJsDatabase;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly events: EventPublisher;
  readonly logger: Logger;
  readonly allowlist: readonly string[];
  readonly resend: { readonly apiKey: string; readonly from: string } | null;
  /** Whether codes may be logged rather than emailed. See ConsoleMailer. */
  readonly allowConsoleMail: boolean;
  /** Development-only sink for sign-in codes; see ConsoleMailer. */
  readonly devMailSink?: string | undefined;
  /**
   * Null when GitHub OAuth is not configured. Linking is then unavailable and
   * everything else works unchanged, rather than the app failing to start.
   */
  readonly github: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
    readonly tokenEncryptionKey: string;
  } | null;
};

/**
 * Assembles the identity module: the one place its concrete adapters are
 * constructed. Everything above this line depends on interfaces.
 */
export function createIdentityModule(config: IdentityModuleConfig) {
  const users = new DrizzleUserRepository(config.db);
  const sessions = new DrizzleSessionStore(config.db);
  const codes = new DrizzleVerificationCodeStore(config.db);
  const hasher = new NodeHasher();
  const secrets = new NodeSecretGenerator();
  const limiter = new DrizzleRateLimiter(config.db, config.clock);

  // Falling back to the console mailer silently would log sign-in codes
  // instead of sending them; ConsoleMailer refuses unless that is explicitly
  // permitted, so a missing key fails loudly at startup instead.
  const mailer: Mailer = config.resend
    ? new ResendMailer(config.resend, config.logger)
    : new ConsoleMailer(config.logger, config.allowConsoleMail, config.devMailSink);

  // Present only when GitHub is configured. Callers check `githubLinking` for
  // null rather than the module throwing, so an unconfigured deployment is a
  // missing feature and not a broken app.
  const githubLinking = config.github
    ? (() => {
        const oauth = new GitHubOAuthHttpClient(
          {
            clientId: config.github.clientId,
            clientSecret: config.github.clientSecret,
            redirectUri: config.github.redirectUri,
          },
          config.logger,
        );
        const states = new DrizzleOAuthStateStore(config.db);
        const cipher = new AesGcmTokenCipher(config.github.tokenEncryptionKey);

        return {
          start: makeStartGitHubLink({
            users,
            states,
            oauth,
            pkce: new NodePkceGenerator(),
            ids: config.ids,
            clock: config.clock,
          }),
          complete: makeCompleteGitHubLink({ users, states, oauth, cipher, clock: config.clock }),
          unlink: makeUnlinkGitHub({ users }),
        };
      })()
    : null;

  return {
    githubLinking,
    requestSignInCode: makeRequestSignInCode({
      codes,
      mailer,
      hasher,
      secrets,
      limiter,
      clock: config.clock,
    }),
    confirmSignInCode: makeConfirmSignInCode({
      users,
      codes,
      sessions,
      hasher,
      secrets,
      ids: config.ids,
      events: config.events,
      clock: config.clock,
      allowlist: config.allowlist,
    }),
    authenticate: makeAuthenticate({ users, sessions, hasher, clock: config.clock }),
    signOut: makeSignOut({ sessions, hasher, clock: config.clock }),
    signOutEverywhere: makeSignOutEverywhere({ sessions, clock: config.clock }),
    completeOnboarding: makeCompleteOnboarding({ users, clock: config.clock }),
    approveUser: makeApproveUser({ users, events: config.events, clock: config.clock }),
    suspendUser: makeSuspendUser({ users, sessions, clock: config.clock }),
    listPendingApproval: makeListPendingApproval({ users }),
  } as const;
}

export type IdentityModule = ReturnType<typeof createIdentityModule>;
