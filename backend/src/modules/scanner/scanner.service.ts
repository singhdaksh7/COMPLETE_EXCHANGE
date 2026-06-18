import type { DepositStatus, Prisma } from '@prisma/client';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { recordAudit } from '../../lib/audit';
import { scannerRepository } from './scanner.repository';
import { getTronProvider, getBscProvider } from './providers';
import {
  ScannerAction,
  baseToHuman,
  toCryptoDepositDto,
  toUserCryptoDepositDto,
} from './scanner.types';
import type {
  CryptoDepositDto,
  ScanResult,
  ScannerContext,
  ScannerHealthDto,
  UserCryptoDepositDto,
} from './scanner.types';
import type { TronProvider, BscProvider, TokenTransfer } from './providers';
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
  async scanOnce(deps: {
    chain?: string;
    asset?: string;
    provider: any;
  }): Promise<ScanResult> {
    const chain = (deps.chain ?? 'TRON').toUpperCase();
    const asset = (deps.asset ?? 'USDT').toUpperCase();
    const { provider } = deps;
    
    const startBlock = BigInt(config.scanner.startBlock);
    const safetyLag = BigInt(config.scanner.safetyLag);
    const reorgBuffer = BigInt(config.scanner.reorgBuffer);

    const head = await provider.getLatestBlock();
    const toBlock = head.number - safetyLag;

    const cursor = await scannerRepository.getCursor(chain);
    const lastScanned = cursor?.lastScannedBlock ?? startBlock - 1n;

    const empty: ScanResult = {
      chain,
      fromBlock: '0',
      toBlock: '0',
      headBlock: head.number.toString(),
      detected: 0,
      orphaned: 0,
    };

    if (toBlock < startBlock) return empty;

    // The token must be a supported, active deposit network.
    const token = await scannerRepository.getSupportedToken(asset, chain);
    if (!token || !token.contractAddr) {
      logger.warn({ chain, asset }, 'No active token to scan');
      return empty;
    }

    // Re-scan a rolling window behind the cursor so a recent reorg is caught
    // before any affected deposit is credited.
    const fromBlock = bigMax(startBlock, lastScanned + 1n - reorgBuffer);
    if (fromBlock > toBlock) {
      return { ...empty, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() };
    }

    const addresses = await scannerRepository.listActiveDepositAddresses(chain);
    
    // EVM hex addresses are case-insensitive. TRON base58 addresses are case-sensitive.
    const normalizeAddr = (addr: string): string => {
      return addr.startsWith('0x') ? addr.toLowerCase() : addr;
    };

    const addrMap = new Map(
      addresses.map((a) => [normalizeAddr(a.address), { userId: a.userId, addressId: a.id }]),
    );

    let transfers: TokenTransfer[] = [];
    if (chain === 'TRON') {
      const tronTransfers = await (provider as TronProvider).getTrc20Transfers({
        contract: token.contractAddr,
        fromBlock,
        toBlock,
      });
      transfers = tronTransfers.map((t) => ({
        txHash: t.txHash,
        logIndex: t.logIndex,
        from: t.from,
        to: t.to,
        contract: t.contract,
        amountBase: t.amountBase,
        blockNumber: t.blockNumber,
        blockHash: t.blockHash,
      }));
    } else {
      transfers = await (provider as BscProvider).getTokenTransfers({
        contract: token.contractAddr,
        fromBlock,
        toBlock,
      });
    }

    const byBlock = new Map<bigint, TokenTransfer[]>();
    for (const t of transfers) {
      const list = byBlock.get(t.blockNumber) ?? [];
      list.push(t);
      byBlock.set(t.blockNumber, list);
    }

    // Determine which blocks we actually need to fetch:
    // 1. toBlock (to store its hash in the cursor)
    // 2. Blocks containing transfers destined to our active deposit addresses
    // 3. Blocks containing pending/confirming deposits in the DB in this range
    const blocksToFetch = new Set<bigint>();
    blocksToFetch.add(toBlock);

    for (const t of transfers) {
      if (addrMap.has(normalizeAddr(t.to))) {
        blocksToFetch.add(t.blockNumber);
      }
    }

    const pendingBlocks = await scannerRepository.getPendingDepositBlocks(chain, fromBlock, toBlock);
    for (const b of pendingBlocks) {
      blocksToFetch.add(b);
    }

    // Fetch the required blocks in parallel
    const blockRefEntries = await Promise.all(
      Array.from(blocksToFetch).map(async (n) => {
        try {
          const ref = await provider.getBlock(n);
          return ref ? ([n, ref] as const) : null;
        } catch (err) {
          logger.warn({ chain, blockNumber: n.toString(), err }, 'Failed to fetch block ref');
          return null;
        }
      })
    );

    const blockRefs = new Map<bigint, { number: bigint; hash: string }>();
    for (const entry of blockRefEntries) {
      if (entry) {
        blockRefs.set(entry[0], entry[1]);
      }
    }

    let detected = 0;
    let orphaned = 0;
    let lastHash: string | null = cursor?.lastScannedHash ?? null;

    for (let n = fromBlock; n <= toBlock; n += 1n) {
      // If we don't have blockRef for this block (either because it wasn't requested or it failed to fetch),
      // we skip processing for this block.
      if (!blocksToFetch.has(n)) continue;

      const blockRef = blockRefs.get(n);
      if (!blockRef) continue;

      // Detect transfers addressed to our deposit addresses in this block.
      for (const t of byBlock.get(n) ?? []) {
        const target = addrMap.get(normalizeAddr(t.to));
        if (!target) continue; // not one of our addresses — ignore
        const { row, created } = await scannerRepository.upsertDetectedDeposit({
          chain,
          asset,
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
              chain,
              asset,
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
        chain,
        n,
        blockRef.hash,
      );
      orphaned += orphan.count;

      if (n === toBlock) lastHash = blockRef.hash;
    }

    await scannerRepository.upsertCursor(chain, {
      lastScannedBlock: toBlock,
      lastScannedHash: lastHash,
      safeBlock: toBlock,
    });

    return {
      chain,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      headBlock: head.number.toString(),
      detected,
      orphaned,
    };
  },

  // ------------------------------------------------------------------
  // User: own crypto deposit history / status (read-only; no audit needed)
  // ------------------------------------------------------------------
  async listUserDeposits(input: {
    userId: string;
    chain?: string;
    status?: DepositStatus;
    cursor?: string;
    limit: number;
  }): Promise<{ items: UserCryptoDepositDto[]; nextCursor: string | null }> {
    const rows = await scannerRepository.listUserDeposits(input);
    const hasMore = rows.length > input.limit;
    const slice = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items: slice.map(toUserCryptoDepositDto),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  // ------------------------------------------------------------------
  // Admin: scanner health + deposit monitoring
  // ------------------------------------------------------------------
  async getHealth(
    ctx: ScannerContext = {},
    chainParam: string = 'TRON',
  ): Promise<ScannerHealthDto> {
    const chain = chainParam.toUpperCase();
    const provider = chain === 'TRON' ? getTronProvider() : getBscProvider();
    let headBlock: bigint | null = null;
    try {
      headBlock = (await provider.getLatestBlock()).number;
    } catch (err) {
      logger.warn({ err, chain }, 'Scanner health: head fetch failed');
    }

    const [cursor, depositCounts] = await Promise.all([
      scannerRepository.getCursor(chain),
      scannerRepository.countByStatus(chain),
    ]);

    const lagBlocks =
      headBlock !== null && cursor
        ? (headBlock - cursor.lastScannedBlock).toString()
        : null;

    await this.auditAdmin(ctx, {
      action: ScannerAction.ADMIN_HEALTH_VIEW,
      targetType: 'scanner',
      afterState: { chain, headBlock: headBlock?.toString() ?? null },
    });

    return {
      chain,
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
