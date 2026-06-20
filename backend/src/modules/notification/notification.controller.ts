import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { notificationService } from './notification.service';
import type { NotificationListQueryDto } from './notification.validators';

/**
 * User-facing notification controller. Every handler is scoped to the
 * authenticated user (req.user.id) so a user can only ever see/act on their own
 * notifications.
 */
export const notificationController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const { cursor, limit } = req.query as unknown as NotificationListQueryDto;
    const result = await notificationService.list({ userId: req.user.id, cursor, limit });
    sendSuccess(res, result);
  },

  async markRead(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await notificationService.markRead(req.user.id, req.params.id);
    sendSuccess(res, result);
  },

  async markAllRead(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await notificationService.markAllRead(req.user.id);
    sendSuccess(res, result);
  },
};
