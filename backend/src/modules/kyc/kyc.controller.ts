import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { kycService } from './kyc.service';
import type { KycContext } from './kyc.types';

/** Pull request-scoped forensic context for audit logging. */
function ctx(req: Request): KycContext {
  return {
    actorId: req.user?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * User-facing KYC controller: HTTP in, HTTP out. It extracts request data,
 * calls the service, and shapes the response envelope. No business logic here.
 */
export const kycController = {
  async getStatus(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const profile = await kycService.getStatus(req.user.id);
    sendSuccess(res, profile);
  },

  async submitProfile(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await kycService.submitProfile(req.user.id, req.body, ctx(req));
    // 202: accepted for review. The profile is the envelope data; the DigiLocker
    // consent handle rides in `meta` so the success envelope stays canonical.
    sendSuccess(res, result.profile, 202, { digilocker: result.digilocker });
  },

  async listDocuments(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const items = await kycService.listDocuments(req.user.id);
    sendSuccess(res, { items });
  },

  async submitDocument(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await kycService.submitDocument(req.user.id, req.body, ctx(req));
    sendSuccess(res, result, 201);
  },
};
