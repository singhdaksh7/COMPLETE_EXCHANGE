import type {
  ChainSigner,
  HotWallet,
  Prisma,
  TreasuryTransfer,
  TreasuryTransferStatus,
  TreasuryTransferType,
  WalletNonce,
  WalletTier,
} from '@prisma/client';
import { toChainSignerRef } from '../wallet/wallet.types';
import type { ChainSignerRef } from '../wallet/providers/chain-signer.provider';

/**
 * Treasury / custody shared types (Module 2).
 *
 * A treasury transfer moves the exchange's OWN funds between a hot wallet and a
 * cold wallet (both rows in hot_wallets; cold = tier COLD). It NEVER touches a
 * user balance. Execution posts a balanced ledger transaction between the
 * HOT_WALLET and COLD_WALLET system accounts, so the custody position stays
 * reconcilable. NO private keys are stored or returned — only the signer's
 * KMS/HSM reference (kmsKeyRef) surfaces, exactly as the wallet module exposes.
 */

/** Request-scoped forensic context threaded into the service for auditing. */
export interface TreasuryContext {
  actorId?: string; // admin id
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** The two ledger custody account kinds a transfer moves between. */
export const HOT_ACCOUNT = 'HOT_WALLET' as const;
export const COLD_ACCOUNT = 'COLD_WALLET' as const;

/** Stable audit action codes (kept together to avoid typos in the trail). */
export const TreasuryAction = {
  HOT_WALLET_LIST: 'treasury.hot_wallet_list',
  COLD_WALLET_LIST: 'treasury.cold_wallet_list',
  SUMMARY_VIEW: 'treasury.summary_view',
  TRANSFER_LIST: 'treasury.transfer_list',
  SWEEP_REQUESTED: 'treasury.sweep_requested',
  REFILL_REQUESTED: 'treasury.refill_requested',
  TRANSFER_APPROVED: 'treasury.transfer_approved',
  TRANSFER_APPROVED_FIRST: 'treasury.transfer_approved_first',
  TRANSFER_EXECUTED: 'treasury.transfer_executed',
  TRANSFER_REJECTED: 'treasury.transfer_rejected',
  TRANSFER_FAILED: 'treasury.transfer_failed',
} as const;

/** Reference data for the idempotent custody ledger posting. */
export const TREASURY_LEDGER = {
  KIND: 'TREASURY_TRANSFER',
  REFERENCE_TYPE: 'treasury_transfer',
} as const;

/** Admin view of a custody wallet (hot or cold). Key-free: signer ref only. */
export interface TreasuryWalletDto {
  id: string;
  chain: string;
  address: string;
  tier: WalletTier;
  label: string | null;
  isActive: boolean;
  signer: ChainSignerRef | null;
  nonce: { nextNonce: string; updatedAt: Date } | null;
}

/** One asset's custody position across the hot and cold ledger accounts. */
export interface TreasuryAssetPositionDto {
  asset: string;
  hot: string; // HOT_WALLET ledger balance (decimal string)
  cold: string; // COLD_WALLET ledger balance (decimal string)
  total: string; // hot + cold
}

/** Treasury health summary — custody positions + wallet/transfer counts. */
export interface TreasurySummaryDto {
  positions: TreasuryAssetPositionDto[];
  wallets: { hot: number; cold: number; activeHot: number; activeCold: number };
  pendingTransfers: number;
  dualControl: boolean;
}

/** A treasury transfer record (request + approval + execution state). */
export interface TreasuryTransferDto {
  id: string;
  type: TreasuryTransferType;
  chain: string;
  asset: string;
  fromWalletId: string;
  toWalletId: string;
  fromAddress: string | null;
  toAddress: string | null;
  amount: string;
  status: TreasuryTransferStatus;
  reason: string | null;
  requestedBy: string;
  approvedBy: string | null;
  approvedBy2: string | null;
  rejectedBy: string | null;
  ledgerTxnId: string | null;
  txHash: string | null;
  failureReason: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  completedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function toTreasuryWalletDto(
  row: HotWallet & { signer: ChainSigner | null; nonce: WalletNonce | null },
): TreasuryWalletDto {
  return {
    id: row.id,
    chain: row.chain,
    address: row.address,
    tier: row.tier,
    label: row.label,
    isActive: row.isActive,
    signer: row.signer ? toChainSignerRef(row.signer) : null,
    nonce: row.nonce
      ? { nextNonce: row.nonce.nextNonce.toString(), updatedAt: row.nonce.updatedAt }
      : null,
  };
}

type TransferWithWallets = TreasuryTransfer & {
  fromWallet?: Pick<HotWallet, 'address'> | null;
  toWallet?: Pick<HotWallet, 'address'> | null;
};

export function toTreasuryTransferDto(row: TransferWithWallets): TreasuryTransferDto {
  return {
    id: row.id,
    type: row.type,
    chain: row.chain,
    asset: row.asset,
    fromWalletId: row.fromWalletId,
    toWalletId: row.toWalletId,
    fromAddress: row.fromWallet?.address ?? null,
    toAddress: row.toWallet?.address ?? null,
    amount: row.amount.toFixed(),
    status: row.status,
    reason: row.reason,
    requestedBy: row.requestedBy,
    approvedBy: row.approvedBy,
    approvedBy2: row.approvedBy2,
    rejectedBy: row.rejectedBy,
    ledgerTxnId: row.ledgerTxnId,
    txHash: row.txHash,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    completedAt: row.completedAt,
  };
}

/** Narrowing helper for admin metadata payloads. */
export type TreasuryAuditMeta = Prisma.InputJsonValue;
