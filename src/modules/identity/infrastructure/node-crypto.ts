import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Hasher, SecretGenerator } from '../application/ports/crypto';

/**
 * SHA-256 is the right tool here, and deliberately not a password KDF.
 *
 * Sign-in codes and session tokens are high-entropy and short-lived, so there
 * is nothing to brute-force offline: a 256-bit token cannot be guessed, and a
 * six-digit code is protected by attempt limits and a ten-minute window rather
 * than by hashing cost. Using bcrypt or argon2 would add latency to every
 * authenticated request while defending against an attack that does not apply.
 */
export class NodeHasher implements Hasher {
  hash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  equals(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');

    // timingSafeEqual throws on length mismatch, which would itself leak
    // length through an exception. Both inputs here are hex digests of the
    // same algorithm, so a mismatch means something is wrong rather than
    // attacker-controlled — but fail closed rather than throw.
    if (left.length !== right.length) return false;

    return timingSafeEqual(left, right);
  }
}

export class NodeSecretGenerator implements SecretGenerator {
  /**
   * `randomInt` draws uniformly from a cryptographic source. Deriving digits
   * from `randomBytes` with a modulo would bias the low digits, shrinking the
   * effective keyspace of an already-short code.
   */
  numericCode(length: number): string {
    let code = '';
    for (let i = 0; i < length; i++) code += randomInt(0, 10).toString();
    return code;
  }

  /** 32 bytes — 256 bits — base64url encoded, so it is cookie-safe. */
  sessionToken(): string {
    return randomBytes(32).toString('base64url');
  }
}
