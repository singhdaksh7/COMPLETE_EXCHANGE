import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { caseService } from './case.service';
import { monitoringService } from './monitoring.service';
import type { ComplianceContext } from './compliance.types';
import type {
  AlertStatusDto,
  CaseAssignDto,
  CaseCreateDto,
  CaseListQueryDto,
  CaseNoteDto,
  CaseStatusDto,
  AlertLinkCaseDto,
  MonitoringRunDto,
} from './case.validators';

function ctx(req: Request): ComplianceContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * Admin controller for the Stage 5.2 case/alert/monitoring surface. Behind
 * adminAuthenticate + RBAC (enforced in the routes file).
 */
export const complianceCasesAdminController = {
  async listCases(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await caseService.list(req.query as unknown as CaseListQueryDto, ctx(req));
    sendSuccess(res, result);
  },

  async summary(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await caseService.summary(ctx(req));
    sendSuccess(res, result);
  },

  async getCase(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await caseService.get(req.params.caseId, ctx(req));
    sendSuccess(res, result);
  },

  async createCase(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await caseService.create(req.body as CaseCreateDto, ctx(req));
    sendSuccess(res, result, 201);
  },

  async assignCase(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { adminId } = req.body as CaseAssignDto;
    const result = await caseService.assign(req.params.caseId, adminId ?? null, ctx(req));
    sendSuccess(res, result);
  },

  async setCaseStatus(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { status, note } = req.body as CaseStatusDto;
    const result = await caseService.setStatus(req.params.caseId, status, note, ctx(req));
    sendSuccess(res, result);
  },

  async addCaseNote(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { body } = req.body as CaseNoteDto;
    const result = await caseService.addNote(req.params.caseId, body, ctx(req));
    sendSuccess(res, result);
  },

  async exportStrDraft(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const draft = await caseService.exportStrDraft(req.params.caseId, ctx(req));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="str-draft-${req.params.caseId}.json"`,
    );
    sendSuccess(res, draft);
  },

  async listAlerts(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await caseService.listAlerts(
      { userId: req.query.userId as string | undefined, status: req.query.status as never },
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async linkAlertToCase(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { caseId } = req.body as AlertLinkCaseDto;
    const result = await caseService.linkAlert(req.params.alertId, caseId, ctx(req));
    sendSuccess(res, result);
  },

  async setAlertStatus(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { status, note } = req.body as AlertStatusDto;
    const result = await caseService.setAlertStatus(req.params.alertId, status, note, ctx(req));
    sendSuccess(res, result);
  },

  async runMonitoring(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { userId } = (req.body ?? {}) as MonitoringRunDto;
    const result = await monitoringService.run(ctx(req), userId);
    sendSuccess(res, result);
  },
};
