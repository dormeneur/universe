import { z } from 'zod';
import { err, ok, type Result } from '@/shared/result';
import type { Logger } from '@/shared/logger';
import type {
  GitHubIdentity,
  GitHubOAuthClient,
  OAuthExchangeFailure,
} from '../application/ports/github-oauth';

export type GitHubOAuthConfig = {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
};

/**
 * GitHub answers a failed exchange with HTTP 200 and an `error` field, so the
 * status alone says nothing — the body has to be parsed either way.
 */
const TokenResponse = z.union([
  z.object({ access_token: z.string(), token_type: z.string().optional() }),
  z.object({ error: z.string(), error_description: z.string().optional() }),
]);

const UserResponse = z.object({
  id: z.number(),
  login: z.string(),
  avatar_url: z.string().nullable().optional(),
});

export class GitHubOAuthHttpClient implements GitHubOAuthClient {
  constructor(
    private readonly config: GitHubOAuthConfig,
    private readonly logger: Logger,
  ) {}

  authorizeUrl(params: { state: string; codeChallenge: string }): string {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // Read-only, and no repo scope at all: public repository metadata is
    // available unscoped, and Uni-verse never requests write access in any
    // phase (PRD, GitHub read scopes only).
    url.searchParams.set('scope', 'read:user');
    return url.toString();
  }

  async exchangeCode(params: {
    code: string;
    codeVerifier: string;
  }): Promise<Result<GitHubIdentity, OAuthExchangeFailure>> {
    const token = await this.requestToken(params);
    if (!token.ok) return token;

    return this.fetchIdentity(token.value);
  }

  private async requestToken(params: {
    code: string;
    codeVerifier: string;
  }): Promise<Result<string, OAuthExchangeFailure>> {
    let response: Response;
    try {
      response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code: params.code,
          redirect_uri: this.config.redirectUri,
          code_verifier: params.codeVerifier,
        }),
      });
    } catch (error) {
      return err({ kind: 'exchange_failed', detail: describeNetworkError(error) });
    }

    const parsed = TokenResponse.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      this.logger.error('unrecognized token response from GitHub', { status: response.status });
      return err({ kind: 'exchange_failed', detail: 'unrecognized response' });
    }

    if ('error' in parsed.data) {
      // The description is GitHub's own text and safe to log; the code and
      // secret are not, and never appear here.
      this.logger.warn('GitHub refused the code exchange', { error: parsed.data.error });
      return err({ kind: 'exchange_failed', detail: parsed.data.error });
    }

    return ok(parsed.data.access_token);
  }

  private async fetchIdentity(
    accessToken: string,
  ): Promise<Result<GitHubIdentity, OAuthExchangeFailure>> {
    let response: Response;
    try {
      response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch (error) {
      return err({ kind: 'exchange_failed', detail: describeNetworkError(error) });
    }

    if (!response.ok) {
      this.logger.error('GitHub rejected the identity lookup', { status: response.status });
      return err({
        kind: 'exchange_failed',
        detail: `identity lookup returned ${response.status}`,
      });
    }

    const parsed = UserResponse.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      return err({ kind: 'exchange_failed', detail: 'unrecognized user response' });
    }

    return ok({
      githubUserId: parsed.data.id,
      login: parsed.data.login,
      avatarUrl: parsed.data.avatar_url ?? null,
      accessToken,
    });
  }
}

function describeNetworkError(error: unknown): string {
  return error instanceof Error ? `network error: ${error.message}` : 'network error';
}
