import {
  Prisma,
  type CryptoWithdrawal,
  type RiskLevel,
  type UserStatus,
  type WithdrawalAddress,
  type WithdrawalStatus,
} from '@prisma/client';
import { buildExplorerTxUrl } from '../../lib/explorer';

/** Request-scoped forensic context threaded into the service for auditing. */
export interface WithdrawalContext {
  userId?: string;
  actorId?: string; // admin id for admin-surface calls
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Stable action codes (kept together to avoid typos in the audit trail). */
export const WithdrawalAction = {
  ADDRESS_ADDED: 'crypto.withdrawal.address_added',
  REQUESTED: 'crypto.withdrawal.requested',
  HOLD_PLACED: 'crypto.withdrawal.hold_placed',
  APPROVED: 'crypto.withdrawal.approved',
  REJECTED: 'crypto.withdrawal.rejected',
  BROADCAST: 'crypto.withdrawal.broadcast',
  COMPLETED: 'crypto.withdrawal.completed',
  FAILED: 'crypto.withdrawal.failed',
  HOLD_RELEASED: 'crypto.withdrawal.hold_released',
  ADMIN_QUEUE_VIEW: 'crypto.withdrawal.admin_queue_view',
  FIRST_APPROVED: 'crypto.withdrawal.first_approved',
} as const;

/** Ledger transaction kinds + reference types (each idempotent independently). */
export const LEDGER = {
  HOLD_KIND: 'WITHDRAWAL_HOLD',
  RELEASE_KIND: 'WITHDRAWAL_RELEASE',
  FINAL_KIND: 'WITHDRAWAL_FINAL',
  REF_HOLD: 'crypto_withdrawal',
  REF_RELEASE: 'crypto_withdrawal_release',
  REF_FINAL: 'crypto_withdrawal_final',
} as const;

export const CHAIN = 'TRON';
export const ASSET = 'USDT';

export interface WithdrawalAddressDto {
  id: string;
  chain: string;
  address: string;
  label: string | null;
  whitelistedAt: Date | null;
  /** True once the cooling-off period has elapsed and it is usable. */
  usable: boolean;
  createdAt: Date;
}

export interface CryptoWithdrawalDto {
  id: string;
  userId: string;
  chain: string;
  asset: string;
  toAddress: string;
  fromAddress: string | null;
  amount: string;
  fee: string;
  netAmount: string;
  status: WithdrawalStatus;
  txHash: string | null;
  explorerUrl: string | null;
  nonce: string | null;
  failureReason: string | null;
  requestedAt: Date;
  broadcastAt: Date | null;
  completedAt: Date | null;
}

export interface AdminCryptoWithdrawalDto extends CryptoWithdrawalDto {
  userEmail: string | null;
  userStatus: UserStatus | null;
  userKycStatus: string | null;
  userKycTier: number | null;
  withdrawalsBlocked: boolean | null;
  riskLevel: RiskLevel | null;
  riskNote: string | null;
  riskFlags: unknown;
  approvedBy: string | null;
  approvedBy2: string | null;
  firstApprovedAt: Date | null;
  requiresSecondApproval: boolean;
}

export function toWithdrawalAddressDto(
  row: WithdrawalAddress,
  now = new Date(),
): WithdrawalAddressDto {
  return {
    id: row.id,
    chain: row.chain,
    address: row.address,
    label: row.label,
    whitelistedAt: row.whitelistedAt,
    usable: row.whitelistedAt !== null && row.whitelistedAt <= now,
    createdAt: row.createdAt,
  };
}

export function toCryptoWithdrawalDto(row: CryptoWithdrawal): CryptoWithdrawalDto {
  return {
    id: row.id,
    userId: row.userId,
    chain: row.chain,
    asset: row.asset,
    toAddress: row.toAddress,
    fromAddress: row.fromAddress,
    amount: row.amount.toFixed(),
    fee: row.fee.toFixed(),
    netAmount: row.netAmount.toFixed(),
    status: row.status,
    txHash: row.txHash,
    explorerUrl: buildExplorerTxUrl(row.chain, row.txHash),
    nonce: row.nonce === null ? null : row.nonce.toString(),
    failureReason: row.failureReason,
    requestedAt: row.requestedAt,
    broadcastAt: row.broadcastAt,
    completedAt: row.completedAt,
  };
}

export function toAdminCryptoWithdrawalDto(
  row: CryptoWithdrawal & {
    user?: {
      email: string;
      status: UserStatus;
      kycStatus: string;
      kycTier: number;
      withdrawalsBlocked: boolean;
      riskLevel: RiskLevel;
      riskNote: string | null;
    };
  },
  opts: { dualApprovalThreshold: Prisma.Decimal },
): AdminCryptoWithdrawalDto {
  return {
    ...toCryptoWithdrawalDto(row),
    userEmail: row.user?.email ?? null,
    userStatus: row.user?.status ?? null,
    userKycStatus: row.user?.kycStatus ?? null,
    userKycTier: row.user?.kycTier ?? null,
    withdrawalsBlocked: row.user?.withdrawalsBlocked ?? null,
    riskLevel: row.user?.riskLevel ?? null,
    riskNote: row.user?.riskNote ?? null,
    riskFlags: row.riskFlags,
    approvedBy: row.approvedBy,
    approvedBy2: row.approvedBy2,
    firstApprovedAt: row.approvedBy && row.status === 'PENDING_APPROVAL' ? row.updatedAt : null,
    requiresSecondApproval:
      row.status === 'PENDING_APPROVAL' &&
      row.approvedBy !== null &&
      row.amount.gte(opts.dualApprovalThreshold),
  };
}

/** Convert a human decimal-string amount to integer base units (no floats). */
export function humanToBase(amount: string, decimals: number): string {
  const base = new Prisma.Decimal(amount).mul(new Prisma.Decimal(10).pow(decimals));
  if (!base.isInteger()) {
    throw new Error('Amount has more precision than the asset supports');
  }
  return base.toFixed(0);
}
