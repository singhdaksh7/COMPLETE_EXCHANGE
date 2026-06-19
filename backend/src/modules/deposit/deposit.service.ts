import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type InrTransaction, type InrTxnStatus } from '@prisma/client';
import { config } from '../../config';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { ledgerService } from '../ledger/ledger.service';
import { depositRepository } from './deposit.repository';
import type { AdminDepositFilter } from './deposit.repository';
import { getRazorpayProvider } from './providers';
import { RAZORPAY_PROVIDER_ID } from './providers/razorpay.provider';
import {
  DepositAction,
  MANUAL_PROVIDER,
  RazorpayEvent,
  rupeesToPaise,
  toInrDepositDto,
} from './deposit.types';
import type {
  CreateDepositInput,
  CreateManualDepositInput,
  DepositContext,
  InrDepositDto,
  InrDepositIntentDto,
  ManualDecisionInput,
  VerifyPaymentInput,
  WebhookResult,
} from './deposit.types';

const INR = 'INR';
// Ledger txn kind for a gateway-funded INR credit.
const DEPOSIT_CREDIT_KIND = 'INR_DEPOSIT';
// Ledger txn kind for an admin-approved manual INR credit.
const DEPOSIT_CREDIT_MANUAL_KIND = 'INR_DEPOSIT_MANUAL';
const REFERENCE_TYPE = 'inr_transaction';

/** Normalized payment entity extracted from a Razorpay webhook payload. */
interface ParsedPayment {
  paymentId: string;
  orderId: string;
  amountPaise: number;
}

function parsePaymentEntity(payload: unknown): ParsedPayment | null {
  const entity = (payload as Record<string, unknown> | undefined)?.payment as
    | { entity?: Record<string, unknown> }
    | undefined;
  const e = entity?.entity;
  if (!e) return null;
  const paymentId = e.id;
  const orderId = e.order_id;
  const amount = e.amount;
  if (
    typeof paymentId !== 'string' ||
    typeof orderId !== 'string' ||
    typeof amount !== 'number'
  ) {
    return null;
  }
  return { paymentId, orderId, amountPaise: amount };
}

export const depositService = {
  // ------------------------------------------------------------------
  // 1. Create a Razorpay order for an INR deposit
  // ------------------------------------------------------------------
  async createDeposit(
    userId: string,
    input: CreateDepositInput,
    ctx: DepositContext = {},
  ): Promise<InrDepositIntentDto> {
    const user = await depositRepository.findUserKyc(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_INACTIVE');
    }
    // INR rails are KYC-gated (OpenAPI: 403 KYC_REQUIRED).
    if (user.kycStatus !== 'APPROVED' || user.kycTier < 1) {
      throw new ForbiddenError(
        'KYC approval is required to deposit INR',
        'KYC_REQUIRED',
      );
    }

    const amount = new Prisma.Decimal(input.amount);
    const min = new Prisma.Decimal(config.razorpay.depositMin);
    const max = new Prisma.Decimal(config.razorpay.depositMax);
    if (amount.lt(min)) {
      throw new AppError(
        `Deposit is below the minimum of ${min.toFixed(2)} INR`,
        422,
        'AMOUNT_BELOW_MINIMUM',
      );
    }
    if (amount.gt(max)) {
      throw new AppError(
        `Deposit exceeds the maximum of ${max.toFixed(2)} INR`,
        422,
        'LIMIT_EXCEEDED',
      );
    }
    // Guard against sub-paise precision before we ever talk to the gateway.
    const amountPaise = rupeesToPaise(input.amount);

    const provider = getRazorpayProvider();

    // Pre-allocate the deposit id so the gateway order's `receipt` and our DB
    // row share one identifier — no chicken-and-egg, no placeholder writes.
    const depositId = randomUUID();
    const order = await provider.createOrder({
      amountPaise,
      receipt: depositId,
      notes: { userId, inrTransactionId: depositId },
    });

    const deposit = await depositRepository.createDeposit({
      id: depositId,
      userId,
      amount,
      provider: RAZORPAY_PROVIDER_ID,
      providerOrderId: order.id,
      metadata: { amountPaise } as Prisma.InputJsonValue,
    });

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: DepositAction.INITIATED,
      entityType: REFERENCE_TYPE,
      entityId: deposit.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        provider: RAZORPAY_PROVIDER_ID,
        providerOrderId: order.id,
        amount: amount.toFixed(2),
        amountPaise,
      },
    });

    return {
      inrTransactionId: deposit.id,
      provider: RAZORPAY_PROVIDER_ID,
      providerOrderId: order.id,
      keyId: provider.keyId,
      amount: deposit.amount.toFixed(2),
      status: deposit.status,
    };
  },

  // ------------------------------------------------------------------
  // 2. Verify the browser checkout payment signature
  // ------------------------------------------------------------------
  async verifyPayment(
    userId: string,
    input: VerifyPaymentInput,
    ctx: DepositContext = {},
  ): Promise<InrDepositDto> {
    const deposit = await depositRepository.findDepositByOrderId(
      RAZORPAY_PROVIDER_ID,
      input.orderId,
    );
    if (!deposit || deposit.userId !== userId) {
      throw new NotFoundError('Deposit not found');
    }

    const provider = getRazorpayProvider();
    const ok = provider.verifyPaymentSignature({
      orderId: input.orderId,
      paymentId: input.paymentId,
      signature: input.signature,
    });
    if (!ok) {
      await recordAudit({
        actorType: 'USER',
        actorId: userId,
        action: DepositAction.PAYMENT_VERIFY_FAILED,
        entityType: REFERENCE_TYPE,
        entityId: deposit.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        metadata: { providerOrderId: input.orderId },
      });
      throw new AppError(
        'Razorpay payment signature is invalid',
        400,
        'INVALID_SIGNATURE',
      );
    }

    // Signature is valid. Record the payment id and move to PENDING. The
    // authoritative credit happens on the server-to-server `payment.captured`
    // webhook — never here — so a forged/replayed client call can never credit.
    let updated = deposit;
    if (deposit.status === 'INITIATED') {
      updated = await depositRepository.attachPayment(deposit.id, {
        providerPaymentId: input.paymentId,
        status: 'PENDING',
      });
    }

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: DepositAction.PAYMENT_VERIFIED,
      entityType: REFERENCE_TYPE,
      entityId: deposit.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { providerPaymentId: input.paymentId },
    });

    return toInrDepositDto(updated);
  },

  // ------------------------------------------------------------------
  // 3 + 4. Webhook ingestion — signature verified + idempotent
  // ------------------------------------------------------------------
  async handleWebhook(
    input: {
      rawBody: string | undefined;
      signature: string | undefined;
      eventId: string | undefined;
      body: unknown;
    },
    ctx: DepositContext = {},
  ): Promise<WebhookResult> {
    if (!input.rawBody) {
      throw new BadRequestError('Missing webhook body');
    }
    if (!input.signature) {
      throw new BadRequestError('Missing X-Razorpay-Signature header');
    }

    const provider = getRazorpayProvider();
    const signatureOk = provider.verifyWebhookSignature({
      rawBody: input.rawBody,
      signature: input.signature,
    });

    const payload = input.body as Record<string, unknown>;
    const eventType =
      typeof payload?.event === 'string' ? payload.event : 'unknown';
    // Prefer Razorpay's delivery id header; fall back to a deterministic id over
    // the raw body so we still dedupe redeliveries that omit the header.
    const providerEventId =
      input.eventId ?? `body:${hashRawBody(input.rawBody)}`;

    // 7. Persist the event. The table is append-only, so `processedAt` is
    //    stamped now (at receipt) and never updated. A valid event is marked
    //    processed; an invalid-signature event is recorded unprocessed for
    //    forensics. Idempotency comes from the unique (provider, eventId) insert.
    const { created, event } = await depositRepository.recordWebhookEvent({
      provider: RAZORPAY_PROVIDER_ID,
      providerEventId,
      eventType,
      signatureOk,
      payload: payload as Prisma.InputJsonValue,
      processedAt: signatureOk ? new Date() : null,
    });

    if (!signatureOk) {
      await recordAudit({
        actorType: 'SYSTEM',
        action: DepositAction.WEBHOOK_INVALID_SIGNATURE,
        entityType: 'payment_webhook_event',
        entityId: event.id,
        ip: ctx.ip,
        requestId: ctx.requestId,
        metadata: { eventType, providerEventId },
      });
      throw new AppError(
        'Razorpay webhook signature is invalid',
        400,
        'INVALID_WEBHOOK_SIGNATURE',
      );
    }

    // 4. Idempotent processing: a redelivery (the INSERT lost the unique race)
    //    is a no-op replay — the original delivery already settled it. The
    //    settle path is itself idempotent, so this is belt-and-suspenders.
    if (!created) {
      return { received: true, duplicate: true };
    }

    let status: string | undefined;
    if (
      eventType === RazorpayEvent.PAYMENT_CAPTURED ||
      eventType === RazorpayEvent.ORDER_PAID
    ) {
      const payment = parsePaymentEntity(payload.payload);
      if (payment) status = await this.settleCapturedPayment(payment, ctx);
    } else if (eventType === RazorpayEvent.PAYMENT_FAILED) {
      const payment = parsePaymentEntity(payload.payload);
      if (payment) status = await this.markPaymentFailed(payment, ctx);
    }

    return { received: true, duplicate: false, status };
  },

  // ------------------------------------------------------------------
  // 5. Credit INR balance — EXCLUSIVELY through the double-entry ledger.
  //     Idempotent across duplicate webhooks via three independent guards:
  //       (a) deposit.status === SUCCESS short-circuit,
  //       (b) ledgerService.post de-dupes on (referenceType, referenceId),
  //       (c) unique (provider, provider_payment_id) on inr_transactions.
  // ------------------------------------------------------------------
  async settleCapturedPayment(
    payment: ParsedPayment,
    ctx: DepositContext = {},
  ): Promise<string> {
    const deposit = await depositRepository.findDepositByOrderId(
      RAZORPAY_PROVIDER_ID,
      payment.orderId,
    );
    if (!deposit) {
      // Order we never created — record nothing to credit; safe no-op.
      return 'UNKNOWN_ORDER';
    }

    // (a) Already credited → idempotent no-op.
    if (deposit.status === 'SUCCESS') return deposit.status;
    if (deposit.status === 'FAILED' || deposit.status === 'REVERSED') {
      return deposit.status;
    }

    // Defend against amount tampering: the captured amount MUST equal the
    // amount we created the order for (compared in integer paise, no floats).
    const expectedPaise = rupeesToPaise(deposit.amount.toFixed(2));
    if (payment.amountPaise !== expectedPaise) {
      await depositRepository.markFailed(deposit.id, {
        providerPaymentId: payment.paymentId,
        reason: 'amount_mismatch',
      });
      await recordAudit({
        actorType: 'SYSTEM',
        action: DepositAction.FAILED,
        entityType: REFERENCE_TYPE,
        entityId: deposit.id,
        requestId: ctx.requestId,
        metadata: {
          reason: 'amount_mismatch',
          expectedPaise,
          actualPaise: payment.amountPaise,
        },
      });
      return 'FAILED';
    }

    const amount = deposit.amount.toFixed(2);
    // (b) Double-entry posting: gateway clearing → user available INR.
    const posted = await ledgerService.post(
      {
        kind: DEPOSIT_CREDIT_KIND,
        referenceType: REFERENCE_TYPE,
        referenceId: deposit.id,
        metadata: {
          provider: RAZORPAY_PROVIDER_ID,
          providerOrderId: payment.orderId,
          providerPaymentId: payment.paymentId,
        },
        lines: [
          {
            kind: 'GATEWAY_CLEARING',
            userId: null,
            asset: INR,
            direction: 'DEBIT',
            amount,
          },
          {
            kind: 'USER_AVAILABLE',
            userId: deposit.userId,
            asset: INR,
            direction: 'CREDIT',
            amount,
          },
        ],
      },
      { userId: deposit.userId, requestId: ctx.requestId, ip: ctx.ip },
    );

    // (c) Flip the deposit to SUCCESS and bind the crediting ledger txn.
    const credited = await depositRepository.markCredited(deposit.id, {
      providerPaymentId: payment.paymentId,
      ledgerTxnId: posted.id,
    });

    await recordAudit({
      actorType: 'SYSTEM',
      action: DepositAction.CREDITED,
      entityType: REFERENCE_TYPE,
      entityId: deposit.id,
      requestId: ctx.requestId,
      metadata: {
        amount,
        ledgerTxnId: posted.id,
        providerPaymentId: payment.paymentId,
      },
    });

    return credited.status;
  },

  async markPaymentFailed(
    payment: ParsedPayment,
    ctx: DepositContext = {},
  ): Promise<string> {
    const deposit = await depositRepository.findDepositByOrderId(
      RAZORPAY_PROVIDER_ID,
      payment.orderId,
    );
    if (!deposit) return 'UNKNOWN_ORDER';
    // Never override a successful credit with a late failure event.
    if (deposit.status === 'SUCCESS') return deposit.status;
    const failed = await depositRepository.markFailed(deposit.id, {
      providerPaymentId: payment.paymentId,
      reason: 'payment_failed',
    });
    await recordAudit({
      actorType: 'SYSTEM',
      action: DepositAction.FAILED,
      entityType: REFERENCE_TYPE,
      entityId: deposit.id,
      requestId: ctx.requestId,
      metadata: { providerPaymentId: payment.paymentId, reason: 'payment_failed' },
    });
    return failed.status;
  },

  // ------------------------------------------------------------------
  // 6 + 9. Status tracking / user history
  // ------------------------------------------------------------------
  async getDeposit(userId: string, id: string): Promise<InrDepositDto> {
    const deposit = await depositRepository.findDepositById(id);
    if (!deposit || deposit.userId !== userId || deposit.type !== 'DEPOSIT') {
      throw new NotFoundError('Deposit not found');
    }
    return toInrDepositDto(deposit);
  },

  async listUserDeposits(input: {
    userId: string;
    status?: InrTxnStatus;
    cursor?: string;
    limit: number;
  }): Promise<{ items: InrDepositDto[]; nextCursor: string | null }> {
    const rows = await depositRepository.listUserDeposits(input);
    return page(rows, input.limit);
  },

  // ------------------------------------------------------------------
  // M1. Manual INR deposit — user submits amount + UTR (+ optional proof).
  //     Lands PENDING; no money moves until an admin approves. Razorpay is not
  //     involved. The unique (provider, utr) index blocks duplicate UTRs.
  // ------------------------------------------------------------------
  async createManualDeposit(
    userId: string,
    input: CreateManualDepositInput,
    ctx: DepositContext = {},
  ): Promise<InrDepositDto> {
    const user = await depositRepository.findUserKyc(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_INACTIVE');
    }
    // INR rails are KYC-gated (parity with the gateway deposit path).
    if (user.kycStatus !== 'APPROVED' || user.kycTier < 1) {
      throw new ForbiddenError(
        'KYC approval is required to deposit INR',
        'KYC_REQUIRED',
      );
    }

    const amount = new Prisma.Decimal(input.amount);
    const min = new Prisma.Decimal(config.razorpay.depositMin);
    const max = new Prisma.Decimal(config.razorpay.depositMax);
    if (amount.lt(min)) {
      throw new AppError(
        `Deposit is below the minimum of ${min.toFixed(2)} INR`,
        422,
        'AMOUNT_BELOW_MINIMUM',
      );
    }
    if (amount.gt(max)) {
      throw new AppError(
        `Deposit exceeds the maximum of ${max.toFixed(2)} INR`,
        422,
        'LIMIT_EXCEEDED',
      );
    }
    // Reject sub-paise precision up front (same invariant as the gateway path).
    rupeesToPaise(input.amount);

    const deposit = await depositRepository.createManualDeposit({
      id: randomUUID(),
      userId,
      amount,
      provider: MANUAL_PROVIDER,
      utr: input.utr,
      method: input.method,
      proofKey: input.proofKey,
    });

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: DepositAction.MANUAL_SUBMITTED,
      entityType: REFERENCE_TYPE,
      entityId: deposit.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        provider: MANUAL_PROVIDER,
        method: input.method,
        amount: amount.toFixed(2),
        utr: input.utr,
      },
    });

    return toInrDepositDto(deposit);
  },

  // ------------------------------------------------------------------
  // M2. Admin approve — credit the user's INR balance EXCLUSIVELY through the
  //     double-entry ledger. Idempotent via three guards:
  //       (a) status === SUCCESS short-circuit,
  //       (b) ledgerService.post de-dupes on (referenceType, referenceId),
  //       (c) conditional updateMany WHERE status = PENDING.
  // ------------------------------------------------------------------
  async approveManualDeposit(
    depositId: string,
    ctx: DepositContext = {},
  ): Promise<InrDepositDto> {
    if (!ctx.actorId) throw new ForbiddenError('Admin context required');
    const deposit = await depositRepository.adminFindDepositById(depositId);
    if (
      !deposit ||
      deposit.type !== 'DEPOSIT' ||
      deposit.provider !== MANUAL_PROVIDER
    ) {
      throw new NotFoundError('Manual deposit not found');
    }
    // (a) Already credited → idempotent no-op.
    if (deposit.status === 'SUCCESS') return toInrDepositDto(deposit);
    if (deposit.status !== 'PENDING') {
      throw new ConflictError(
        `Manual deposit cannot be approved from status ${deposit.status}`,
        'INVALID_STATE',
      );
    }

    // Maker-checker: deposits at/above the threshold need two DIFFERENT admins.
    const threshold = new Prisma.Decimal(config.inrOps.dualApprovalThreshold);
    const requiresDual = deposit.amount.gte(threshold);

    // ----- FIRST approval of a dual-approval deposit: record, do NOT credit ---
    if (requiresDual && !deposit.firstApprovedBy) {
      const { updated, row } = await depositRepository.markFirstApproval(
        deposit.id,
        { firstApprovedBy: ctx.actorId },
      );
      if (!row) throw new NotFoundError('Manual deposit not found');
      if (updated) {
        await recordAudit({
          actorType: 'ADMIN',
          actorId: ctx.actorId,
          action: DepositAction.MANUAL_FIRST_APPROVED,
          entityType: REFERENCE_TYPE,
          entityId: deposit.id,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
          metadata: { amount: deposit.amount.toFixed(2), utr: deposit.utr },
        });
        await depositRepository.writeAdminLog({
          adminId: ctx.actorId,
          action: DepositAction.MANUAL_FIRST_APPROVED,
          targetType: REFERENCE_TYPE,
          targetId: deposit.id,
          ip: ctx.ip,
          requestId: ctx.requestId,
          beforeState: { status: 'PENDING', firstApprovedBy: null },
          afterState: {
            status: 'PENDING_SECOND_APPROVAL',
            firstApprovedBy: ctx.actorId,
          },
        });
      }
      return toInrDepositDto(row);
    }

    // ----- Same admin cannot perform the second approval --------------------
    if (requiresDual && deposit.firstApprovedBy === ctx.actorId) {
      throw new ForbiddenError(
        'A second, different admin must approve this deposit',
        'SAME_APPROVER',
      );
    }

    // ----- Credit step: single approval (below threshold) OR second approval
    //       (dual, by a different admin). Money moves here, exactly once. ------
    const creditAction = requiresDual
      ? DepositAction.MANUAL_SECOND_APPROVED
      : DepositAction.MANUAL_APPROVED;
    const amount = deposit.amount.toFixed(2);
    // (b) Double-entry posting: manual bank clearing → user available INR.
    const posted = await ledgerService.post(
      {
        kind: DEPOSIT_CREDIT_MANUAL_KIND,
        referenceType: REFERENCE_TYPE,
        referenceId: deposit.id,
        metadata: {
          provider: MANUAL_PROVIDER,
          utr: deposit.utr,
          method: deposit.method,
          firstApprovedBy: deposit.firstApprovedBy,
          approvedBy: ctx.actorId,
        },
        lines: [
          {
            kind: 'MANUAL_BANK_CLEARING',
            userId: null,
            asset: INR,
            direction: 'DEBIT',
            amount,
          },
          {
            kind: 'USER_AVAILABLE',
            userId: deposit.userId,
            asset: INR,
            direction: 'CREDIT',
            amount,
          },
        ],
      },
      { userId: deposit.userId, requestId: ctx.requestId, ip: ctx.ip },
    );

    // (c) Flip PENDING → SUCCESS, bind ledger txn + final reviewing admin.
    const { updated, row } = await depositRepository.markManualApproved(
      deposit.id,
      { reviewedBy: ctx.actorId, ledgerTxnId: posted.id },
    );
    if (!row) throw new NotFoundError('Manual deposit not found');

    // Only the approval that actually flipped the row writes the trail, so a
    // lost race doesn't double-log (the ledger posting is already idempotent).
    if (updated) {
      await recordAudit({
        actorType: 'ADMIN',
        actorId: ctx.actorId,
        action: creditAction,
        entityType: REFERENCE_TYPE,
        entityId: deposit.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        metadata: {
          amount,
          ledgerTxnId: posted.id,
          utr: deposit.utr,
          firstApprovedBy: deposit.firstApprovedBy,
          dualApproval: requiresDual,
        },
      });
      await depositRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: creditAction,
        targetType: REFERENCE_TYPE,
        targetId: deposit.id,
        ip: ctx.ip,
        requestId: ctx.requestId,
        beforeState: { status: 'PENDING', firstApprovedBy: deposit.firstApprovedBy },
        afterState: { status: 'SUCCESS', ledgerTxnId: posted.id },
      });
    }

    return toInrDepositDto(row);
  },

  // ------------------------------------------------------------------
  // M3. Admin reject — mark FAILED with a reason. No ledger posting ever.
  // ------------------------------------------------------------------
  async rejectManualDeposit(
    depositId: string,
    input: ManualDecisionInput,
    ctx: DepositContext = {},
  ): Promise<InrDepositDto> {
    if (!ctx.actorId) throw new ForbiddenError('Admin context required');
    const deposit = await depositRepository.adminFindDepositById(depositId);
    if (
      !deposit ||
      deposit.type !== 'DEPOSIT' ||
      deposit.provider !== MANUAL_PROVIDER
    ) {
      throw new NotFoundError('Manual deposit not found');
    }
    if (deposit.status === 'SUCCESS') {
      throw new ConflictError(
        'A credited deposit cannot be rejected',
        'ALREADY_CREDITED',
      );
    }
    // Already rejected → idempotent no-op.
    if (deposit.status === 'FAILED') return toInrDepositDto(deposit);
    if (deposit.status !== 'PENDING') {
      throw new ConflictError(
        `Manual deposit cannot be rejected from status ${deposit.status}`,
        'INVALID_STATE',
      );
    }

    const { updated, row } = await depositRepository.markManualRejected(
      deposit.id,
      { reviewedBy: ctx.actorId, reason: input.reason },
    );
    if (!row) throw new NotFoundError('Manual deposit not found');

    if (updated) {
      await recordAudit({
        actorType: 'ADMIN',
        actorId: ctx.actorId,
        action: DepositAction.MANUAL_REJECTED,
        entityType: REFERENCE_TYPE,
        entityId: deposit.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        metadata: { reason: input.reason ?? null, utr: deposit.utr },
      });
      await depositRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: DepositAction.MANUAL_REJECTED,
        targetType: REFERENCE_TYPE,
        targetId: deposit.id,
        reason: input.reason,
        ip: ctx.ip,
        requestId: ctx.requestId,
        beforeState: { status: 'PENDING' },
        afterState: { status: 'FAILED', rejectionReason: input.reason ?? null },
      });
    }

    return toInrDepositDto(row);
  },

  // ------------------------------------------------------------------
  // 8. Admin deposit monitoring (filterable) + CSV export
  // ------------------------------------------------------------------
  async adminListDeposits(
    input: AdminDepositFilter & { cursor?: string; limit: number },
    ctx: DepositContext = {},
  ): Promise<{ items: InrDepositDto[]; nextCursor: string | null }> {
    const rows = await depositRepository.adminListDeposits(input);
    const result = page(rows, input.limit);
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: DepositAction.ADMIN_LIST,
      entityType: 'inr_deposit_queue',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { count: result.items.length, filters: input as object },
    });
    if (ctx.actorId) {
      await depositRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: DepositAction.ADMIN_LIST,
        targetType: 'inr_deposit_queue',
        ip: ctx.ip,
        requestId: ctx.requestId,
        afterState: { count: result.items.length },
      });
    }
    return result;
  },

  /** CSV export of INR deposits (no secrets — id, user email, amount, UTR,
   *  method, status, approvers, timestamps). */
  async adminExportDepositsCsv(
    input: AdminDepositFilter,
    ctx: DepositContext = {},
  ): Promise<string> {
    const rows = await depositRepository.adminExportDeposits(input);
    if (ctx.actorId) {
      await depositRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: 'inr.deposit.export',
        targetType: 'inr_deposit_queue',
        ip: ctx.ip,
        requestId: ctx.requestId,
        afterState: { count: rows.length },
      });
    }
    const header = [
      'id',
      'user_email',
      'amount',
      'utr',
      'method',
      'status',
      'first_approved_by',
      'reviewed_by',
      'reviewed_at',
      'created_at',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.user.email,
          r.amount.toFixed(2),
          r.utr ?? '',
          r.method ?? '',
          r.status,
          r.firstApprovedBy ?? '',
          r.reviewedBy ?? '',
          r.reviewedAt ? r.reviewedAt.toISOString() : '',
          r.createdAt.toISOString(),
        ]
          .map(csvCell)
          .join(','),
      );
    }
    return lines.join('\n');
  },
};

/** Quote a CSV cell when it contains a comma, quote, or newline. */
function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function page(
  rows: InrTransaction[],
  limit: number,
): { items: InrDepositDto[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: slice.map(toInrDepositDto),
    nextCursor: hasMore ? slice[slice.length - 1].id : null,
  };
}

function hashRawBody(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('hex').slice(0, 32);
}

export type DepositService = typeof depositService;
