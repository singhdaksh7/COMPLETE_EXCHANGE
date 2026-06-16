import { config } from '../../config';
import { logger } from '../../lib/logger';
import { withdrawalRepository } from './withdrawal.repository';
import { withdrawalService } from './withdrawal.service';
import { getWithdrawalSigner } from './providers';
import { ASSET, CHAIN, SUPPORTED_CHAINS } from './withdrawal.types';
import type { WithdrawalSignerProvider } from './providers';

/**
 * Crypto-withdrawal execution worker.
 *
 * Two passes per tick:
 *   1. BROADCAST   — pick APPROVED withdrawals, allocate a nonce, mock-sign, and
 *                    mock-broadcast (→ BROADCAST). Claiming is atomic, so a
 *                    second worker cannot re-broadcast / double-spend a nonce.
 *   2. CONFIRMATION — poll the signer for depth; promote to CONFIRMING, finalize
 *                     through the ledger at min-confirmations (idempotent), or
 *                     FAIL + release the hold on a dropped tx.
 *
 * No real keys, no real broadcasts — the signer is always the offline mock.
 */

export interface WithdrawalCycleResult {
  broadcast: number;
  promoted: number;
  completed: number;
  failed: number;
}

/** Broadcast APPROVED withdrawals for ONE chain (default TRON). */
export async function runBroadcastCycle(
  signer: WithdrawalSignerProvider,
  chain: string = CHAIN,
): Promise<number> {
  const pending = await withdrawalRepository.listForBroadcast(chain);
  let broadcast = 0;
  for (const w of pending) {
    if (await withdrawalService.broadcastWithdrawal(w, signer)) broadcast += 1;
  }
  return broadcast;
}

/** Poll/confirm in-flight withdrawals for ONE chain (default TRON). */
export async function runConfirmationCycle(
  signer: WithdrawalSignerProvider,
  chain: string = CHAIN,
): Promise<{ promoted: number; completed: number; failed: number }> {
  const token = await withdrawalRepository.getSupportedToken(ASSET, chain);
  const minConf = token?.minConfirmations ?? 20;

  const inFlight = await withdrawalRepository.listForConfirmation(chain);
  let promoted = 0;
  let completed = 0;
  let failed = 0;

  for (const w of inFlight) {
    if (!w.txHash) continue;
    const status = await signer.getConfirmations({ chain, txHash: w.txHash });
    if (!status.found) continue; // not yet visible to the (mock) network
    if (!status.success) {
      if (await withdrawalService.failWithdrawal(w, 'tx_failed_or_dropped')) failed += 1;
      continue;
    }
    if (status.confirmations >= minConf) {
      if (await withdrawalService.finalizeWithdrawal(w)) completed += 1;
    } else if (w.status === 'BROADCAST' && status.confirmations >= 1) {
      await withdrawalRepository.setConfirming(w.id);
      promoted += 1;
    }
  }
  return { promoted, completed, failed };
}

/**
 * One full broadcast → confirm cycle. Defaults to TRON for back-compat (the
 * existing single-chain callers/tests); the worker process runs it per chain.
 */
export async function runWithdrawalCycle(
  signer: WithdrawalSignerProvider,
  chain: string = CHAIN,
): Promise<WithdrawalCycleResult> {
  const broadcast = await runBroadcastCycle(signer, chain);
  const { promoted, completed, failed } = await runConfirmationCycle(signer, chain);
  return { broadcast, promoted, completed, failed };
}

/** Run a withdrawal cycle across EVERY supported chain (used by the worker). */
export async function runAllChainsWithdrawalCycle(
  signer: WithdrawalSignerProvider,
): Promise<WithdrawalCycleResult> {
  const totals: WithdrawalCycleResult = { broadcast: 0, promoted: 0, completed: 0, failed: 0 };
  for (const chain of SUPPORTED_CHAINS) {
    const r = await runWithdrawalCycle(signer, chain);
    totals.broadcast += r.broadcast;
    totals.promoted += r.promoted;
    totals.completed += r.completed;
    totals.failed += r.failed;
  }
  return totals;
}

export interface WithdrawalWorkerHandle {
  name: string;
  stop: () => Promise<void>;
}

/** Start the polling withdrawal worker. Returns a graceful-stop handle. */
export function startWithdrawalWorker(
  opts: { pollMs?: number; signer?: WithdrawalSignerProvider } = {},
): WithdrawalWorkerHandle {
  const signer = opts.signer ?? getWithdrawalSigner();
  const pollMs = opts.pollMs ?? config.scanner.pollMs;

  let running = true;
  let timer: NodeJS.Timeout | undefined;

  const tick = async (): Promise<void> => {
    if (!running) return;
    try {
      const result = await runAllChainsWithdrawalCycle(signer);
      if (result.broadcast || result.completed || result.failed || result.promoted) {
        logger.info({ ...result, signer: signer.mode }, 'Withdrawal cycle complete');
      }
    } catch (err) {
      logger.error({ err }, 'Withdrawal cycle failed');
    }
    if (running) timer = setTimeout(() => void tick(), pollMs);
  };

  void tick();

  return {
    name: 'withdrawal-executor',
    stop: async (): Promise<void> => {
      running = false;
      if (timer) clearTimeout(timer);
    },
  };
}
