import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { treasuryService } from './treasury.service';
import type { TreasuryContext } from './treasury.types';
import type {
  RejectBodyDto,
  TransferIdParamDto,
  TransferListQueryDto,
  TransferRequestDto,
  TreasuryWalletQueryDto,
} from './treasury.validators';

function ctx(req: Request): TreasuryContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin treasury / custody surface. Behind adminAuthenticate + RBAC — see
 * treasury.admin.routes.ts. Reads need `withdrawal.view`; movements need
 * `withdrawal.approve` OR `treasury.manage`. Every action is audited and never
 * returns private-key material (only the signer's KMS reference).
 */
export const adminTreasuryController = {
  async listHotWallets(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { chain } = req.query as unknown as TreasuryWalletQueryDto;
    const items = await treasuryService.listHotWallets({ chain }, ctx(req));
    sendSuccess(res, { items });
  },

  async listColdWallets(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { chain } = req.query as unknown as TreasuryWalletQueryDto;
    const items = await treasuryService.listColdWallets({ chain }, ctx(req));
    sendSuccess(res, { items });
  },

  async summary(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const summary = await treasuryService.getSummary(ctx(req));
    sendSuccess(res, summary);
  },

  async listTransfers(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const query = req.query as unknown as TransferListQueryDto;
    const result = await treasuryService.listTransfers(query, ctx(req));
    sendSuccess(res, result);
  },

  async createSweep(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const body = req.body as TransferRequestDto;
    const transfer = await treasuryService.requestSweep(body, ctx(req));
    sendSuccess(res, transfer, 201);
  },

  async createRefill(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const body = req.body as TransferRequestDto;
    const transfer = await treasuryService.requestRefill(body, ctx(req));
    sendSuccess(res, transfer, 201);
  },

  async approve(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { id } = req.params as unknown as TransferIdParamDto;
    const transfer = await treasuryService.approve(id, ctx(req));
    sendSuccess(res, transfer);
  },

  async reject(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { id } = req.params as unknown as TransferIdParamDto;
    const body = req.body as RejectBodyDto;
    const transfer = await treasuryService.reject(id, body, ctx(req));
    sendSuccess(res, transfer);
  },
};
