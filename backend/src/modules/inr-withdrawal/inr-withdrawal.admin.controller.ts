import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { inrWithdrawalService } from './inr-withdrawal.service';
import type { WithdrawalContext } from './inr-withdrawal.types';
import type { AdminWithdrawalQueryDto } from './inr-withdrawal.validators';

function ctx(req: Request): WithdrawalContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin-facing INR withdrawal queue + decisions. Behind adminAuthenticate +
 * adminAuthorize('inr.view' / 'inr.approve') — see inr-withdrawal.admin.routes.ts.
 */
export const adminInrWithdrawalController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as AdminWithdrawalQueryDto;
    const result = await inrWithdrawalService.adminList(
      {
        cursor: q.cursor,
        limit: q.limit,
        status: q.status,
        userId: q.userId,
        email: q.email,
        fromDate: q.fromDate,
        toDate: q.toDate,
      },
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async get(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const dto = await inrWithdrawalService.adminGet(req.params.id);
    sendSuccess(res, dto);
  },

  async approve(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const dto = await inrWithdrawalService.approve(req.params.id, ctx(req));
    sendSuccess(res, dto);
  },

  async reject(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const dto = await inrWithdrawalService.reject(
      req.params.id,
      { reason: req.body.reason },
      ctx(req),
    );
    sendSuccess(res, dto);
  },

  async markPaid(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const dto = await inrWithdrawalService.markPaid(
      req.params.id,
      { utr: req.body.utr, note: req.body.note },
      ctx(req),
    );
    sendSuccess(res, dto);
  },
};
