import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { walletService } from './wallet.service';
import type { WalletContext } from './wallet.types';
import type {
  AdminAddressQueryDto,
  AdminHotWalletQueryDto,
  AdminSignerQueryDto,
} from './wallet.validators';

function ctx(req: Request): WalletContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin-facing wallet monitoring. Behind adminAuthenticate + adminAuthorize —
 * see wallet.admin.routes.ts. All reads are audited.
 */
export const adminWalletController = {
  async listDepositAddresses(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { chain, userId, cursor, limit } =
      req.query as unknown as AdminAddressQueryDto;
    const result = await walletService.adminListDepositAddresses(
      { chain, userId, cursor, limit },
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async listHotWallets(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { chain, tier } = req.query as unknown as AdminHotWalletQueryDto;
    const items = await walletService.adminListHotWallets({ chain, tier }, ctx(req));
    sendSuccess(res, { items });
  },

  async listSigners(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { chain } = req.query as unknown as AdminSignerQueryDto;
    const items = await walletService.adminListSigners({ chain }, ctx(req));
    sendSuccess(res, { items });
  },
};
