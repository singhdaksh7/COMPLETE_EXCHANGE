import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminScannerController } from './scanner.admin.controller';
import { adminDepositQuerySchema } from './scanner.validators';

/**
 * Admin scanner monitoring routes, mounted at /admin/v1/scanner.
 * Behind adminAuthenticate + adminAuthorize('deposit.view'). SUPER_ADMIN
 * bypasses the permission check.
 */
export const adminScannerRouter = Router();

adminScannerRouter.get(
  '/health',
  adminAuthenticate,
  adminAuthorize('deposit.view'),
  asyncHandler(adminScannerController.health),
);

adminScannerRouter.get(
  '/deposits',
  adminAuthenticate,
  adminAuthorize('deposit.view'),
  validate({ query: adminDepositQuerySchema }),
  asyncHandler(adminScannerController.listDeposits),
);
