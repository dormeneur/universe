import type { CampusEmail } from '../../domain/campus-email';
import type { VerificationCode } from '../../domain/verification-code';

/**
 * At most one outstanding code per address.
 *
 * `save` replaces any existing record for that address, so requesting a new
 * code invalidates the old one. Allowing several live codes at once would
 * multiply the number of valid guesses an attacker gets per rate-limit window.
 */
export interface VerificationCodeStore {
  byEmail(email: CampusEmail): Promise<VerificationCode | null>;
  save(code: VerificationCode): Promise<void>;
  delete(email: CampusEmail): Promise<void>;
}
