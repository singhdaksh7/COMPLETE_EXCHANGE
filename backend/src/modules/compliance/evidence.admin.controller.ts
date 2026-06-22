import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { evidenceService } from './evidence.service';
import { retentionService } from './retention.service';
import type { ComplianceContext } from './compliance.types';
import type {
  EvidencePackCreateDto,
  EvidencePackQueryDto,
  ExportEventsQueryDto,
  RetentionPolicyDto,
  RetentionReviewQueryDto,
  RetentionReviewStatusDto,
} from './evidence.validators';

function ctx(req: Request): ComplianceContext {
  return { actorId: req.admin?.id, ip: req.ip, userAgent: req.headers['user-agent'], requestId: String(req.id) };
}

/** Admin controller for Stage 5.4 evidence packs + record retention. */
export const evidenceAdminController = {
  // ---- evidence packs ----
  async createPack(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await evidenceService.generate(req.body as EvidencePackCreateDto, ctx(req));
    sendSuccess(res, result, 201);
  },

  async listPacks(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as EvidencePackQueryDto;
    const result = await evidenceService.list(q as never, ctx(req));
    sendSuccess(res, result);
  },

  async getPack(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await evidenceService.get(req.params.packId);
    sendSuccess(res, result);
  },

  async exportPack(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const payload = await evidenceService.export(req.params.packId, ctx(req));
    res.setHeader('Content-Disposition', `attachment; filename="evidence-pack-${req.params.packId}.json"`);
    sendSuccess(res, payload);
  },

  // ---- retention ----
  async listPolicies(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await retentionService.listPolicies(ctx(req));
    sendSuccess(res, { items: result });
  },

  async upsertPolicy(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await retentionService.upsertPolicy(req.body as RetentionPolicyDto, ctx(req));
    sendSuccess(res, result, 201);
  },

  async listReviews(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as RetentionReviewQueryDto;
    const result = await retentionService.listReviews(q);
    sendSuccess(res, result);
  },

  async setReviewStatus(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { status, notes } = req.body as RetentionReviewStatusDto;
    const result = await retentionService.setReviewStatus(req.params.reviewId, status, notes, ctx(req));
    sendSuccess(res, result);
  },

  // ---- export events ----
  async listExportEvents(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as ExportEventsQueryDto;
    const result = await evidenceService.listExportEvents(q);
    sendSuccess(res, result);
  },
};
