import { Prisma, type MasterWalletDeposit } from '@prisma/client';
import { AppError, BadRequestError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { ledgerService } from '../ledger/ledger.service';
import { cryptoDepositRepository as repo } from './crypto-deposit.repository';
import {
  SUPPORTED_CHAINS,
  cryptoDepositsEnabled,
  getNetwork,
  isNetworkConfigured,
  isNetworkEnabled,
  listEnabledPublicNetworks,
  toPublicNetwork,
  type PublicNetworkDto,
  type ResolvedNetwork,
} from './crypto-deposit.config';
import { usdtDepositVerifier } from './verification';
import type { VerificationResult } from './verification';
import {
  toAdminMasterDepositDto,
  toMasterDepositDto,
  type AdminMasterDepositDto,
  type CryptoDepositContext,
  type MasterDepositDto,
} from './crypto-deposit.types';
import type {
  AdminCryptoDepositListQueryDto,
  CryptoDepositListQueryDto,
  SubmitCryptoDepositDto,
} from './crypto-deposit.validators';

const ASSET = 'USDT';
const REFERENCE_TYPE = 'master_wallet_deposit';
const CREDIT_KIND = 'CRYPTO_DEPOSIT_CREDIT';

/** EVM hashes are normalized to lowercase; TRON hashes are left as-is. */
function normalizeTxHash(chain: string, txHash: string): string {
  const t = txHash.trim();
  return chain === 'TRON' ? t : t.toLowerCase();
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

export const cryptoDepositService = {
  // ------------------------------------------------------------------
  // Public network list (secrets-free). Includes the global enabled flag so a
  // disabled feature renders an empty, explained surface instead of crashing.
  // ------------------------------------------------------------------
  listNetworks(): { enabled: boolean; networks: PublicNetworkDto[] } {
    return {
      enabled: cryptoDepositsEnabled(),
      networks: listEnabledPublicNetworks(),
    };
  },

  // ------------------------------------------------------------------
  // User: submit a tx hash for verification + (if confirmed) crediting.
  // ------------------------------------------------------------------
  async submit(
    userId: string,
    input: SubmitCryptoDepositDto,
    ctx: CryptoDepositContext = {},
  ): Promise<MasterDepositDto> {
    if (!cryptoDepositsEnabled()) {
      throw new AppError('Crypto deposits are currently disabled', 422, 'CRYPTO_DEPOSITS_DISABLED');
    }
    const network = getNetwork(input.chain);
    if (!network) throw new BadRequestError('Unsupported chain');
    if (!isNetworkEnabled(network) || !network.masterAddress) {
      throw new AppError(
        `${input.chain} USDT deposits are not available`,
        422,
        'NETWORK_NOT_AVAILABLE',
      );
    }

    const txHash = normalizeTxHash(input.chain, input.txHash);

    const existing = await repo.findByChainTxHash(input.chain, txHash);
    if (existing) {
      return this.handleExisting(existing, userId, network, ctx);
    }

    let deposit: MasterWalletDeposit;
    try {
      deposit = await repo.create({
        userId,
        assetSymbol: ASSET,
        chain: input.chain,
        masterAddress: network.masterAddress,
        txHash,
      });
    } catch (err) {
      // Lost the race to a concurrent submit of the same (chain, txHash).
      if (isUniqueViolation(err)) {
        const row = await repo.findByChainTxHash(input.chain, txHash);
        if (row) return this.handleExisting(row, userId, network, ctx);
      }
      throw err;
    }

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: 'crypto_deposit.submit',
      entityType: REFERENCE_TYPE,
      entityId: deposit.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { chain: input.chain, asset: ASSET },
    });

    const processed = await this.verifyAndProcess(deposit, ctx);
    return toMasterDepositDto(processed, network.minConfirmations);
  },

  /** Resolve a resubmission of an already-seen (chain, txHash). */
  async handleExisting(
    existing: MasterWalletDeposit,
    userId: string,
    network: ResolvedNetwork,
    ctx: CryptoDepositContext,
  ): Promise<MasterDepositDto> {
    if (existing.userId !== userId) {
      // Belongs to another account — never credit twice and never leak details.
      return {
        id: existing.id,
        assetSymbol: ASSET,
        chain: existing.chain,
        masterAddress: network.masterAddress ?? existing.masterAddress,
        fromAddress: null,
        txHash: existing.txHash,
        amount: '0',
        confirmations: 0,
        minConfirmations: network.minConfirmations,
        status: 'duplicate',
        rejectionReason: 'This transaction has already been submitted',
        creditedAt: null,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      };
    }
    // Same user — re-verify and return the current state (no new row).
    const updated = await this.verifyAndProcess(existing, ctx);
    return toMasterDepositDto(updated, network.minConfirmations);
  },

  // ------------------------------------------------------------------
  // Core: verify a deposit on-chain and move it to its next state.
  // Idempotent — a CONFIRMED deposit is never re-processed.
  // ------------------------------------------------------------------
  async verifyAndProcess(
    deposit: MasterWalletDeposit,
    ctx: CryptoDepositContext,
  ): Promise<MasterWalletDeposit> {
    if (deposit.status === 'CONFIRMED') return deposit;

    const network = getNetwork(deposit.chain);
    if (!network || !isNetworkConfigured(network)) {
      return repo.update(deposit.id, {
        status: 'FAILED',
        rejectionReason: 'provider_not_configured',
      });
    }

    const result = await usdtDepositVerifier.verifyTx({
      chain: network.chain,
      txHash: deposit.txHash,
      network,
    });
    const summary = (result.summary ?? {}) as Prisma.InputJsonValue;

    switch (result.outcome) {
      case 'CONFIRMED':
        return this.creditDeposit(deposit, result, ctx);
      case 'PENDING':
        return repo.update(deposit.id, {
          status: 'PENDING_CONFIRMATION',
          confirmations: result.confirmations ?? 0,
          ...(result.amount ? { amount: result.amount } : {}),
          fromAddress: result.fromAddress ?? null,
          logIndex: result.logIndex ?? null,
          rejectionReason: null,
          rawVerificationSummary: summary,
        });
      case 'REJECTED':
        return repo.update(deposit.id, {
          status: 'REJECTED',
          rejectionReason: result.reason ?? 'verification_failed',
          rawVerificationSummary: summary,
        });
      // PROVIDER_NOT_CONFIGURED / PROVIDER_ERROR → transient, safe to recheck.
      default:
        return repo.update(deposit.id, {
          status: 'FAILED',
          rejectionReason: result.reason ?? 'provider_error',
          rawVerificationSummary: summary,
        });
    }
  },

  /**
   * Credit a confirmed deposit EXACTLY ONCE. Two independent guards:
   *   (a) ledgerService.post de-dupes on (referenceType, referenceId),
   *   (b) repo.markCredited only flips a not-yet-CONFIRMED row.
   * So repeated submit/recheck can never double-credit.
   */
  async creditDeposit(
    deposit: MasterWalletDeposit,
    result: VerificationResult,
    ctx: CryptoDepositContext,
  ): Promise<MasterWalletDeposit> {
    const amount = result.amount;
    if (!amount || new Prisma.Decimal(amount).lte(0)) {
      // Never credit a non-positive amount.
      return repo.update(deposit.id, {
        status: 'REJECTED',
        rejectionReason: 'zero_amount',
      });
    }

    const posted = await ledgerService.post(
      {
        kind: CREDIT_KIND,
        referenceType: REFERENCE_TYPE,
        referenceId: deposit.id,
        metadata: {
          chain: deposit.chain,
          asset: ASSET,
          txHash: deposit.txHash,
        },
        lines: [
          { kind: 'SWEEP_CLEARING', userId: null, asset: ASSET, direction: 'DEBIT', amount },
          {
            kind: 'USER_AVAILABLE',
            userId: deposit.userId,
            asset: ASSET,
            direction: 'CREDIT',
            amount,
          },
        ],
      },
      { userId: deposit.userId, ip: ctx.ip, requestId: ctx.requestId },
    );

    const flip = await repo.markCredited(deposit.id, {
      ledgerTxnId: posted.id,
      amount,
      confirmations: result.confirmations ?? 0,
      fromAddress: result.fromAddress ?? null,
      logIndex: result.logIndex ?? null,
      rawVerificationSummary: (result.summary ?? {}) as Prisma.InputJsonValue,
    });

    // Audit only on the pass that actually performed the credit.
    if (flip.count === 1) {
      await recordAudit({
        actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
        actorId: ctx.actorId,
        action: 'crypto_deposit.credited',
        entityType: REFERENCE_TYPE,
        entityId: deposit.id,
        ip: ctx.ip,
        requestId: ctx.requestId,
        metadata: { amount, ledgerTxnId: posted.id, chain: deposit.chain, asset: ASSET },
      });
    }

    const fresh = await repo.findById(deposit.id);
    return fresh ?? deposit;
  },

  // ------------------------------------------------------------------
  // User: list own deposits.
  // ------------------------------------------------------------------
  async listForUser(
    userId: string,
    query: CryptoDepositListQueryDto,
  ): Promise<{ items: MasterDepositDto[]; nextCursor: string | null }> {
    const rows = await repo.listForUser({
      userId,
      status: query.status,
      chain: query.chain,
      cursor: query.cursor,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map((r) => toMasterDepositDto(r, getNetwork(r.chain)?.minConfirmations ?? null)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  },

  // ------------------------------------------------------------------
  // Admin: list + detail + recheck.
  // ------------------------------------------------------------------
  async adminList(
    query: AdminCryptoDepositListQueryDto,
  ): Promise<{ items: AdminMasterDepositDto[]; nextCursor: string | null }> {
    const rows = await repo.listForAdmin({
      status: query.status,
      chain: query.chain,
      userId: query.userId,
      txHash: query.txHash ? normalizeTxHash(query.chain ?? 'ETH', query.txHash) : undefined,
      fromDate: query.fromDate,
      toDate: query.toDate,
      cursor: query.cursor,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map((r) =>
        toAdminMasterDepositDto(r, getNetwork(r.chain)?.minConfirmations ?? null),
      ),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  },

  async adminGet(id: string): Promise<AdminMasterDepositDto> {
    const row = await repo.findByIdWithUser(id);
    if (!row) throw new NotFoundError('Crypto deposit not found');
    return toAdminMasterDepositDto(row, getNetwork(row.chain)?.minConfirmations ?? null);
  },

  /**
   * Admin recheck: re-run verification and credit once if now confirmed. Writes
   * the hash-chained audit + an admin_logs entry. Reuses the same idempotent
   * credit path, so a recheck can never double-credit.
   */
  async adminRecheck(
    id: string,
    ctx: CryptoDepositContext,
  ): Promise<AdminMasterDepositDto> {
    const deposit = await repo.findById(id);
    if (!deposit) throw new NotFoundError('Crypto deposit not found');
    const before = deposit.status;
    const updated = await this.verifyAndProcess(deposit, ctx);

    if (ctx.actorId) {
      await repo.writeAdminLog({
        adminId: ctx.actorId,
        action: 'crypto_deposit.recheck',
        targetType: REFERENCE_TYPE,
        targetId: id,
        beforeState: { status: before },
        afterState: { status: updated.status },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
    }
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: 'crypto_deposit.recheck',
      entityType: REFERENCE_TYPE,
      entityId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { from: before, to: updated.status },
    });

    return this.adminGet(id);
  },

  // ------------------------------------------------------------------
  // Startup: persist the PUBLIC network config projection (best-effort).
  // ------------------------------------------------------------------
  async seedNetworkConfigs(): Promise<void> {
    for (const chain of SUPPORTED_CHAINS) {
      const n = getNetwork(chain);
      if (!n) continue;
      try {
        const dto = toPublicNetwork(n);
        await repo.upsertNetworkConfig({
          assetSymbol: n.assetSymbol,
          chain: n.chain,
          networkName: n.networkName,
          masterAddress: n.masterAddress,
          tokenContract: n.tokenContract,
          decimals: n.decimals,
          minConfirmations: n.minConfirmations,
          isEnabled: dto.enabled,
        });
      } catch (err) {
        logger.warn({ err, chain }, 'crypto-deposit: network config seed failed (non-fatal)');
      }
    }
  },
};

export type CryptoDepositService = typeof cryptoDepositService;
