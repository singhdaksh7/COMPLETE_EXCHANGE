import { Resend } from 'resend';
import { config } from '../../../config';
import type { EmailMessage, EmailProvider, EmailSendResult } from '../types';

// Client is created lazily so importing this module never requires
// RESEND_API_KEY — only selecting MAIL_PROVIDER=resend does (and env
// validation already enforces the key + from-address exist together).
let client: Resend | undefined;
function getClient(): Resend {
  if (!client) {
    if (!config.mail.resend.apiKey) {
      // Defensive: env validation already enforces this for MAIL_PROVIDER=resend.
      throw new Error('MAIL_PROVIDER=resend requires RESEND_API_KEY');
    }
    client = new Resend(config.mail.resend.apiKey);
  }
  return client;
}

function fromHeader(): string {
  const email = config.mail.resend.fromEmail;
  if (!email) {
    // Defensive: env validation already enforces this for MAIL_PROVIDER=resend.
    throw new Error('MAIL_PROVIDER=resend requires RESEND_FROM_EMAIL');
  }
  return config.mail.resend.fromName ? `${config.mail.resend.fromName} <${email}>` : email;
}

export const resendEmailProvider: EmailProvider = {
  name: 'resend',
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const resend = getClient();
    const { data, error } = await resend.emails.send({
      from: fromHeader(),
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo ?? config.mail.replyTo ?? undefined,
      tags: message.tags
        ? Object.entries(message.tags).map(([name, value]) => ({ name, value }))
        : undefined,
      headers: message.idempotencyKey
        ? { 'Idempotency-Key': message.idempotencyKey }
        : undefined,
    });
    if (error) {
      // Fail clearly — never let a caller believe the email was delivered.
      throw new Error(`Resend send failed (${error.name}): ${error.message}`);
    }
    return { provider: 'resend', providerMessageId: data?.id };
  },
};
