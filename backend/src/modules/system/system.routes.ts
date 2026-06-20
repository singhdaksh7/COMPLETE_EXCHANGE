import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { systemController } from './system.controller';

/**
 * Admin System / Ops Center routes, mounted at /admin/v1/system (Stage 4.3).
 *
 * RBAC:
 *   - overview / queues / scanner / mail → system.view
 *   - health                             → system.health.view
 *   - risk-alerts                        → system.risk.view
 * SUPER_ADMIN bypasses; SUPPORT/READ_ONLY hold these via their *.view grants.
 *
 * Every route is read-only and returns secrets-free operational data.
 */
export const adminSystemRouter = Router();

adminSystemRouter.get(
  '/overview',
  adminAuthenticate,
  adminAuthorize('system.view'),
  asyncHandler(systemController.overview),
);

adminSystemRouter.get(
  '/health',
  adminAuthenticate,
  adminAuthorize('system.health.view'),
  asyncHandler(systemController.health),
);

adminSystemRouter.get(
  '/queues',
  adminAuthenticate,
  adminAuthorize('system.view'),
  asyncHandler(systemController.queues),
);

adminSystemRouter.get(
  '/scanner',
  adminAuthenticate,
  adminAuthorize('system.view'),
  asyncHandler(systemController.scanner),
);

adminSystemRouter.get(
  '/mail',
  adminAuthenticate,
  adminAuthorize('system.view'),
  asyncHandler(systemController.mail),
);

adminSystemRouter.get(
  '/risk-alerts',
  adminAuthenticate,
  adminAuthorize('system.risk.view'),
  asyncHandler(systemController.riskAlerts),
);
