import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { commandCenterController } from './command-center.admin.controller';

/**
 * Stage 8A admin command center, mounted at /admin/v1/ops.
 *
 * One read-only aggregate (GET /ops/command-center) gated by operations.view —
 * the broad ops read permission (SUPER_ADMIN bypasses; FINANCE / KYC_REVIEWER /
 * INR_OPERATOR / SUPPORT / READ_ONLY hold it). No raw PII or secrets are
 * returned; the view is not separately audited (read-only snapshot, consistent
 * with the existing /system overview which is also un-audited).
 */
export const adminCommandCenterRouter = Router();

adminCommandCenterRouter.get(
  '/command-center',
  adminAuthenticate,
  adminAuthorize('operations.view'),
  asyncHandler(commandCenterController.commandCenter),
);
