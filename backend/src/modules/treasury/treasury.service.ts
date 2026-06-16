import {
  Prisma,
  type HotWallet,
  type TreasuryTransferType,
} from '@prisma/client';
import { config } from '../../config';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { ledgerService } from '../ledger/ledger.service';
import { treasuryRepository } from './treasury.repository';
import { notificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.types';
import {
  COLD_ACCOUNT,
  HOT_ACCOUNT,
  TREASURY_LEDGER,
  TreasuryAction,
  toTreasuryTransferDto,
  toTreasuryWalletDto,
  type TreasuryAssetPositionDto,
  type TreasuryContext,
  type TreasurySummaryDto,
  type TreasuryTransferDto,
  type TreasuryWalletDto,
} from './treasury.types';
import type {
  RejectBodyDto,
  TransferListQueryDto,
  TransferRequestDto,
} from './treasury.validators';

const dec = (v: Prisma.Decimal.Value): Prisma.Decimal => new Prisma.Decimal(v);
const isCold = (w: HotWallet): boolean => w.tier === 'COLD';

export const treasuryService = {
  // ==================================================================
  // 1–2. Wallet registries (hot = HOT/WARM, cold = COLD). Key-free.
  // ==================================================================
  async listHotWallets(
    filter: { chain?: string },
    ctx: TreasuryContext = {},
  ): Promise<TreasuryWalletDto[]> {
    const rows = await treasuryRepository.listWalletsByTier({
      tiers: ['HOT', 'WARM'],
      chain: filter.chain,
    });
    await this.audit(ctx, {
      action: TreasuryAction.HOT_WALLET_LIST,
      targetType: 'hot_wallet_registry',
      afterState: { count: rows.length, filters: filter },
    });
    return rows.map(toTreasuryWalletDto);
  },

  async listColdWallets(
    filter: { chain?: string },
    ctx: TreasuryContext = {},
  ): Promise<TreasuryWalletDto[]> {
    const rows = await treasuryRepository.listWalletsByTier({
      tiers: ['COLD'],
      chain: filter.chain,
    });
    await this.audit(ctx, {
      action: TreasuryAction.COLD_WALLET_LIST,
      targetType: 'cold_wallet_registry',
      afterState: { count: rows.length, filters: filter },
    });
    return rows.map(toTreasuryWalletDto);
  },

  // ==================================================================
  // 10. Treasury health summary — custody positions + counts.
  // ==================================================================
  async getSummary(ctx: TreasuryContext = {}): Promise<TreasurySummaryDto> {
    const [balances, walletGroups, pendingTransfers] = await Promise.all([
      treasuryRepository.custodyBalances(),
      treasuryRepository.countWallets(),
      treasuryRepository.countByStatus('PENDING_APPROVAL'),
    ]);

    const byAsset = new Map<string, TreasuryAssetPositionDto>();
    for (const b of balances) {
      const key = b.asset.toUpperCase();
      const entry =
        byAsset.get(key) ?? { asset: key, hot: '0', cold: '0', total: '0' };
      if (b.kind === 'HOT_WALLET') entry.hot = b.balance.toFixed();
      if (b.kind === 'COLD_WALLET') entry.cold = b.balance.toFixed();
      entry.total = dec(entry.hot).add(dec(entry.cold)).toFixed();
      byAsset.set(key, entry);
    }

    let hot = 0;
    let cold = 0;
    let activeHot = 0;
    let activeCold = 0;
    for (const g of walletGroups) {
      const n = g._count._all;
      if (g.tier === 'COLD') {
        cold += n;
        if (g.isActive) activeCold += n;
      } else {
        hot += n;
        if (g.isActive) activeHot += n;
      }
    }

    await this.audit(ctx, {
      action: TreasuryAction.SUMMARY_VIEW,
      targetType: 'treasury_summary',
      afterState: { assets: byAsset.size, pendingTransfers },
    });

    return {
      positions: [...byAsset.values()].sort((a, b) => a.asset.localeCompare(b.asset)),
      wallets: { hot, cold, activeHot, activeCold },
      pendingTransfers,
      dualControl: config.treasury.dualControl,
    };
  },

  // ==================================================================
  // 8. Transfer history
  // ==================================================================
  async listTransfers(
    input: TransferListQueryDto,
    ctx: TreasuryContext = {},
  ): Promise<{ items: TreasuryTransferDto[]; nextCursor: string | null }> {
    const rows = await treasuryRepository.listTransfers(input);
    const hasMore = rows.length > input.limit;
    const slice = hasMore ? rows.slice(0, input.limit) : rows;
    await this.audit(ctx, {
      action: TreasuryAction.TRANSFER_LIST,
      targetType: 'treasury_transfer_queue',
      afterState: { count: slice.length, filters: input as object },
    });
    return {
      items: slice.map(toTreasuryTransferDto),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  // ==================================================================
  // 5–6. Sweep (hot→cold) and refill (cold→hot) request flows
  // ==================================================================
  async requestSweep(
    input: TransferRequestDto,
    ctx: TreasuryContext,
  ): Promise<TreasuryTransferDto> {
    return this.createTransfer('SWEEP', input, ctx);
  },

  async requestRefill(
    input: TransferRequestDto,
    ctx: TreasuryContext,
  ): Promise<TreasuryTransferDto> {
    return this.createTransfer('REFILL', input, ctx);
  },

  async createTransfer(
    type: TreasuryTransferType,
    input: TransferRequestDto,
    ctx: TreasuryContext,
  ): Promise<TreasuryTransferDto> {
    const [from, to] = await Promise.all([
      treasuryRepository.findWalletById(input.fromWalletId),
      treasuryRepository.findWalletById(input.toWalletId),
    ]);
    if (!from || !to) throw new NotFoundError('Wallet not found', 'WALLET_NOT_FOUND');

    if (from.chain.toUpperCase() !== to.chain.toUpperCase()) {
      throw new AppError('Source and destination wallets are on different chains', 422, 'WALLET_CHAIN_MISMATCH');
    }
    if (!from.isActive || !to.isActive) {
      throw new AppError('Both wallets must be active', 422, 'WALLET_INACTIVE');
    }

    // Direction ⇄ tier invariant. SWEEP empties a hot/warm wallet into cold;
    // REFILL tops a hot/warm wallet back up from cold.
    if (type === 'SWEEP' && (isCold(from) || !isCold(to))) {
      throw new AppError('A sweep must move funds from a hot wallet to a cold wallet', 422, 'INVALID_SWEEP_WALLETS');
    }
    if (type === 'REFILL' && (!isCold(from) || isCold(to))) {
      throw new AppError('A refill must move funds from a cold wallet to a hot wallet', 422, 'INVALID_REFILL_WALLETS');
    }

    const chain = from.chain;
    const supported = await treasuryRepository.assetSupportedOnChain(chain, input.asset);
    if (!supported) {
      throw new AppError(`Asset ${input.asset} is not supported on ${chain}`, 422, 'ASSET_NOT_SUPPORTED');
    }

    // The custody position the funds leave (the ledger source account).
    const sourceKind = type === 'SWEEP' ? HOT_ACCOUNT : COLD_ACCOUNT;
    const available = await treasuryRepository.systemBalance(sourceKind, input.asset);
    if (dec(input.amount).gt(available)) {
      throw new AppError(
        `Insufficient ${sourceKind} ${input.asset} custody balance for this transfer`,
        422,
        'INSUFFICIENT_CUSTODY_BALANCE',
      );
    }

    const row = await treasuryRepository.createTransfer({
      type,
      chain,
      asset: input.asset,
      fromWalletId: from.id,
      toWalletId: to.id,
      amount: dec(input.amount),
      reason: input.reason ?? null,
      requestedBy: ctx.actorId ?? '',
    });

    await this.audit(ctx, {
      action: type === 'SWEEP' ? TreasuryAction.SWEEP_REQUESTED : TreasuryAction.REFILL_REQUESTED,
      targetType: 'treasury_transfer',
      targetId: row.id,
      afterState: {
        type,
        chain,
        asset: input.asset,
        amount: input.amount,
        fromWalletId: from.id,
        toWalletId: to.id,
      },
    });

    await notificationService.notifyAdmins({
      type: NotificationType.ADMIN_TREASURY_PENDING,
      title: 'Treasury transfer pending approval',
      message: `A ${type} of ${input.amount} ${input.asset} on ${chain} is awaiting approval.`,
      severity: 'WARNING',
      metadata: { transferId: row.id, type, chain, asset: input.asset, amount: input.amount },
    });

    const full = await treasuryRepository.findTransferById(row.id);
    return toTreasuryTransferDto(full ?? row);
  },

  // ==================================================================
  // 7. Approve / reject transfer requests (dual-control aware)
  // ==================================================================
  async approve(id: string, ctx: TreasuryContext): Promise<TreasuryTransferDto> {
    const transfer = await treasuryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError('Transfer not found', 'TRANSFER_NOT_FOUND');
    if (transfer.status !== 'PENDING_APPROVAL') {
      if (transfer.status === 'COMPLETED') return toTreasuryTransferDto(transfer);
      throw new ConflictError(`Transfer cannot be approved from status ${transfer.status}`, 'INVALID_STATE');
    }

    const approver = ctx.actorId ?? '';
    // Separation of duties: the requester can never approve their own transfer.
    if (approver === transfer.requestedBy) {
      throw new ForbiddenError('You cannot approve a transfer you requested', 'SELF_APPROVAL_FORBIDDEN');
    }

    const dualControl = config.treasury.dualControl;

    // Dual-control, first approval: record it and PARK at PENDING_APPROVAL until
    // a second, distinct admin signs off. No funds move yet.
    if (dualControl && !transfer.approvedBy) {
      const res = await treasuryRepository.recordFirstApproval(id, approver);
      if (res.count === 0) throw new ConflictError('Transfer is no longer pending', 'INVALID_STATE');
      await this.audit(ctx, {
        action: TreasuryAction.TRANSFER_APPROVED_FIRST,
        targetType: 'treasury_transfer',
        targetId: id,
        afterState: { firstApprover: approver },
      });
      const parked = await treasuryRepository.findTransferById(id);
      return toTreasuryTransferDto(parked ?? transfer);
    }

    // Second approver (dual-control) must differ from the first.
    const secondApprover = dualControl;
    if (secondApprover && approver === transfer.approvedBy) {
      throw new ForbiddenError('A second, distinct approver is required', 'SECOND_APPROVER_REQUIRED');
    }

    // Atomically claim PENDING_APPROVAL → APPROVED so we execute exactly once.
    const claim = await treasuryRepository.claimForExecution(id, approver, secondApprover);
    if (claim.count === 0) throw new ConflictError('Transfer is no longer pending', 'INVALID_STATE');

    const executed = await this.execute(id, ctx);
    await this.audit(ctx, {
      action: TreasuryAction.TRANSFER_APPROVED,
      targetType: 'treasury_transfer',
      targetId: id,
      afterState: { approver, dualControl, status: executed.status },
    });
    return executed;
  },

  /**
   * Execute an APPROVED transfer: post the balanced HOT_WALLET ⇄ COLD_WALLET
   * ledger move (idempotent on the transfer id) and mark it COMPLETED. Signing
   * is MOCKED — a pseudo tx hash records the (non-)broadcast. Re-checks the
   * source custody balance first; a shortfall FAILS the transfer (no posting).
   */
  async execute(id: string, ctx: TreasuryContext): Promise<TreasuryTransferDto> {
    const transfer = await treasuryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError('Transfer not found', 'TRANSFER_NOT_FOUND');

    const sourceKind = transfer.type === 'SWEEP' ? HOT_ACCOUNT : COLD_ACCOUNT;
    const destKind = transfer.type === 'SWEEP' ? COLD_ACCOUNT : HOT_ACCOUNT;
    const available = await treasuryRepository.systemBalance(sourceKind, transfer.asset);
    if (transfer.amount.gt(available)) {
      await treasuryRepository.failTransfer(id, 'INSUFFICIENT_CUSTODY_BALANCE');
      await this.audit(ctx, {
        action: TreasuryAction.TRANSFER_FAILED,
        targetType: 'treasury_transfer',
        targetId: id,
        afterState: { reason: 'INSUFFICIENT_CUSTODY_BALANCE' },
      });
      throw new AppError(
        `Insufficient ${sourceKind} ${transfer.asset} custody balance to execute this transfer`,
        422,
        'INSUFFICIENT_CUSTODY_BALANCE',
      );
    }

    const amount = transfer.amount.toFixed();
    const ledgerTxn = await ledgerService.post({
      kind: TREASURY_LEDGER.KIND,
      referenceType: TREASURY_LEDGER.REFERENCE_TYPE,
      referenceId: transfer.id,
      metadata: { type: transfer.type, chain: transfer.chain, asset: transfer.asset },
      lines: [
        { kind: sourceKind, userId: null, asset: transfer.asset, direction: 'DEBIT', amount },
        { kind: destKind, userId: null, asset: transfer.asset, direction: 'CREDIT', amount },
      ],
    });

    // Mock broadcast — NO real signing/network. The signer's KMS ref lives on
    // the wallet's ChainSigner; we never touch key material here.
    const txHash = `mock-treasury-${transfer.id}`;
    const completed = await treasuryRepository.completeTransfer(id, {
      ledgerTxnId: ledgerTxn.id,
      txHash,
    });

    await this.audit(ctx, {
      action: TreasuryAction.TRANSFER_EXECUTED,
      targetType: 'treasury_transfer',
      targetId: id,
      afterState: { ledgerTxnId: ledgerTxn.id, txHash, amount, asset: transfer.asset },
    });

    const full = await treasuryRepository.findTransferById(id);
    return toTreasuryTransferDto(full ?? completed);
  },

  async reject(
    id: string,
    body: RejectBodyDto,
    ctx: TreasuryContext,
  ): Promise<TreasuryTransferDto> {
    const transfer = await treasuryRepository.findTransferById(id);
    if (!transfer) throw new NotFoundError('Transfer not found', 'TRANSFER_NOT_FOUND');
    if (transfer.status !== 'PENDING_APPROVAL') {
      if (transfer.status === 'REJECTED') return toTreasuryTransferDto(transfer);
      throw new ConflictError(`Transfer cannot be rejected from status ${transfer.status}`, 'INVALID_STATE');
    }

    const res = await treasuryRepository.rejectTransfer(id, ctx.actorId ?? '', body.reason);
    if (res.count === 0) throw new ConflictError('Transfer is no longer pending', 'INVALID_STATE');

    await this.audit(ctx, {
      action: TreasuryAction.TRANSFER_REJECTED,
      targetType: 'treasury_transfer',
      targetId: id,
      reason: body.reason,
      afterState: { status: 'REJECTED' },
    });
    const updated = await treasuryRepository.findTransferById(id);
    return toTreasuryTransferDto(updated ?? transfer);
  },

  // ------------------------------------------------------------------
  // Audit helper — writes audit_logs AND admin_logs (treasury trail).
  // ------------------------------------------------------------------
  async audit(
    ctx: TreasuryContext,
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
      await treasuryRepository.writeAdminLog({
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

export type TreasuryService = typeof treasuryService;
