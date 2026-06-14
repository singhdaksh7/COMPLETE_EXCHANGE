import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminConversionController } from './conversion.admin.controller';
import { adminConversionQuerySchema } from './conversion.validators';

/**
 * Admin conversion monitoring, mounted at /admin/v1/conversions.
 * Behind adminAuthenticate + adminAuthorize('inr.view'); SUPER_ADMIN bypasses.
 */
export const adminConversionRouter = Router();

adminConversionRouter.get(
  '/',
  adminAuthenticate,
  adminAuthorize('inr.view'),
  validate({ query: adminConversionQuerySchema }),
  asyncHandler(adminConversionController.list),
);
