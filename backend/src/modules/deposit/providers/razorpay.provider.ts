/**
 * Razorpay provider abstraction.
 *
 * This interface is the seam the deposit module codes against so the offline
 * mock used in dev/tests and the live Razorpay client are interchangeable.
 *
 * Money is always handled in INTEGER PAISE at the provider boundary (Razorpay's
 * native unit) — never as JS floating-point rupees. The service converts to/from
 * decimal-string rupees for the ledger.
 */

export interface CreateOrderInput {
  /** Amount in integer paise (e.g. ₹500.00 → 50000). */
  amountPaise: number;
  /** Idempotent receipt id we control (our InrTransaction id). */
  receipt: string;
  /** Non-sensitive notes attached to the order for reconciliation. */
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  /** Razorpay order id, e.g. 'order_ABC123'. */
  id: string;
  amountPaise: number;
  currency: string;
  receipt: string;
  status: string;
}

/** Normalized view of the payment entity carried by a webhook. */
export interface RazorpayPaymentEntity {
  id: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  status: string;
}

export interface RazorpayProvider {
  /** Human-readable implementation name (e.g. 'razorpay-mock'). */
  readonly name: string;
  /** 'mock' (offline) or 'live' (talks to Razorpay). */
  readonly mode: 'mock' | 'live';
  /** Public key id surfaced to the client to open checkout (null in mock). */
  readonly keyId: string | null;

  /** Create a Razorpay order for the given paise amount. */
  createOrder(input: CreateOrderInput): Promise<RazorpayOrder>;

  /** Verify the browser checkout callback signature (orderId|paymentId). */
  verifyPaymentSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean;

  /** Verify an inbound webhook HMAC over the raw request body. */
  verifyWebhookSignature(input: { rawBody: string; signature: string }): boolean;
}

/** Stable provider identifier persisted on InrTransaction.provider / events. */
export const RAZORPAY_PROVIDER_ID = 'razorpay';
