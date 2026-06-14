import { config } from '../../config';
import { logger } from '../../lib/logger';
import { getTronProvider } from './providers';
import { scannerService } from './scanner.service';
import { confirmationService } from './confirmation.service';
import type { ScanResult, ConfirmResult } from './scanner.types';
import type { TronProvider } from './providers';

/**
 * TRON deposit-scanner worker.
 *
 * A self-pacing polling worker that runs one DETECT → CONFIRM cycle per tick.
 * It is the single registration point used by both the dedicated scanner
 * process (src/scanner.ts) and the shared worker scaffold (src/worker.ts), so
 * "where the scanner runs" is a deployment choice, not a code change.
 *
 * The cursor lives in Postgres, so any restart resumes exactly where it left
 * off. Detection + crediting are idempotent, so even two workers running at once
 * cannot double-credit.
 */

export interface ScannerWorkerHandle {
  name: string;
  stop: () => Promise<void>;
}

/** Run exactly one detect→confirm cycle. Exposed for tests + schedulers. */
export async function runTronScanCycle(
  provider: TronProvider,
): Promise<{ scan: ScanResult; confirm: ConfirmResult }> {
  const scan = await scannerService.scanOnce({ provider });
  const confirm = await confirmationService.runConfirmations({ provider });
  return { scan, confirm };
}

/** Start the polling TRON scanner. Returns a handle to stop it gracefully. */
export function startTronScannerWorker(
  opts: { pollMs?: number; provider?: TronProvider } = {},
): ScannerWorkerHandle {
  const provider = opts.provider ?? getTronProvider();
  const pollMs = opts.pollMs ?? config.scanner.pollMs;

  let running = true;
  let timer: NodeJS.Timeout | undefined;

  const tick = async (): Promise<void> => {
    if (!running) return;
    try {
      const { scan, confirm } = await runTronScanCycle(provider);
      logger.info(
        {
          provider: provider.mode,
          head: scan.headBlock,
          scanned: `${scan.fromBlock}..${scan.toBlock}`,
          detected: scan.detected,
          orphaned: scan.orphaned,
          promoted: confirm.promoted,
          credited: confirm.credited,
        },
        'TRON scan cycle complete',
      );
    } catch (err) {
      logger.error({ err }, 'TRON scan cycle failed');
    }
    if (running) timer = setTimeout(() => void tick(), pollMs);
  };

  void tick();

  return {
    name: 'tron-scanner',
    stop: async (): Promise<void> => {
      running = false;
      if (timer) clearTimeout(timer);
    },
  };
}
