import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminSensitiveRateLimiter } from '../../middleware/rate-limit';
import { adminInrWithdrawalController } from './inr-withdrawal.admin.controller';
import {
  adminWithdrawalQuerySchema,
  markPaidSchema,
  rejectWithdrawalSchema,
  withdrawalIdParamSchema,
} from './inr-withdrawal.validators';

/**
 * Admin INR withdrawal routes, mounted at /admin/v1/inr/withdrawals.
 * Monitoring is behind adminAuthorize('inr.view'); approve/reject/mark-paid
 * decisions require the stronger 'inr.approve' permission (same model the INR
 * deposit queue uses).
 */
export const adminInrWithdrawalRouter = Router();

adminInrWithdrawalRouter.get(
  '/',
  adminAuthenticate,
  adminAuthorize('inr.view'),
  validate({ query: adminWithdrawalQuerySchema }),
  asyncHandler(adminInrWithdrawalController.list),
);

adminInrWithdrawalRouter.get(
  '/:id',
  adminAuthenticate,
  adminAuthorize('inr.view'),
  validate({ params: withdrawalIdParamSchema }),
  asyncHandler(adminInrWithdrawalController.get),
);

// Sensitive admin money-movement actions are throttled in the dedicated
// admin-sensitive bucket (Stage 9E pattern), in addition to RBAC + audit.
adminInrWithdrawalRouter.post(
  '/:id/approve',
  adminAuthenticate,
  adminAuthorize('inr.approve'),
  adminSensitiveRateLimiter,
  validate({ params: withdrawalIdParamSchema }),
  asyncHandler(adminInrWithdrawalController.approve),
);

adminInrWithdrawalRouter.post(
  '/:id/reject',
  adminAuthenticate,
  adminAuthorize('inr.approve'),
  adminSensitiveRateLimiter,
  validate({ params: withdrawalIdParamSchema, body: rejectWithdrawalSchema }),
  asyncHandler(adminInrWithdrawalController.reject),
);

adminInrWithdrawalRouter.post(
  '/:id/mark-paid',
  adminAuthenticate,
  adminAuthorize('inr.approve'),
  adminSensitiveRateLimiter,
  validate({ params: withdrawalIdParamSchema, body: markPaidSchema }),
  asyncHandler(adminInrWithdrawalController.markPaid),
);
