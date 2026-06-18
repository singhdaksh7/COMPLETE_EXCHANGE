import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminDepositController } from './deposit.admin.controller';
import {
  adminDepositQuerySchema,
  depositIdParamSchema,
  manualDecisionSchema,
} from './deposit.validators';

/**
 * Admin INR deposit routes, mounted at /admin/v1/inr/deposits.
 * Monitoring is behind adminAuthorize('inr.view') — a seeded permission held by
 * FINANCE and (implicitly) SUPER_ADMIN; manual approve/reject decisions require
 * the stronger 'inr.approve' permission.
 */
export const adminDepositRouter = Router();

adminDepositRouter.get(
  '/',
  adminAuthenticate,
  adminAuthorize('inr.view'),
  validate({ query: adminDepositQuerySchema }),
  asyncHandler(adminDepositController.list),
);

adminDepositRouter.post(
  '/:id/approve',
  adminAuthenticate,
  adminAuthorize('inr.approve'),
  validate({ params: depositIdParamSchema }),
  asyncHandler(adminDepositController.approve),
);

adminDepositRouter.post(
  '/:id/reject',
  adminAuthenticate,
  adminAuthorize('inr.approve'),
  validate({ params: depositIdParamSchema, body: manualDecisionSchema }),
  asyncHandler(adminDepositController.reject),
);
