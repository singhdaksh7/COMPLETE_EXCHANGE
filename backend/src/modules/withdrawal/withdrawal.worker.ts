import { config } from '../../config';
import { logger } from '../../lib/logger';
import { withdrawalRepository } from './withdrawal.repository';
import { withdrawalService } from './withdrawal.service';
import { getWithdrawalSigner } from './providers';
import { ASSET, CHAIN } from './withdrawal.types';
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

export async function runBroadcastCycle(
  signer: WithdrawalSignerProvider,
): Promise<number> {
  const pending = await withdrawalRepository.listForBroadcast(CHAIN);
  let broadcast = 0;
  for (const w of pending) {
    if (await withdrawalService.broadcastWithdrawal(w, signer)) broadcast += 1;
  }
  return broadcast;
}

export async function runConfirmationCycle(
  signer: WithdrawalSignerProvider,
): Promise<{ promoted: number; completed: number; failed: number }> {
  const token = await withdrawalRepository.getSupportedToken(ASSET, CHAIN);
  const minConf = token?.minConfirmations ?? 20;

  const inFlight = await withdrawalRepository.listForConfirmation(CHAIN);
  let promoted = 0;
  let completed = 0;
  let failed = 0;

  for (const w of inFlight) {
    if (!w.txHash) continue;
    const status = await signer.getConfirmations({ chain: CHAIN, txHash: w.txHash });
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

/** One full broadcast → confirm cycle. Exposed for tests + schedulers. */
export async function runWithdrawalCycle(
  signer: WithdrawalSignerProvider,
): Promise<WithdrawalCycleResult> {
  const broadcast = await runBroadcastCycle(signer);
  const { promoted, completed, failed } = await runConfirmationCycle(signer);
  return { broadcast, promoted, completed, failed };
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
      const result = await runWithdrawalCycle(signer);
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
