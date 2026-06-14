import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { walletService } from './wallet.service';
import type { WalletContext } from './wallet.types';
import type { AddressQueryDto, NetworksQueryDto } from './wallet.validators';

function ctx(req: Request): WalletContext {
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

export const walletController = {
  // GET /wallets/overview — ledger balances + deposit networks/addresses.
  async overview(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const data = await walletService.getOverview(user.id);
    sendSuccess(res, data);
  },

  // GET /wallets/networks — supported asset/chain listing.
  async networks(req: Request, res: Response): Promise<void> {
    requireUser(req);
    const { chain } = req.query as unknown as NetworksQueryDto;
    const items = await walletService.listSupportedNetworks(chain);
    sendSuccess(res, { items });
  },

  // GET /wallets/addresses — list the user's deposit addresses.
  async listAddresses(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const { chain } = req.query as unknown as AddressQueryDto;
    const items = await walletService.listAddresses(user.id, chain);
    sendSuccess(res, { items });
  },

  // POST /wallets/addresses — get-or-derive the deposit address for a chain.
  async createAddress(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const { address, created } = await walletService.requestDepositAddress(
      user.id,
      req.body.chain,
      ctx(req),
    );
    // 201 when freshly derived, 200 when returning an existing active address.
    sendSuccess(res, address, created ? 201 : 200);
  },
};
