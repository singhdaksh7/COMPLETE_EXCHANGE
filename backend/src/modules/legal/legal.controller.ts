import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { legalService } from './legal.service';
import type { LegalAcceptDto } from './legal.validators';

/** User-facing legal controller (documents + own acceptances). */
export const legalController = {
  async currentDocuments(_req: Request, res: Response): Promise<void> {
    const docs = await legalService.currentDocuments();
    sendSuccess(res, { items: docs });
  },

  async accept(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const body = req.body as LegalAcceptDto;
    const acceptance = await legalService.accept(req.user.id, body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: String(req.id),
    });
    sendSuccess(res, acceptance, 201);
  },

  async myAcceptances(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const items = await legalService.acceptancesForUser(req.user.id);
    sendSuccess(res, { items });
  },
};
