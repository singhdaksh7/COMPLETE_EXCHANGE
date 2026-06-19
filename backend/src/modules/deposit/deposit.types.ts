import { Prisma, type InrTransaction } from '@prisma/client';

export type DecimalString = string;

/** Request-scoped forensic context threaded into the service for auditing. */
export interface DepositContext {
  userId?: string;
  actorId?: string; // admin id for admin-surface calls
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Stable action codes (kept together to avoid typos in the audit trail). */
export const DepositAction = {
  INITIATED: 'inr.deposit.initiated',
  PAYMENT_VERIFIED: 'inr.deposit.payment_verified',
  PAYMENT_VERIFY_FAILED: 'inr.deposit.payment_verify_failed',
  CREDITED: 'inr.deposit.credited',
  FAILED: 'inr.deposit.failed',
  WEBHOOK_RECEIVED: 'inr.deposit.webhook_received',
  WEBHOOK_INVALID_SIGNATURE: 'inr.deposit.webhook_invalid_signature',
  ADMIN_LIST: 'inr.deposit.admin_list',
  // Manual INR deposit lifecycle
  MANUAL_SUBMITTED: 'inr.deposit.manual_submitted',
  MANUAL_APPROVED: 'inr.deposit.manual_approved',
  MANUAL_REJECTED: 'inr.deposit.manual_rejected',
  // Maker-checker (dual approval) lifecycle
  MANUAL_FIRST_APPROVED: 'inr.deposit.manual_first_approved',
  MANUAL_SECOND_APPROVED: 'inr.deposit.manual_second_approved',
} as const;

/** Provider tag for manually-submitted (non-gateway) INR deposits. */
export const MANUAL_PROVIDER = 'MANUAL';

/** Manual deposit payment methods accepted from the user. */
export const MANUAL_METHODS = ['UPI', 'IMPS', 'NEFT', 'QR', 'BANK'] as const;
export type ManualDepositMethod = (typeof MANUAL_METHODS)[number];

/** Razorpay webhook events we act on. */
export const RazorpayEvent = {
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_FAILED: 'payment.failed',
  ORDER_PAID: 'order.paid',
} as const;

export interface CreateDepositInput {
  amount: DecimalString; // rupees, scale 2, > 0
}

export interface CreateManualDepositInput {
  amount: DecimalString; // rupees, scale 2, > 0
  utr: string; // bank/UPI reference (unique per provider)
  method: ManualDepositMethod;
  proofKey?: string; // optional object-storage key for a proof screenshot
}

export interface ManualDecisionInput {
  reason?: string; // required for reject, recorded as rejectionReason
}

export interface VerifyPaymentInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

/** Mirrors OpenAPI `InrDepositIntent`. */
export interface InrDepositIntentDto {
  inrTransactionId: string;
  provider: string;
  providerOrderId: string;
  keyId: string | null;
  amount: DecimalString;
  status: string;
}

/** User/admin-facing deposit view. */
export interface InrDepositDto {
  id: string;
  userId: string;
  type: string;
  amount: DecimalString;
  fee: DecimalString;
  status: string;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  ledgerTxnId: string | null;
  utr: string | null;
  method: string | null;
  proofKey: string | null;
  firstApprovedBy: string | null;
  firstApprovedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Result of webhook ingestion (returned to the controller for the HTTP code). */
export interface WebhookResult {
  received: true;
  /** True when this exact event had already been processed (idempotent replay). */
  duplicate: boolean;
  /** Resulting deposit status, when the event mapped to a known deposit. */
  status?: string;
}

export function toInrDepositDto(txn: InrTransaction): InrDepositDto {
  return {
    id: txn.id,
    userId: txn.userId,
    type: txn.type,
    amount: txn.amount.toFixed(),
    fee: txn.fee.toFixed(),
    status: txn.status,
    provider: txn.provider,
    providerOrderId: txn.providerOrderId,
    providerPaymentId: txn.providerPaymentId,
    ledgerTxnId: txn.ledgerTxnId,
    utr: txn.utr,
    method: txn.method,
    proofKey: txn.proofKey,
    firstApprovedBy: txn.firstApprovedBy,
    firstApprovedAt: txn.firstApprovedAt,
    reviewedBy: txn.reviewedBy,
    reviewedAt: txn.reviewedAt,
    rejectionReason: txn.rejectionReason,
    createdAt: txn.createdAt,
    updatedAt: txn.updatedAt,
  };
}

/**
 * Convert a decimal-string rupee amount to integer paise WITHOUT floating point.
 * Throws if the amount has sub-paise precision.
 */
export function rupeesToPaise(amount: DecimalString): number {
  const paise = new Prisma.Decimal(amount).mul(100);
  if (!paise.isInteger()) {
    throw new Error('INR amount has sub-paise precision');
  }
  return paise.toNumber();
}

/** Convert integer paise back to a scale-2 decimal-string rupee amount. */
export function paiseToRupees(paise: number): DecimalString {
  return new Prisma.Decimal(paise).div(100).toFixed(2);
}
