/**
 * Provider-neutral transactional email contract (Stage 12).
 *
 * The rest of EXORA (mailer.ts, notification.service.ts) calls `EmailService`,
 * never a concrete SDK (Resend/SES) directly. Adding a new provider means
 * implementing this interface — nothing else changes.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Provider-side categorization (e.g. Resend tags). Never PII/secrets. */
  tags?: Record<string, string>;
  /** Lets a provider that supports it de-duplicate a retried send. */
  idempotencyKey?: string;
}

export type EmailProviderName = 'log' | 'ses' | 'resend';

export interface EmailSendResult {
  provider: EmailProviderName;
  /** Provider-assigned id, when the provider returns one (e.g. Resend). */
  providerMessageId?: string;
}

export interface EmailProvider {
  readonly name: EmailProviderName;
  /**
   * Send one transactional message. MUST throw a clear, specific error on any
   * failure (misconfiguration, provider rejection, network) — never resolve
   * as if the email were sent when it was not.
   */
  send(message: EmailMessage): Promise<EmailSendResult>;
}
