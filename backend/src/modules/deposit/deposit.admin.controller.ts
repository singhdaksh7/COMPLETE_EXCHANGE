import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { depositService } from './deposit.service';
import type { DepositContext } from './deposit.types';
import type {
  AdminDepositExportDto,
  AdminDepositQueryDto,
} from './deposit.validators';

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
    const q = req.query as unknown as AdminDepositQueryDto;
    const result = await depositService.adminListDeposits(
      {
        cursor: q.cursor,
        limit: q.limit,
        status: q.status,
        provider: q.provider,
        userId: q.userId,
        email: q.email,
        utr: q.utr,
        fromDate: q.fromDate,
        toDate: q.toDate,
        minAmount: q.minAmount,
        maxAmount: q.maxAmount,
      },
      ctx(req),
    );
    sendSuccess(res, result);
  },

  // GET /inr/deposits/export — CSV of the filtered deposit set.
  async exportCsv(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as AdminDepositExportDto;
    const csv = await depositService.adminExportDepositsCsv(
      {
        status: q.status,
        provider: q.provider,
        userId: q.userId,
        email: q.email,
        utr: q.utr,
        fromDate: q.fromDate,
        toDate: q.toDate,
        minAmount: q.minAmount,
        maxAmount: q.maxAmount,
      },
      ctx(req),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="inr-deposits.csv"',
    );
    res.status(200).send(csv);
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
