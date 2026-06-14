import { createHash } from 'node:crypto';
import { config } from '../../../config';
import {
  verifyPaymentSignature,
  verifyWebhookSignature,
} from './razorpay.signature';
import type {
  CreateOrderInput,
  RazorpayOrder,
  RazorpayProvider,
} from './razorpay.provider';

/**
 * Mock Razorpay provider.
 *
 * Deterministic, fully offline stand-in for the real Razorpay API. It performs
 * NO network calls: `createOrder` fabricates a stable `order_*` id derived from
 * the receipt, while signature verification uses the SAME real HMAC algorithm as
 * production (keyed by the configured dev secrets). That means tests — and the
 * frontend in dev — can compute a valid payment/webhook signature locally and
 * exercise the genuine verification path, with zero risk of touching Razorpay.
 */
export const mockRazorpayProvider: RazorpayProvider = {
  name: 'razorpay-mock',
  mode: 'mock',
  keyId: config.razorpay.keyId ?? 'rzp_test_mock',

  async createOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
    const digest = createHash('sha256')
      .update(input.receipt)
      .digest('hex')
      .slice(0, 14);
    return {
      id: `order_${digest}`,
      amountPaise: input.amountPaise,
      currency: 'INR',
      receipt: input.receipt,
      status: 'created',
    };
  },

  verifyPaymentSignature(input) {
    return verifyPaymentSignature({
      ...input,
      keySecret: config.razorpay.keySecret,
    });
  },

  verifyWebhookSignature(input) {
    return verifyWebhookSignature({
      ...input,
      webhookSecret: config.razorpay.webhookSecret,
    });
  },
};
