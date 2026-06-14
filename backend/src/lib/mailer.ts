import { logger } from './logger';
import { config } from '../config';

/**
 * Mailer port (stub).
 *
 * Auth needs to *send* verification / reset tokens; it must not depend on a
 * concrete provider. This stub satisfies the interface by logging and, outside
 * production, retaining a small in-memory outbox that tests can assert against.
 * Swap the implementation for a real provider (SES/Postmark/etc.) without
 * touching any caller.
 */
export type MailKind = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

export interface SentMail {
  to: string;
  kind: MailKind;
  token: string;
  sentAt: Date;
}

/** Test-visible outbox. Never populated in production. */
export const outbox: SentMail[] = [];

function record(mail: SentMail): void {
  if (!config.isProd) {
    outbox.push(mail);
    if (outbox.length > 1000) outbox.shift();
  }
  // The raw token is never logged in production.
  logger.info(
    { to: mail.to, kind: mail.kind, token: config.isProd ? '[redacted]' : mail.token },
    'mailer: dispatched',
  );
}

export const mailer = {
  async sendEmailVerification(to: string, token: string): Promise<void> {
    record({ to, kind: 'EMAIL_VERIFICATION', token, sentAt: new Date() });
  },
  async sendPasswordReset(to: string, token: string): Promise<void> {
    record({ to, kind: 'PASSWORD_RESET', token, sentAt: new Date() });
  },
  /** Test helper: most recent token of a kind sent to an address. */
  lastTokenFor(to: string, kind: MailKind): string | undefined {
    for (let i = outbox.length - 1; i >= 0; i--) {
      if (outbox[i].to === to && outbox[i].kind === kind) return outbox[i].token;
    }
    return undefined;
  },
  /** Test helper. */
  clearOutbox(): void {
    outbox.length = 0;
  },
};

export type Mailer = typeof mailer;
