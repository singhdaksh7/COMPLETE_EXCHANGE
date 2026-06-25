import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { cryptoDepositService } from './crypto-deposit.service';
import type { CryptoDepositContext } from './crypto-deposit.types';
import type {
  CryptoDepositListQueryDto,
  SubmitCryptoDepositDto,
} from './crypto-deposit.validators';

function ctx(req: Request): CryptoDepositContext {
  return {
    actorId: req.user?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

function requireUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

export const cryptoDepositController = {
  // GET /deposits/crypto/networks — enabled USDT networks (no secrets).
  async networks(_req: Request, res: Response): Promise<void> {
    const result = cryptoDepositService.listNetworks();
    sendSuccess(res, result);
  },

  // POST /deposits/crypto/submit — submit a tx hash; verify + maybe credit.
  async submit(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const result = await cryptoDepositService.submit(
      user.id,
      req.body as SubmitCryptoDepositDto,
      ctx(req),
    );
    sendSuccess(res, result, 201);
  },

  // GET /deposits/crypto — list the caller's own crypto deposits.
  async list(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const result = await cryptoDepositService.listForUser(
      user.id,
      req.query as unknown as CryptoDepositListQueryDto,
    );
    sendSuccess(res, result);
  },
};
