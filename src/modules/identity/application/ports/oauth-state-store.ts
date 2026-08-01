import type { GitHubLinkState } from '../../domain/github-link';

export interface OAuthStateStore {
  byState(state: string): Promise<GitHubLinkState | null>;
  save(state: GitHubLinkState): Promise<void>;
  deleteExpired(before: Date): Promise<number>;
}
