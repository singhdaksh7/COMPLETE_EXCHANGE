import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { kycService } from './kyc.service';
import type { KycContext } from './kyc.types';
import type { KycNoteDto, KycQueueQueryDto } from './kyc.validators';

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
 * (kyc.view / kyc.review / compliance.view) — see kyc.admin.routes.ts.
 */
export const adminKycController = {
  async queue(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    // Validated + coerced by kycQueueQuerySchema.
    const q = req.query as unknown as KycQueueQueryDto;
    const result = await kycService.reviewQueue(
      {
        cursor: q.cursor,
        limit: q.limit,
        status: q.status,
        email: q.email,
        riskLevel: q.riskLevel,
        accountStatus: q.accountStatus,
        submittedFrom: q.submittedFrom,
        submittedTo: q.submittedTo,
      },
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async detail(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await kycService.getDetail(req.params.userId, ctx(req));
    sendSuccess(res, result);
  },

  async decision(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const profile = await kycService.decide(req.params.userId, req.body, ctx(req));
    sendSuccess(res, profile);
  },

  async note(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { note } = req.body as KycNoteDto;
    const result = await kycService.addComplianceNote(req.params.userId, note, ctx(req));
    sendSuccess(res, result);
  },

  async compliance(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await kycService.complianceSummary(ctx(req));
    sendSuccess(res, result);
  },

  async documentReadUrl(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await kycService.getDocumentReadUrl(req.params.documentId, ctx(req));
    sendSuccess(res, result);
  },
};
