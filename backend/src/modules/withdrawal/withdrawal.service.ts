import { Prisma, type CryptoWithdrawal, type WithdrawalStatus } from '@prisma/client';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { ledgerService } from '../ledger/ledger.service';
import { withdrawalRepository } from './withdrawal.repository';
import {
  ASSET,
  CHAIN,
  LEDGER,
  WithdrawalAction,
  humanToBase,
  toCryptoWithdrawalDto,
  toWithdrawalAddressDto,
} from './withdrawal.types';
import type {
  CryptoWithdrawalDto,
  WithdrawalAddressDto,
  WithdrawalContext,
} from './withdrawal.types';
import type { LedgerPostingLine } from '../ledger/ledger.types';
import type { WithdrawalSignerProvider } from './providers';

function isFrozen(value: unknown): boolean {
  return Boolean((value as { enabled?: boolean } | null)?.enabled);
}

/**
 * Retry an idempotent ledger posting on a serialization write-conflict (P2034).
 * LedgerService runs each posting in a SERIALIZABLE transaction, which can fail
 * under concurrency; because `ledgerService.post` de-dupes on
 * (referenceType, referenceId), retrying is always safe and never double-posts.
 */
async function postWithRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2034'
      ) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 15 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export const withdrawalService = {
  // ==================================================================
  // Allowlist
  // ==================================================================
  async addAddress(
    userId: string,
    input: { chain: string; address: string; label?: string },
    ctx: WithdrawalContext = {},
  ): Promise<WithdrawalAddressDto> {
    if (input.chain !== CHAIN) {
      throw new AppError(`Only ${CHAIN} is supported`, 422, 'CHAIN_NOT_SUPPORTED');
    }
    const existing = await withdrawalRepository.findActiveAddress(
      userId,
      input.chain,
      input.address,
    );
    if (existing) {
      throw new ConflictError('Address is already allowlisted', 'ADDRESS_EXISTS');
    }
    // Cooling-off: address is not usable until whitelistedAt has elapsed.
    const whitelistedAt = new Date(Date.now() + config.withdrawal.addressCooldownMs);
    const row = await withdrawalRepository.addAddress({
      userId,
      chain: input.chain,
      address: input.address,
      label: input.label ?? null,
      whitelistedAt,
    });
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: WithdrawalAction.ADDRESS_ADDED,
      entityType: 'withdrawal_address',
      entityId: row.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { chain: input.chain, address: input.address },
    });
    return toWithdrawalAddressDto(row);
  },

  async listAddresses(userId: string, chain?: string): Promise<WithdrawalAddressDto[]> {
    const rows = await withdrawalRepository.listAddresses(userId, chain);
    const now = new Date();
    return rows.map((r) => toWithdrawalAddressDto(r, now));
  },

  // ==================================================================
  // Request + hold
  // ==================================================================
  async requestWithdrawal(
    userId: string,
    input: { toAddress: string; amount: string },
    ctx: WithdrawalContext = {},
  ): Promise<CryptoWithdrawalDto> {
    // 16. Global freeze kill-switch.
    const freeze = await withdrawalRepository.getWithdrawalFreeze();
    if (isFrozen(freeze?.value)) {
      throw new ForbiddenError('Withdrawals are currently frozen', 'WITHDRAWALS_FROZEN');
    }

    // KYC + account state.
    const user = await withdrawalRepository.findUserKyc(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_INACTIVE');
    }
    if (user.withdrawalsBlocked) {
      throw new ForbiddenError(
        'Withdrawals are blocked for this account',
        'WITHDRAWALS_BLOCKED',
      );
    }
    if (user.kycStatus !== 'APPROVED' || user.kycTier < 1) {
      throw new ForbiddenError('KYC approval is required to withdraw', 'KYC_REQUIRED');
    }

    const token = await withdrawalRepository.getSupportedToken(ASSET, CHAIN);
    if (!token || !token.contractAddr) {
      throw new AppError(`${ASSET} on ${CHAIN} is not supported`, 422, 'ASSET_NOT_SUPPORTED');
    }

    // 1. Allowlist enforcement (+ cooling-off).
    const allow = await withdrawalRepository.findActiveAddress(
      userId,
      CHAIN,
      input.toAddress,
    );
    if (!allow) {
      throw new AppError(
        'Destination address is not allowlisted',
        422,
        'ADDRESS_NOT_ALLOWLISTED',
      );
    }
    if (!allow.whitelistedAt || allow.whitelistedAt > new Date()) {
      throw new ForbiddenError(
        'Destination address is still in its cooling-off period',
        'ADDRESS_COOLING_OFF',
      );
    }

    // Amount, fee, net.
    const amount = new Prisma.Decimal(input.amount);
    const fee = new Prisma.Decimal(config.withdrawal.feeUsdt);
    if (amount.lte(fee)) {
      throw new AppError(
        `Amount must exceed the ${fee.toFixed()} ${ASSET} fee`,
        422,
        'AMOUNT_TOO_SMALL',
      );
    }
    const netAmount = amount.sub(fee);

    // 5. Daily tier limit (USDT).
    const limit = await withdrawalRepository.getTierLimit(user.kycTier);
    if (limit?.usdtDailyWithdrawal) {
      const today = await withdrawalRepository.sumTodayWithdrawals(userId, ASSET);
      if (today.add(amount).gt(limit.usdtDailyWithdrawal)) {
        throw new AppError(
          'Daily withdrawal limit exceeded',
          422,
          'LIMIT_EXCEEDED',
        );
      }
    }

    const withdrawal = await withdrawalRepository.createWithdrawal({
      userId,
      chain: CHAIN,
      asset: ASSET,
      toAddress: input.toAddress,
      amount,
      fee,
      netAmount,
    });

    // 6. Ledger hold: USER_AVAILABLE → USER_LOCKED (atomic balance check).
    let held: CryptoWithdrawal;
    try {
      const posting = await this.placeHold(withdrawal);
      held = await withdrawalRepository.setHold(withdrawal.id, posting.id);
    } catch (err) {
      if (err instanceof ConflictError) {
        await withdrawalRepository.markRequestFailed(withdrawal.id, 'insufficient_balance');
      }
      throw err;
    }

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: WithdrawalAction.REQUESTED,
      entityType: 'crypto_withdrawal',
      entityId: held.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        chain: CHAIN,
        asset: ASSET,
        amount: amount.toFixed(),
        toAddress: input.toAddress,
        holdTxnId: held.holdTxnId,
      },
    });
    return toCryptoWithdrawalDto(held);
  },

  async getWithdrawal(userId: string, id: string): Promise<CryptoWithdrawalDto> {
    const row = await withdrawalRepository.findByIdForUser(id, userId);
    if (!row) throw new NotFoundError('Withdrawal not found');
    return toCryptoWithdrawalDto(row);
  },

  async listUserWithdrawals(input: {
    userId: string;
    status?: WithdrawalStatus;
    cursor?: string;
    limit: number;
  }): Promise<{ items: CryptoWithdrawalDto[]; nextCursor: string | null }> {
    const rows = await withdrawalRepository.listUserWithdrawals(input);
    const hasMore = rows.length > input.limit;
    const slice = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items: slice.map(toCryptoWithdrawalDto),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  // ==================================================================
  // Admin: queue + approve/reject
  // ==================================================================
  async adminListQueue(
    input: { status?: WithdrawalStatus; userId?: string; cursor?: string; limit: number },
    ctx: WithdrawalContext = {},
  ): Promise<{ items: CryptoWithdrawalDto[]; nextCursor: string | null }> {
    const rows = await withdrawalRepository.adminListQueue(input);
    const hasMore = rows.length > input.limit;
    const slice = hasMore ? rows.slice(0, input.limit) : rows;
    await this.auditAdmin(ctx, {
      action: WithdrawalAction.ADMIN_QUEUE_VIEW,
      targetType: 'crypto_withdrawal_queue',
      afterState: { count: slice.length },
    });
    return {
      items: slice.map(toCryptoWithdrawalDto),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  async approve(
    id: string,
    ctx: WithdrawalContext,
  ): Promise<CryptoWithdrawalDto> {
    const existing = await withdrawalRepository.findById(id);
    if (!existing) throw new NotFoundError('Withdrawal not found');
    const res = await withdrawalRepository.approve(id, ctx.actorId ?? '');
    if (res.count === 0) {
      // Idempotent: already approved (or beyond) is not an error.
      if (existing.status !== 'PENDING_APPROVAL' && existing.approvedBy) {
        return toCryptoWithdrawalDto(existing);
      }
      throw new ConflictError(
        `Withdrawal cannot be approved from status ${existing.status}`,
        'INVALID_STATE',
      );
    }
    const updated = await withdrawalRepository.findById(id);
    await this.auditAdmin(ctx, {
      action: WithdrawalAction.APPROVED,
      targetType: 'crypto_withdrawal',
      targetId: id,
      afterState: { status: 'APPROVED' },
    });
    return toCryptoWithdrawalDto(updated as CryptoWithdrawal);
  },

  async reject(
    id: string,
    reason: string,
    ctx: WithdrawalContext,
  ): Promise<CryptoWithdrawalDto> {
    const existing = await withdrawalRepository.findById(id);
    if (!existing) throw new NotFoundError('Withdrawal not found');
    const res = await withdrawalRepository.reject(id, ctx.actorId ?? '', reason);
    if (res.count === 0) {
      if (existing.status === 'REJECTED') return toCryptoWithdrawalDto(existing);
      throw new ConflictError(
        `Withdrawal cannot be rejected from status ${existing.status}`,
        'INVALID_STATE',
      );
    }
    // 15. Release the hold (idempotent via the release reference type).
    if (existing.holdTxnId) {
      await this.releaseHold(existing);
    }
    await this.auditAdmin(ctx, {
      action: WithdrawalAction.REJECTED,
      targetType: 'crypto_withdrawal',
      targetId: id,
      reason,
      afterState: { status: 'REJECTED' },
    });
    const updated = await withdrawalRepository.findById(id);
    return toCryptoWithdrawalDto(updated as CryptoWithdrawal);
  },

  // ==================================================================
  // Execution: broadcast (sign + nonce) and finalize / fail
  // ==================================================================
  async broadcastWithdrawal(
    withdrawal: CryptoWithdrawal,
    signer: WithdrawalSignerProvider,
  ): Promise<boolean> {
    // Atomically claim APPROVED → SIGNING so a second worker cannot re-broadcast.
    const claim = await withdrawalRepository.claimForBroadcast(withdrawal.id);
    if (claim.count === 0) return false;

    try {
      const token = await withdrawalRepository.getSupportedToken(ASSET, CHAIN);
      if (!token || !token.contractAddr) throw new Error('token_not_supported');
      const hot = await withdrawalRepository.pickActiveHotWallet(CHAIN);
      if (!hot || !hot.signer) throw new Error('no_active_hot_wallet');

      // 11. Nonce sequencing via wallet_nonces (atomic per hot wallet).
      const nonce = await withdrawalRepository.allocateNonce(hot.id);

      // Send the NET amount on-chain (fee is retained by the platform).
      const amountBase = humanToBase(withdrawal.netAmount.toFixed(), token.decimals);

      const signed = await signer.signTransfer({
        chain: CHAIN,
        asset: ASSET,
        contract: token.contractAddr,
        fromAddress: hot.address,
        toAddress: withdrawal.toAddress,
        amountBase,
        nonce,
        signer: {
          id: hot.signer.id,
          kmsKeyRef: hot.signer.kmsKeyRef,
          publicKey: hot.signer.publicKey,
        },
      });
      const result = await signer.broadcast({ chain: CHAIN, signedTx: signed });

      const updated = await withdrawalRepository.setBroadcast(withdrawal.id, {
        hotWalletId: hot.id,
        fromAddress: hot.address,
        nonce,
        txHash: result.txHash,
      });
      await recordAudit({
        actorType: 'SYSTEM',
        action: WithdrawalAction.BROADCAST,
        entityType: 'crypto_withdrawal',
        entityId: withdrawal.id,
        metadata: {
          fromAddress: hot.address,
          nonce: nonce.toString(),
          txHash: result.txHash,
          signer: signer.name,
        },
      });
      void updated;
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'broadcast_error';
      logger.error({ err, withdrawalId: withdrawal.id }, 'Withdrawal broadcast failed');
      await this.failWithdrawal(withdrawal, `broadcast_failed:${reason}`);
      return false;
    }
  },

  /** Finalize a confirmed withdrawal: ledger settle + COMPLETED, exactly once. */
  async finalizeWithdrawal(withdrawal: CryptoWithdrawal): Promise<boolean> {
    if (withdrawal.status === 'COMPLETED') return false;
    const posting = await this.finalizeLedger(withdrawal);
    const res = await withdrawalRepository.markCompleted(withdrawal.id, posting.id);
    if (res.count !== 1) return false; // a peer finalized it first
    await recordAudit({
      actorType: 'SYSTEM',
      action: WithdrawalAction.COMPLETED,
      entityType: 'crypto_withdrawal',
      entityId: withdrawal.id,
      metadata: { finalTxnId: posting.id, txHash: withdrawal.txHash },
    });
    return true;
  },

  /** Mark a withdrawal FAILED and release its hold (idempotent). */
  async failWithdrawal(withdrawal: CryptoWithdrawal, reason: string): Promise<boolean> {
    const res = await withdrawalRepository.markFailed(withdrawal.id, reason);
    if (res.count === 0) return false;
    if (withdrawal.holdTxnId) {
      await this.releaseHold(withdrawal);
    }
    await recordAudit({
      actorType: 'SYSTEM',
      action: WithdrawalAction.FAILED,
      entityType: 'crypto_withdrawal',
      entityId: withdrawal.id,
      metadata: { reason },
    });
    return true;
  },

  // ==================================================================
  // Ledger movements — the ONLY place balances move (all idempotent)
  // ==================================================================
  placeHold(withdrawal: CryptoWithdrawal) {
    const amount = withdrawal.amount.toFixed();
    return postWithRetry(() =>
      ledgerService.post(
        {
          kind: LEDGER.HOLD_KIND,
          referenceType: LEDGER.REF_HOLD,
          referenceId: withdrawal.id,
          metadata: { chain: withdrawal.chain, asset: withdrawal.asset },
          lines: [
            { kind: 'USER_AVAILABLE', userId: withdrawal.userId, asset: ASSET, direction: 'DEBIT', amount },
            { kind: 'USER_LOCKED', userId: withdrawal.userId, asset: ASSET, direction: 'CREDIT', amount },
          ],
        },
        { userId: withdrawal.userId },
      ),
    );
  },

  releaseHold(withdrawal: CryptoWithdrawal) {
    const amount = withdrawal.amount.toFixed();
    return postWithRetry(() =>
      ledgerService.post(
        {
          kind: LEDGER.RELEASE_KIND,
          referenceType: LEDGER.REF_RELEASE,
          referenceId: withdrawal.id,
          metadata: { chain: withdrawal.chain, asset: withdrawal.asset },
          lines: [
            { kind: 'USER_LOCKED', userId: withdrawal.userId, asset: ASSET, direction: 'DEBIT', amount },
            { kind: 'USER_AVAILABLE', userId: withdrawal.userId, asset: ASSET, direction: 'CREDIT', amount },
          ],
        },
        { userId: withdrawal.userId },
      ),
    );
  },

  finalizeLedger(withdrawal: CryptoWithdrawal) {
    const gross = withdrawal.amount.toFixed();
    const net = withdrawal.netAmount.toFixed();
    const fee = withdrawal.fee;
    // DEBIT user locked (gross) = CREDIT hot wallet (net) [+ CREDIT fee revenue].
    const lines: LedgerPostingLine[] = [
      { kind: 'USER_LOCKED', userId: withdrawal.userId, asset: ASSET, direction: 'DEBIT', amount: gross },
      { kind: 'HOT_WALLET', userId: null, asset: ASSET, direction: 'CREDIT', amount: net },
    ];
    if (fee.gt(0)) {
      lines.push({
        kind: 'FEE_REVENUE',
        userId: null,
        asset: ASSET,
        direction: 'CREDIT',
        amount: fee.toFixed(),
      });
    }
    return postWithRetry(() =>
      ledgerService.post(
        {
          kind: LEDGER.FINAL_KIND,
          referenceType: LEDGER.REF_FINAL,
          referenceId: withdrawal.id,
          metadata: { chain: withdrawal.chain, asset: withdrawal.asset, txHash: withdrawal.txHash },
          lines,
        },
        { userId: withdrawal.userId },
      ),
    );
  },

  // ==================================================================
  // Audit helper for admin actions (audit_logs + admin_logs)
  // ==================================================================
  async auditAdmin(
    ctx: WithdrawalContext,
    input: {
      action: string;
      targetType?: string;
      targetId?: string;
      reason?: string;
      afterState?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: input.action,
      entityType: input.targetType,
      entityId: input.targetId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: input.afterState,
    });
    if (ctx.actorId) {
      await withdrawalRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        afterState: input.afterState,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
    }
  },
};

export type WithdrawalService = typeof withdrawalService;
