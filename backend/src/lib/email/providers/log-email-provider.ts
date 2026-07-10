import type { EmailMessage, EmailProvider, EmailSendResult } from '../types';

/**
 * Fully-offline stub provider (dev + tests + explicit MAIL_PROVIDER=log).
 * Never touches the network. mailer.ts records the outbox entry itself (it
 * needs the higher-level `kind`/`token`, which this generic provider doesn't
 * know about) — this provider only exists so EmailService has a real 'log'
 * branch alongside 'ses'/'resend'.
 */
export const logEmailProvider: EmailProvider = {
  name: 'log',
  async send(_message: EmailMessage): Promise<EmailSendResult> {
    return { provider: 'log' };
  },
};
