import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockVerify } = vi.hoisted(() => ({ mockVerify: vi.fn() }));

vi.mock('svix', () => ({
  Webhook: class {
    verify = mockVerify;
  },
}));

vi.mock('../../src/lib/redis', () => ({
  redis: { set: vi.fn().mockResolvedValue('OK') },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { resendWebhookService } from '../../src/modules/webhooks/resend-webhook.service';
import { redis } from '../../src/lib/redis';
import { recordAudit } from '../../src/lib/audit';
import { config } from '../../src/config';

const r = vi.mocked(redis);
const audit = vi.mocked(recordAudit);

const HEADERS = {
  'svix-id': 'msg-1',
  'svix-timestamp': '1710000000',
  'svix-signature': 'v1,fake',
};

beforeEach(() => {
  vi.clearAllMocks();
  r.set.mockResolvedValue('OK');
  (config.mail.resend as { webhookSecret?: string }).webhookSecret = 'whsec_test';
});

describe('resendWebhookService.handle', () => {
  it('rejects when no webhook secret is configured (fail closed)', async () => {
    (config.mail.resend as { webhookSecret?: string }).webhookSecret = undefined;
    await expect(resendWebhookService.handle('{}', HEADERS)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('rejects when signature headers are missing', async () => {
    await expect(
      resendWebhookService.handle('{}', { 'svix-id': 'msg-1' }),
    ).rejects.toMatchObject({ errorCode: 'WEBHOOK_SIGNATURE_MISSING' });
  });

  it('rejects an invalid signature', async () => {
    mockVerify.mockImplementation(() => {
      throw new Error('bad signature');
    });
    await expect(resendWebhookService.handle('{}', HEADERS)).rejects.toMatchObject({
      errorCode: 'WEBHOOK_SIGNATURE_INVALID',
    });
  });

  it('records a verified delivery event without logging body/subject', async () => {
    mockVerify.mockReturnValue({
      type: 'email.delivered',
      data: { email_id: 'em_123', to: ['user@example.com'], subject: 'secret subject' },
    });

    await resendWebhookService.handle('{"type":"email.delivered"}', HEADERS);

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'email.delivery_event',
        entityId: 'em_123',
        metadata: expect.objectContaining({ provider: 'resend', type: 'email.delivered', to: 'user@example.com' }),
      }),
    );
    const call = audit.mock.calls[0][0];
    expect(JSON.stringify(call.metadata)).not.toContain('secret subject');
  });

  it('ignores a duplicate delivery (dedupe) without a second audit write', async () => {
    mockVerify.mockReturnValue({ type: 'email.delivered', data: { email_id: 'em_1', to: 'a@example.com' } });
    r.set
      .mockResolvedValueOnce('OK') // first delivery: NX succeeds
      .mockResolvedValueOnce(null); // retry: NX fails (already seen)

    await resendWebhookService.handle('{}', HEADERS);
    expect(audit).toHaveBeenCalledTimes(1);

    await resendWebhookService.handle('{}', HEADERS);
    expect(audit).toHaveBeenCalledTimes(1);
  });
});
