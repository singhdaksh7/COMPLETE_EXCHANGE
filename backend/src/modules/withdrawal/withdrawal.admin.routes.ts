import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminWithdrawalController } from './withdrawal.admin.controller';
import {
  adminQueueQuerySchema,
  rejectSchema,
  withdrawalIdParamSchema,
} from './withdrawal.validators';

/**
 * Admin crypto-withdrawal routes, mounted at /admin/v1/withdrawals.
 *   - queue read   → 'withdrawals.view'
 *   - approve      → 'withdrawals.approve'
 *   - reject       → 'withdrawals.review'
 * SUPER_ADMIN bypasses the permission check.
 */
export const adminWithdrawalRouter = Router();

adminWithdrawalRouter.get(
  '/',
  adminAuthenticate,
  adminAuthorize('withdrawals.view'),
  validate({ query: adminQueueQuerySchema }),
  asyncHandler(adminWithdrawalController.queue),
);

adminWithdrawalRouter.post(
  '/:id/approve',
  adminAuthenticate,
  adminAuthorize('withdrawals.approve'),
  validate({ params: withdrawalIdParamSchema }),
  asyncHandler(adminWithdrawalController.approve),
);

adminWithdrawalRouter.post(
  '/:id/reject',
  adminAuthenticate,
  adminAuthorize('withdrawals.review'),
  validate({ params: withdrawalIdParamSchema, body: rejectSchema }),
  asyncHandler(adminWithdrawalController.reject),
);
