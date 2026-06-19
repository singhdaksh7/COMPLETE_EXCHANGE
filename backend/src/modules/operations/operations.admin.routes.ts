import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { operationsController } from './operations.controller';
import { auditExportSchema, auditQuerySchema } from './operations.validators';

/**
 * Admin operations routes, mounted at /admin/v1/operations.
 *   - summary  → operations.view (dashboard counts)
 *   - audit/*  → audit.view (AdminLog viewer + CSV)
 * SUPER_ADMIN bypasses; READ_ONLY/SUPPORT hold these via their *.view grants.
 */
export const adminOperationsRouter = Router();

adminOperationsRouter.get(
  '/summary',
  adminAuthenticate,
  adminAuthorize('operations.view'),
  asyncHandler(operationsController.summary),
);

adminOperationsRouter.get(
  '/audit',
  adminAuthenticate,
  adminAuthorize('audit.view'),
  validate({ query: auditQuerySchema }),
  asyncHandler(operationsController.audit),
);

adminOperationsRouter.get(
  '/audit/export',
  adminAuthenticate,
  adminAuthorize('audit.view'),
  validate({ query: auditExportSchema }),
  asyncHandler(operationsController.auditExport),
);
