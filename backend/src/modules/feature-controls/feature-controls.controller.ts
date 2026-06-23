import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import {
  featureControlsService,
  type ControlsContext,
} from './feature-controls.service';
import type { UpdateControlsDto } from './feature-controls.validators';

function ctx(req: Request): ControlsContext {
  const userAgent = req.headers['user-agent'];
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: Array.isArray(userAgent) ? userAgent.join(', ') : userAgent,
    requestId: String(req.id),
  };
}

export const featureControlsController = {
  async get(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await featureControlsService.getForAdmin(req.params.userId);
    sendSuccess(res, result);
  },

  async update(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const body = req.body as UpdateControlsDto;
    const result = await featureControlsService.updateForAdmin(
      req.params.userId,
      body,
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async history(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const items = await featureControlsService.changeHistory(req.params.userId);
    sendSuccess(res, { items });
  },
};
