import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { complianceService } from './compliance.service';
import type { ComplianceContext } from './compliance.types';
import type { ComplianceQueryDto } from './compliance.validators';

function ctx(req: Request): ComplianceContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/** Admin compliance review controller. Behind adminAuthenticate + RBAC. */
export const complianceAdminController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { status, riskLevel, email, cursor, limit } =
      req.query as unknown as ComplianceQueryDto;
    const result = await complianceService.listUsers(
      { status, riskLevel, email, cursor, limit },
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async detail(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await complianceService.getDetail(req.params.userId, ctx(req));
    sendSuccess(res, result);
  },

  async evidence(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await complianceService.getEvidence(req.params.userId, ctx(req));
    sendSuccess(res, result);
  },

  async review(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const canOverrideScreening =
      (req.admin.roles?.includes('SUPER_ADMIN') ?? false) ||
      (req.admin.permissions?.includes('compliance.screening.override') ?? false);
    const result = await complianceService.review(
      req.params.userId,
      req.body,
      ctx(req),
      { canOverrideScreening },
    );
    sendSuccess(res, result);
  },

  // ---- screening (Stage 5.1) ----
  async runScreening(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await complianceService.runScreening(req.params.userId, ctx(req));
    sendSuccess(res, result);
  },

  async getScreening(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await complianceService.getScreening(req.params.userId, ctx(req));
    sendSuccess(res, result);
  },

  async decideScreening(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await complianceService.decideScreening(
      req.params.userId,
      req.params.checkId,
      req.body,
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async risk(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await complianceService.setRisk(req.params.userId, req.body, ctx(req));
    sendSuccess(res, result);
  },

  async export(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const summary = await complianceService.exportSummary(req.params.userId, ctx(req));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="compliance-${req.params.userId}.json"`,
    );
    sendSuccess(res, summary);
  },
};
