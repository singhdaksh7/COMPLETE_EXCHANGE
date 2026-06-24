import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { commandCenterService } from './command-center.service';

export const commandCenterController = {
  async commandCenter(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await commandCenterService.getCommandCenter();
    sendSuccess(res, result);
  },
};
