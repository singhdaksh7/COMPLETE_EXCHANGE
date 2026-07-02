import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { supportUserService, type SupportCtx } from './support.user.service';
import type {
  UserCreateTicketDto,
  UserMessageDto,
  UserTicketListQueryDto,
} from './support.validators';

function ctx(req: Request): SupportCtx {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/** User-facing support controller (own tickets only). */
export const supportUserController = {
  async create(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const thread = await supportUserService.createTicket(
      req.user.id,
      req.body as UserCreateTicketDto,
      ctx(req),
    );
    sendSuccess(res, thread, 201);
  },

  async list(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const q = req.query as unknown as UserTicketListQueryDto;
    const result = await supportUserService.listMyTickets(req.user.id, {
      status: q.status,
      cursor: q.cursor,
      limit: q.limit,
    });
    sendSuccess(res, result);
  },

  async detail(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const thread = await supportUserService.getMyTicket(req.user.id, req.params.ticketId);
    sendSuccess(res, thread);
  },

  async addMessage(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const { body } = req.body as UserMessageDto;
    const thread = await supportUserService.addUserMessage(
      req.user.id,
      req.params.ticketId,
      body,
      ctx(req),
    );
    sendSuccess(res, thread, 201);
  },

  async close(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const thread = await supportUserService.closeMyTicket(
      req.user.id,
      req.params.ticketId,
      ctx(req),
    );
    sendSuccess(res, thread);
  },
};
