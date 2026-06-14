import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';

vi.mock('../../src/modules/deposit/deposit.repository', () => ({
  depositRepository: {
    findUserKyc: vi.fn(),
    createDeposit: vi.fn(),
    findDepositById: vi.fn(),
    findDepositByOrderId: vi.fn(),
    attachPayment: vi.fn(),
    markCredited: vi.fn(),
    markFailed: vi.fn(),
    listUserDeposits: vi.fn(),
    adminListDeposits: vi.fn(),
    recordWebhookEvent: vi.fn(),
    writeAdminLog: vi.fn(),
  },
}));

vi.mock('../../src/modules/ledger/ledger.service', () => ({
  ledgerService: { post: vi.fn() },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { config } from '../../src/config';
import { depositRepository } from '../../src/modules/deposit/deposit.repository';
import { ledgerService } from '../../src/modules/ledger/ledger.service';
import { depositService } from '../../src/modules/deposit/deposit.service';

const repo = vi.mocked(depositRepository);
const ledger = vi.mocked(ledgerService);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DEPOSIT_ID = '22222222-2222-4222-8222-222222222222';

function makeDeposit(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DEPOSIT_ID,
    userId: USER_ID,
    type: 'DEPOSIT',
    amount: new Prisma.Decimal('500.00'),
    fee: new Prisma.Decimal('0'),
    status: 'INITIATED',
    provider: 'razorpay',
    providerOrderId: 'order_test123',
    providerPaymentId: null,
    ledgerTxnId: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    bankRef: null,
    ...overrides,
  } as never;
}

function paymentSignature(orderId: string, paymentId: string): string {
  return createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function buildWebhook(eventType: string, p: {
  orderId: string;
  paymentId: string;
  amountPaise: number;
}) {
  const body = {
    event: eventType,
    payload: {
      payment: {
        entity: {
          id: p.paymentId,
          order_id: p.orderId,
          amount: p.amountPaise,
          currency: 'INR',
          status: 'captured',
        },
      },
    },
  };
  const rawBody = JSON.stringify(body);
  const signature = createHmac('sha256', config.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  return { body, rawBody, signature };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('depositService.createDeposit', () => {
  it('creates a gateway order and persists an INITIATED deposit for an approved user', async () => {
    repo.findUserKyc.mockResolvedValue({
      id: USER_ID,
      status: 'ACTIVE',
      kycStatus: 'APPROVED',
      kycTier: 1,
    } as never);
    repo.createDeposit.mockImplementation(
      async (d) => makeDeposit({ id: d.id, providerOrderId: d.providerOrderId }),
    );

    const intent = await depositService.createDeposit(USER_ID, {
      amount: '500.00',
    });

    expect(repo.createDeposit).toHaveBeenCalledOnce();
    expect(intent.provider).toBe('razorpay');
    expect(intent.providerOrderId).toMatch(/^order_/);
    expect(intent.amount).toBe('500.00');
    expect(intent.status).toBe('INITIATED');
  });

  it('rejects deposits when KYC is not approved', async () => {
    repo.findUserKyc.mockResolvedValue({
      id: USER_ID,
      status: 'ACTIVE',
      kycStatus: 'PENDING',
      kycTier: 0,
    } as never);

    await expect(
      depositService.createDeposit(USER_ID, { amount: '500.00' }),
    ).rejects.toMatchObject({ errorCode: 'KYC_REQUIRED' });
    expect(repo.createDeposit).not.toHaveBeenCalled();
  });

  it('rejects amounts below the configured minimum', async () => {
    repo.findUserKyc.mockResolvedValue({
      id: USER_ID,
      status: 'ACTIVE',
      kycStatus: 'APPROVED',
      kycTier: 1,
    } as never);

    await expect(
      depositService.createDeposit(USER_ID, { amount: '1.00' }),
    ).rejects.toMatchObject({ errorCode: 'AMOUNT_BELOW_MINIMUM' });
    expect(repo.createDeposit).not.toHaveBeenCalled();
  });
});

describe('depositService.verifyPayment', () => {
  it('accepts a valid signature and advances the deposit to PENDING', async () => {
    repo.findDepositByOrderId.mockResolvedValue(makeDeposit());
    repo.attachPayment.mockResolvedValue(
      makeDeposit({ status: 'PENDING', providerPaymentId: 'pay_ok' }),
    );

    const result = await depositService.verifyPayment(USER_ID, {
      orderId: 'order_test123',
      paymentId: 'pay_ok',
      signature: paymentSignature('order_test123', 'pay_ok'),
    });

    expect(result.status).toBe('PENDING');
    expect(repo.attachPayment).toHaveBeenCalledWith(DEPOSIT_ID, {
      providerPaymentId: 'pay_ok',
      status: 'PENDING',
    });
  });

  it('rejects an invalid signature and does NOT credit', async () => {
    repo.findDepositByOrderId.mockResolvedValue(makeDeposit());

    await expect(
      depositService.verifyPayment(USER_ID, {
        orderId: 'order_test123',
        paymentId: 'pay_ok',
        signature: 'deadbeef',
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_SIGNATURE' });
    expect(repo.attachPayment).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('does not leak other users\' deposits', async () => {
    repo.findDepositByOrderId.mockResolvedValue(
      makeDeposit({ userId: 'someone-else' }),
    );
    await expect(
      depositService.verifyPayment(USER_ID, {
        orderId: 'order_test123',
        paymentId: 'pay_ok',
        signature: paymentSignature('order_test123', 'pay_ok'),
      }),
    ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});

describe('depositService.handleWebhook', () => {
  it('credits exactly once via the ledger on payment.captured', async () => {
    const { body, rawBody, signature } = buildWebhook('payment.captured', {
      orderId: 'order_test123',
      paymentId: 'pay_cap',
      amountPaise: 50000,
    });
    repo.recordWebhookEvent.mockResolvedValue({
      created: true,
      event: { id: 'evt_1', processedAt: null } as never,
    });
    repo.findDepositByOrderId.mockResolvedValue(makeDeposit({ status: 'PENDING' }));
    ledger.post.mockResolvedValue({
      id: 'ltxn_1',
      kind: 'INR_DEPOSIT',
      entries: [],
    } as never);
    repo.markCredited.mockResolvedValue(makeDeposit({ status: 'SUCCESS' }));

    const result = await depositService.handleWebhook({
      rawBody,
      signature,
      eventId: 'evt_1',
      body,
    });

    expect(result).toMatchObject({ received: true, duplicate: false });
    expect(ledger.post).toHaveBeenCalledOnce();
    // The credit is a balanced gateway → user posting.
    const posting = ledger.post.mock.calls[0][0];
    expect(posting.kind).toBe('INR_DEPOSIT');
    expect(posting.referenceType).toBe('inr_transaction');
    expect(posting.referenceId).toBe(DEPOSIT_ID);
    expect(posting.lines).toEqual([
      expect.objectContaining({
        kind: 'GATEWAY_CLEARING',
        direction: 'DEBIT',
        amount: '500.00',
        userId: null,
      }),
      expect.objectContaining({
        kind: 'USER_AVAILABLE',
        direction: 'CREDIT',
        amount: '500.00',
        userId: USER_ID,
      }),
    ]);
    expect(repo.markCredited).toHaveBeenCalledWith(DEPOSIT_ID, {
      providerPaymentId: 'pay_cap',
      ledgerTxnId: 'ltxn_1',
    });
    // The event is stamped processed at INSERT time (append-only table).
    expect(repo.recordWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ signatureOk: true, processedAt: expect.any(Date) }),
    );
  });

  it('is idempotent: an already-processed event does not re-credit', async () => {
    const { body, rawBody, signature } = buildWebhook('payment.captured', {
      orderId: 'order_test123',
      paymentId: 'pay_cap',
      amountPaise: 50000,
    });
    repo.recordWebhookEvent.mockResolvedValue({
      created: false,
      event: { id: 'evt_1', processedAt: new Date() } as never,
    });

    const result = await depositService.handleWebhook({
      rawBody,
      signature,
      eventId: 'evt_1',
      body,
    });

    expect(result).toMatchObject({ received: true, duplicate: true });
    expect(ledger.post).not.toHaveBeenCalled();
    expect(repo.markCredited).not.toHaveBeenCalled();
  });

  it('rejects an invalid webhook signature and records it as not-ok', async () => {
    const { body, rawBody } = buildWebhook('payment.captured', {
      orderId: 'order_test123',
      paymentId: 'pay_cap',
      amountPaise: 50000,
    });
    repo.recordWebhookEvent.mockResolvedValue({
      created: true,
      event: { id: 'evt_bad', processedAt: null } as never,
    });

    await expect(
      depositService.handleWebhook({
        rawBody,
        signature: 'not-a-valid-signature',
        eventId: 'evt_bad',
        body,
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_WEBHOOK_SIGNATURE' });

    expect(repo.recordWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ signatureOk: false }),
    );
    expect(ledger.post).not.toHaveBeenCalled();
  });
});

describe('depositService.settleCapturedPayment guards', () => {
  it('short-circuits when the deposit is already SUCCESS (no double credit)', async () => {
    repo.findDepositByOrderId.mockResolvedValue(makeDeposit({ status: 'SUCCESS' }));
    const status = await depositService.settleCapturedPayment({
      orderId: 'order_test123',
      paymentId: 'pay_cap',
      amountPaise: 50000,
    });
    expect(status).toBe('SUCCESS');
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('fails the deposit on amount mismatch instead of crediting', async () => {
    repo.findDepositByOrderId.mockResolvedValue(makeDeposit({ status: 'PENDING' }));
    repo.markFailed.mockResolvedValue(makeDeposit({ status: 'FAILED' }));
    const status = await depositService.settleCapturedPayment({
      orderId: 'order_test123',
      paymentId: 'pay_cap',
      amountPaise: 49999, // ₹499.99 ≠ ordered ₹500.00
    });
    expect(status).toBe('FAILED');
    expect(ledger.post).not.toHaveBeenCalled();
    expect(repo.markFailed).toHaveBeenCalled();
  });
});
