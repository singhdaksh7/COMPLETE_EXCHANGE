import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { ledgerService } from './ledger.service';
import type { LedgerContext } from './ledger.types';

function ctx(req: Request): LedgerContext {
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

export const ledgerController = {
  async listWallets(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const items = await ledgerService.listWallets(user.id);
    sendSuccess(res, { items });
  },

  async getWallet(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const wallet = await ledgerService.getWallet(user.id, req.params.asset);
    sendSuccess(res, wallet);
  },

  async getWalletLedger(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const result = await ledgerService.listLedgerEntries({
      userId: user.id,
      asset: req.params.asset,
      cursor: req.query.cursor as string | undefined,
      limit: Number(req.query.limit),
    });
    sendSuccess(res, result);
  },

  async listInrTransactions(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const result = await ledgerService.listInrTransactions({
      userId: user.id,
      type: req.query.type as 'DEPOSIT' | 'WITHDRAWAL' | undefined,
      cursor: req.query.cursor as string | undefined,
      limit: Number(req.query.limit),
    });
    sendSuccess(res, result);
  },

  async internalTransfer(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const result = await ledgerService.internalTransfer(
      {
        userId: user.id,
        toUserId: req.body.toUserId,
        amount: req.body.amount,
        asset: req.body.asset,
        fromKind: req.body.fromKind,
        toKind: req.body.toKind,
        referenceType: req.body.referenceType,
        referenceId: req.body.referenceId,
        metadata: req.body.metadata,
      },
      ctx(req),
    );
    sendSuccess(res, result, 201);
  },
};
