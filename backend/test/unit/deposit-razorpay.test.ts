import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  hmacSha256Hex,
  safeEqualHex,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../../src/modules/deposit/providers/razorpay.signature';
import {
  paiseToRupees,
  rupeesToPaise,
} from '../../src/modules/deposit/deposit.types';

const KEY_SECRET = 'unit-test-key-secret';
const WEBHOOK_SECRET = 'unit-test-webhook-secret';

describe('razorpay signature primitives', () => {
  it('accepts a correctly computed payment signature', () => {
    const orderId = 'order_abc';
    const paymentId = 'pay_xyz';
    const signature = createHmac('sha256', KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    expect(
      verifyPaymentSignature({
        orderId,
        paymentId,
        signature,
        keySecret: KEY_SECRET,
      }),
    ).toBe(true);
  });

  it('rejects a payment signature signed with the wrong secret', () => {
    const orderId = 'order_abc';
    const paymentId = 'pay_xyz';
    const signature = createHmac('sha256', 'attacker-secret')
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    expect(
      verifyPaymentSignature({
        orderId,
        paymentId,
        signature,
        keySecret: KEY_SECRET,
      }),
    ).toBe(false);
  });

  it('rejects a tampered payment id under the same signature', () => {
    const orderId = 'order_abc';
    const signature = createHmac('sha256', KEY_SECRET)
      .update(`${orderId}|pay_real`)
      .digest('hex');
    expect(
      verifyPaymentSignature({
        orderId,
        paymentId: 'pay_forged',
        signature,
        keySecret: KEY_SECRET,
      }),
    ).toBe(false);
  });

  it('verifies a webhook HMAC over the exact raw body', () => {
    const rawBody = '{"event":"payment.captured"}';
    const signature = hmacSha256Hex(rawBody, WEBHOOK_SECRET);
    expect(
      verifyWebhookSignature({ rawBody, signature, webhookSecret: WEBHOOK_SECRET }),
    ).toBe(true);
    // A single-byte change to the body invalidates the signature.
    expect(
      verifyWebhookSignature({
        rawBody: rawBody + ' ',
        signature,
        webhookSecret: WEBHOOK_SECRET,
      }),
    ).toBe(false);
  });

  it('safeEqualHex is false on length mismatch and non-hex input', () => {
    expect(safeEqualHex('abcd', 'abcdef')).toBe(false);
    expect(safeEqualHex('zz', 'zz')).toBe(false); // non-hex
  });
});

describe('rupee <-> paise conversion (no JS floats)', () => {
  it('converts decimal-string rupees to integer paise', () => {
    expect(rupeesToPaise('100.00')).toBe(10000);
    expect(rupeesToPaise('1')).toBe(100);
    expect(rupeesToPaise('0.01')).toBe(1);
    // The classic float trap: 0.1 + 0.2 !== 0.3 in float; decimal math is exact.
    expect(rupeesToPaise('19.99')).toBe(1999);
    expect(rupeesToPaise('100000.55')).toBe(10000055);
  });

  it('round-trips paise back to scale-2 rupee strings', () => {
    expect(paiseToRupees(10000)).toBe('100.00');
    expect(paiseToRupees(1)).toBe('0.01');
    expect(paiseToRupees(1999)).toBe('19.99');
  });

  it('rejects sub-paise precision rather than silently truncating', () => {
    expect(() => rupeesToPaise('1.005')).toThrow();
  });
});
