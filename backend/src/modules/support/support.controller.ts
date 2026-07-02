import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { supportService, type SupportContext } from './support.service';
import { supportUserService } from './support.user.service';
import type {
  AddNoteDto,
  AdminAssignDto,
  AdminMessageDto,
  AdminResolveDto,
  CreateTicketDto,
  ListQueryDto,
  UpdateTicketDto,
} from './support.validators';

function ctx(req: Request): SupportContext {
  const userAgent = req.headers['user-agent'];
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: Array.isArray(userAgent) ? userAgent.join(', ') : userAgent,
    requestId: String(req.id),
  };
}

export const supportController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as ListQueryDto;
    const result = await supportService.list(q);
    sendSuccess(res, result);
  },

  async detail(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await supportService.get(req.params.id);
    sendSuccess(res, result);
  },

  async create(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await supportService.create(req.body as CreateTicketDto, ctx(req));
    sendSuccess(res, result, 201);
  },

  async update(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await supportService.update(req.params.id, req.body as UpdateTicketDto, ctx(req));
    sendSuccess(res, result);
  },

  async addNote(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const body = req.body as AddNoteDto;
    const result = await supportService.addNote(req.params.id, body.body, ctx(req));
    sendSuccess(res, result, 201);
  },

  // ---- Stage 9A: admin conversation (user-facing thread) ----
  async thread(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await supportUserService.adminGetThread(req.params.id));
  },

  async reply(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { body, isInternalNote } = req.body as AdminMessageDto;
    const result = await supportUserService.adminReply(
      req.params.id,
      { body, isInternalNote },
      ctx(req),
    );
    sendSuccess(res, result, 201);
  },

  async assign(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { assignedAdminId } = req.body as AdminAssignDto;
    // Omitted → assign to self; null → unassign; uuid → assign to that admin.
    const target = assignedAdminId === undefined ? req.admin.id : assignedAdminId;
    sendSuccess(res, await supportUserService.adminAssign(req.params.id, target, ctx(req)));
  },

  async resolve(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const { reason } = req.body as AdminResolveDto;
    sendSuccess(res, await supportUserService.adminResolve(req.params.id, reason, ctx(req)));
  },

  async close(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await supportUserService.adminClose(req.params.id, ctx(req)));
  },

  async reopen(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    sendSuccess(res, await supportUserService.adminReopen(req.params.id, ctx(req)));
  },
};
