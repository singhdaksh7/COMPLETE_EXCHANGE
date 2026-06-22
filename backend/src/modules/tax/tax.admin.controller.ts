import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { taxService, financialYearOf } from './tax.service';
import type { ComplianceContext } from '../compliance/compliance.types';
import type { TaxQueryDto, TaxRuleUpsertDto, TaxStatementGenerateDto } from './tax.validators';

function ctx(req: Request): ComplianceContext {
  return { actorId: req.admin?.id, ip: req.ip, userAgent: req.headers['user-agent'], requestId: String(req.id) };
}

/** Admin tax controller (TDS rules, records, statements). Calculation-only. */
export const taxAdminController = {
  async listRules(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, { items: await taxService.listRules(ctx(req)) });
  },

  async upsertRule(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await taxService.upsertRule(req.body as TaxRuleUpsertDto, ctx(req)), 201);
  },

  async listTds(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as TaxQueryDto;
    sendSuccess(res, await taxService.listTds(q));
  },

  async listStatements(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as TaxQueryDto;
    sendSuccess(res, await taxService.listStatements({ userId: q.userId, limit: q.limit, cursor: q.cursor }));
  },

  async generateStatement(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const body = req.body as TaxStatementGenerateDto;
    const fy = body.financialYear ?? financialYearOf();
    const statement = await taxService.generateStatement(body.userId, fy, body.events, ctx(req));
    sendSuccess(res, statement, 201);
  },
};
