import { Prisma, type CryptoDeposit, type DepositStatus } from '@prisma/client';

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
