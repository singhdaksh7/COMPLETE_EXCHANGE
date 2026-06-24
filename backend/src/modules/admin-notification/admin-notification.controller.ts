import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import {
  adminNotificationService,
  type AdminNotificationContext,
} from './admin-notification.service';
import type { ListQueryDto } from './admin-notification.validators';

function ctx(req: Request): AdminNotificationContext {
  const userAgent = req.headers['user-agent'];
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: Array.isArray(userAgent) ? userAgent.join(', ') : userAgent,
    requestId: String(req.id),
  };
}

export const adminNotificationController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as ListQueryDto;
    const result = await adminNotificationService.list({
      unreadOnly: q.unreadOnly,
      type: q.type,
      cursor: q.cursor,
      limit: q.limit,
    });
    sendSuccess(res, result);
  },

  async markRead(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await adminNotificationService.markRead(req.params.id, ctx(req));
    sendSuccess(res, result);
  },

  async markAllRead(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await adminNotificationService.markAllRead(ctx(req));
    sendSuccess(res, result);
  },
};
