import { Webhook } from 'svix';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import { recordAudit, AuditAction } from '../../lib/audit';
import { ForbiddenError, ServiceUnavailableError } from '../../lib/errors';

/**
 * Resend delivery-event webhook (Stage 12 — Phase 5).
 *
 * Resend signs webhooks using the Svix format (svix-id / svix-timestamp /
 * svix-signature headers over the raw body). No email-delivery model exists
 * in the schema yet, so events are recorded as structured audit/operational
 * log entries (recordAudit) rather than standing up a new table — the
 * existing append-only audit log already gives us a queryable, timestamped
 * trail, and this keeps the additive footprint minimal.
 *
 * Never logs the email body, subject, or OTP content — only provider event
 * type + recipient + provider message id.
 */

const DEDUPE_TTL_SEC = 24 * 60 * 60; // 24h — comfortably longer than any Svix retry window.

interface ResendWebhookEvent {
  type: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    created_at?: string;
  };
}

/** Best-effort de-duplication so a retried webhook delivery is a no-op. */
async function alreadyProcessed(svixId: string): Promise<boolean> {
  try {
    // NX: only the first caller to see this svix-id gets 'OK'; a retry gets null.
    const result = await redis.set(
      `webhook:resend:seen:${svixId}`,
      '1',
      'EX',
      DEDUPE_TTL_SEC,
      'NX',
    );
    return result !== 'OK';
  } catch (err) {
    // Redis hiccup must never cause us to drop (or double-process) a webhook;
    // treat as "not seen" and let it through — the audit row is the record.
    logger.error({ err }, 'resend webhook: dedupe check failed, proceeding');
    return false;
  }
}

export const resendWebhookService = {
  /**
   * Verify + process one inbound Resend webhook delivery.
   *
   * @param rawBody   the EXACT raw request body bytes (never the re-serialized
   *                  parsed object — that would break signature verification).
   * @param headers   the svix-id / svix-timestamp / svix-signature headers.
   */
  async handle(rawBody: string, headers: Record<string, string | undefined>): Promise<void> {
    if (!config.mail.resend.webhookSecret) {
      // Absent configuration is never treated as "verified" — fail closed.
      throw new ServiceUnavailableError('Resend webhook is not configured');
    }

    const svixId = headers['svix-id'];
    const svixTimestamp = headers['svix-timestamp'];
    const svixSignature = headers['svix-signature'];
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new ForbiddenError('Missing webhook signature headers', 'WEBHOOK_SIGNATURE_MISSING');
    }

    let event: ResendWebhookEvent;
    try {
      const webhook = new Webhook(config.mail.resend.webhookSecret);
      event = webhook.verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ResendWebhookEvent;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'resend webhook: signature verification failed');
      throw new ForbiddenError('Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID');
    }

    if (await alreadyProcessed(svixId)) {
      logger.info({ svixId, type: event.type }, 'resend webhook: duplicate delivery ignored');
      return;
    }

    const to = Array.isArray(event.data?.to) ? event.data?.to.join(',') : event.data?.to;
    await recordAudit({
      actorType: 'SYSTEM',
      action: AuditAction.EMAIL_DELIVERY_EVENT,
      entityType: 'email_delivery',
      entityId: event.data?.email_id,
      metadata: {
        provider: 'resend',
        type: event.type,
        to: to ?? null,
      },
    });
  },
};

export type ResendWebhookService = typeof resendWebhookService;
