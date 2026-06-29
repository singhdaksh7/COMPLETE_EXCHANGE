import type { InrWithdrawal } from '@prisma/client';

export type DecimalString = string;

/** Request-scoped forensic context threaded into the service for auditing. */
export interface WithdrawalContext {
  userId?: string;
  actorId?: string; // admin id for admin-surface calls
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Stable action codes (kept together to avoid typos in the audit trail). */
export const InrWithdrawalAction = {
  REQUESTED: 'inr.withdrawal.requested',
  RESERVE_FAILED: 'inr.withdrawal.reserve_failed',
  APPROVED: 'inr.withdrawal.approved',
  REJECTED: 'inr.withdrawal.rejected',
  PAID: 'inr.withdrawal.paid',
  ADMIN_LIST: 'inr.withdrawal.admin_list',
} as const;

/**
 * Ledger anchors shared by the service + tests.
 *
 * Idempotency for a ledger posting is the pair (referenceType, referenceId).
 * `LedgerTransaction.referenceId` is a UUID column (`@db.Uuid`), so it MUST be
 * the withdrawal id alone — never a composite string. Each money movement for a
 * withdrawal is disambiguated by a DISTINCT referenceType (mirroring the crypto
 * withdrawal pattern: crypto_withdrawal / _release / _final), so the same
 * withdrawal id can anchor lock, release and payout without colliding.
 */
export const WITHDRAWAL_REFERENCE_TYPE = 'inr_withdrawal'; // lock/reserve
export const WITHDRAWAL_RELEASE_REFERENCE_TYPE = 'inr_withdrawal_release';
export const WITHDRAWAL_PAYOUT_REFERENCE_TYPE = 'inr_withdrawal_payout';
export const WITHDRAWAL_LOCK_KIND = 'INR_WITHDRAWAL_LOCK';
export const WITHDRAWAL_RELEASE_KIND = 'INR_WITHDRAWAL_RELEASE';
export const WITHDRAWAL_PAYOUT_KIND = 'INR_WITHDRAWAL_PAYOUT';

export const PAYOUT_METHODS = ['UPI', 'BANK'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export interface CreateWithdrawalInput {
  amount: DecimalString; // rupees, scale 2, > 0
  method: PayoutMethod;
  // UPI payout
  upiId?: string;
  // Bank payout
  accountNumber?: string;
  ifsc?: string;
  holderName?: string;
  bankName?: string;
}

export interface RejectWithdrawalInput {
  reason: string;
}

export interface MarkPaidInput {
  utr: string;
  note?: string;
}

/** Payout destination as shown to the OWNING user (masked). */
export interface PayoutDestinationMasked {
  method: string;
  upiId: string | null;
  accountLast4: string | null;
  ifsc: string | null;
  holderName: string | null;
  bankName: string | null;
}

/** User-facing withdrawal view — payout destination is masked. */
export interface InrWithdrawalDto {
  id: string;
  userId: string;
  amount: DecimalString;
  status: string;
  payout: PayoutDestinationMasked;
  utr: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  paidAt: Date | null;
}

/** Admin-facing view — adds the FULL account number (decrypted) + admin trail. */
export interface AdminInrWithdrawalDto extends Omit<InrWithdrawalDto, 'payout'> {
  payout: PayoutDestinationMasked & { accountNumber: string | null };
  lockLedgerTxnId: string | null;
  finalLedgerTxnId: string | null;
  approvedBy: string | null;
  reviewedBy: string | null;
  paidBy: string | null;
  adminNote: string | null;
}

function maskUpi(upi: string | null): string | null {
  if (!upi) return null;
  const at = upi.indexOf('@');
  if (at <= 1) return upi;
  const handle = upi.slice(0, at);
  const masked =
    handle.length <= 2
      ? handle
      : `${handle.slice(0, 2)}${'*'.repeat(Math.max(1, handle.length - 2))}`;
  return `${masked}${upi.slice(at)}`;
}

function maskedPayout(row: InrWithdrawal): PayoutDestinationMasked {
  return {
    method: row.payoutMethod,
    upiId: maskUpi(row.upiId),
    accountLast4: row.accountLast4 ? `••••${row.accountLast4}` : null,
    ifsc: row.ifsc,
    holderName: row.holderName,
    bankName: row.bankName,
  };
}

export function toInrWithdrawalDto(row: InrWithdrawal): InrWithdrawalDto {
  return {
    id: row.id,
    userId: row.userId,
    amount: row.amount.toFixed(2),
    status: row.status,
    payout: maskedPayout(row),
    utr: row.utr,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    approvedAt: row.approvedAt,
    paidAt: row.paidAt,
  };
}

/**
 * Admin DTO. The full account number is decrypted by the caller (service) and
 * passed in, so this module never imports the encryption key directly.
 */
export function toAdminInrWithdrawalDto(
  row: InrWithdrawal,
  accountNumber: string | null,
): AdminInrWithdrawalDto {
  const base = toInrWithdrawalDto(row);
  return {
    ...base,
    payout: { ...base.payout, accountNumber },
    lockLedgerTxnId: row.lockLedgerTxnId,
    finalLedgerTxnId: row.finalLedgerTxnId,
    approvedBy: row.approvedBy,
    reviewedBy: row.reviewedBy,
    paidBy: row.paidBy,
    adminNote: row.adminNote,
  };
}
