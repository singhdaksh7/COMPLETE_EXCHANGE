import { config } from './config';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { connectRedis, disconnectRedis } from './lib/redis';
import { onShutdown, setupProcessGuards } from './lib/lifecycle';
import { startTronScannerWorker, startBscScannerWorker } from './modules/scanner/scanner.worker';
import { startWithdrawalWorker } from './modules/withdrawal/withdrawal.worker';

/**
 * Background worker entrypoint (BullMQ on Redis — ARCHITECTURE.md §2.5).
 *
 * A SEPARATE process from the API so a stuck job never takes down request
 * serving. It shares the codebase (and the modules' services) but a different
 * entrypoint. Queues + processors are registered in `src/jobs/` and wired here
 * as those modules land (deposit-confirm, withdrawal-confirm, payment-webhook,
 * notifications, reconciliation, ...).
 *
 * This is currently a runnable scaffold: it establishes the same dependency
 * connections and lifecycle as the API, registers zero queues, and stays alive
 * waiting for shutdown. Adding a worker is a drop-in into `registerWorkers`.
 */

interface ClosableWorker {
  name: string;
  close: () => Promise<void>;
}

const HEARTBEAT_MS = 60_000;

async function registerWorkers(): Promise<ClosableWorker[]> {
  const workers: ClosableWorker[] = [];

  // deposit scanners. Off by default (the dedicated scanner process
  // runs it); SCAN_RUN_IN_WORKER=true consolidates it onto the worker scaffold.
  if (config.scanner.runInWorker) {
    if (config.chains.scanned.includes('TRON')) {
      const scanner = startTronScannerWorker();
      workers.push({ name: scanner.name, close: () => scanner.stop() });
    }
    if (config.chains.scanned.includes('BSC')) {
      const scanner = startBscScannerWorker();
      workers.push({ name: scanner.name, close: () => scanner.stop() });
    }
  }

  // Crypto withdrawal executor: broadcasts APPROVED withdrawals (mock signer)
  // and finalizes them through the ledger on confirmation. Idempotent, so it is
  // always safe to run; balance movement only ever happens via LedgerService.
  const withdrawalExec = startWithdrawalWorker();
  workers.push({ name: withdrawalExec.name, close: () => withdrawalExec.stop() });

  // Future BullMQ workers (deposit-confirm, ...) register here as they land.
  return workers;
}

async function bootstrap(): Promise<void> {
  setupProcessGuards();

  await connectDatabase();
  await connectRedis();

  const workers = await registerWorkers();
  logger.info(
    { workers: workers.map((w) => w.name), count: workers.length },
    'Worker process started',
  );

  // Keep the event loop alive and emit a liveness heartbeat even with no
  // queues registered yet, so the process is observable.
  const heartbeat = setInterval(() => {
    logger.debug({ workers: workers.length }, 'worker heartbeat');
  }, HEARTBEAT_MS);

  onShutdown(async () => {
    clearInterval(heartbeat);
    await Promise.allSettled(workers.map((w) => w.close()));
    await disconnectRedis();
    await disconnectDatabase();
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Fatal error during worker bootstrap');
  process.exit(1);
});
