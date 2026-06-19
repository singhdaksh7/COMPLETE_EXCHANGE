import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { withdrawalService } from './withdrawal.service';
import type { WithdrawalContext } from './withdrawal.types';
import type { AdminQueueQueryDto } from './withdrawal.validators';

function ctx(req: Request): WithdrawalContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin withdrawal queue + approve/reject. Behind adminAuthenticate +
 * adminAuthorize — see withdrawal.admin.routes.ts. All actions audited.
 */
export const adminWithdrawalController = {
  async queue(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { status, asset, userId, email, fromDate, toDate, cursor, limit } =
      req.query as unknown as AdminQueueQueryDto;
    const result = await withdrawalService.adminListQueue(
      { status, asset, userId, email, fromDate, toDate, cursor, limit },
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async approve(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const dto = await withdrawalService.approve(req.params.id, ctx(req));
    sendSuccess(res, dto);
  },

  async reject(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const dto = await withdrawalService.reject(req.params.id, req.body.reason, ctx(req));
    sendSuccess(res, dto);
  },
};
