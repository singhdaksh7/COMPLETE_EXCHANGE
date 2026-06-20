import { Prisma, type CryptoDeposit, type DepositStatus } from '@prisma/client';
import { buildExplorerTxUrl } from '../../lib/explorer';

/** Request-scoped forensic context threaded into admin reads for auditing. */
export interface ScannerContext {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Stable action codes (kept together to avoid typos in the audit trail). */
export const ScannerAction = {
  DEPOSIT_DETECTED: 'crypto.deposit.detected',
  DEPOSIT_CREDITED: 'crypto.deposit.credited',
  DEPOSIT_ORPHANED: 'crypto.deposit.orphaned',
  ADMIN_HEALTH_VIEW: 'crypto.scanner.health_view',
} as const;

/** Ledger txn kind for an on-chain deposit credit. */
export const DEPOSIT_CREDIT_KIND = 'DEPOSIT_CREDIT';
export const DEPOSIT_REFERENCE_TYPE = 'crypto_deposit';

/** Outcome of a single detection pass. */
export interface ScanResult {
  chain: string;
  fromBlock: string;
  toBlock: string;
  headBlock: string;
  detected: number;
  orphaned: number;
}

/** Outcome of a single confirmation/credit pass. */
export interface ConfirmResult {
  chain: string;
  headBlock: string;
  promoted: number;
  credited: number;
}

export interface CryptoDepositDto {
  id: string;
  userId: string | null;
  chain: string;
  asset: string;
  txHash: string;
  logIndex: number;
  fromAddress: string | null;
  amount: string;
  amountBase: string;
  confirmations: number;
  reqConfirmations: number;
  status: DepositStatus;
  blockNumber: string | null;
  blockHash: string | null;
  creditedTxnId: string | null;
  detectedAt: Date;
  creditedAt: Date | null;
}

/**
 * User-facing crypto deposit view. A focused projection of {@link CryptoDepositDto}
 * (no internal block hash / log index / ledger txn id) plus an explorer link and
 * a `requiredConfirmations` alias for the client.
 */
export interface UserCryptoDepositDto {
  id: string;
  chain: string;
  asset: string;
  amount: string;
  status: DepositStatus;
  txHash: string;
  confirmations: number;
  requiredConfirmations: number;
  explorerUrl: string | null;
  detectedAt: Date;
  creditedAt: Date | null;
}

export function toUserCryptoDepositDto(row: CryptoDeposit): UserCryptoDepositDto {
  return {
    id: row.id,
    chain: row.chain,
    asset: row.asset,
    amount: row.amount.toFixed(),
    status: row.status,
    txHash: row.txHash,
    confirmations: row.confirmations,
    requiredConfirmations: row.reqConfirmations,
    explorerUrl: buildExplorerTxUrl(row.chain, row.txHash),
    detectedAt: row.detectedAt,
    creditedAt: row.creditedAt,
  };
}

export interface ScannerHealthDto {
  chain: string;
  provider: { name: string; mode: string };
  headBlock: string | null;
  cursor: {
    lastScannedBlock: string;
    lastScannedHash: string | null;
    safeBlock: string;
    updatedAt: Date;
  } | null;
  /** head - lastScannedBlock; null when head is unavailable. */
  lagBlocks: string | null;
  depositCounts: Record<string, number>;
}

/**
 * Operational, secrets-free status summary across all scanner chains. Reports
 * the configured provider MODE ('mock' | 'live') and the persisted checkpoint —
 * never RPC URLs, API keys, or any provider credentials.
 */
export interface ScannerChainStatus {
  chain: string;
  providerMode: string;
  lastScannedBlock: string | null;
  safeBlock: string | null;
  lastScannedHash: string | null;
  updatedAt: Date | null;
}

export interface ScannerStatusSummary {
  safetyLag: number;
  reorgBuffer: number;
  startBlock: number;
  chains: ScannerChainStatus[];
}

export function toCryptoDepositDto(row: CryptoDeposit): CryptoDepositDto {
  return {
    id: row.id,
    userId: row.userId,
    chain: row.chain,
    asset: row.asset,
    txHash: row.txHash,
    logIndex: row.logIndex,
    fromAddress: row.fromAddress,
    amount: row.amount.toFixed(),
    amountBase: row.amountBase.toFixed(),
    confirmations: row.confirmations,
    reqConfirmations: row.reqConfirmations,
    status: row.status,
    blockNumber: row.blockNumber === null ? null : row.blockNumber.toString(),
    blockHash: row.blockHash,
    creditedTxnId: row.creditedTxnId,
    detectedAt: row.detectedAt,
    creditedAt: row.creditedAt,
  };
}

/**
 * Convert an integer base-unit amount string to a human Decimal using the
 * token's on-chain decimals — exact decimal math, never JS floats.
 */
export function baseToHuman(amountBase: string, decimals: number): Prisma.Decimal {
  return new Prisma.Decimal(amountBase).div(new Prisma.Decimal(10).pow(decimals));
}
