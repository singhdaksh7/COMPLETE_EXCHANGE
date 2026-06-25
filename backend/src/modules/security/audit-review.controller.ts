import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { auditReviewService } from './audit-review.service';
import type { AuditReviewQueryDto } from './audit-review.validators';

/**
 * Stage 9D — Admin Audit Review controller. Sits behind adminAuthenticate +
 * (audit.view OR operations.view). Read-only.
 */
export const auditReviewController = {
  async review(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as AuditReviewQueryDto;
    const result = await auditReviewService.review({
      cursor: q.cursor,
      limit: q.limit,
      adminId: q.adminId,
      targetId: q.targetId,
      action: q.action,
      riskLevel: q.riskLevel,
      ip: q.ip,
      fromDate: q.fromDate,
      toDate: q.toDate,
    });
    sendSuccess(res, result);
  },
};
