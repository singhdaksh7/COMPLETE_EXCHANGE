import type { DepositStatus, Prisma } from '@prisma/client';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { recordAudit } from '../../lib/audit';
import { scannerRepository } from './scanner.repository';
import { getChainProvider } from './providers';
import { ScannerAction, baseToHuman, toCryptoDepositDto } from './scanner.types';
import type {
  CryptoDepositDto,
  ScanResult,
  ScannerContext,
  ScannerHealthDto,
} from './scanner.types';
import type { ChainProvider, TokenTransfer } from './providers';

const DEFAULT_CHAIN = 'TRON';
const ASSET = 'USDT';

function bigMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/**
 * TRC20 USDT deposit DETECTION service.
 *
 * Runs a block-by-block cursor (ARCHITECTURE.md §8.2): from the persisted
 * `chain_cursors` checkpoint up to `head - SAFETY_LAG`, re-scanning a rolling
 * reorg window each pass. It only WRITES `DETECTED` deposit rows (idempotent on
 * (chain, tx_hash, log_index)) and orphans reorged rows. It NEVER credits —
 * crediting is the separate confirmation service, after min-confirmations.
 */
export const scannerService = {
  async scanOnce(deps: { provider: ChainProvider; chain?: string }): Promise<ScanResult> {
    const { provider } = deps;
    const CHAIN = deps.chain ?? provider.chain ?? DEFAULT_CHAIN;
    const startBlock = BigInt(config.scanner.startBlock);
    const safetyLag = BigInt(config.scanner.safetyLag);
    const reorgBuffer = BigInt(config.scanner.reorgBuffer);

    const head = await provider.getLatestBlock();
    const toBlock = head.number - safetyLag;

    const cursor = await scannerRepository.getCursor(CHAIN);
    const lastScanned = cursor?.lastScannedBlock ?? startBlock - 1n;

    const empty: ScanResult = {
      chain: CHAIN,
      fromBlock: '0',
      toBlock: '0',
      headBlock: head.number.toString(),
      detected: 0,
      orphaned: 0,
    };

    if (toBlock < startBlock) return empty;

    // The token must be a supported, active deposit network.
    const token = await scannerRepository.getSupportedToken(ASSET, CHAIN);
    if (!token || !token.contractAddr) {
      logger.warn({ chain: CHAIN, asset: ASSET }, 'No active token to scan');
      return empty;
    }

    // Re-scan a rolling window behind the cursor so a recent reorg is caught
    // before any affected deposit is credited.
    const fromBlock = bigMax(startBlock, lastScanned + 1n - reorgBuffer);
    if (fromBlock > toBlock) {
      return { ...empty, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() };
    }

    const addresses = await scannerRepository.listActiveDepositAddresses(CHAIN);
    const addrMap = new Map(
      addresses.map((a) => [a.address, { userId: a.userId, addressId: a.id }]),
    );

    const transfers = await provider.getTokenTransfers({
      contract: token.contractAddr,
      fromBlock,
      toBlock,
    });
    const byBlock = new Map<bigint, TokenTransfer[]>();
    for (const t of transfers) {
      const list = byBlock.get(t.blockNumber) ?? [];
      list.push(t);
      byBlock.set(t.blockNumber, list);
    }

    let detected = 0;
    let orphaned = 0;
    let lastHash: string | null = cursor?.lastScannedHash ?? null;

    for (let n = fromBlock; n <= toBlock; n += 1n) {
      const blockRef = await provider.getBlock(n);
      if (!blockRef) continue;

      // Detect transfers addressed to our deposit addresses in this block.
      for (const t of byBlock.get(n) ?? []) {
        const target = addrMap.get(t.to);
        if (!target) continue; // not one of our addresses — ignore
        const { row, created } = await scannerRepository.upsertDetectedDeposit({
          chain: CHAIN,
          asset: ASSET,
          txHash: t.txHash,
          logIndex: t.logIndex,
          fromAddress: t.from,
          amountBase: baseToHuman(t.amountBase, 0), // already base units
          amount: baseToHuman(t.amountBase, token.decimals),
          blockNumber: n,
          blockHash: blockRef.hash,
          reqConfirmations: token.minConfirmations,
          userId: target.userId,
          addressId: target.addressId,
        });
        if (created) {
          detected += 1;
          await recordAudit({
            actorType: 'SYSTEM',
            action: ScannerAction.DEPOSIT_DETECTED,
            entityType: 'crypto_deposit',
            entityId: row.id,
            metadata: {
              chain: CHAIN,
              asset: ASSET,
              txHash: t.txHash,
              logIndex: t.logIndex,
              blockNumber: n.toString(),
              blockHash: blockRef.hash,
            },
          });
        }
      }

      // Reorg safety: orphan non-credited deposits whose stored block hash no
      // longer matches this block's canonical hash.
      const orphan = await scannerRepository.orphanReorgedDeposits(
        CHAIN,
        n,
        blockRef.hash,
      );
      orphaned += orphan.count;

      if (n === toBlock) lastHash = blockRef.hash;
    }

    await scannerRepository.upsertCursor(CHAIN, {
      lastScannedBlock: toBlock,
      lastScannedHash: lastHash,
      safeBlock: toBlock,
    });

    return {
      chain: CHAIN,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      headBlock: head.number.toString(),
      detected,
      orphaned,
    };
  },

  // ------------------------------------------------------------------
  // Admin: scanner health + deposit monitoring
  // ------------------------------------------------------------------
  async getHealth(chainInput?: string, ctx: ScannerContext = {}): Promise<ScannerHealthDto> {
    const CHAIN = (chainInput ?? DEFAULT_CHAIN).toUpperCase();
    let provider: ChainProvider;
    try {
      provider = getChainProvider(CHAIN);
    } catch {
      // Unknown/unsupported chain — report a placeholder so the endpoint still
      // returns structured health rather than 500ing.
      provider = { name: 'none', chain: CHAIN, mode: 'mock' } as ChainProvider;
    }
    let headBlock: bigint | null = null;
    try {
      headBlock = (await provider.getLatestBlock()).number;
    } catch (err) {
      logger.warn({ err, chain: CHAIN }, 'Scanner health: head fetch failed');
    }

    const [cursor, depositCounts] = await Promise.all([
      scannerRepository.getCursor(CHAIN),
      scannerRepository.countByStatus(CHAIN),
    ]);

    const lagBlocks =
      headBlock !== null && cursor
        ? (headBlock - cursor.lastScannedBlock).toString()
        : null;

    await this.auditAdmin(ctx, {
      action: ScannerAction.ADMIN_HEALTH_VIEW,
      targetType: 'scanner',
      afterState: { chain: CHAIN, headBlock: headBlock?.toString() ?? null },
    });

    return {
      chain: CHAIN,
      provider: { name: provider.name, mode: provider.mode },
      headBlock: headBlock === null ? null : headBlock.toString(),
      cursor: cursor
        ? {
            lastScannedBlock: cursor.lastScannedBlock.toString(),
            lastScannedHash: cursor.lastScannedHash,
            safeBlock: cursor.safeBlock.toString(),
            updatedAt: cursor.updatedAt,
          }
        : null,
      lagBlocks,
      depositCounts,
    };
  },

  async adminListDeposits(
    filter: {
      chain?: string;
      status?: DepositStatus;
      userId?: string;
      cursor?: string;
      limit: number;
    },
    ctx: ScannerContext = {},
  ): Promise<{ items: CryptoDepositDto[]; nextCursor: string | null }> {
    const rows = await scannerRepository.adminListDeposits(filter);
    const hasMore = rows.length > filter.limit;
    const slice = hasMore ? rows.slice(0, filter.limit) : rows;
    await this.auditAdmin(ctx, {
      action: ScannerAction.ADMIN_HEALTH_VIEW,
      targetType: 'crypto_deposit_queue',
      afterState: { count: slice.length },
    });
    return {
      items: slice.map(toCryptoDepositDto),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  async auditAdmin(
    ctx: ScannerContext,
    input: {
      action: string;
      targetType?: string;
      targetId?: string;
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

export type ScannerService = typeof scannerService;
