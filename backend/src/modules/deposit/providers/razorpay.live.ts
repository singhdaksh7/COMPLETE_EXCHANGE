import { config } from '../../../config';
import { ServiceUnavailableError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
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
 * Live Razorpay provider.
 *
 * Talks to the real Razorpay Orders API over HTTPS with HTTP Basic auth
 * (key id + secret). It is ONLY ever constructed by the resolver after it has
 * confirmed real credentials exist, so this code can assume `keyId`/`keySecret`
 * are present. Signature verification reuses the shared HMAC primitives.
 */
export function createLiveRazorpayProvider(deps: {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  apiBase: string;
}): RazorpayProvider {
  const authHeader =
    'Basic ' +
    Buffer.from(`${deps.keyId}:${deps.keySecret}`).toString('base64');

  return {
    name: 'razorpay-live',
    mode: 'live',
    keyId: deps.keyId,

    async createOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
      let res: Response;
      try {
        res = await fetch(`${deps.apiBase}/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          body: JSON.stringify({
            amount: input.amountPaise,
            currency: 'INR',
            receipt: input.receipt,
            notes: input.notes,
            // Razorpay dedupes order creation per receipt when this is set.
            payment_capture: 1,
          }),
        });
      } catch (err) {
        logger.error({ err }, 'Razorpay order creation request failed');
        throw new ServiceUnavailableError('Payment gateway is unavailable');
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.error(
          { status: res.status, body: text.slice(0, 500) },
          'Razorpay order creation returned an error',
        );
        throw new ServiceUnavailableError('Payment gateway rejected the order');
      }

      const data = (await res.json()) as {
        id: string;
        amount: number;
        currency: string;
        receipt: string;
        status: string;
      };
      return {
        id: data.id,
        amountPaise: data.amount,
        currency: data.currency,
        receipt: data.receipt,
        status: data.status,
      };
    },

    verifyPaymentSignature(input) {
      return verifyPaymentSignature({ ...input, keySecret: deps.keySecret });
    },

    verifyWebhookSignature(input) {
      return verifyWebhookSignature({
        ...input,
        webhookSecret: deps.webhookSecret,
      });
    },
  };
}

/** Used by the resolver/config sanity. */
export const liveCredentialsPresent = (): boolean =>
  Boolean(config.razorpay.keyId && config.razorpay.keySecret);
