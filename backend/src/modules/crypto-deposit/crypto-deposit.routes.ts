import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
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
 */
export const cryptoDepositRouter = Router();

cryptoDepositRouter.get(
  '/networks',
  authenticate,
  asyncHandler(cryptoDepositController.networks),
);

cryptoDepositRouter.post(
  '/submit',
  authenticate,
  authRateLimiter,
  validate({ body: submitCryptoDepositSchema }),
  asyncHandler(cryptoDepositController.submit),
);

cryptoDepositRouter.get(
  '/',
  authenticate,
  validate({ query: cryptoDepositListQuerySchema }),
  asyncHandler(cryptoDepositController.list),
);
