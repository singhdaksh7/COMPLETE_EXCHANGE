import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { scannerService } from './scanner.service';
import type { ScannerContext } from './scanner.types';
import type { AdminDepositQueryDto } from './scanner.validators';

function ctx(req: Request): ScannerContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin-facing deposit-scanner monitoring. Behind adminAuthenticate +
 * adminAuthorize('deposit.view') — see scanner.admin.routes.ts.
 */
export const adminScannerController = {
  async health(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    // The legacy /admin/v1/scanner/health endpoint is TRON-scoped; the
    // multi-chain view lives at /admin/v1/chains/:chain/health.
    const data = await scannerService.getHealth('TRON', ctx(req));
    sendSuccess(res, data);
  },

  async listDeposits(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { chain, status, userId, cursor, limit } =
      req.query as unknown as AdminDepositQueryDto;
    const result = await scannerService.adminListDeposits(
      { chain, status, userId, cursor, limit },
      ctx(req),
    );
    sendSuccess(res, result);
  },
};
