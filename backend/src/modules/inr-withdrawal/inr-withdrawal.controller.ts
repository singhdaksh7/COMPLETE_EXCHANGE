import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { inrWithdrawalService } from './inr-withdrawal.service';
import type { WithdrawalContext } from './inr-withdrawal.types';
import type { WithdrawalQueryDto } from './inr-withdrawal.validators';

function ctx(req: Request): WithdrawalContext {
  return {
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

function requireUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

export const inrWithdrawalController = {
  // POST /inr/withdrawals — request a manual INR withdrawal (reserves funds).
  async create(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const dto = await inrWithdrawalService.requestWithdrawal(
      user.id,
      {
        amount: req.body.amount,
        method: req.body.method,
        upiId: req.body.upiId,
        accountNumber: req.body.accountNumber,
        ifsc: req.body.ifsc,
        holderName: req.body.holderName,
        bankName: req.body.bankName,
      },
      ctx(req),
    );
    sendSuccess(res, dto, 201);
  },

  // GET /inr/withdrawals — the caller's withdrawal history.
  async list(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const { cursor, limit, status } = req.query as unknown as WithdrawalQueryDto;
    const result = await inrWithdrawalService.listUserWithdrawals({
      userId: user.id,
      cursor,
      limit,
      status,
    });
    sendSuccess(res, result);
  },

  // GET /inr/withdrawals/:id — single withdrawal (own only; 404 otherwise).
  async get(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const dto = await inrWithdrawalService.getUserWithdrawal(user.id, req.params.id);
    sendSuccess(res, dto);
  },
};
