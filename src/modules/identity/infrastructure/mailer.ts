import type { Logger } from '@/shared/logger';
import type { Mailer, SignInCodeMessage } from '../application/ports/mailer';

const SUBJECT = 'Your Uni-verse sign-in code';

function bodyText(message: SignInCodeMessage): string {
  return [
    `Your sign-in code is ${message.code}`,
    '',
    `It expires in ${message.expiresInMinutes} minutes and can be used once.`,
    '',
    'If you did not ask to sign in to Uni-verse, you can ignore this email —',
    'nobody can get in without this code.',
  ].join('\n');
}

/**
 * The code is repeated in the subject line on purpose: most mail clients show
 * the subject in a notification, so a student can read it off a lock screen
 * without opening the message. This is a large part of why codes beat magic
 * links on a phone.
 */
function subjectWithCode(message: SignInCodeMessage): string {
  return `${message.code} — ${SUBJECT}`;
}

/**
 * Development mailer: writes the code to the log instead of sending it.
 *
 * Guarded so it can never be selected in production — a misconfiguration that
 * silently logged sign-in codes rather than mailing them would hand every
 * account to anyone with log access.
 */
export class ConsoleMailer implements Mailer {
  constructor(
    private readonly logger: Logger,
    /**
     * Whether logging codes instead of sending them is permitted. Decided by
     * the composition root, not inferred here.
     *
     * An earlier version keyed this off NODE_ENV, which was wrong twice over:
     * `next start` forces NODE_ENV=production even for a local end-to-end run,
     * and a real deployment's safety should not rest on a variable that
     * frameworks set for their own reasons. An explicit decision is both
     * safer and testable.
     */
    allowed: boolean,
    /**
     * Optional file sink, the same idea as Mailpit or Mailhog: somewhere a
     * developer — or an end-to-end test — can read the code without a real
     * inbox.
     */
    private readonly sinkPath?: string,
  ) {
    if (!allowed) {
      throw new Error(
        'Refusing to log sign-in codes instead of sending them. Configure RESEND_API_KEY, or ' +
          'set ALLOW_CONSOLE_MAIL=true if you really intend codes to go to the log.',
      );
    }
  }

  async sendSignInCode(message: SignInCodeMessage): Promise<void> {
    this.logger.info('sign-in code (development only, not sent)', {
      to: message.to,
      code: message.code,
    });

    if (this.sinkPath) {
      const { appendFile } = await import('node:fs/promises');
      await appendFile(
        this.sinkPath,
        `${JSON.stringify({ to: message.to, code: message.code, at: new Date().toISOString() })}\n`,
        'utf8',
      );
    }
  }
}

export type ResendConfig = {
  readonly apiKey: string;
  readonly from: string;
};

export class ResendMailer implements Mailer {
  constructor(
    private readonly config: ResendConfig,
    private readonly logger: Logger,
  ) {}

  async sendSignInCode(message: SignInCodeMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.from,
        to: message.to,
        subject: subjectWithCode(message),
        text: bodyText(message),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      // The code must never reach the log — deliverability problems are
      // diagnosed from the status and the recipient, not the secret.
      this.logger.error('failed to send sign-in code', {
        to: message.to,
        status: response.status,
        detail: detail.slice(0, 500),
      });
      throw new Error(`Resend rejected the message with status ${response.status}`);
    }
  }
}
