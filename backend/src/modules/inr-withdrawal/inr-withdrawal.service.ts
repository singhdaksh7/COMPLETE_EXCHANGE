import { randomUUID } from 'node:crypto';
import { Prisma, type InrWithdrawal, type InrWithdrawalStatus } from '@prisma/client';
import { config } from '../../config';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { encryptPII, decryptPII } from '../../lib/encryption';
import { ledgerService } from '../ledger/ledger.service';
import { notificationService } from '../notification/notification.service';
import {
  inrWithdrawalRepository,
  type AdminWithdrawalFilter,
} from './inr-withdrawal.repository';
import {
  InrWithdrawalAction,
  WITHDRAWAL_LOCK_KIND,
  WITHDRAWAL_PAYOUT_KIND,
  WITHDRAWAL_PAYOUT_REFERENCE_TYPE,
  WITHDRAWAL_REFERENCE_TYPE,
  WITHDRAWAL_RELEASE_KIND,
  WITHDRAWAL_RELEASE_REFERENCE_TYPE,
  toAdminInrWithdrawalDto,
  toInrWithdrawalDto,
  type AdminInrWithdrawalDto,
  type CreateWithdrawalInput,
  type InrWithdrawalDto,
  type MarkPaidInput,
  type RejectWithdrawalInput,
  type WithdrawalContext,
} from './inr-withdrawal.types';

const INR = 'INR';

/** Decrypt the stored account number for the admin view; null-safe. */
function decryptAccountNumber(row: InrWithdrawal): string | null {
  if (!row.accountNumberEnc) return null;
  try {
    return decryptPII(Buffer.from(row.accountNumberEnc));
  } catch {
    // Never leak a crypto error to the caller; surface as "unavailable".
    return null;
  }
}

export const inrWithdrawalService = {
  // --------------------------------------------------------------------------
  // 1. User requests an INR withdrawal. Funds are RESERVED immediately
  //    (USER_AVAILABLE -> USER_LOCKED) through the double-entry ledger.
  // --------------------------------------------------------------------------
  async requestWithdrawal(
    userId: string,
    input: CreateWithdrawalInput,
    ctx: WithdrawalContext = {},
  ): Promise<InrWithdrawalDto> {
    const user = await inrWithdrawalRepository.findUserState(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_INACTIVE');
    }
    // INR rails are KYC-gated (parity with the INR deposit path).
    if (user.kycStatus !== 'APPROVED' || user.kycTier < 1) {
      throw new ForbiddenError(
        'KYC approval is required to withdraw INR',
        'KYC_REQUIRED',
      );
    }
    // Admin-set per-user withdrawal block (separate from the feature gate, which
    // is already enforced by requireUserFeature on the route).
    if (user.withdrawalsBlocked) {
      throw new ForbiddenError(
        'Withdrawals are currently blocked for your account',
        'WITHDRAWALS_BLOCKED',
      );
    }

    const amount = new Prisma.Decimal(input.amount);
    const min = new Prisma.Decimal(config.inrOps.withdrawalMin);
    const max = new Prisma.Decimal(config.inrOps.withdrawalMax);
    if (amount.lt(min)) {
      throw new AppError(
        `Withdrawal is below the minimum of ${min.toFixed(2)} INR`,
        422,
        'AMOUNT_BELOW_MINIMUM',
      );
    }
    if (amount.gt(max)) {
      throw new AppError(
        `Withdrawal exceeds the maximum of ${max.toFixed(2)} INR`,
        422,
        'LIMIT_EXCEEDED',
      );
    }
    // Reject sub-paise precision up front.
    if (!amount.mul(100).isInteger()) {
      throw new BadRequestError('INR amount has sub-paise precision');
    }

    // Friendly pre-check (the authoritative guard is the atomic ledger debit,
    // which fails closed if available balance is short at posting time).
    const wallet = await ledgerService.getInrWallet(userId).catch(() => null);
    const available = new Prisma.Decimal(wallet?.available ?? '0');
    if (available.lt(amount)) {
      throw new ConflictError(
        'Insufficient available INR balance',
        'INSUFFICIENT_BALANCE',
      );
    }

    // Build the payout snapshot. Account number is sealed (AES-256-GCM) before it
    // ever touches the DB; only the last 4 are kept in clear for display.
    const isBank = input.method === 'BANK';
    const accountNumber = isBank ? input.accountNumber!.trim() : undefined;

    const id = randomUUID();
    await inrWithdrawalRepository.create({
      id,
      userId,
      amount,
      payoutMethod: input.method,
      upiId: input.method === 'UPI' ? input.upiId!.trim() : null,
      accountNumberEnc: accountNumber ? encryptPII(accountNumber) : null,
      accountLast4: accountNumber ? accountNumber.slice(-4) : null,
      ifsc: isBank ? input.ifsc!.trim().toUpperCase() : null,
      holderName: isBank ? input.holderName!.trim() : null,
      bankName: isBank ? input.bankName?.trim() ?? null : null,
    });

    // Reserve funds: USER_AVAILABLE -> USER_LOCKED. Idempotent on referenceId.
    let lockTxnId: string;
    try {
      const posted = await ledgerService.post(
        {
          kind: WITHDRAWAL_LOCK_KIND,
          referenceType: WITHDRAWAL_REFERENCE_TYPE,
          referenceId: id,
          metadata: { method: input.method },
          lines: [
            {
              kind: 'USER_AVAILABLE',
              userId,
              asset: INR,
              direction: 'DEBIT',
              amount: amount.toFixed(2),
            },
            {
              kind: 'USER_LOCKED',
              userId,
              asset: INR,
              direction: 'CREDIT',
              amount: amount.toFixed(2),
            },
          ],
        },
        { userId, requestId: ctx.requestId, ip: ctx.ip },
      );
      lockTxnId = posted.id;
    } catch (err) {
      // Reserve failed (e.g. a balance race lost the atomic debit). The row has
      // no money movement bound to it, so roll it back cleanly.
      await inrWithdrawalRepository.deleteIfPending(id);
      await recordAudit({
        actorType: 'USER',
        actorId: userId,
        action: InrWithdrawalAction.RESERVE_FAILED,
        entityType: WITHDRAWAL_REFERENCE_TYPE,
        entityId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        metadata: { amount: amount.toFixed(2) },
      });
      if (err instanceof ConflictError) throw err;
      throw new ConflictError(
        'Insufficient available INR balance',
        'INSUFFICIENT_BALANCE',
      );
    }

    const bound = await inrWithdrawalRepository.setLockTxn(id, lockTxnId);

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: InrWithdrawalAction.REQUESTED,
      entityType: WITHDRAWAL_REFERENCE_TYPE,
      entityId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        amount: amount.toFixed(2),
        method: input.method,
        lockLedgerTxnId: lockTxnId,
      },
    });
    await notificationService
      .notify({
        userId,
        type: 'WITHDRAWAL_REQUESTED',
        metadata: { amount: amount.toFixed(2), asset: INR, method: input.method },
      })
      .catch(() => undefined);

    return toInrWithdrawalDto(bound);
  },

  // --------------------------------------------------------------------------
  // User reads (own only — IDOR-safe).
  // --------------------------------------------------------------------------
  async listUserWithdrawals(input: {
    userId: string;
    status?: InrWithdrawalStatus;
    cursor?: string;
    limit: number;
  }): Promise<{ items: InrWithdrawalDto[]; nextCursor: string | null }> {
    const rows = await inrWithdrawalRepository.listForUser(input);
    return pageUser(rows, input.limit);
  },

  async getUserWithdrawal(userId: string, id: string): Promise<InrWithdrawalDto> {
    const row = await inrWithdrawalRepository.findByIdForUser(id, userId);
    if (!row) throw new NotFoundError('Withdrawal not found');
    return toInrWithdrawalDto(row);
  },

  // --------------------------------------------------------------------------
  // Admin reads.
  // --------------------------------------------------------------------------
  async adminList(
    input: AdminWithdrawalFilter & { cursor?: string; limit: number },
    ctx: WithdrawalContext = {},
  ): Promise<{ items: AdminInrWithdrawalDto[]; nextCursor: string | null }> {
    const rows = await inrWithdrawalRepository.adminList(input);
    const hasMore = rows.length > input.limit;
    const slice = hasMore ? rows.slice(0, input.limit) : rows;
    if (ctx.actorId) {
      await inrWithdrawalRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: InrWithdrawalAction.ADMIN_LIST,
        targetType: 'inr_withdrawal_queue',
        ip: ctx.ip,
        requestId: ctx.requestId,
        afterState: { count: slice.length },
      });
    }
    return {
      // List view masks the account number (full number only on detail GET).
      items: slice.map((r) => toAdminInrWithdrawalDto(r, null)),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  async adminGet(id: string): Promise<AdminInrWithdrawalDto> {
    const row = await inrWithdrawalRepository.findById(id);
    if (!row) throw new NotFoundError('Withdrawal not found');
    return toAdminInrWithdrawalDto(row, decryptAccountNumber(row));
  },

  // --------------------------------------------------------------------------
  // 2. Admin approve — PENDING -> APPROVED. No money moves (already locked).
  // --------------------------------------------------------------------------
  async approve(
    id: string,
    ctx: WithdrawalContext = {},
  ): Promise<AdminInrWithdrawalDto> {
    if (!ctx.actorId) throw new ForbiddenError('Admin context required');
    const existing = await inrWithdrawalRepository.findById(id);
    if (!existing) throw new NotFoundError('Withdrawal not found');
    if (existing.status === 'APPROVED') {
      return toAdminInrWithdrawalDto(existing, decryptAccountNumber(existing));
    }
    if (existing.status !== 'PENDING') {
      throw new ConflictError(
        `Withdrawal cannot be approved from status ${existing.status}`,
        'INVALID_STATE',
      );
    }

    const { updated, row } = await inrWithdrawalRepository.approve(id, ctx.actorId);
    if (!row) throw new NotFoundError('Withdrawal not found');
    if (updated) {
      await this.audit(InrWithdrawalAction.APPROVED, row, ctx, {
        before: { status: 'PENDING' },
        after: { status: 'APPROVED' },
      });
      await notificationService
        .notify({
          userId: row.userId,
          type: 'WITHDRAWAL_APPROVED',
          metadata: { amount: row.amount.toFixed(2), asset: INR },
        })
        .catch(() => undefined);
    }
    return toAdminInrWithdrawalDto(row, decryptAccountNumber(row));
  },

  // --------------------------------------------------------------------------
  // 3. Admin reject — release the reservation (USER_LOCKED -> USER_AVAILABLE)
  //    then flip to REJECTED. Idempotent: the ledger dedupes on referenceId and
  //    the conditional update flips exactly one row.
  // --------------------------------------------------------------------------
  async reject(
    id: string,
    input: RejectWithdrawalInput,
    ctx: WithdrawalContext = {},
  ): Promise<AdminInrWithdrawalDto> {
    if (!ctx.actorId) throw new ForbiddenError('Admin context required');
    const existing = await inrWithdrawalRepository.findById(id);
    if (!existing) throw new NotFoundError('Withdrawal not found');
    if (existing.status === 'REJECTED') {
      return toAdminInrWithdrawalDto(existing, decryptAccountNumber(existing));
    }
    if (existing.status === 'PAID') {
      throw new ConflictError('A paid withdrawal cannot be rejected', 'ALREADY_PAID');
    }
    if (existing.status !== 'PENDING' && existing.status !== 'APPROVED') {
      throw new ConflictError(
        `Withdrawal cannot be rejected from status ${existing.status}`,
        'INVALID_STATE',
      );
    }

    // Release the held funds first. Idempotent on (referenceType, referenceId):
    // a distinct release referenceType keyed to the withdrawal UUID (NOT a
    // composite string — referenceId is a UUID column).
    await ledgerService.post(
      {
        kind: WITHDRAWAL_RELEASE_KIND,
        referenceType: WITHDRAWAL_RELEASE_REFERENCE_TYPE,
        referenceId: id,
        metadata: { reason: input.reason },
        lines: [
          {
            kind: 'USER_LOCKED',
            userId: existing.userId,
            asset: INR,
            direction: 'DEBIT',
            amount: existing.amount.toFixed(2),
          },
          {
            kind: 'USER_AVAILABLE',
            userId: existing.userId,
            asset: INR,
            direction: 'CREDIT',
            amount: existing.amount.toFixed(2),
          },
        ],
      },
      { userId: existing.userId, requestId: ctx.requestId, ip: ctx.ip },
    );

    const { updated, row } = await inrWithdrawalRepository.reject(
      id,
      ctx.actorId,
      input.reason,
    );
    if (!row) throw new NotFoundError('Withdrawal not found');
    if (updated) {
      await this.audit(InrWithdrawalAction.REJECTED, row, ctx, {
        before: { status: existing.status },
        after: { status: 'REJECTED', rejectionReason: input.reason },
        reason: input.reason,
      });
      await notificationService
        .notify({
          userId: row.userId,
          type: 'WITHDRAWAL_REJECTED',
          metadata: { amount: row.amount.toFixed(2), asset: INR, reason: input.reason },
        })
        .catch(() => undefined);
    }
    return toAdminInrWithdrawalDto(row, decryptAccountNumber(row));
  },

  // --------------------------------------------------------------------------
  // 4. Admin mark paid — finalize the payout (USER_LOCKED -> MANUAL_BANK_CLEARING)
  //    and record the UTR. Only from APPROVED. Idempotent on the payout ledger
  //    reference (inr_withdrawal_payout + withdrawal id) + the conditional
  //    APPROVED -> PAID update.
  // --------------------------------------------------------------------------
  async markPaid(
    id: string,
    input: MarkPaidInput,
    ctx: WithdrawalContext = {},
  ): Promise<AdminInrWithdrawalDto> {
    if (!ctx.actorId) throw new ForbiddenError('Admin context required');
    const existing = await inrWithdrawalRepository.findById(id);
    if (!existing) throw new NotFoundError('Withdrawal not found');
    if (existing.status === 'PAID') {
      return toAdminInrWithdrawalDto(existing, decryptAccountNumber(existing));
    }
    if (existing.status !== 'APPROVED') {
      throw new ConflictError(
        `Withdrawal must be APPROVED before it can be marked paid (current: ${existing.status})`,
        'INVALID_STATE',
      );
    }

    // Finalize: debit the locked funds, credit the manual bank-clearing account
    // (the exchange paid out from its bank). Idempotent on (referenceType,
    // referenceId): a distinct payout referenceType keyed to the withdrawal UUID
    // (NOT a composite string — referenceId is a UUID column).
    const posted = await ledgerService.post(
      {
        kind: WITHDRAWAL_PAYOUT_KIND,
        referenceType: WITHDRAWAL_PAYOUT_REFERENCE_TYPE,
        referenceId: id,
        metadata: { utr: input.utr },
        lines: [
          {
            kind: 'USER_LOCKED',
            userId: existing.userId,
            asset: INR,
            direction: 'DEBIT',
            amount: existing.amount.toFixed(2),
          },
          {
            kind: 'MANUAL_BANK_CLEARING',
            userId: null,
            asset: INR,
            direction: 'CREDIT',
            amount: existing.amount.toFixed(2),
          },
        ],
      },
      { userId: existing.userId, requestId: ctx.requestId, ip: ctx.ip },
    );

    const { updated, row } = await inrWithdrawalRepository.markPaid(id, {
      paidBy: ctx.actorId,
      utr: input.utr,
      finalLedgerTxnId: posted.id,
      note: input.note,
    });
    if (!row) throw new NotFoundError('Withdrawal not found');
    if (updated) {
      await this.audit(InrWithdrawalAction.PAID, row, ctx, {
        before: { status: 'APPROVED' },
        after: { status: 'PAID', utr: input.utr, finalLedgerTxnId: posted.id },
      });
      // NOTE: no auto-notification here — the shared WITHDRAWAL_COMPLETED copy
      // says "sent on-chain", which is wrong for a manual INR bank payout. The
      // PAID transition is fully captured in the audit + admin logs.
    }
    return toAdminInrWithdrawalDto(row, decryptAccountNumber(row));
  },

  /** Write both the append-only audit log and the admin log for an admin action. */
  async audit(
    action: string,
    row: InrWithdrawal,
    ctx: WithdrawalContext,
    states: {
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      reason?: string;
    },
  ): Promise<void> {
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action,
      entityType: WITHDRAWAL_REFERENCE_TYPE,
      entityId: row.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { amount: row.amount.toFixed(2), ...states.after },
    });
    if (ctx.actorId) {
      await inrWithdrawalRepository.writeAdminLog({
        adminId: ctx.actorId,
        action,
        targetType: WITHDRAWAL_REFERENCE_TYPE,
        targetId: row.id,
        reason: states.reason,
        beforeState: states.before as Prisma.InputJsonValue,
        afterState: states.after as Prisma.InputJsonValue,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
    }
  },
};

function pageUser(
  rows: InrWithdrawal[],
  limit: number,
): { items: InrWithdrawalDto[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: slice.map(toInrWithdrawalDto),
    nextCursor: hasMore ? slice[slice.length - 1].id : null,
  };
}

export type InrWithdrawalService = typeof inrWithdrawalService;
