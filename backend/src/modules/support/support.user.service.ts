import { randomBytes } from 'node:crypto';
import type { Prisma, SupportTicket, SupportTicketMessage } from '@prisma/client';
import { AppError, BadRequestError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import { supportRepository } from './support.repository';
import type { UserCreateTicketDto } from './support.validators';

/**
 * Stage 9A — user-facing support conversation service.
 *
 * Handles the USER<->ADMIN ticket thread on top of the existing SupportTicket
 * model. Users only ever touch their OWN tickets; admin actions are RBAC-gated
 * at the route and audit-logged here. Internal-note messages are never returned
 * on user-facing endpoints. Never moves money.
 */

export interface SupportCtx {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface SupportMessageDto {
  id: string;
  senderType: string;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
}

export interface SupportTicketSummaryDto {
  id: string;
  ticketNumber: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  referenceType: string | null;
  referenceId: string | null;
  assignedAdminId: string | null;
  lastMessageAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketThreadDto extends SupportTicketSummaryDto {
  userId: string | null;
  userEmail?: string | null;
  messages: SupportMessageDto[];
}

const CLOSED = new Set(['CLOSED']);

function toSummary(t: SupportTicket): SupportTicketSummaryDto {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    category: t.category,
    status: t.status,
    priority: t.priority,
    referenceType: t.referenceType,
    referenceId: t.referenceId,
    assignedAdminId: t.assignedAdminId,
    lastMessageAt: t.lastMessageAt ? t.lastMessageAt.toISOString() : null,
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function toMessage(m: SupportTicketMessage): SupportMessageDto {
  return {
    id: m.id,
    senderType: m.senderType,
    body: m.body,
    isInternalNote: m.isInternalNote,
    createdAt: m.createdAt.toISOString(),
  };
}

async function generateTicketNumber(): Promise<string> {
  // TKT-XXXXXXXX (8 upper base36). Retry on the (astronomically unlikely) clash.
  for (let i = 0; i < 6; i += 1) {
    const num = `TKT-${randomBytes(6).toString('hex').slice(0, 8).toUpperCase()}`;
    const exists = await supportRepository.ticketNumberExists(num);
    if (!exists) return num;
  }
  throw new BadRequestError('Could not allocate a ticket number, please retry', {
    code: 'TICKET_NUMBER_ALLOCATION_FAILED',
  });
}

async function audit(
  ctx: SupportCtx,
  actorType: 'USER' | 'ADMIN',
  action: string,
  ticketId: string,
  metadata?: Prisma.InputJsonValue,
  adminLog?: { reason?: string; beforeState?: Prisma.InputJsonValue; afterState?: Prisma.InputJsonValue },
): Promise<void> {
  await recordAudit({
    actorType,
    actorId: ctx.actorId,
    action,
    entityType: 'support_ticket',
    entityId: ticketId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    metadata,
  });
  if (actorType === 'ADMIN' && ctx.actorId) {
    await prisma.adminLog.create({
      data: {
        adminId: ctx.actorId,
        action,
        targetType: 'support_ticket',
        targetId: ticketId,
        reason: adminLog?.reason,
        beforeState: adminLog?.beforeState,
        afterState: adminLog?.afterState,
        ip: ctx.ip,
        requestId: ctx.requestId,
      },
    });
  }
}

export const supportUserService = {
  // ---------------- user ----------------
  async createTicket(
    userId: string,
    input: UserCreateTicketDto,
    ctx: SupportCtx,
  ): Promise<SupportTicketThreadDto> {
    const ticketNumber = await generateTicketNumber();
    const now = new Date();
    const ticket = await supportRepository.createUserTicket({
      ticketNumber,
      userId,
      subject: input.subject,
      category: input.category,
      priority: 'MEDIUM',
      status: 'WAITING_FOR_ADMIN',
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      lastMessageAt: now,
    });
    await supportRepository.addMessage({
      ticketId: ticket.id,
      senderType: 'USER',
      userId,
      body: input.message,
      isInternalNote: false,
    });
    await audit({ ...ctx, actorId: userId }, 'USER', 'user.support.ticket_create', ticket.id, {
      ticketNumber,
      category: input.category,
    });
    return this.getMyTicket(userId, ticket.id);
  },

  async listMyTickets(
    userId: string,
    query: { status?: string; cursor?: string; limit: number },
  ): Promise<{ items: SupportTicketSummaryDto[]; nextCursor: string | null }> {
    const rows = await supportRepository.listForUser({ userId, ...query });
    const hasMore = rows.length > query.limit;
    const slice = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: slice.map(toSummary),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  async getMyTicket(userId: string, ticketId: string): Promise<SupportTicketThreadDto> {
    const ticket = await supportRepository.findUserTicket(ticketId, userId);
    if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    // includeInternal=false: users NEVER see internal admin notes.
    const messages = await supportRepository.listMessages(ticketId, false);
    return { ...toSummary(ticket), userId: ticket.userId, messages: messages.map(toMessage) };
  },

  async addUserMessage(
    userId: string,
    ticketId: string,
    body: string,
    ctx: SupportCtx,
  ): Promise<SupportTicketThreadDto> {
    const ticket = await supportRepository.findUserTicket(ticketId, userId);
    if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    if (CLOSED.has(ticket.status)) {
      throw new AppError(
        'This ticket is closed. Please open a new ticket.',
        400,
        'TICKET_CLOSED',
      );
    }
    const now = new Date();
    await supportRepository.addMessage({
      ticketId,
      senderType: 'USER',
      userId,
      body,
      isInternalNote: false,
    });
    await supportRepository.update(ticketId, { status: 'WAITING_FOR_ADMIN', lastMessageAt: now });
    await audit({ ...ctx, actorId: userId }, 'USER', 'user.support.ticket_reply', ticketId);
    return this.getMyTicket(userId, ticketId);
  },

  async closeMyTicket(
    userId: string,
    ticketId: string,
    ctx: SupportCtx,
  ): Promise<SupportTicketThreadDto> {
    const ticket = await supportRepository.findUserTicket(ticketId, userId);
    if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    const now = new Date();
    await supportRepository.update(ticketId, { status: 'CLOSED', closedAt: now });
    await supportRepository.addMessage({
      ticketId,
      senderType: 'SYSTEM',
      body: 'Ticket closed by the user.',
      isInternalNote: false,
    });
    await audit({ ...ctx, actorId: userId }, 'USER', 'user.support.ticket_close', ticketId);
    return this.getMyTicket(userId, ticketId);
  },

  // ---------------- admin ----------------
  async adminGetThread(ticketId: string): Promise<SupportTicketThreadDto> {
    const ticket = await supportRepository.findBasicById(ticketId);
    if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    const messages = await supportRepository.listMessages(ticketId, true); // admin sees internal
    return { ...toSummary(ticket), userId: ticket.userId, messages: messages.map(toMessage) };
  },

  async adminReply(
    ticketId: string,
    input: { body: string; isInternalNote: boolean },
    ctx: SupportCtx,
  ): Promise<SupportTicketThreadDto> {
    const ticket = await supportRepository.findBasicById(ticketId);
    if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    const now = new Date();
    await supportRepository.addMessage({
      ticketId,
      senderType: 'ADMIN',
      adminId: ctx.actorId ?? null,
      body: input.body,
      isInternalNote: input.isInternalNote,
    });
    // A public reply hands the ticket back to the user; an internal note does not
    // change the user-visible state.
    if (!input.isInternalNote) {
      await supportRepository.update(ticketId, { status: 'WAITING_FOR_USER', lastMessageAt: now });
    }
    await audit(
      ctx,
      'ADMIN',
      input.isInternalNote ? 'admin.support.ticket_internal_note' : 'admin.support.ticket_reply',
      ticketId,
      { isInternalNote: input.isInternalNote },
    );
    return this.adminGetThread(ticketId);
  },

  async adminAssign(
    ticketId: string,
    assignedAdminId: string | null,
    ctx: SupportCtx,
  ): Promise<SupportTicketThreadDto> {
    const ticket = await supportRepository.findBasicById(ticketId);
    if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    await supportRepository.update(ticketId, { assignedAdminId });
    await audit(ctx, 'ADMIN', 'admin.support.ticket_assign', ticketId, undefined, {
      beforeState: { assignedAdminId: ticket.assignedAdminId },
      afterState: { assignedAdminId },
    });
    return this.adminGetThread(ticketId);
  },

  async adminResolve(
    ticketId: string,
    reason: string | undefined,
    ctx: SupportCtx,
  ): Promise<SupportTicketThreadDto> {
    const ticket = await supportRepository.findBasicById(ticketId);
    if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    const now = new Date();
    await supportRepository.update(ticketId, { status: 'RESOLVED', resolvedAt: now });
    await supportRepository.addMessage({
      ticketId,
      senderType: 'SYSTEM',
      body: 'Ticket marked resolved by support.',
      isInternalNote: false,
    });
    await audit(ctx, 'ADMIN', 'admin.support.ticket_resolve', ticketId, undefined, { reason });
    return this.adminGetThread(ticketId);
  },

  async adminClose(ticketId: string, ctx: SupportCtx): Promise<SupportTicketThreadDto> {
    const ticket = await supportRepository.findBasicById(ticketId);
    if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    await supportRepository.update(ticketId, {
      status: 'CLOSED',
      closedAt: new Date(),
      closedByAdminId: ctx.actorId ?? null,
    });
    await audit(ctx, 'ADMIN', 'admin.support.ticket_close', ticketId);
    return this.adminGetThread(ticketId);
  },

  async adminReopen(ticketId: string, ctx: SupportCtx): Promise<SupportTicketThreadDto> {
    const ticket = await supportRepository.findBasicById(ticketId);
    if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    await supportRepository.update(ticketId, {
      status: 'WAITING_FOR_ADMIN',
      resolvedAt: null,
      closedAt: null,
      closedByAdminId: null,
    });
    await audit(ctx, 'ADMIN', 'admin.support.ticket_reopen', ticketId);
    return this.adminGetThread(ticketId);
  },
};

export type SupportUserService = typeof supportUserService;
