import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminSensitiveRateLimiter } from '../../middleware/rate-limit';
import { adminDepositController } from './deposit.admin.controller';
import {
  adminDepositExportSchema,
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

adminDepositRouter.get(
  '/export',
  adminAuthenticate,
  adminAuthorize('inr.view'),
  validate({ query: adminDepositExportSchema }),
  asyncHandler(adminDepositController.exportCsv),
);

// Sensitive admin money-movement actions are throttled in the dedicated
// admin-sensitive bucket (Stage 9E pattern), in addition to RBAC + audit.
adminDepositRouter.post(
  '/:id/approve',
  adminAuthenticate,
  adminAuthorize('inr.approve'),
  adminSensitiveRateLimiter,
  validate({ params: depositIdParamSchema }),
  asyncHandler(adminDepositController.approve),
);

adminDepositRouter.post(
  '/:id/reject',
  adminAuthenticate,
  adminAuthorize('inr.approve'),
  adminSensitiveRateLimiter,
  validate({ params: depositIdParamSchema, body: manualDecisionSchema }),
  asyncHandler(adminDepositController.reject),
);
