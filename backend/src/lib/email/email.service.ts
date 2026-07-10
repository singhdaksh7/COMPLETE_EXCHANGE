import { config } from '../../config';
import { logEmailProvider } from './providers/log-email-provider';
import { sesEmailProvider } from './providers/ses-email-provider';
import { resendEmailProvider } from './providers/resend-email-provider';
import type { EmailMessage, EmailProvider, EmailSendResult } from './types';

/**
 * Provider-neutral transactional email service (Stage 12).
 *
 * Every EXORA call site sends mail through `emailService.send()` — never
 * through a concrete SDK. Swapping providers (SES ⇄ Resend) or adding a new
 * one never touches a call site; only `resolveProvider` changes.
 */
function resolveProvider(): EmailProvider {
  switch (config.mail.provider) {
    case 'ses':
      return sesEmailProvider;
    case 'resend':
      return resendEmailProvider;
    default:
      return logEmailProvider;
  }
}

export const emailService = {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    return resolveProvider().send(message);
  },
};

export type EmailService = typeof emailService;
export type { EmailMessage, EmailProvider, EmailSendResult } from './types';
