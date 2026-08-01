import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { CampusEmail } from '../domain/campus-email';
import type { VerificationCode } from '../domain/verification-code';
import type { VerificationCodeStore } from '../application/ports/verification-code-store';
import { verificationCodes } from './schema';

type Row = typeof verificationCodes.$inferSelect;

function toDomain(row: Row): VerificationCode {
  return {
    email: row.email as CampusEmail,
    codeHash: row.codeHash,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    attempts: row.attempts,
    consumedAt: row.consumedAt,
  };
}

export class DrizzleVerificationCodeStore implements VerificationCodeStore {
  constructor(private readonly db: PostgresJsDatabase) {}

  async byEmail(email: CampusEmail): Promise<VerificationCode | null> {
    const [row] = await this.db
      .select()
      .from(verificationCodes)
      .where(eq(verificationCodes.email, email))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async save(code: VerificationCode): Promise<void> {
    // Upserting on the email primary key is what enforces one live code per
    // address: requesting a new one overwrites the old, rather than leaving
    // several valid secrets outstanding.
    await this.db
      .insert(verificationCodes)
      .values({
        email: code.email,
        codeHash: code.codeHash,
        issuedAt: code.issuedAt,
        expiresAt: code.expiresAt,
        attempts: code.attempts,
        consumedAt: code.consumedAt,
      })
      .onConflictDoUpdate({
        target: verificationCodes.email,
        set: {
          codeHash: code.codeHash,
          issuedAt: code.issuedAt,
          expiresAt: code.expiresAt,
          attempts: code.attempts,
          consumedAt: code.consumedAt,
        },
      });
  }

  async delete(email: CampusEmail): Promise<void> {
    await this.db.delete(verificationCodes).where(eq(verificationCodes.email, email));
  }
}
