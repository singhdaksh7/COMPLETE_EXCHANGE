import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { adminUsersService, type AdminUserContext } from './admin-users.service';
import type {
  AccountStatusDto,
  AdminUserListQueryDto,
  ArchiveUserDto,
  RestoreUserDto,
  RiskProfileDto,
  WithdrawalBlockDto,
} from './admin-users.validators';

function ctx(req: Request): AdminUserContext {
  const userAgent = req.headers['user-agent'];
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: Array.isArray(userAgent) ? userAgent.join(', ') : userAgent,
    requestId: String(req.id),
  };
}

export const adminUsersController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as AdminUserListQueryDto;
    const result = await adminUsersService.listUsers(q, ctx(req));
    sendSuccess(res, result);
  },

  async detail(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await adminUsersService.getUser(req.params.userId, ctx(req));
    sendSuccess(res, result);
  },

  // --- Soft delete / archive (Stage 9C) ------------------------------------

  async listArchived(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as AdminUserListQueryDto;
    const result = await adminUsersService.listArchivedUsers(q, ctx(req));
    sendSuccess(res, result);
  },

  async archivedDetail(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await adminUsersService.getArchivedUser(req.params.userId, ctx(req));
    sendSuccess(res, result);
  },

  async archive(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const body = req.body as ArchiveUserDto;
    const result = await adminUsersService.archiveUser(
      req.params.userId,
      { reason: body.reason },
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async restore(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const body = req.body as RestoreUserDto;
    const result = await adminUsersService.restoreUser(
      req.params.userId,
      { reason: body.reason },
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async setStatus(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await adminUsersService.setAccountStatus(
      req.params.userId,
      req.body as AccountStatusDto,
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async setWithdrawalBlock(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const body = req.body as WithdrawalBlockDto;
    const result = await adminUsersService.setWithdrawalBlock(
      req.params.userId,
      body.withdrawalsBlocked,
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async updateRisk(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await adminUsersService.updateRiskProfile(
      req.params.userId,
      req.body as RiskProfileDto,
      ctx(req),
    );
    sendSuccess(res, result);
  },
};
