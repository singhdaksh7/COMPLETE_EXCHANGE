import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { kycService } from './kyc.service';
import type { KycContext } from './kyc.types';
import type { KycQueueQueryDto } from './kyc.validators';

function ctx(req: Request): KycContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin-facing KYC controller. Sits behind adminAuthenticate + adminAuthorize
 * (kyc.view / kyc.review) — see kyc.admin.routes.ts.
 */
export const adminKycController = {
  async queue(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    // Validated + coerced by kycQueueQuerySchema.
    const { cursor, limit } = req.query as unknown as KycQueueQueryDto;
    const result = await kycService.reviewQueue({ cursor, limit }, ctx(req));
    sendSuccess(res, result);
  },

  async decision(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const profile = await kycService.decide(req.params.userId, req.body, ctx(req));
    sendSuccess(res, profile);
  },
};
