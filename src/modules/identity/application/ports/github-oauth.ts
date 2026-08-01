import type { Result } from '@/shared/result';

/**
 * What GitHub tells us about the account that just authorized.
 *
 * `githubUserId` is the numeric, immutable identifier. `login` is the current
 * handle and may be renamed at any time, so it is display data rather than an
 * identity — uniqueness is keyed on the number (PRD ID-10).
 */
export type GitHubIdentity = {
  readonly githubUserId: number;
  readonly login: string;
  readonly avatarUrl: string | null;
  readonly accessToken: string;
};

export type OAuthExchangeFailure = { readonly kind: 'exchange_failed'; readonly detail: string };

export interface GitHubOAuthClient {
  /**
   * Where to send the student. The challenge is the S256 hash of the verifier
   * we keep; GitHub returns the code only to whoever can produce the original.
   */
  authorizeUrl(params: { state: string; codeChallenge: string }): string;

  exchangeCode(params: {
    code: string;
    codeVerifier: string;
  }): Promise<Result<GitHubIdentity, OAuthExchangeFailure>>;
}

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

/** Generating the PKCE pair needs SHA-256, so it sits behind a port too. */
export interface PkceGenerator {
  generate(): PkcePair;
}
