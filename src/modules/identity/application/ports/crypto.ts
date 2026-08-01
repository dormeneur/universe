/**
 * Cryptographic primitives, behind ports so the domain and use cases stay
 * free of `node:crypto` and remain testable without it.
 */

export interface Hasher {
  /**
   * One-way hash for values compared against a stored digest — sign-in codes
   * and session tokens. Both are high-entropy and short-lived, so a fast
   * digest is appropriate; a password-grade KDF would be the wrong tool.
   */
  hash(value: string): string;

  /**
   * Comparison that does not short-circuit on the first differing byte.
   *
   * A naive `===` returns fractionally sooner for a wrong first character than
   * a wrong last one, which over enough samples leaks the value one character
   * at a time.
   */
  equals(a: string, b: string): boolean;
}

export interface SecretGenerator {
  /** A numeric sign-in code of the requested length, uniformly distributed. */
  numericCode(length: number): string;

  /** A URL-safe session token with at least 256 bits of entropy. */
  sessionToken(): string;
}
