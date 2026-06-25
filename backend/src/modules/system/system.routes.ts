import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize, adminAuthorizeAny } from '../../middleware/admin-authorize';
import { systemController } from './system.controller';

/**
 * Admin System / Ops Center routes, mounted at /admin/v1/system (Stage 4.3).
 *
 * RBAC:
 *   - overview / queues / scanner / mail → system.view
 *   - health                             → system.health.view
 *   - risk-alerts                        → system.risk.view
 *   - readiness / backup-status /        → operations.view OR system.view
 *     monitoring / guardrails (Stage 9)     (either operations or system viewer)
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

// --- Stage 9: production readiness pack (read-only status surfaces) ---------
// Reachable by either the operations admin (operations.view) or the system/ops
// viewer (system.view).

// Stage 9A — structured readiness checklist.
adminSystemRouter.get(
  '/readiness',
  adminAuthenticate,
  adminAuthorizeAny('operations.view', 'system.view'),
  asyncHandler(systemController.readiness),
);

// Stage 9B — backup / restore status + checklist.
adminSystemRouter.get(
  '/backup-status',
  adminAuthenticate,
  adminAuthorizeAny('operations.view', 'system.view'),
  asyncHandler(systemController.backupStatus),
);

// Stage 9C — monitoring / alerts status.
adminSystemRouter.get(
  '/monitoring',
  adminAuthenticate,
  adminAuthorizeAny('operations.view', 'system.view'),
  asyncHandler(systemController.monitoring),
);

// Stage 9E — security / abuse guardrails (enforced vs planned).
adminSystemRouter.get(
  '/guardrails',
  adminAuthenticate,
  adminAuthorizeAny('operations.view', 'system.view'),
  asyncHandler(systemController.guardrails),
);
