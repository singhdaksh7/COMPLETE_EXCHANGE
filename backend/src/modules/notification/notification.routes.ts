import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { notificationController } from './notification.controller';
import {
  notificationIdParamSchema,
  notificationListQuerySchema,
} from './notification.validators';

/**
 * User-facing notification routes (mounted at /notifications). Every route is
 * authenticated and operates only on the caller's own notifications.
 */
export const notificationRouter = Router();

notificationRouter.get(
  '/',
  authenticate,
  validate({ query: notificationListQuerySchema }),
  asyncHandler(notificationController.list),
);

notificationRouter.post(
  '/read-all',
  authenticate,
  asyncHandler(notificationController.markAllRead),
);

notificationRouter.post(
  '/:id/read',
  authenticate,
  validate({ params: notificationIdParamSchema }),
  asyncHandler(notificationController.markRead),
);
