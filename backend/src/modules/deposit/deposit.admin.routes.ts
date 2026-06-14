import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminDepositController } from './deposit.admin.controller';
import { adminDepositQuerySchema } from './deposit.validators';

/**
 * Admin INR deposit monitoring routes, mounted at /admin/v1/inr/deposits.
 * Behind adminAuthenticate + adminAuthorize('inr.deposit.view').
 */
export const adminDepositRouter = Router();

adminDepositRouter.get(
  '/',
  adminAuthenticate,
  adminAuthorize('inr.deposit.view'),
  validate({ query: adminDepositQuerySchema }),
  asyncHandler(adminDepositController.list),
);
