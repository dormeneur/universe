import type { UserId } from './user';

/**
 * The pending half of a GitHub link: what we remember between sending a
 * student to GitHub and them coming back.
 *
 * The `state` value is what makes the callback trustworthy. Without it, anyone
 * could hand a student a crafted callback URL and have their own GitHub
 * account attached to that student's profile. Binding state to the user who
 * started the flow, single-use and short-lived, closes that.
 */

export const LINK_STATE_TTL_MS = 10 * 60 * 1000;

export type GitHubLinkState = {
  readonly state: string;
  readonly userId: UserId;
  /**
   * The PKCE verifier. GitHub supports PKCE with the S256 challenge method,
   * which binds the authorization code to the client that started the flow —
   * so an intercepted code cannot be redeemed by anyone else.
   */
  readonly codeVerifier: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
};

export type GitHubLinkError =
  | { readonly kind: 'link_not_permitted' }
  | { readonly kind: 'link_state_unknown' }
  | { readonly kind: 'link_state_expired' }
  | { readonly kind: 'link_state_already_used' }
  | { readonly kind: 'link_state_belongs_to_another_user' }
  | { readonly kind: 'github_denied' }
  | { readonly kind: 'github_exchange_failed'; readonly detail: string }
  | { readonly kind: 'github_account_already_linked' }
  | { readonly kind: 'github_not_configured' };

export function linkStateExpiryFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + LINK_STATE_TTL_MS);
}

export function isLinkStateExpired(state: GitHubLinkState, now: Date): boolean {
  return now.getTime() > state.expiresAt.getTime();
}

export function isLinkStateConsumed(state: GitHubLinkState): boolean {
  return state.consumedAt !== null;
}

/**
 * Whether a returning callback may be honoured.
 *
 * The actor is checked as well as the state itself: the state already names
 * the user who began the flow, and requiring the current session to be that
 * same user means a stolen state cannot be redeemed from someone else's
 * browser.
 */
export function checkLinkStateUsable(
  state: GitHubLinkState,
  actorId: UserId,
  now: Date,
): GitHubLinkError | null {
  if (isLinkStateConsumed(state)) return { kind: 'link_state_already_used' };
  if (isLinkStateExpired(state, now)) return { kind: 'link_state_expired' };
  if (state.userId !== actorId) return { kind: 'link_state_belongs_to_another_user' };
  return null;
}

export function markLinkStateConsumed(state: GitHubLinkState, now: Date): GitHubLinkState {
  return { ...state, consumedAt: now };
}
