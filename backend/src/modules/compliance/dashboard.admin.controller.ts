import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { dashboardService } from './dashboard.service';
import type { ComplianceContext } from './compliance.types';
import type { DashboardQueryDto } from './dashboard.validators';
import type { DashboardFilters } from './dashboard.repository';

function ctx(req: Request): ComplianceContext {
  const userAgent = req.headers['user-agent'];
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: Array.isArray(userAgent) ? userAgent.join(', ') : userAgent,
    requestId: String(req.id),
  };
}

export const dashboardAdminController = {
  async dashboard(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as DashboardQueryDto;
    const filters: DashboardFilters = {
      riskLevel: q.riskLevel,
      caseStatus: q.caseStatus,
      alertType: q.alertType,
      assignedAdminId: q.assignedAdminId,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      previewLimit: q.previewLimit,
    };
    const result = await dashboardService.getDashboard(filters, ctx(req));
    sendSuccess(res, result);
  },
};
