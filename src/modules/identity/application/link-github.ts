import type { Clock } from '@/shared/clock';
import type { IdGenerator } from '@/shared/id';
import { err, ok, type Result } from '@/shared/result';
import {
  checkLinkStateUsable,
  linkStateExpiryFrom,
  markLinkStateConsumed,
  type GitHubLinkError,
} from '../domain/github-link';
import { canLinkGitHub, type GitHubLink, type User, type UserId } from '../domain/user';
import type { GitHubOAuthClient, PkceGenerator } from './ports/github-oauth';
import type { OAuthStateStore } from './ports/oauth-state-store';
import type { TokenCipher } from './ports/token-cipher';
import type { GitHubLinkWriter, UserReader } from './ports/user-repository';

/**
 * Starts the link: remembers a single-use state bound to this user, and hands
 * back the URL to send them to.
 */
export function makeStartGitHubLink(deps: {
  users: UserReader;
  states: OAuthStateStore;
  oauth: GitHubOAuthClient;
  pkce: PkceGenerator;
  ids: IdGenerator;
  clock: Clock;
}) {
  return async function startGitHubLink(input: {
    userId: UserId;
  }): Promise<Result<{ authorizeUrl: string }, GitHubLinkError>> {
    const user = await deps.users.byId(input.userId);
    if (!user || !canLinkGitHub(user)) return err({ kind: 'link_not_permitted' });

    const now = deps.clock.now();
    const state = deps.ids.next();
    const { verifier, challenge } = deps.pkce.generate();

    await deps.states.save({
      state,
      userId: input.userId,
      codeVerifier: verifier,
      createdAt: now,
      expiresAt: linkStateExpiryFrom(now),
      consumedAt: null,
    });

    return ok({ authorizeUrl: deps.oauth.authorizeUrl({ state, codeChallenge: challenge }) });
  };
}

/**
 * Finishes the link when GitHub sends the student back.
 *
 * The state is consumed before the code is exchanged, so a callback replayed
 * with the same state cannot produce a second exchange even if the first one
 * failed partway.
 */
export function makeCompleteGitHubLink(deps: {
  users: UserReader & GitHubLinkWriter;
  states: OAuthStateStore;
  oauth: GitHubOAuthClient;
  cipher: TokenCipher;
  clock: Clock;
}) {
  return async function completeGitHubLink(input: {
    state: string;
    code: string;
    actorId: UserId;
  }): Promise<Result<User, GitHubLinkError>> {
    const now = deps.clock.now();

    const stored = await deps.states.byState(input.state);
    if (!stored) return err({ kind: 'link_state_unknown' });

    const rejection = checkLinkStateUsable(stored, input.actorId, now);
    if (rejection) return err(rejection);

    await deps.states.save(markLinkStateConsumed(stored, now));

    const user = await deps.users.byId(input.actorId);
    if (!user || !canLinkGitHub(user)) return err({ kind: 'link_not_permitted' });

    const exchanged = await deps.oauth.exchangeCode({
      code: input.code,
      codeVerifier: stored.codeVerifier,
    });
    if (!exchanged.ok) {
      return err({ kind: 'github_exchange_failed', detail: exchanged.error.detail });
    }

    const identity = exchanged.value;

    // Checked before writing so the common case gets a clear message rather
    // than a constraint violation. The unique index is still the real
    // guarantee — this is a race, and the database settles it.
    const alreadyLinked = await deps.users.byGitHubUserId(identity.githubUserId);
    if (alreadyLinked && alreadyLinked.id !== user.id) {
      return err({ kind: 'github_account_already_linked' });
    }

    const link: GitHubLink = {
      githubUserId: identity.githubUserId,
      login: identity.login,
      avatarUrl: identity.avatarUrl,
      linkedAt: now,
    };

    await deps.users.linkGitHub(user.id, link, deps.cipher.encrypt(identity.accessToken));

    return ok({ ...user, github: link });
  };
}

/**
 * Unlinking discards the stored token and never touches sign-in (PRD ID-13) —
 * the account is the email address, so there is nothing here to lock out.
 */
export function makeUnlinkGitHub(deps: { users: UserReader & GitHubLinkWriter }) {
  return async function unlinkGitHub(input: {
    userId: UserId;
  }): Promise<Result<User, GitHubLinkError>> {
    const user = await deps.users.byId(input.userId);
    if (!user) return err({ kind: 'link_not_permitted' });

    await deps.users.unlinkGitHub(user.id);
    return ok({ ...user, github: null });
  };
}
