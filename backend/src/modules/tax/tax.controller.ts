import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { taxService, TAX_LABEL, financialYearOf } from './tax.service';
import type { TaxProfileUserDto } from './tax.validators';

/** User-facing tax controller. Scoped to the authenticated user (req.user.id). */
export const taxController = {
  async getProfile(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const profile = await taxService.getProfile(req.user.id);
    sendSuccess(
      res,
      profile ?? { userId: req.user.id, panAvailable: false, higherTdsApplicable: true, taxJurisdiction: 'IN', residentStatus: 'RESIDENT', panStatus: 'MISSING' },
    );
  },

  async setProfile(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const body = req.body as TaxProfileUserDto;
    // User self-service: no admin actor recorded.
    const profile = await taxService.upsertProfile(req.user.id, body, { ip: req.ip, userAgent: req.headers['user-agent'] });
    sendSuccess(res, profile);
  },

  async summary(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const fy = (req.query.financialYear as string | undefined) ?? financialYearOf();
    const result = await taxService.summary(req.user.id, fy);
    sendSuccess(res, result);
  },

  async statements(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await taxService.listStatements({ userId: req.user.id, limit: 50 });
    sendSuccess(res, { ...result, label: TAX_LABEL });
  },
};
