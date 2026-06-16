import { config } from '../../config';
import { logger } from '../../lib/logger';
import { getChainProvider, getTronProvider } from './providers';
import { scannerService } from './scanner.service';
import { confirmationService } from './confirmation.service';
import type { ScanResult, ConfirmResult } from './scanner.types';
import type { ChainProvider, TronProvider } from './providers';

/**
 * Multi-chain deposit-scanner worker (Phase 5.1).
 *
 * A self-pacing polling worker that runs one DETECT → CONFIRM cycle per tick for
 * ONE chain. It is the single registration point used by both the dedicated
 * scanner process (src/scanner.ts) and the shared worker scaffold (src/worker.ts),
 * so "where/which chains the scanner runs" is a deployment choice, not a code
 * change. The cursor lives in Postgres, so any restart resumes exactly where it
 * left off. Detection + crediting are idempotent, so even two workers running at
 * once cannot double-credit. TRON behaviour is preserved via thin wrappers.
 */

export interface ScannerWorkerHandle {
  name: string;
  stop: () => Promise<void>;
}

/** Run exactly one detect→confirm cycle for a chain. Exposed for tests. */
export async function runScanCycle(
  chain: string,
  provider: ChainProvider,
): Promise<{ scan: ScanResult; confirm: ConfirmResult }> {
  const scan = await scannerService.scanOnce({ chain, provider });
  const confirm = await confirmationService.runConfirmations({ chain, provider });
  return { scan, confirm };
}

/** Start the polling scanner for a chain. Returns a handle to stop it. */
export function startChainScannerWorker(
  chain: string,
  opts: { pollMs?: number; provider?: ChainProvider } = {},
): ScannerWorkerHandle {
  const chainId = chain.toUpperCase();
  const provider = opts.provider ?? getChainProvider(chainId);
  const pollMs = opts.pollMs ?? config.scanner.pollMs;

  let running = true;
  let timer: NodeJS.Timeout | undefined;

  const tick = async (): Promise<void> => {
    if (!running) return;
    try {
      const { scan, confirm } = await runScanCycle(chainId, provider);
      logger.info(
        {
          chain: chainId,
          provider: provider.mode,
          head: scan.headBlock,
          scanned: `${scan.fromBlock}..${scan.toBlock}`,
          detected: scan.detected,
          orphaned: scan.orphaned,
          promoted: confirm.promoted,
          credited: confirm.credited,
        },
        'scan cycle complete',
      );
    } catch (err) {
      logger.error({ err, chain: chainId }, 'scan cycle failed');
    }
    if (running) timer = setTimeout(() => void tick(), pollMs);
  };

  void tick();

  return {
    name: `${chainId.toLowerCase()}-scanner`,
    stop: async (): Promise<void> => {
      running = false;
      if (timer) clearTimeout(timer);
    },
  };
}

// ---------------------------------------------------------------------------
// TRON back-compat wrappers (preserve the existing public surface + tests).
// ---------------------------------------------------------------------------

/** Run one TRON detect→confirm cycle. */
export function runTronScanCycle(
  provider: TronProvider,
): Promise<{ scan: ScanResult; confirm: ConfirmResult }> {
  return runScanCycle('TRON', provider);
}

/** Start the polling TRON scanner. Returns a handle to stop it gracefully. */
export function startTronScannerWorker(
  opts: { pollMs?: number; provider?: TronProvider } = {},
): ScannerWorkerHandle {
  return startChainScannerWorker('TRON', { ...opts, provider: opts.provider ?? getTronProvider() });
}
