import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Razorpay signature primitives.
 *
 * Both the mock and the live provider verify signatures the same way — the
 * algorithm is pure cryptography, not a network call — so the logic lives here
 * once and each provider supplies its own configured secret.
 *
 * Comparisons use a constant-time compare to avoid leaking secrets via timing.
 */

/** Lowercase hex HMAC-SHA256 of `payload` keyed by `secret`. */
export function hmacSha256Hex(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

const HEX = /^[0-9a-f]+$/i;

/** Constant-time equality for two hex strings of (expected) equal length. */
export function safeEqualHex(a: string, b: string): boolean {
  // Reject anything that isn't well-formed hex of matching length. `Buffer.from`
  // silently drops invalid hex nibbles, so without this guard two different
  // non-hex strings could decode to equal (e.g. empty) buffers and compare true.
  if (a.length !== b.length || !HEX.test(a) || !HEX.test(b)) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify the checkout payment signature returned to the browser after a
 * successful payment. Razorpay signs `${orderId}|${paymentId}` with the API key
 * secret. See https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/build-integration/#step-4-verify-payment-signature
 */
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const expected = hmacSha256Hex(
    `${input.orderId}|${input.paymentId}`,
    input.keySecret,
  );
  return safeEqualHex(expected, input.signature);
}

/**
 * Verify an inbound webhook. Razorpay signs the EXACT raw request body with the
 * webhook secret and sends the hex digest in the `X-Razorpay-Signature` header.
 */
export function verifyWebhookSignature(input: {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}): boolean {
  const expected = hmacSha256Hex(input.rawBody, input.webhookSecret);
  return safeEqualHex(expected, input.signature);
}
