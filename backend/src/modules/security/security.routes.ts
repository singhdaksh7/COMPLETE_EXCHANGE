import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorizeAny } from '../../middleware/admin-authorize';
import { auditReviewController } from './audit-review.controller';
import { auditReviewQuerySchema } from './audit-review.validators';

/**
 * Admin Security routes, mounted at /admin/v1/security (Stage 9D).
 *
 *   - audit-review → audit.view OR operations.view (risk-aware, paginated)
 *
 * Additive: this does NOT replace the existing /operations/audit viewer. It is a
 * second, risk-focused review surface. SUPER_ADMIN bypasses.
 */
export const adminSecurityRouter = Router();

adminSecurityRouter.get(
  '/audit-review',
  adminAuthenticate,
  adminAuthorizeAny('audit.view', 'operations.view'),
  validate({ query: auditReviewQuerySchema }),
  asyncHandler(auditReviewController.review),
);
