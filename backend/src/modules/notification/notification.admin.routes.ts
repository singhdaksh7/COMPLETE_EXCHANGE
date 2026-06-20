import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { notificationService } from './notification.service';
import {
  adminNotificationQuerySchema,
  type AdminNotificationQueryDto,
} from './notification.validators';

/**
 * Admin notification delivery log (mounted at /admin/v1/notifications).
 * Read-only visibility into recently created notifications and their email
 * delivery status. Behind adminAuthorize('notifications.view').
 */
export const adminNotificationRouter = Router();

adminNotificationRouter.get(
  '/',
  adminAuthenticate,
  adminAuthorize('notifications.view'),
  validate({ query: adminNotificationQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.admin) throw new UnauthorizedError();
    const { cursor, limit, type } = req.query as unknown as AdminNotificationQueryDto;
    const result = await notificationService.adminRecent({ cursor, limit, type });
    sendSuccess(res, result);
  }),
);
