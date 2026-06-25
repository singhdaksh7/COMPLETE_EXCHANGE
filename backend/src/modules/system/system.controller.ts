import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { systemService } from './system.service';
import { getSystemReadiness } from './readiness.service';
import { backupService } from './backup.service';
import { monitoringService } from './monitoring.service';
import { guardrailsService } from './guardrails.service';
import { goLiveService } from './go-live.service';

/**
 * Admin System / Ops Center controllers. Each handler sits behind
 * adminAuthenticate + adminAuthorize (see system.routes.ts) and returns only
 * safe operational data — never secrets.
 */
export const systemController = {
  async overview(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await systemService.overview());
  },

  async health(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await systemService.health());
  },

  async queues(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await systemService.queues());
  },

  async scanner(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await systemService.scanner());
  },

  async mail(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await systemService.mail());
  },

  async riskAlerts(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await systemService.riskAlerts());
  },

  // Stage 9A — structured readiness (DB / Redis / config / build).
  async readiness(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await getSystemReadiness());
  },

  // Stage 9B — backup / restore status + checklist (status surface only).
  async backupStatus(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, backupService.status());
  },

  // Stage 9C — monitoring / alerts configured-vs-missing status.
  async monitoring(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, monitoringService.status());
  },

  // Stage 9E — security / abuse guardrails: enforced vs planned.
  async guardrails(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, guardrailsService.status());
  },

  // Stage 10 — production go-live readiness aggregate.
  async goLiveReadiness(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, goLiveService.readiness());
  },
};
