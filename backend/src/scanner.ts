import { config } from './config';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { connectRedis, disconnectRedis } from './lib/redis';
import { onShutdown, setupProcessGuards } from './lib/lifecycle';
import { getTronProvider } from './modules/scanner/providers';
import { startTronScannerWorker } from './modules/scanner/scanner.worker';

/**
 * Chain scanner entrypoint (ARCHITECTURE.md §8).
 *
 * One scanner process watches one chain's blocks for USDT transfers to our
 * deposit addresses, checkpointing a cursor in Postgres so a restart resumes
 * exactly. Run one per chain: `SCAN_CHAIN=TRON node dist/scanner.js`.
 *
 * Each iteration runs two passes:
 *   1. DETECTION   — head → block scan → upsert DETECTED deposits + reorg orphan
 *                    → advance the persisted cursor.
 *   2. CONFIRMATION — recompute depth → promote → credit via LedgerService once
 *                     min-confirmations is reached (idempotent).
 *
 * Only TRON is wired today (TRC20 USDT); EVM chains are future modules.
 */

const SUPPORTED_CHAINS = ['TRON', 'ETHEREUM', 'BSC'] as const;
type ScanChain = (typeof SUPPORTED_CHAINS)[number];

function resolveChain(): ScanChain | undefined {
  const raw = (process.env.SCAN_CHAIN ?? '').toUpperCase();
  return (SUPPORTED_CHAINS as readonly string[]).includes(raw)
    ? (raw as ScanChain)
    : undefined;
}

async function bootstrap(): Promise<void> {
  setupProcessGuards();

  const chain = resolveChain();
  if (!chain) {
    logger.fatal(
      { supported: SUPPORTED_CHAINS, provided: process.env.SCAN_CHAIN ?? null },
      'SCAN_CHAIN must be set to one of the supported chains',
    );
    process.exit(1);
  }
  if (chain !== 'TRON') {
    logger.fatal(
      { chain },
      'Only the TRON scanner is implemented; EVM chains are a future module',
    );
    process.exit(1);
  }

  await connectDatabase();
  await connectRedis();

  logger.info(
    { chain, pollMs: config.scanner.pollMs, provider: getTronProvider().mode },
    'Chain scanner started',
  );

  // The cursor is persisted in Postgres, so this resumes exactly on restart.
  const worker = startTronScannerWorker();

  onShutdown(async () => {
    await worker.stop();
    await disconnectRedis();
    await disconnectDatabase();
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Fatal error during scanner bootstrap');
  process.exit(1);
});
