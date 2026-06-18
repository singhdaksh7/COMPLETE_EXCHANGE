import { config } from '../../config';
import { logger } from '../../lib/logger';
import { getTronProvider, getBscProvider } from './providers';
import { scannerService } from './scanner.service';
import { confirmationService } from './confirmation.service';
import type { ScanResult, ConfirmResult } from './scanner.types';
import type { TronProvider, BscProvider } from './providers';

export interface ScannerWorkerHandle {
  name: string;
  stop: () => Promise<void>;
}

export async function runChainScanCycle(
  chain: string,
  asset: string,
  provider: any,
): Promise<{ scan: ScanResult; confirm: ConfirmResult }> {
  const scan = await scannerService.scanOnce({ chain, asset, provider });
  const confirm = await confirmationService.runConfirmations({ chain, provider });
  return { scan, confirm };
}

/** Expose runTronScanCycle for backward compatibility and tests. */
export async function runTronScanCycle(
  provider: TronProvider,
): Promise<{ scan: ScanResult; confirm: ConfirmResult }> {
  return runChainScanCycle('TRON', 'USDT', provider);
}

/** Expose runBscScanCycle for convenience. */
export async function runBscScanCycle(
  provider: BscProvider,
): Promise<{ scan: ScanResult; confirm: ConfirmResult }> {
  return runChainScanCycle('BSC', 'USDT', provider);
}

export function startScannerWorker(
  chain: string,
  asset: string,
  provider: any,
  pollMs: number = config.scanner.pollMs,
): ScannerWorkerHandle {
  const chainUpper = chain.toUpperCase();
  let running = true;
  let timer: NodeJS.Timeout | undefined;

  const tick = async (): Promise<void> => {
    if (!running) return;
    try {
      const { scan, confirm } = await runChainScanCycle(chainUpper, asset, provider);
      logger.info(
        {
          chain: chainUpper,
          provider: provider.mode,
          head: scan.headBlock,
          scanned: `${scan.fromBlock}..${scan.toBlock}`,
          detected: scan.detected,
          orphaned: scan.orphaned,
          promoted: confirm.promoted,
          credited: confirm.credited,
        },
        `${chainUpper} scan cycle complete`,
      );
    } catch (err) {
      logger.error({ err, chain: chainUpper }, `${chainUpper} scan cycle failed`);
    }
    if (running) timer = setTimeout(() => void tick(), pollMs);
  };

  void tick();

  return {
    name: `${chainUpper.toLowerCase()}-scanner`,
    stop: async (): Promise<void> => {
      running = false;
      if (timer) clearTimeout(timer);
    },
  };
}

export function startTronScannerWorker(
  opts: { pollMs?: number; provider?: TronProvider } = {},
): ScannerWorkerHandle {
  const provider = opts.provider ?? getTronProvider();
  const pollMs = opts.pollMs ?? config.scanner.pollMs;
  return startScannerWorker('TRON', 'USDT', provider, pollMs);
}

export function startBscScannerWorker(
  opts: { pollMs?: number; provider?: BscProvider } = {},
): ScannerWorkerHandle {
  const provider = opts.provider ?? getBscProvider();
  const pollMs = opts.pollMs ?? config.scanner.pollMs;
  return startScannerWorker('BSC', 'USDT', provider, pollMs);
}
