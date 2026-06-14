import { config } from '../../../config';
import { mockRazorpayProvider } from './razorpay.mock';
import { createLiveRazorpayProvider } from './razorpay.live';
import type { RazorpayProvider } from './razorpay.provider';

let cached: RazorpayProvider | undefined;

/**
 * Resolve the active Razorpay provider.
 *
 * Default is the offline mock. The live provider is selected ONLY when
 * RAZORPAY_PROVIDER=live AND real credentials (key id + secret) are present —
 * otherwise we fail loudly rather than silently degrading or, worse, hitting
 * Razorpay with placeholder keys. This enforces "do not call real Razorpay APIs
 * unless credentials exist".
 */
export function getRazorpayProvider(): RazorpayProvider {
  if (cached) return cached;

  if (config.razorpay.provider === 'live') {
    if (!config.razorpay.keyId || !config.razorpay.keySecret) {
      throw new Error(
        'RAZORPAY_PROVIDER=live requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET',
      );
    }
    cached = createLiveRazorpayProvider({
      keyId: config.razorpay.keyId,
      keySecret: config.razorpay.keySecret,
      webhookSecret: config.razorpay.webhookSecret,
      apiBase: config.razorpay.apiBase,
    });
    return cached;
  }

  cached = mockRazorpayProvider;
  return cached;
}

/** Test helper: drop the memoized provider so config changes take effect. */
export function resetRazorpayProvider(): void {
  cached = undefined;
}

export type {
  RazorpayProvider,
  RazorpayOrder,
  CreateOrderInput,
  RazorpayPaymentEntity,
} from './razorpay.provider';
export { RAZORPAY_PROVIDER_ID } from './razorpay.provider';
