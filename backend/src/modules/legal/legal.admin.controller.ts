import type { Request, Response } from 'express';
import type { LegalDocumentType } from '@prisma/client';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { legalService } from './legal.service';
import type { ComplianceContext } from '../compliance/compliance.types';
import type { LegalAcceptancesQueryDto, LegalDocumentCreateDto } from './legal.validators';

function ctx(req: Request): ComplianceContext {
  return { actorId: req.admin?.id, ip: req.ip, userAgent: req.headers['user-agent'], requestId: String(req.id) };
}

/** Admin legal controller (document versions + acceptance oversight). */
export const legalAdminController = {
  async listDocuments(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const type = req.query.type as LegalDocumentType | undefined;
    sendSuccess(res, { items: await legalService.listVersions(type) });
  },

  async createDocument(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await legalService.createDocument(req.body as LegalDocumentCreateDto, ctx(req)), 201);
  },

  async listAcceptances(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as LegalAcceptancesQueryDto;
    sendSuccess(res, await legalService.listAcceptances(q));
  },

  async userAcceptances(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const items = await legalService.acceptancesForUser(req.params.userId);
    sendSuccess(res, { items });
  },
};
