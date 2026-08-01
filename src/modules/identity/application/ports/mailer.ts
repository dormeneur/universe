import type { CampusEmail } from '../../domain/campus-email';

export interface SignInCodeMessage {
  readonly to: CampusEmail;
  readonly code: string;
  readonly expiresInMinutes: number;
}

/**
 * Narrow on purpose: this is the only message identity sends, so the port
 * describes that message rather than exposing a general "send anything"
 * surface that would let business copy drift into calling code.
 */
export interface Mailer {
  sendSignInCode(message: SignInCodeMessage): Promise<void>;
}
