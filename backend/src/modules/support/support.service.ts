import { Prisma, type SupportTicketNote } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import {
  supportRepository,
  type SupportTicketDetail,
  type SupportTicketWithUser,
} from './support.repository';
import type { CreateTicketDto, UpdateTicketDto } from './support.validators';

export interface SupportContext {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface TicketListItemDto {
  id: string;
  userId: string | null;
  userEmail: string | null;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assignedAdminId: string | null;
  createdByAdminId: string | null;
  closedByAdminId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketNoteDto {
  id: string;
  authorAdminId: string | null;
  body: string;
  createdAt: string;
}

export interface TicketDetailDto extends TicketListItemDto {
  notes: TicketNoteDto[];
}

function toListItem(t: SupportTicketWithUser): TicketListItemDto {
  return {
    id: t.id,
    userId: t.userId,
    userEmail: t.user?.email ?? null,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    assignedAdminId: t.assignedAdminId,
    createdByAdminId: t.createdByAdminId,
    closedByAdminId: t.closedByAdminId,
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function toNote(n: SupportTicketNote): TicketNoteDto {
  return {
    id: n.id,
    authorAdminId: n.authorAdminId,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
  };
}

function toDetail(t: SupportTicketDetail): TicketDetailDto {
  return { ...toListItem(t), notes: t.notes.map(toNote) };
}

const CLOSED_STATES = new Set(['RESOLVED', 'CLOSED']);

export const supportService = {
  async list(input: {
    status?: string;
    priority?: string;
    assignedAdminId?: string;
    userId?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: TicketListItemDto[]; nextCursor: string | null }> {
    const rows = await supportRepository.list(input);
    const hasMore = rows.length > input.limit;
    const slice = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items: slice.map(toListItem),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  async get(id: string): Promise<TicketDetailDto> {
    const t = await supportRepository.findById(id);
    if (!t) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    return toDetail(t);
  },

  async create(input: CreateTicketDto, ctx: SupportContext): Promise<TicketDetailDto> {
    if (input.userId) {
      const exists = await supportRepository.userExists(input.userId);
      if (!exists) throw new BadRequestError('Linked user not found', { code: 'USER_NOT_FOUND' });
    }

    const ticket = await supportRepository.create({
      userId: input.userId ?? null,
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      status: 'OPEN',
      createdByAdminId: ctx.actorId ?? null,
    });

    // Optional opening note.
    if (input.body && input.body.trim().length > 0) {
      await supportRepository.addNote({
        ticketId: ticket.id,
        authorAdminId: ctx.actorId ?? null,
        body: input.body.trim(),
      });
    }

    await this.audit(ctx, 'admin.support.ticket_create', ticket.id, {
      afterState: { subject: ticket.subject, priority: ticket.priority, userId: ticket.userId },
    });
    return this.get(ticket.id);
  },

  async update(id: string, input: UpdateTicketDto, ctx: SupportContext): Promise<TicketDetailDto> {
    const existing = await supportRepository.findById(id);
    if (!existing) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');

    const data: Prisma.SupportTicketUncheckedUpdateInput = {};
    if (input.subject !== undefined) data.subject = input.subject;
    if (input.category !== undefined) data.category = input.category;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.assignedAdminId !== undefined) data.assignedAdminId = input.assignedAdminId;

    let action = 'admin.support.ticket_update';
    if (input.status !== undefined && input.status !== existing.status) {
      data.status = input.status;
      if (CLOSED_STATES.has(input.status) && !CLOSED_STATES.has(existing.status)) {
        data.closedAt = new Date();
        data.closedByAdminId = ctx.actorId ?? null;
        action = 'admin.support.ticket_close';
      } else if (!CLOSED_STATES.has(input.status) && CLOSED_STATES.has(existing.status)) {
        // Re-opening clears the closure stamp.
        data.closedAt = null;
        data.closedByAdminId = null;
      }
    }
    if (input.assignedAdminId !== undefined && input.assignedAdminId !== existing.assignedAdminId) {
      action = 'admin.support.ticket_assign';
    }

    const before = {
      status: existing.status,
      priority: existing.priority,
      assignedAdminId: existing.assignedAdminId,
    };
    const updated = await supportRepository.update(id, data);
    await this.audit(ctx, action, id, {
      reason: input.reason,
      beforeState: before,
      afterState: {
        status: updated.status,
        priority: updated.priority,
        assignedAdminId: updated.assignedAdminId,
      },
    });
    return this.get(id);
  },

  async addNote(id: string, body: string, ctx: SupportContext): Promise<TicketDetailDto> {
    const exists = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
    const note = await supportRepository.addNote({
      ticketId: id,
      authorAdminId: ctx.actorId ?? null,
      body: body.trim(),
    });
    await this.audit(ctx, 'admin.support.ticket_note', id, { afterState: { noteId: note.id } });
    return this.get(id);
  },

  async audit(
    ctx: SupportContext,
    action: string,
    ticketId: string,
    input: { reason?: string; beforeState?: Prisma.InputJsonValue; afterState?: Prisma.InputJsonValue },
  ): Promise<void> {
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action,
      entityType: 'support_ticket',
      entityId: ticketId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: input.afterState,
    });
    if (ctx.actorId) {
      await prisma.adminLog.create({
        data: {
          adminId: ctx.actorId,
          action,
          targetType: 'support_ticket',
          targetId: ticketId,
          reason: input.reason,
          beforeState: input.beforeState,
          afterState: input.afterState,
          ip: ctx.ip,
          requestId: ctx.requestId,
        },
      });
    }
  },
};

export type SupportService = typeof supportService;
