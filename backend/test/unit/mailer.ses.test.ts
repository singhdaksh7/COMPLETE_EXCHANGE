import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * SES provider tests for the mailer.
 *
 * These lock in the field mapping that the AccessDeniedException incident was
 * about: the recipient address must NEVER be used as the SES send identity.
 *
 *   - FromEmailAddress must always equal the configured MAIL_FROM.
 *   - Destination.ToAddresses must contain the recipient.
 *   - ReplyToAddresses must use MAIL_REPLY_TO only when configured.
 *
 * The AWS SDK is fully mocked (no network, no credentials). We drive the
 * mailer under MAIL_PROVIDER=ses by setting env before a fresh import.
 */

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-sesv2', () => ({
  // Minimal stand-ins: SendEmailCommand just captures its input so we can
  // assert on the exact request shape the mailer builds.
  SESv2Client: class {
    send = mockSend;
  },
  SendEmailCommand: class {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

const RECIPIENT = 'someuser@gmail.com';
const MAIL_FROM = 'noreply@exorain.com';
const MAIL_REPLY_TO = 'support@exorain.com';

const ENV_KEYS = ['MAIL_PROVIDER', 'MAIL_FROM', 'MAIL_REPLY_TO', 'AWS_REGION'] as const;
const savedEnv: Record<string, string | undefined> = {};

/** Reset modules and import the mailer with a given SES env. */
async function loadMailer(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  vi.resetModules();
  process.env.MAIL_PROVIDER = env.MAIL_PROVIDER ?? 'ses';
  process.env.MAIL_FROM = env.MAIL_FROM ?? MAIL_FROM;
  process.env.AWS_REGION = env.AWS_REGION ?? 'ap-south-1';
  if (env.MAIL_REPLY_TO === undefined) delete process.env.MAIL_REPLY_TO;
  else process.env.MAIL_REPLY_TO = env.MAIL_REPLY_TO;
  return import('../../src/lib/mailer');
}

/** The SendEmailCommand input captured from the most recent send() call. */
function lastSesInput(): Record<string, any> {
  expect(mockSend).toHaveBeenCalled();
  const command = mockSend.mock.calls.at(-1)![0] as { input: Record<string, any> };
  return command.input;
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  mockSend.mockReset().mockResolvedValue({ MessageId: 'ses-msg-1' });
});

afterEach(() => {
  // Restore env so other test files keep the default MAIL_PROVIDER=log.
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('mailer SES provider — From/To/ReplyTo field mapping', () => {
  it('verification email: FromEmailAddress is MAIL_FROM, ToAddresses is the recipient', async () => {
    const { mailer } = await loadMailer({ MAIL_REPLY_TO });
    await mailer.sendEmailVerification(RECIPIENT, 'verify-token');

    const input = lastSesInput();
    expect(input.FromEmailAddress).toBe(MAIL_FROM);
    expect(input.Destination.ToAddresses).toEqual([RECIPIENT]);
  });

  it('NEVER uses the recipient email as the SES send identity', async () => {
    const { mailer } = await loadMailer({ MAIL_REPLY_TO });
    await mailer.sendEmailVerification(RECIPIENT, 'verify-token');

    const input = lastSesInput();
    expect(input.FromEmailAddress).not.toBe(RECIPIENT);
    expect(input.FromEmailAddress).not.toContain('gmail.com');
  });

  it('attaches ReplyToAddresses from MAIL_REPLY_TO when configured', async () => {
    const { mailer } = await loadMailer({ MAIL_REPLY_TO });
    await mailer.sendEmailVerification(RECIPIENT, 'verify-token');

    expect(lastSesInput().ReplyToAddresses).toEqual([MAIL_REPLY_TO]);
  });

  it('omits ReplyToAddresses entirely when MAIL_REPLY_TO is not configured', async () => {
    const { mailer } = await loadMailer({ MAIL_REPLY_TO: undefined });
    await mailer.sendEmailVerification(RECIPIENT, 'verify-token');

    expect(lastSesInput()).not.toHaveProperty('ReplyToAddresses');
  });

  it('password reset and notification emails follow the same identity rules', async () => {
    const { mailer } = await loadMailer({ MAIL_REPLY_TO });

    await mailer.sendPasswordReset(RECIPIENT, 'reset-token');
    let input = lastSesInput();
    expect(input.FromEmailAddress).toBe(MAIL_FROM);
    expect(input.Destination.ToAddresses).toEqual([RECIPIENT]);
    expect(input.ReplyToAddresses).toEqual([MAIL_REPLY_TO]);

    const delivery = await mailer.sendNotification(RECIPIENT, {
      subject: 'Withdrawal completed',
      html: '<p>done</p>',
      text: 'done',
    });
    expect(delivery).toBe('ses');
    input = lastSesInput();
    expect(input.FromEmailAddress).toBe(MAIL_FROM);
    expect(input.Destination.ToAddresses).toEqual([RECIPIENT]);
  });
});
