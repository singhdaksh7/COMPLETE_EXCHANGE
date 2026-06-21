import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { complianceService } from './compliance.service';
import { extractGeoEvidence, type ComplianceContext } from './compliance.types';

function ctx(req: Request): ComplianceContext {
  return {
    actorId: req.user?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * User-facing compliance / enhanced-KYC controller. Captures IP + user-agent +
 * safe geo (CloudFront viewer headers) server-side — never trusting the client
 * for forensic evidence.
 */
export const complianceController = {
  async getStatus(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const status = await complianceService.getStatus(req.user.id);
    sendSuccess(res, status);
  },

  async startLiveness(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const session = await complianceService.startLiveness(req.user.id, ctx(req));
    sendSuccess(res, session, 201);
  },

  async verifyLiveness(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await complianceService.verifyLiveness(req.user.id, req.body, ctx(req));
    sendSuccess(res, result);
  },

  async submitEnhanced(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const geo = extractGeoEvidence({ ip: req.ip, headers: req.headers });
    const profile = await complianceService.submitEnhanced(req.user.id, req.body, geo, ctx(req));
    sendSuccess(res, profile, 202);
  },
};
