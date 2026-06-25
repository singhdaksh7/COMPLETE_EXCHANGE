import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { cryptoDepositService } from './crypto-deposit.service';
import type { CryptoDepositContext } from './crypto-deposit.types';
import type { AdminCryptoDepositListQueryDto } from './crypto-deposit.validators';

function ctx(req: Request): CryptoDepositContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin master-wallet deposit controller. Sits behind adminAuthenticate +
 * adminAuthorize('operations.view') — see crypto-deposit.admin.routes.ts.
 */
export const adminCryptoDepositController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await cryptoDepositService.adminList(
      req.query as unknown as AdminCryptoDepositListQueryDto,
    );
    sendSuccess(res, result);
  },

  async detail(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await cryptoDepositService.adminGet(req.params.id);
    sendSuccess(res, result);
  },

  async recheck(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await cryptoDepositService.adminRecheck(req.params.id, ctx(req));
    sendSuccess(res, result);
  },
};
