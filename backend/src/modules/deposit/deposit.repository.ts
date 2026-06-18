import {
  Prisma,
  type InrTransaction,
  type InrTxnStatus,
  type PaymentWebhookEvent,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ConflictError } from '../../lib/errors';

/**
 * Repository layer: the ONLY place that talks to Prisma for INR deposits and
 * payment webhook events. The DB schema is frozen — this layer only reads/writes
 * the existing `inr_transactions` and `payment_webhook_events` tables.
 *
 * It NEVER mutates balances directly; crediting goes exclusively through
 * LedgerService (double-entry). This repo only tracks deposit STATE.
 */
export const depositRepository = {
  findUserKyc(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, kycStatus: true, kycTier: true },
    });
  },

  /** Create the deposit intent row (no money moved yet). */
  createDeposit(data: {
    id: string;
    userId: string;
    amount: Prisma.Decimal;
    provider: string;
    providerOrderId: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<InrTransaction> {
    return prisma.inrTransaction.create({
      data: {
        id: data.id,
        userId: data.userId,
        type: 'DEPOSIT',
        amount: data.amount,
        status: 'INITIATED',
        provider: data.provider,
        providerOrderId: data.providerOrderId,
        metadata: data.metadata,
      },
    });
  },

  findDepositById(id: string): Promise<InrTransaction | null> {
    return prisma.inrTransaction.findUnique({ where: { id } });
  },

  /**
   * Create a manual (non-gateway) INR deposit claim in PENDING state. No money
   * moves — an admin must approve before the ledger credits the user. The unique
   * (provider, utr) index is the duplicate-submission guard: a re-used UTR hits a
   * P2002 violation, surfaced here as a typed DUPLICATE_UTR conflict.
   */
  async createManualDeposit(data: {
    id: string;
    userId: string;
    amount: Prisma.Decimal;
    provider: string;
    utr: string;
    method: string;
    proofKey?: string;
  }): Promise<InrTransaction> {
    try {
      return await prisma.inrTransaction.create({
        data: {
          id: data.id,
          userId: data.userId,
          type: 'DEPOSIT',
          amount: data.amount,
          status: 'PENDING',
          provider: data.provider,
          utr: data.utr,
          method: data.method,
          proofKey: data.proofKey,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictError(
          'This UTR/reference has already been submitted',
          'DUPLICATE_UTR',
        );
      }
      throw err;
    }
  },

  /** Admin lookup by id (no user scoping) for the review/decision path. */
  adminFindDepositById(id: string): Promise<InrTransaction | null> {
    return prisma.inrTransaction.findUnique({ where: { id } });
  },

  /**
   * Flip a manual deposit PENDING → SUCCESS and bind the crediting ledger txn +
   * reviewing admin. Conditional on status='PENDING' so a concurrent double
   * approve (or an approve racing a reject) updates zero rows instead of
   * re-crediting. Returns the fresh row, or null when the guard matched nothing.
   */
  async markManualApproved(
    id: string,
    data: { reviewedBy: string; ledgerTxnId: string },
  ): Promise<{ updated: boolean; row: InrTransaction | null }> {
    const result = await prisma.inrTransaction.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'SUCCESS',
        reviewedBy: data.reviewedBy,
        reviewedAt: new Date(),
        ledgerTxnId: data.ledgerTxnId,
      },
    });
    const row = await prisma.inrTransaction.findUnique({ where: { id } });
    return { updated: result.count === 1, row };
  },

  /**
   * Reject a manual deposit PENDING → FAILED with a reason. Conditional on
   * status='PENDING' so a credited deposit can never be flipped to FAILED.
   */
  async markManualRejected(
    id: string,
    data: { reviewedBy: string; reason?: string },
  ): Promise<{ updated: boolean; row: InrTransaction | null }> {
    const result = await prisma.inrTransaction.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'FAILED',
        reviewedBy: data.reviewedBy,
        reviewedAt: new Date(),
        rejectionReason: data.reason,
      },
    });
    const row = await prisma.inrTransaction.findUnique({ where: { id } });
    return { updated: result.count === 1, row };
  },

  /** Resolve a deposit by its gateway order id (webhook → txn reconcile). */
  findDepositByOrderId(
    provider: string,
    providerOrderId: string,
  ): Promise<InrTransaction | null> {
    return prisma.inrTransaction.findFirst({
      where: { provider, providerOrderId, type: 'DEPOSIT' },
    });
  },

  /** Record the verified payment id and advance status (no credit yet). */
  attachPayment(
    id: string,
    data: { providerPaymentId: string; status: InrTxnStatus },
  ): Promise<InrTransaction> {
    return prisma.inrTransaction.update({
      where: { id },
      data: {
        providerPaymentId: data.providerPaymentId,
        status: data.status,
      },
    });
  },

  /**
   * Mark a deposit credited: SUCCESS + the ledger txn that did the crediting +
   * the settling payment id. Idempotent at the DB level via the unique
   * (provider, provider_payment_id) constraint.
   */
  markCredited(
    id: string,
    data: { providerPaymentId: string; ledgerTxnId: string },
  ): Promise<InrTransaction> {
    return prisma.inrTransaction.update({
      where: { id },
      data: {
        status: 'SUCCESS',
        providerPaymentId: data.providerPaymentId,
        ledgerTxnId: data.ledgerTxnId,
      },
    });
  },

  markFailed(
    id: string,
    data: { providerPaymentId?: string; reason?: string },
  ): Promise<InrTransaction> {
    return prisma.inrTransaction.update({
      where: { id },
      data: {
        status: 'FAILED',
        ...(data.providerPaymentId
          ? { providerPaymentId: data.providerPaymentId }
          : {}),
        ...(data.reason
          ? { metadata: { failureReason: data.reason } as Prisma.InputJsonValue }
          : {}),
      },
    });
  },

  listUserDeposits(input: {
    userId: string;
    status?: InrTxnStatus;
    cursor?: string;
    limit: number;
  }): Promise<InrTransaction[]> {
    return prisma.inrTransaction.findMany({
      where: {
        userId: input.userId,
        type: 'DEPOSIT',
        ...(input.status ? { status: input.status } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
    });
  },

  /** Admin monitoring view across all users, with optional filters. */
  adminListDeposits(input: {
    status?: InrTxnStatus;
    provider?: string;
    userId?: string;
    cursor?: string;
    limit: number;
  }): Promise<InrTransaction[]> {
    return prisma.inrTransaction.findMany({
      where: {
        type: 'DEPOSIT',
        ...(input.status ? { status: input.status } : {}),
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
    });
  },

  // ---------------------------------------------------------------------------
  // Webhook event persistence (idempotency ledger for inbound gateway events)
  // ---------------------------------------------------------------------------

  /**
   * Persist an inbound webhook event. The table is APPEND-ONLY (a DB trigger
   * rejects UPDATE/DELETE), so `processedAt` is stamped at INSERT time and never
   * mutated. Idempotency is enforced entirely by the unique
   * (provider, provider_event_id) constraint: a redelivery hits the violation
   * and is returned with `created: false`, so the caller skips reprocessing.
   */
  async recordWebhookEvent(data: {
    provider: string;
    providerEventId: string;
    eventType: string;
    signatureOk: boolean;
    payload: Prisma.InputJsonValue;
    processedAt: Date | null;
  }): Promise<{ created: boolean; event: PaymentWebhookEvent }> {
    try {
      const event = await prisma.paymentWebhookEvent.create({ data });
      return { created: true, event };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const event = await prisma.paymentWebhookEvent.findUniqueOrThrow({
          where: {
            provider_providerEventId: {
              provider: data.provider,
              providerEventId: data.providerEventId,
            },
          },
        });
        return { created: false, event };
      }
      throw err;
    }
  },

  writeAdminLog(data: {
    adminId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    reason?: string;
    beforeState?: Prisma.InputJsonValue;
    afterState?: Prisma.InputJsonValue;
    ip?: string;
    requestId?: string;
  }) {
    return prisma.adminLog.create({
      data: {
        adminId: data.adminId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
        beforeState: data.beforeState,
        afterState: data.afterState,
        ip: data.ip,
        requestId: data.requestId,
      },
    });
  },
};

export type DepositRepository = typeof depositRepository;
