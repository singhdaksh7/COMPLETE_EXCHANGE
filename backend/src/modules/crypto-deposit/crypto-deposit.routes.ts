import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { requireUserFeature } from '../../middleware/require-user-feature';
import { authRateLimiter } from '../../middleware/rate-limit';
import { cryptoDepositController } from './crypto-deposit.controller';
import {
  cryptoDepositListQuerySchema,
  submitCryptoDepositSchema,
} from './crypto-deposit.validators';

/**
 * User-facing master-wallet USDT deposit routes (Stage 12 V1).
 * Mounted at /deposits/crypto. The submit endpoint carries the tighter
 * authRateLimiter (it triggers on-chain verification work).
 *
 * Stage 15: every route is gated by `requireUserFeature('canDepositCrypto')`.
 * Because effective access = per-user flag AND the global CRYPTO_DEPOSITS flag,
 * and the global flag is OFF by default (INR-only compliance mode), these
 * endpoints return 403 FEATURE_DISABLED_FOR_USER by default — the Stage 12
 * code below stays intact but inaccessible until compliance enables it.
 */
export const cryptoDepositRouter = Router();

cryptoDepositRouter.get(
  '/networks',
  authenticate,
  requireUserFeature('canDepositCrypto'),
  asyncHandler(cryptoDepositController.networks),
);

cryptoDepositRouter.post(
  '/submit',
  authenticate,
  authRateLimiter,
  requireUserFeature('canDepositCrypto'),
  validate({ body: submitCryptoDepositSchema }),
  asyncHandler(cryptoDepositController.submit),
);

cryptoDepositRouter.get(
  '/',
  authenticate,
  requireUserFeature('canDepositCrypto'),
  validate({ query: cryptoDepositListQuerySchema }),
  asyncHandler(cryptoDepositController.list),
);
