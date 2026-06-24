import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminNotificationController } from './admin-notification.controller';
import {
  listQuerySchema,
  notificationIdParamSchema,
} from './admin-notification.validators';

/**
 * Admin notification center (Stage 8B), mounted at /admin/v1/admin-notifications.
 *
 * NOTE: mounted at /admin-notifications (not /notifications) so it does NOT
 * shadow the existing /notifications delivery-log endpoint (Stage 4.0). All
 * three operations are gated by operations.view — the broad ops read/triage
 * permission (SUPER_ADMIN bypasses). Marking read is per-admin housekeeping and
 * is audit-logged.
 */
export const adminNotificationCenterRouter = Router();

adminNotificationCenterRouter.get(
  '/',
  adminAuthenticate,
  adminAuthorize('operations.view'),
  validate({ query: listQuerySchema }),
  asyncHandler(adminNotificationController.list),
);

adminNotificationCenterRouter.patch(
  '/read-all',
  adminAuthenticate,
  adminAuthorize('operations.view'),
  asyncHandler(adminNotificationController.markAllRead),
);

adminNotificationCenterRouter.patch(
  '/:id/read',
  adminAuthenticate,
  adminAuthorize('operations.view'),
  validate({ params: notificationIdParamSchema }),
  asyncHandler(adminNotificationController.markRead),
);
