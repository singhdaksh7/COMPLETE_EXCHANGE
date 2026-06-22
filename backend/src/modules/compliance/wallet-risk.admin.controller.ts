import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { walletRiskService } from './wallet-risk.service';
import { travelRuleService } from './travel-rule.service';
import type { ComplianceContext } from './compliance.types';
import type {
  TravelRuleActionDto,
  TravelRuleQueryDto,
  WalletRiskCheckQueryDto,
  WalletRiskProfileQueryDto,
  WalletRiskReviewDto,
  WalletRiskRunDto,
} from './wallet-risk.validators';

function ctx(req: Request): ComplianceContext {
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/** Admin controller for the Stage 5.3 wallet-risk + Travel Rule surface. */
export const walletRiskAdminController = {
  // ---- wallet risk ----
  async run(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const body = req.body as WalletRiskRunDto;
    const result = await walletRiskService.runCheck(body, ctx(req));
    sendSuccess(res, result, 201);
  },

  async listChecks(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as WalletRiskCheckQueryDto;
    const result = await walletRiskService.listChecks(q);
    sendSuccess(res, result);
  },

  async listProfiles(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as WalletRiskProfileQueryDto;
    const result = await walletRiskService.listProfiles(q);
    sendSuccess(res, result);
  },

  async getProfile(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await walletRiskService.getProfile(req.params.profileId);
    sendSuccess(res, result);
  },

  async reviewCheck(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const body = req.body as WalletRiskReviewDto;
    const result = await walletRiskService.review(req.params.checkId, body, ctx(req));
    sendSuccess(res, result);
  },

  async summary(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await walletRiskService.summary();
    sendSuccess(res, result);
  },

  // ---- travel rule ----
  async listTransfers(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as TravelRuleQueryDto;
    const result = await travelRuleService.list(q);
    sendSuccess(res, result);
  },

  async getTransfer(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await travelRuleService.get(req.params.transferId);
    sendSuccess(res, result);
  },

  async transferAction(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { action, note, exemptedReason } = req.body as TravelRuleActionDto;
    const result = await travelRuleService.applyAction(
      req.params.transferId,
      action,
      { note, exemptedReason },
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async exportTransfer(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const packet = await travelRuleService.exportMockPacket(req.params.transferId, ctx(req));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="travel-rule-mock-${req.params.transferId}.json"`,
    );
    sendSuccess(res, packet);
  },
};
