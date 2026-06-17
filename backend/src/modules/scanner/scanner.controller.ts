import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { scannerService } from './scanner.service';
import type { UserDepositQueryDto } from './scanner.validators';

/**
 * User-facing crypto deposit controller. Read-only view of the caller's own
 * detected/credited on-chain deposits (the scanner owns crypto_deposits).
 */
export const scannerController = {
  // GET /wallets/deposits — the caller's crypto deposit history/status.
  async listDeposits(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const { chain, status, cursor, limit } = req.query as unknown as UserDepositQueryDto;
    const result = await scannerService.listUserDeposits({
      userId: req.user.id,
      chain,
      status,
      cursor,
      limit,
    });
    sendSuccess(res, result);
  },
};
