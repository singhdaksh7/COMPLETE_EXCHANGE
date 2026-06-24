import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { dashboardAdminController } from './dashboard.admin.controller';
import { dashboardQuerySchema } from './dashboard.validators';

/**
 * Compliance dashboard aggregate (Stage 4A), mounted at /admin/v1/compliance.
 *
 * One read-only endpoint that returns the overview cards + queue previews for
 * the compliance landing page. Gated by compliance.view (the broad read gate the
 * task specifies); the deeper drill-down pages keep their own finer permissions.
 * `/dashboard` does not collide with the existing /users, /cases, /alerts paths.
 */
export const adminComplianceDashboardRouter = Router();

adminComplianceDashboardRouter.get(
  '/dashboard',
  adminAuthenticate,
  adminAuthorize('compliance.view'),
  validate({ query: dashboardQuerySchema }),
  asyncHandler(dashboardAdminController.dashboard),
);
