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
} as const;

/** Razorpay webhook events we act on. */
export const RazorpayEvent = {
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_FAILED: 'payment.failed',
  ORDER_PAID: 'order.paid',
} as const;

export interface CreateDepositInput {
  amount: DecimalString; // rupees, scale 2, > 0
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
  type: string;
  amount: DecimalString;
  fee: DecimalString;
  status: string;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  ledgerTxnId: string | null;
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
    type: txn.type,
    amount: txn.amount.toFixed(),
    fee: txn.fee.toFixed(),
    status: txn.status,
    provider: txn.provider,
    providerOrderId: txn.providerOrderId,
    providerPaymentId: txn.providerPaymentId,
    ledgerTxnId: txn.ledgerTxnId,
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
