import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { chainsService, type ChainContext } from './chains.service';
import type {
  ChainDepositsQueryDto,
  ChainParamDto,
  ChainWithdrawalsQueryDto,
} from './chains.validators';

function ctx(req: Request): ChainContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin multi-chain monitoring. Behind adminAuthenticate + RBAC — see
 * chains.admin.routes.ts. Read-only; audited; exposes no key material.
 */
export const adminChainsController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await chainsService.listChains(ctx(req)));
  },

  async health(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { chain } = req.params as unknown as ChainParamDto;
    sendSuccess(res, await chainsService.getHealth(chain, ctx(req)));
  },

  async cursor(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { chain } = req.params as unknown as ChainParamDto;
    sendSuccess(res, await chainsService.getCursor(chain, ctx(req)));
  },

  async deposits(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { chain } = req.params as unknown as ChainParamDto;
    const { status, userId, cursor, limit } = req.query as unknown as ChainDepositsQueryDto;
    sendSuccess(res, await chainsService.listDeposits(chain, { status, userId, cursor, limit }, ctx(req)));
  },

  async withdrawals(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { chain } = req.params as unknown as ChainParamDto;
    const { status, cursor, limit } = req.query as unknown as ChainWithdrawalsQueryDto;
    sendSuccess(res, await chainsService.listWithdrawals(chain, { status, cursor, limit }, ctx(req)));
  },
};
