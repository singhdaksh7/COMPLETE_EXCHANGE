import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { config } from '../../../config';
import type { EmailMessage, EmailProvider, EmailSendResult } from '../types';

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

export const sesEmailProvider: EmailProvider = {
  name: 'ses',
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const client = getSesClient();
    // Field mapping is deliberate and asymmetric:
    //   - FromEmailAddress is ALWAYS the configured sender identity (MAIL_FROM).
    //     It must be an SES-verified identity in AWS_REGION. The recipient
    //     address must never appear here, or SES rejects the send with
    //     AccessDeniedException on identity/<recipient>.
    //   - Destination.ToAddresses is the recipient.
    //   - ReplyToAddresses is attached only when a reply-to is configured.
    const replyTo = message.replyTo ?? config.mail.replyTo;
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: config.mail.from,
        Destination: { ToAddresses: [message.to] },
        ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
        ...(config.mail.sesConfigurationSet
          ? { ConfigurationSetName: config.mail.sesConfigurationSet }
          : {}),
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: message.html, Charset: 'UTF-8' },
              Text: { Data: message.text, Charset: 'UTF-8' },
            },
          },
        },
      }),
    );
    return { provider: 'ses' };
  },
};
