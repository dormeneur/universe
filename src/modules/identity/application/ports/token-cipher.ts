/**
 * Encryption for the GitHub access token at rest (PRD ID-12).
 *
 * The token grants read access to a student's repositories, so a database leak
 * must not hand it over — unlike a session token, it cannot simply be hashed,
 * because the sync job in Phase 2 needs the original value back.
 */
export interface TokenCipher {
  encrypt(plaintext: string): string;
  decrypt(payload: string): string;
}
