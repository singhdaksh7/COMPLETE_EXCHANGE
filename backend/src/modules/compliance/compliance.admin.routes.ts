import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { complianceAdminController } from './compliance.admin.controller';
import {
  complianceQuerySchema,
  complianceReviewSchema,
  complianceRiskSchema,
} from './compliance.validators';
import { screeningDecisionSchema } from './screening.validators';

/**
 * Admin compliance routes, mounted at /admin/v1/compliance (Stage 5.0).
 *
 * RBAC:
 *   - list / detail / evidence → compliance.view
 *   - review                   → compliance.review
 *   - risk                     → compliance.risk.manage
 *   - export                   → compliance.export
 * SUPER_ADMIN bypasses. All responses are masked/secrets-free.
 */
export const adminComplianceRouter = Router();

adminComplianceRouter.get(
  '/users',
  adminAuthenticate,
  adminAuthorize('compliance.view'),
  validate({ query: complianceQuerySchema }),
  asyncHandler(complianceAdminController.list),
);

adminComplianceRouter.get(
  '/users/:userId',
  adminAuthenticate,
  adminAuthorize('compliance.view'),
  asyncHandler(complianceAdminController.detail),
);

adminComplianceRouter.get(
  '/users/:userId/evidence',
  adminAuthenticate,
  adminAuthorize('compliance.view'),
  asyncHandler(complianceAdminController.evidence),
);

adminComplianceRouter.post(
  '/users/:userId/review',
  adminAuthenticate,
  adminAuthorize('compliance.review'),
  validate({ body: complianceReviewSchema }),
  asyncHandler(complianceAdminController.review),
);

adminComplianceRouter.post(
  '/users/:userId/risk',
  adminAuthenticate,
  adminAuthorize('compliance.risk.manage'),
  validate({ body: complianceRiskSchema }),
  asyncHandler(complianceAdminController.risk),
);

adminComplianceRouter.get(
  '/users/:userId/export',
  adminAuthenticate,
  adminAuthorize('compliance.export'),
  asyncHandler(complianceAdminController.export),
);

// ---- screening: sanctions / PEP / adverse-media (Stage 5.1) ----
//   view    → compliance.screening.view
//   run     → compliance.screening.run
//   decide  → compliance.screening.review
//   (override of the approval block is gated separately by
//    compliance.screening.override inside the review handler.)
adminComplianceRouter.get(
  '/users/:userId/screening',
  adminAuthenticate,
  adminAuthorize('compliance.screening.view'),
  asyncHandler(complianceAdminController.getScreening),
);

adminComplianceRouter.post(
  '/users/:userId/screening/run',
  adminAuthenticate,
  adminAuthorize('compliance.screening.run'),
  asyncHandler(complianceAdminController.runScreening),
);

adminComplianceRouter.post(
  '/users/:userId/screening/:checkId/decision',
  adminAuthenticate,
  adminAuthorize('compliance.screening.review'),
  validate({ body: screeningDecisionSchema }),
  asyncHandler(complianceAdminController.decideScreening),
);
