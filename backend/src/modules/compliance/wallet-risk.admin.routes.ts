import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { walletRiskAdminController } from './wallet-risk.admin.controller';
import {
  travelRuleActionSchema,
  travelRuleQuerySchema,
  walletRiskCheckQuerySchema,
  walletRiskProfileQuerySchema,
  walletRiskReviewSchema,
  walletRiskRunSchema,
} from './wallet-risk.validators';

/**
 * Admin wallet-risk + Travel Rule routes (Stage 5.3), mounted at
 * /admin/v1/compliance alongside the Stage 5.0/5.1/5.2 routers.
 *
 * RBAC:
 *   - wallet-risk view (checks/profiles/summary) → compliance.walletRisk.view
 *   - wallet-risk run                            → compliance.walletRisk.run
 *   - wallet-risk review/override                → compliance.walletRisk.review
 *   - travel-rule view (list/detail)             → compliance.travelRule.view
 *   - travel-rule status transitions             → compliance.travelRule.manage
 *   - travel-rule mock export                    → compliance.travelRule.export
 * SUPER_ADMIN bypasses. Responses are redacted/secrets-free.
 */
export const adminWalletRiskRouter = Router();

// ---- wallet risk ----
adminWalletRiskRouter.post(
  '/wallet-risk/run',
  adminAuthenticate,
  adminAuthorize('compliance.walletRisk.run'),
  validate({ body: walletRiskRunSchema }),
  asyncHandler(walletRiskAdminController.run),
);

adminWalletRiskRouter.get(
  '/wallet-risk/summary',
  adminAuthenticate,
  adminAuthorize('compliance.walletRisk.view'),
  asyncHandler(walletRiskAdminController.summary),
);

adminWalletRiskRouter.get(
  '/wallet-risk/checks',
  adminAuthenticate,
  adminAuthorize('compliance.walletRisk.view'),
  validate({ query: walletRiskCheckQuerySchema }),
  asyncHandler(walletRiskAdminController.listChecks),
);

adminWalletRiskRouter.post(
  '/wallet-risk/checks/:checkId/review',
  adminAuthenticate,
  adminAuthorize('compliance.walletRisk.review'),
  validate({ body: walletRiskReviewSchema }),
  asyncHandler(walletRiskAdminController.reviewCheck),
);

adminWalletRiskRouter.get(
  '/wallet-risk/profiles',
  adminAuthenticate,
  adminAuthorize('compliance.walletRisk.view'),
  validate({ query: walletRiskProfileQuerySchema }),
  asyncHandler(walletRiskAdminController.listProfiles),
);

adminWalletRiskRouter.get(
  '/wallet-risk/profiles/:profileId',
  adminAuthenticate,
  adminAuthorize('compliance.walletRisk.view'),
  asyncHandler(walletRiskAdminController.getProfile),
);

// ---- travel rule ----
adminWalletRiskRouter.get(
  '/travel-rule',
  adminAuthenticate,
  adminAuthorize('compliance.travelRule.view'),
  validate({ query: travelRuleQuerySchema }),
  asyncHandler(walletRiskAdminController.listTransfers),
);

adminWalletRiskRouter.get(
  '/travel-rule/:transferId',
  adminAuthenticate,
  adminAuthorize('compliance.travelRule.view'),
  asyncHandler(walletRiskAdminController.getTransfer),
);

adminWalletRiskRouter.get(
  '/travel-rule/:transferId/export',
  adminAuthenticate,
  adminAuthorize('compliance.travelRule.export'),
  asyncHandler(walletRiskAdminController.exportTransfer),
);

adminWalletRiskRouter.post(
  '/travel-rule/:transferId/status',
  adminAuthenticate,
  adminAuthorize('compliance.travelRule.manage'),
  validate({ body: travelRuleActionSchema }),
  asyncHandler(walletRiskAdminController.transferAction),
);
