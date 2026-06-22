import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { fiuService } from './fiu.service';
import type { ComplianceContext } from './compliance.types';
import type { FiuGenerateDto, FiuQueryDto, FiuStatusDto } from './fiu.validators';

function ctx(req: Request): ComplianceContext {
  return { actorId: req.admin?.id, ip: req.ip, userAgent: req.headers['user-agent'], requestId: String(req.id) };
}

/** Admin FIU draft-reporting controller. Draft-only — never submits to FIU. */
export const fiuAdminController = {
  async create(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await fiuService.generate(req.body as FiuGenerateDto, ctx(req)), 201);
  },

  async list(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await fiuService.list(req.query as unknown as FiuQueryDto));
  },

  async get(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await fiuService.get(req.params.reportId));
  },

  async validate(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await fiuService.validate(req.params.reportId, ctx(req)));
  },

  async export(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const payload = await fiuService.export(req.params.reportId, ctx(req));
    res.setHeader('Content-Disposition', `attachment; filename="fiu-draft-${req.params.reportId}.json"`);
    sendSuccess(res, payload);
  },

  async setStatus(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { status } = req.body as FiuStatusDto;
    sendSuccess(res, await fiuService.setStatus(req.params.reportId, status, ctx(req)));
  },

  async issues(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, { items: await fiuService.listIssues(req.params.reportId) });
  },

  async exports(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    sendSuccess(res, await fiuService.listExportEvents({ limit, cursor: req.query.cursor as string | undefined }));
  },
};
