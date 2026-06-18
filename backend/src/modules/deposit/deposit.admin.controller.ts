import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { depositService } from './deposit.service';
import type { DepositContext } from './deposit.types';
import type { AdminDepositQueryDto } from './deposit.validators';

function ctx(req: Request): DepositContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin-facing INR deposit monitoring. Sits behind adminAuthenticate +
 * adminAuthorize('inr.deposit.view') — see deposit.admin.routes.ts.
 */
export const adminDepositController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { cursor, limit, status, provider, userId } =
      req.query as unknown as AdminDepositQueryDto;
    const result = await depositService.adminListDeposits(
      { cursor, limit, status, provider, userId },
      ctx(req),
    );
    sendSuccess(res, result);
  },

  // POST /inr/deposits/:id/approve — credit the user's INR balance (idempotent).
  async approve(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const deposit = await depositService.approveManualDeposit(
      req.params.id,
      ctx(req),
    );
    sendSuccess(res, deposit);
  },

  // POST /inr/deposits/:id/reject — mark FAILED with a reason. No credit.
  async reject(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const deposit = await depositService.rejectManualDeposit(
      req.params.id,
      { reason: req.body.reason },
      ctx(req),
    );
    sendSuccess(res, deposit);
  },
};
