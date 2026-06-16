import type { DepositStatus, Prisma, WithdrawalStatus } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { scannerService } from '../scanner/scanner.service';
import { scannerRepository } from '../scanner/scanner.repository';
import { getChainProvider } from '../scanner/providers';
import { chainsRepository } from './chains.repository';

/**
 * Multi-chain admin service (Phase 5.1). Read-only aggregation across the chain
 * reference data, the deposit scanner, and crypto withdrawals — every call is
 * audited and exposes no key material.
 */

export interface ChainContext {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

function providerMode(chain: string): 'mock' | 'live' | 'unknown' {
  try {
    return getChainProvider(chain).mode;
  } catch {
    return 'unknown';
  }
}

export const chainsService = {
  async listChains(ctx: ChainContext = {}) {
    const rows = await chainsRepository.listChains();
    const items = rows.map((c) => ({
      chain: c.id,
      name: c.name,
      family: c.family,
      isActive: c.isActive,
      nativeAsset: c.nativeAsset,
      confirmations: c.confirmations,
      provider: { mode: providerMode(c.id) },
      networks: c.assetChains.map((ac) => ({
        asset: ac.asset,
        contractAddr: ac.contractAddr,
        decimals: ac.decimals,
        minConfirmations: ac.minConfirmations,
      })),
      cursor: c.cursor
        ? {
            lastScannedBlock: c.cursor.lastScannedBlock.toString(),
            safeBlock: c.cursor.safeBlock.toString(),
            updatedAt: c.cursor.updatedAt,
          }
        : null,
    }));
    await this.audit(ctx, { action: 'chains.list', targetType: 'chain_list', afterState: { count: items.length } });
    return { items };
  },

  async getHealth(chain: string, ctx: ChainContext = {}) {
    // Reuses the scanner health check (provider head + cursor lag + counts).
    return scannerService.getHealth(chain, ctx);
  },

  async getCursor(chain: string, ctx: ChainContext = {}) {
    const cursor = await scannerRepository.getCursor(chain);
    await this.audit(ctx, { action: 'chains.cursor_view', targetType: 'chain_cursor', targetId: chain, afterState: { found: cursor != null } });
    return {
      chain,
      cursor: cursor
        ? {
            lastScannedBlock: cursor.lastScannedBlock.toString(),
            lastScannedHash: cursor.lastScannedHash,
            safeBlock: cursor.safeBlock.toString(),
            updatedAt: cursor.updatedAt,
          }
        : null,
    };
  },

  async listDeposits(
    chain: string,
    filter: { status?: DepositStatus; userId?: string; cursor?: string; limit: number },
    ctx: ChainContext = {},
  ) {
    return scannerService.adminListDeposits({ chain, ...filter }, ctx);
  },

  async listWithdrawals(
    chain: string,
    filter: { status?: WithdrawalStatus; cursor?: string; limit: number },
    ctx: ChainContext = {},
  ) {
    const rows = await chainsRepository.listWithdrawals({ chain, ...filter });
    const hasMore = rows.length > filter.limit;
    const slice = hasMore ? rows.slice(0, filter.limit) : rows;
    await this.audit(ctx, { action: 'chains.withdrawals_view', targetType: 'crypto_withdrawal_queue', afterState: { chain, count: slice.length } });
    return {
      items: slice.map((w) => ({
        id: w.id,
        chain: w.chain,
        asset: w.asset,
        toAddress: w.toAddress,
        fromAddress: w.fromAddress,
        amount: w.amount.toFixed(),
        netAmount: w.netAmount.toFixed(),
        status: w.status,
        txHash: w.txHash,
        nonce: w.nonce != null ? w.nonce.toString() : null,
        requestedAt: w.requestedAt,
        completedAt: w.completedAt,
      })),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  async audit(
    ctx: ChainContext,
    input: { action: string; targetType?: string; targetId?: string; afterState?: Prisma.InputJsonValue },
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
      await scannerRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        ip: ctx.ip,
        requestId: ctx.requestId,
        afterState: input.afterState,
      });
    }
  },
};

export type ChainsService = typeof chainsService;
