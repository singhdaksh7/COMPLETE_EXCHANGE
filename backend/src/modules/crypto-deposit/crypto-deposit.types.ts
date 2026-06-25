import type { MasterWalletDeposit, MasterWalletDepositStatus } from '@prisma/client';

/** Request/actor context threaded through the service for audit + ledger. */
export interface CryptoDepositContext {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Lowercase wire statuses (match the Stage 12 spec). */
export type WireDepositStatus =
  | 'submitted'
  | 'pending_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'duplicate'
  | 'failed';

const STATUS_WIRE: Record<MasterWalletDepositStatus, WireDepositStatus> = {
  SUBMITTED: 'submitted',
  PENDING_CONFIRMATION: 'pending_confirmation',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  DUPLICATE: 'duplicate',
  FAILED: 'failed',
};

/** Safe, secrets-free deposit DTO returned to users and admins. */
export interface MasterDepositDto {
  id: string;
  assetSymbol: string;
  chain: string;
  masterAddress: string;
  fromAddress: string | null;
  txHash: string;
  amount: string;
  confirmations: number;
  minConfirmations: number | null;
  status: WireDepositStatus;
  rejectionReason: string | null;
  creditedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toMasterDepositDto(
  row: MasterWalletDeposit,
  minConfirmations: number | null = null,
): MasterDepositDto {
  return {
    id: row.id,
    assetSymbol: row.assetSymbol,
    chain: row.chain,
    masterAddress: row.masterAddress,
    fromAddress: row.fromAddress,
    txHash: row.txHash,
    amount: row.amount.toFixed(),
    confirmations: row.confirmations,
    minConfirmations,
    status: STATUS_WIRE[row.status],
    rejectionReason: row.rejectionReason,
    creditedAt: row.creditedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Admin list row adds the owning userId + the user email for display. */
export interface AdminMasterDepositDto extends MasterDepositDto {
  userId: string;
  userEmail: string | null;
}

export function toAdminMasterDepositDto(
  row: MasterWalletDeposit & { user?: { email: string } | null },
  minConfirmations: number | null = null,
): AdminMasterDepositDto {
  return {
    ...toMasterDepositDto(row, minConfirmations),
    userId: row.userId,
    userEmail: row.user?.email ?? null,
  };
}
