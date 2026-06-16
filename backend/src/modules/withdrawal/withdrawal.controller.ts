import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { withdrawalService } from './withdrawal.service';
import type { WithdrawalContext } from './withdrawal.types';
import type {
  AddressQueryDto,
  WithdrawalQueryDto,
} from './withdrawal.validators';

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

export const withdrawalController = {
  // POST /withdrawals/addresses — add an allowlisted address.
  async addAddress(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const dto = await withdrawalService.addAddress(
      user.id,
      { chain: req.body.chain, address: req.body.address, label: req.body.label },
      ctx(req),
    );
    sendSuccess(res, dto, 201);
  },

  // GET /withdrawals/addresses — list allowlisted addresses.
  async listAddresses(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const { chain } = req.query as unknown as AddressQueryDto;
    const items = await withdrawalService.listAddresses(user.id, chain);
    sendSuccess(res, { items });
  },

  // POST /withdrawals — request a withdrawal (places a ledger hold).
  async create(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const dto = await withdrawalService.requestWithdrawal(
      user.id,
      { chain: req.body.chain, toAddress: req.body.toAddress, amount: req.body.amount },
      ctx(req),
    );
    sendSuccess(res, dto, 201);
  },

  // GET /withdrawals — list the caller's withdrawals.
  async list(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const { status, cursor, limit } = req.query as unknown as WithdrawalQueryDto;
    const result = await withdrawalService.listUserWithdrawals({
      userId: user.id,
      status,
      cursor,
      limit,
    });
    sendSuccess(res, result);
  },

  // GET /withdrawals/:id — single withdrawal status.
  async get(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const dto = await withdrawalService.getWithdrawal(user.id, req.params.id);
    sendSuccess(res, dto);
  },
};
