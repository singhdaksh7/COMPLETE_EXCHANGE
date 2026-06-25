import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminCryptoDepositController } from './crypto-deposit.admin.controller';
import {
  adminCryptoDepositListQuerySchema,
  depositIdParamSchema,
} from './crypto-deposit.validators';

/**
 * Admin master-wallet USDT deposit routes (Stage 12). Every route requires
 * adminAuthenticate + the `operations.view` permission (SUPER_ADMIN bypasses).
 * Recheck re-runs on-chain verification and credits at most once via the same
 * idempotent path used by user submits.
 */
export const adminCryptoDepositRouter = Router();

adminCryptoDepositRouter.get(
  '/deposits',
  adminAuthenticate,
  adminAuthorize('operations.view'),
  validate({ query: adminCryptoDepositListQuerySchema }),
  asyncHandler(adminCryptoDepositController.list),
);

adminCryptoDepositRouter.get(
  '/deposits/:id',
  adminAuthenticate,
  adminAuthorize('operations.view'),
  validate({ params: depositIdParamSchema }),
  asyncHandler(adminCryptoDepositController.detail),
);

adminCryptoDepositRouter.post(
  '/deposits/:id/recheck',
  adminAuthenticate,
  adminAuthorize('operations.view'),
  validate({ params: depositIdParamSchema }),
  asyncHandler(adminCryptoDepositController.recheck),
);
