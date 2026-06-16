import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { logger } from './logger';
import { config } from '../config';

/**
 * Mailer port.
 *
 * Auth needs to *send* verification / reset tokens; it must not depend on a
 * concrete provider. Two providers are supported, selected via MAIL_PROVIDER:
 *
 *   - 'log'  (default; dev + tests): logs the dispatch and, outside production,
 *            retains a small in-memory outbox that tests can assert against.
 *            No network, no real email.
 *   - 'ses'  (staging/prod): sends real email through AWS SES (v2). Credentials
 *            are resolved by the default AWS provider chain (ECS task role) — no
 *            secrets are read here.
 *
 * Public method signatures are stable, so callers in auth.service.ts never
 * change when the provider is swapped.
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

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/* ------------------------------------------------------------------ */
/* Link builders                                                       */
/* ------------------------------------------------------------------ */

/** `${FRONTEND_URL}/verify-email?email=...&token=...` (exported for tests). */
export function verificationLink(to: string, token: string): string {
  return (
    `${config.urls.frontendUrl}/verify-email` +
    `?email=${encodeURIComponent(to)}&token=${encodeURIComponent(token)}`
  );
}

/** `${FRONTEND_URL}/reset-password?token=...` (exported for tests). */
export function resetLink(token: string): string {
  return `${config.urls.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

/* ------------------------------------------------------------------ */
/* Email content                                                      */
/* ------------------------------------------------------------------ */

function layout(heading: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#0b0e11;font-family:Arial,Helvetica,sans-serif;color:#e8e8e8;">
    <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
      <div style="font-size:20px;font-weight:bold;color:#F5C242;margin-bottom:24px;">Exora</div>
      <h1 style="font-size:20px;color:#ffffff;margin:0 0 12px;">${heading}</h1>
      <p style="font-size:14px;line-height:1.6;color:#b5b5b5;margin:0 0 24px;">${body}</p>
      <a href="${cta.url}" style="display:inline-block;background:#F5C242;color:#0b0e11;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;">${cta.label}</a>
      <p style="font-size:12px;line-height:1.6;color:#7a7a7a;margin:24px 0 0;">If the button doesn&rsquo;t work, copy and paste this link into your browser:<br><span style="color:#9a9a9a;word-break:break-all;">${cta.url}</span></p>
      <p style="font-size:12px;line-height:1.6;color:#7a7a7a;margin:24px 0 0;">If you didn&rsquo;t request this, you can safely ignore this email.</p>
    </div>
  </body>
</html>`;
}

function verificationEmail(link: string): EmailContent {
  return {
    subject: 'Verify your Exora email address',
    html: layout(
      'Verify your email',
      'Confirm your email address to activate your Exora account and start trading.',
      { label: 'Verify Email', url: link },
    ),
    text:
      'Verify your Exora email address\n\n' +
      'Confirm your email address to activate your Exora account:\n' +
      `${link}\n\n` +
      "If you didn't request this, you can safely ignore this email.",
  };
}

function resetEmail(link: string): EmailContent {
  return {
    subject: 'Reset your Exora password',
    html: layout(
      'Reset your password',
      'We received a request to reset your Exora password. This link expires shortly for your security.',
      { label: 'Reset Password', url: link },
    ),
    text:
      'Reset your Exora password\n\n' +
      'We received a request to reset your Exora password. Use the link below (it expires shortly):\n' +
      `${link}\n\n` +
      "If you didn't request this, you can safely ignore this email.",
  };
}

/* ------------------------------------------------------------------ */
/* Providers                                                          */
/* ------------------------------------------------------------------ */

/** 'log' provider: in-memory outbox (non-prod) + structured log. */
function recordLog(mail: SentMail): void {
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

// SES client is created lazily and reused. Region comes from validated config;
// credentials come from the default AWS provider chain (e.g. ECS task role).
let sesClient: SESv2Client | undefined;
function getSesClient(): SESv2Client {
  if (!sesClient) {
    if (!config.mail.awsRegion) {
      // Defensive: env validation already enforces this for MAIL_PROVIDER=ses.
      throw new Error('MAIL_PROVIDER=ses requires AWS_REGION');
    }
    sesClient = new SESv2Client({ region: config.mail.awsRegion });
  }
  return sesClient;
}

async function sendViaSes(to: string, content: EmailContent): Promise<void> {
  const client = getSesClient();
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: config.mail.from,
      Destination: { ToAddresses: [to] },
      ...(config.mail.sesConfigurationSet
        ? { ConfigurationSetName: config.mail.sesConfigurationSet }
        : {}),
      Content: {
        Simple: {
          Subject: { Data: content.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: content.html, Charset: 'UTF-8' },
            Text: { Data: content.text, Charset: 'UTF-8' },
          },
        },
      },
    }),
  );
}

/** Route a message to the configured provider. Never logs the link/raw token in prod. */
async function dispatch(
  to: string,
  kind: MailKind,
  token: string,
  content: EmailContent,
): Promise<void> {
  if (config.mail.provider === 'ses') {
    await sendViaSes(to, content);
    logger.info(
      { to, kind, provider: 'ses', token: config.isProd ? '[redacted]' : token },
      'mailer: dispatched',
    );
    return;
  }
  recordLog({ to, kind, token, sentAt: new Date() });
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export const mailer = {
  async sendEmailVerification(to: string, token: string): Promise<void> {
    await dispatch(to, 'EMAIL_VERIFICATION', token, verificationEmail(verificationLink(to, token)));
  },
  async sendPasswordReset(to: string, token: string): Promise<void> {
    await dispatch(to, 'PASSWORD_RESET', token, resetEmail(resetLink(token)));
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
