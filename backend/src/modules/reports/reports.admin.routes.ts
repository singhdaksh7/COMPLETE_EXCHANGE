import { Router } from 'express';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { reportsController } from './reports.controller';
import { feeReportQuerySchema } from './reports.validators';

/**
 * Admin reports routes, mounted at /admin/v1/reports.
 * Fee reports are read-only and backed by trades, completed withdrawals, and
 * FEE_REVENUE ledger entries. No fee settings are mutated from this surface.
 */
export const adminReportsRouter = Router();

adminReportsRouter.get(
  '/fees',
  adminAuthenticate,
  adminAuthorize('fees.view'),
  validate({ query: feeReportQuerySchema }),
  asyncHandler(reportsController.fees),
);
