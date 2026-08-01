import type { GitHubLinkError } from '../domain/github-link';

/**
 * Collapses a typed link failure into a short code safe to put in a URL.
 *
 * Deliberately lossy: the specific reason a code exchange failed is diagnostic
 * detail that belongs in the log, not in a query string that lands in browser
 * history and referrer headers.
 */
export type GitHubOutcome =
  'linked' | 'unlinked' | 'denied' | 'invalid' | 'expired' | 'taken' | 'unavailable' | 'error';

export function githubCallbackOutcome(error: GitHubLinkError): GitHubOutcome {
  switch (error.kind) {
    case 'github_denied':
      return 'denied';
    case 'link_state_expired':
      return 'expired';
    case 'github_account_already_linked':
      return 'taken';
    case 'github_not_configured':
      return 'unavailable';
    case 'link_state_unknown':
    case 'link_state_already_used':
    case 'link_state_belongs_to_another_user':
      return 'invalid';
    case 'link_not_permitted':
    case 'github_exchange_failed':
      return 'error';
  }
}

export function describeGitHubOutcome(outcome: string): string | null {
  switch (outcome) {
    case 'linked':
      return 'GitHub connected.';
    case 'unlinked':
      return 'GitHub disconnected. You can reconnect it any time.';
    case 'denied':
      return 'You cancelled the GitHub connection. Nothing changed.';
    case 'expired':
      return 'That took too long and the link request expired. Try again.';
    case 'taken':
      return 'That GitHub account is already connected to another Uni-verse account.';
    case 'invalid':
      return 'That connection link was not valid. Start again from this page.';
    case 'unavailable':
      return 'GitHub connections are not set up on this deployment yet.';
    case 'error':
      return 'Something went wrong connecting GitHub. Try again — nothing was changed.';
    default:
      return null;
  }
}
