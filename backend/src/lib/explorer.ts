import { config } from '../config';

/**
 * Build a block-explorer transaction URL for a chain + tx hash, or null when
 * either the hash is absent or the chain has no configured explorer base.
 *
 * Config-driven (see `config.chains.explorerTxBase`) — adding/altering an
 * explorer is an env change, never a DB migration or code change.
 */
export function buildExplorerTxUrl(
  chain: string,
  txHash: string | null,
): string | null {
  if (!txHash) return null;
  const base = config.chains.explorerTxBase[chain.toUpperCase()];
  return base ? `${base}${txHash}` : null;
}

/**
 * Whether a chain's deposits are actively scanned + credited today. Used to warn
 * users that depositing to a derived address on a not-yet-scanned chain will not
 * (yet) be detected or credited.
 */
export function isChainScanned(chain: string): boolean {
  return config.chains.scanned.includes(chain.toUpperCase());
}
