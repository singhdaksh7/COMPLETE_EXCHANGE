import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { systemService } from './system.service';

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
};
