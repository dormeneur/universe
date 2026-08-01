import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import type { Hasher, SecretGenerator } from '../application/ports/crypto';
import type { PkceGenerator, PkcePair } from '../application/ports/github-oauth';
import type { TokenCipher } from '../application/ports/token-cipher';

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

/**
 * PKCE, S256 — the only challenge method GitHub accepts.
 *
 * The verifier stays on our side; only its hash travels to GitHub. When the
 * code comes back, presenting the original verifier proves we are the client
 * that started the flow, so an intercepted code is worthless to anyone else.
 */
export class NodePkceGenerator implements PkceGenerator {
  generate(): PkcePair {
    // 32 bytes base64url is 43 characters, inside RFC 7636's 43–128 range.
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }
}

/**
 * AES-256-GCM for the GitHub access token at rest.
 *
 * GCM rather than CBC because it authenticates as well as encrypts: tampering
 * with stored ciphertext fails loudly instead of decrypting to garbage. A
 * fresh random IV per encryption is what keeps two identical tokens from
 * producing identical ciphertext.
 */
export class AesGcmTokenCipher implements TokenCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'GITHUB_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded. ' +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      );
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
  }

  decrypt(payload: string): string {
    const parts = payload.split('.');
    const [ivPart, tagPart, ciphertextPart] = parts;
    if (parts.length !== 3 || !ivPart || !tagPart || !ciphertextPart) {
      throw new Error('Malformed encrypted token payload');
    }

    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
