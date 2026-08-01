import { describe, expect, it } from 'vitest';
import { NodeHasher, NodeSecretGenerator } from './node-crypto';

describe('NodeHasher', () => {
  const hasher = new NodeHasher();

  it('produces a stable digest for the same input', () => {
    expect(hasher.hash('123456')).toBe(hasher.hash('123456'));
  });

  it('produces different digests for different inputs', () => {
    expect(hasher.hash('123456')).not.toBe(hasher.hash('123457'));
  });

  it('never returns the input itself', () => {
    expect(hasher.hash('123456')).not.toContain('123456');
  });

  it('matches equal digests', () => {
    expect(hasher.equals(hasher.hash('a'), hasher.hash('a'))).toBe(true);
  });

  it('rejects unequal digests', () => {
    expect(hasher.equals(hasher.hash('a'), hasher.hash('b'))).toBe(false);
  });

  it('returns false rather than throwing on a length mismatch', () => {
    // timingSafeEqual throws when lengths differ, which would leak length
    // through an exception instead of a boolean.
    expect(hasher.equals('short', hasher.hash('a'))).toBe(false);
  });
});

describe('NodeSecretGenerator', () => {
  const secrets = new NodeSecretGenerator();

  it('produces a code of the requested length', () => {
    expect(secrets.numericCode(6)).toHaveLength(6);
  });

  it('produces only digits', () => {
    for (let i = 0; i < 50; i++) {
      expect(secrets.numericCode(6)).toMatch(/^\d{6}$/);
    }
  });

  it('can produce codes with leading zeros', () => {
    // A generator that formatted a number would silently drop them, making
    // some codes five characters and failing the well-formedness check.
    const codes = Array.from({ length: 400 }, () => secrets.numericCode(6));
    expect(codes.some((c) => c.startsWith('0'))).toBe(true);
  });

  it('covers every digit in the leading position', () => {
    // A modulo-biased generator would under-represent some values here.
    const leading = new Set(Array.from({ length: 1200 }, () => secrets.numericCode(6).charAt(0)));
    expect(leading.size).toBe(10);
  });

  it('does not repeat session tokens', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => secrets.sessionToken()));
    expect(tokens.size).toBe(500);
  });

  it('produces URL-safe session tokens with at least 256 bits of entropy', () => {
    const token = secrets.sessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });
});
