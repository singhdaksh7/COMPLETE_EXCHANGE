import { logger } from '../../../lib/logger';
import type { ResolvedNetwork } from '../crypto-deposit.config';
import { isNetworkConfigured } from '../crypto-deposit.config';
import type { VerificationResult, VerifyTxInput } from './types';

/**
 * EVM (BSC / Ethereum) USDT deposit verifier.
 *
 * Read-only: it only calls `eth_getTransactionReceipt` and `eth_blockNumber`
 * over JSON-RPC (no signing, no keys, no state changes). It confirms the
 * receipt succeeded, finds the ERC20 `Transfer` log emitted by the CONFIGURED
 * token contract whose recipient is the CONFIGURED master wallet, extracts the
 * amount/sender, and computes confirmations against the chain tip.
 *
 * No third-party EVM library is required: ERC20 `Transfer` is a fixed event
 * whose topic hash is a known constant, and address/amount decoding is plain
 * hex slicing — so this stays dependency-free and offline-testable.
 */

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface EvmLog {
  address?: string;
  topics?: string[];
  data?: string;
  logIndex?: string;
}

interface EvmReceipt {
  status?: string;
  blockNumber?: string;
  from?: string;
  logs?: EvmLog[];
}

/** Lowercase a hex address for case-insensitive comparison; '' when missing. */
function norm(addr?: string | null): string {
  return (addr ?? '').trim().toLowerCase();
}

/** A 32-byte topic word encodes an address in its low 20 bytes. */
function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

/** Convert a base token amount to a human decimal string using `decimals`. */
export function formatUnits(value: bigint, decimals: number): string {
  if (decimals <= 0) return value.toString();
  const neg = value < 0n;
  const digits = (neg ? -value : value).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/**
 * Find the FIRST ERC20 Transfer log from the configured token contract whose
 * recipient is the configured master wallet. Returns null when none matches
 * (wrong contract or wrong recipient).
 */
export function findMasterTransfer(
  logs: EvmLog[],
  tokenContract: string,
  masterAddress: string,
): { from: string; to: string; value: bigint; logIndex: number | null } | null {
  const contract = norm(tokenContract);
  const master = norm(masterAddress);
  for (const log of logs) {
    if (norm(log.address) !== contract) continue;
    const topics = log.topics ?? [];
    if (topics.length < 3) continue;
    if (norm(topics[0]) !== TRANSFER_TOPIC) continue;
    if (topicToAddress(topics[2]) !== master) continue;
    let value: bigint;
    try {
      value = BigInt(log.data && log.data !== '0x' ? log.data : '0x0');
    } catch {
      continue;
    }
    return {
      from: topicToAddress(topics[1]),
      to: master,
      value,
      logIndex:
        typeof log.logIndex === 'string' ? Number.parseInt(log.logIndex, 16) : null,
    };
  }
  return null;
}

/**
 * Pure evaluation of an already-fetched receipt + chain tip against a network.
 * Separated from I/O so the full decision matrix is unit-testable without a
 * provider. `receipt === null` means the tx is not (yet) mined.
 */
export function evaluateEvmReceipt(
  receipt: EvmReceipt | null,
  latestBlock: bigint,
  network: ResolvedNetwork,
): VerificationResult {
  if (!network.masterAddress || !network.tokenContract) {
    return { outcome: 'PROVIDER_NOT_CONFIGURED', reason: 'provider_not_configured' };
  }
  // Not found yet → treat as pending (a recheck may find it once mined).
  if (!receipt) {
    return {
      outcome: 'PENDING',
      reason: 'transaction_not_found_yet',
      confirmations: 0,
      minConfirmations: network.minConfirmations,
    };
  }
  // Reverted transaction can never be a valid deposit.
  if (receipt.status !== undefined && receipt.status !== '0x1') {
    return { outcome: 'REJECTED', reason: 'transaction_failed' };
  }

  const transfer = findMasterTransfer(
    receipt.logs ?? [],
    network.tokenContract,
    network.masterAddress,
  );
  if (!transfer) {
    // Either the configured USDT contract did not emit a transfer, or none of
    // the transfers were addressed to the master wallet.
    return { outcome: 'REJECTED', reason: 'no_matching_usdt_transfer_to_master' };
  }
  if (transfer.value <= 0n) {
    return { outcome: 'REJECTED', reason: 'zero_amount' };
  }

  const amount = formatUnits(transfer.value, network.decimals);
  const txBlock = receipt.blockNumber ? BigInt(receipt.blockNumber) : latestBlock;
  // Per spec: confirmations = latest - txBlock (clamped at 0).
  const confirmations = Number(latestBlock > txBlock ? latestBlock - txBlock : 0n);
  const summary: Record<string, unknown> = {
    family: 'EVM',
    chain: network.chain,
    contract: network.tokenContract,
    to: transfer.to,
    from: transfer.from,
    amount,
    txBlock: txBlock.toString(),
    latestBlock: latestBlock.toString(),
    confirmations,
    minConfirmations: network.minConfirmations,
  };

  const base = {
    amount,
    fromAddress: transfer.from,
    toAddress: transfer.to,
    confirmations,
    minConfirmations: network.minConfirmations,
    logIndex: transfer.logIndex,
    summary,
  };
  if (confirmations >= network.minConfirmations) {
    return { outcome: 'CONFIRMED', ...base };
  }
  return { outcome: 'PENDING', reason: 'awaiting_confirmations', ...base };
}

/** Minimal JSON-RPC POST. Throws on transport / RPC error. */
async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc_http_${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(`rpc_error:${json.error.message ?? 'unknown'}`);
  return json.result as T;
}

export const evmVerifier = {
  async verifyTx(input: VerifyTxInput): Promise<VerificationResult> {
    const { network, txHash } = input;
    if (!isNetworkConfigured(network) || !network.rpcUrl) {
      return { outcome: 'PROVIDER_NOT_CONFIGURED', reason: 'provider_not_configured' };
    }
    try {
      const [receipt, latestHex] = await Promise.all([
        rpc<EvmReceipt | null>(network.rpcUrl, 'eth_getTransactionReceipt', [txHash]),
        rpc<string>(network.rpcUrl, 'eth_blockNumber', []),
      ]);
      const latestBlock = latestHex ? BigInt(latestHex) : 0n;
      return evaluateEvmReceipt(receipt, latestBlock, network);
    } catch (err) {
      // Transient provider failure — never reject on this; allow a recheck.
      logger.warn(
        { err, chain: network.chain },
        'crypto-deposit: EVM verification provider error',
      );
      return { outcome: 'PROVIDER_ERROR', reason: 'provider_error' };
    }
  },
};
