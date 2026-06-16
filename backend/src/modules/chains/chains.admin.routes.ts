import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminChainsController } from './chains.admin.controller';
import {
  chainDepositsQuerySchema,
  chainParamSchema,
  chainWithdrawalsQuerySchema,
} from './chains.validators';

/**
 * Admin multi-chain monitoring, mounted at /admin/v1/chains.
 *   GET /chains                      — supported chains + networks + cursors
 *   GET /chains/:chain/health        — scanner head/lag/provider/deposit counts
 *   GET /chains/:chain/cursor        — persisted scan cursor
 *   GET /chains/:chain/deposits      — crypto deposits on the chain
 *   GET /chains/:chain/withdrawals   — crypto withdrawals on the chain
 *
 * Deposit-side reads need `deposit.view`; withdrawals need `withdrawal.view`.
 * SUPER_ADMIN bypasses. Every read is audited; no key material is returned.
 */
export const adminChainsRouter = Router();

adminChainsRouter.get(
  '/',
  adminAuthenticate,
  adminAuthorize('deposit.view'),
  asyncHandler(adminChainsController.list),
);

adminChainsRouter.get(
  '/:chain/health',
  adminAuthenticate,
  adminAuthorize('deposit.view'),
  validate({ params: chainParamSchema }),
  asyncHandler(adminChainsController.health),
);

adminChainsRouter.get(
  '/:chain/cursor',
  adminAuthenticate,
  adminAuthorize('deposit.view'),
  validate({ params: chainParamSchema }),
  asyncHandler(adminChainsController.cursor),
);

adminChainsRouter.get(
  '/:chain/deposits',
  adminAuthenticate,
  adminAuthorize('deposit.view'),
  validate({ params: chainParamSchema, query: chainDepositsQuerySchema }),
  asyncHandler(adminChainsController.deposits),
);

adminChainsRouter.get(
  '/:chain/withdrawals',
  adminAuthenticate,
  adminAuthorize('withdrawal.view'),
  validate({ params: chainParamSchema, query: chainWithdrawalsQuerySchema }),
  asyncHandler(adminChainsController.withdrawals),
);
