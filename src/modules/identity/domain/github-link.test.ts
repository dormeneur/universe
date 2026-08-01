import { describe, expect, it } from 'vitest';
import type { UserId } from './user';
import {
  checkLinkStateUsable,
  isLinkStateExpired,
  LINK_STATE_TTL_MS,
  linkStateExpiryFrom,
  markLinkStateConsumed,
  type GitHubLinkState,
} from './github-link';

const CREATED = new Date('2026-08-01T00:00:00.000Z');
const OWNER = 'u1' as UserId;

function makeState(overrides: Partial<GitHubLinkState> = {}): GitHubLinkState {
  return {
    state: 'state-token',
    userId: OWNER,
    codeVerifier: 'verifier',
    createdAt: CREATED,
    expiresAt: linkStateExpiryFrom(CREATED),
    consumedAt: null,
    ...overrides,
  };
}

const at = (offsetMs: number) => new Date(CREATED.getTime() + offsetMs);

describe('isLinkStateExpired', () => {
  it('is live one millisecond before the deadline', () => {
    expect(isLinkStateExpired(makeState(), at(LINK_STATE_TTL_MS - 1))).toBe(false);
  });

  it('is live exactly at the deadline', () => {
    expect(isLinkStateExpired(makeState(), at(LINK_STATE_TTL_MS))).toBe(false);
  });

  it('is expired one millisecond after', () => {
    expect(isLinkStateExpired(makeState(), at(LINK_STATE_TTL_MS + 1))).toBe(true);
  });
});

describe('checkLinkStateUsable', () => {
  it('permits the user who started the flow', () => {
    expect(checkLinkStateUsable(makeState(), OWNER, CREATED)).toBeNull();
  });

  it('refuses a state already redeemed, so a callback cannot be replayed', () => {
    const used = makeState({ consumedAt: CREATED });
    expect(checkLinkStateUsable(used, OWNER, at(1000))).toEqual({
      kind: 'link_state_already_used',
    });
  });

  it('refuses an expired state', () => {
    expect(checkLinkStateUsable(makeState(), OWNER, at(LINK_STATE_TTL_MS + 1))).toEqual({
      kind: 'link_state_expired',
    });
  });

  it('refuses redemption by a different signed-in user', () => {
    // Without this, a stolen state could be redeemed from another browser and
    // attach the attacker's GitHub account to somebody else's profile.
    expect(checkLinkStateUsable(makeState(), 'someone-else' as UserId, CREATED)).toEqual({
      kind: 'link_state_belongs_to_another_user',
    });
  });

  it('reports prior use ahead of expiry, so the reason is the definitive one', () => {
    const used = makeState({ consumedAt: CREATED });
    expect(checkLinkStateUsable(used, OWNER, at(LINK_STATE_TTL_MS + 1))).toEqual({
      kind: 'link_state_already_used',
    });
  });
});

describe('markLinkStateConsumed', () => {
  it('records consumption without mutating the original', () => {
    const state = makeState();
    const consumed = markLinkStateConsumed(state, at(500));
    expect(consumed.consumedAt).toEqual(at(500));
    expect(state.consumedAt).toBeNull();
  });
});
