import {
  Prisma,
  type SupportTicket,
  type SupportTicketNote,
  type SupportTicketMessage,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

export type SupportTicketWithUser = SupportTicket & {
  user: { id: string; email: string } | null;
};

export type SupportTicketDetail = SupportTicketWithUser & {
  notes: SupportTicketNote[];
};

export type SupportTicketWithMessages = SupportTicketWithUser & {
  messages: SupportTicketMessage[];
};

export const supportRepository = {
  list(input: {
    status?: string;
    priority?: string;
    assignedAdminId?: string;
    userId?: string;
    cursor?: string;
    limit: number;
  }): Promise<SupportTicketWithUser[]> {
    return prisma.supportTicket.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assignedAdminId ? { assignedAdminId: input.assignedAdminId } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      include: { user: { select: { id: true, email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    }) as Promise<SupportTicketWithUser[]>;
  },

  findById(id: string): Promise<SupportTicketDetail | null> {
    return prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true } },
        notes: { orderBy: { createdAt: 'asc' } },
      },
    }) as Promise<SupportTicketDetail | null>;
  },

  create(data: Prisma.SupportTicketUncheckedCreateInput): Promise<SupportTicket> {
    return prisma.supportTicket.create({ data });
  },

  update(id: string, data: Prisma.SupportTicketUncheckedUpdateInput): Promise<SupportTicket> {
    return prisma.supportTicket.update({ where: { id }, data });
  },

  addNote(data: Prisma.SupportTicketNoteUncheckedCreateInput): Promise<SupportTicketNote> {
    return prisma.supportTicketNote.create({ data });
  },

  /** Confirm the user exists (for create with a userId link). */
  userExists(userId: string): Promise<{ id: string } | null> {
    return prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
  },

  // ---- Stage 9A: user-facing conversation ----

  ticketNumberExists(ticketNumber: string): Promise<{ id: string } | null> {
    return prisma.supportTicket.findUnique({ where: { ticketNumber }, select: { id: true } });
  },

  createUserTicket(data: Prisma.SupportTicketUncheckedCreateInput): Promise<SupportTicket> {
    return prisma.supportTicket.create({ data });
  },

  addMessage(
    data: Prisma.SupportTicketMessageUncheckedCreateInput,
  ): Promise<SupportTicketMessage> {
    return prisma.supportTicketMessage.create({ data });
  },

  /** List a user's own tickets (newest first), cursor-paginated. */
  listForUser(input: {
    userId: string;
    status?: string;
    cursor?: string;
    limit: number;
  }): Promise<SupportTicket[]> {
    return prisma.supportTicket.findMany({
      where: {
        userId: input.userId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
  },

  /** A single ticket restricted to its owner (null if not theirs / missing). */
  findUserTicket(id: string, userId: string): Promise<SupportTicket | null> {
    return prisma.supportTicket.findFirst({ where: { id, userId } });
  },

  findBasicById(id: string): Promise<SupportTicket | null> {
    return prisma.supportTicket.findUnique({ where: { id } });
  },

  /** Messages for a ticket; internal notes optionally excluded (user view). */
  listMessages(ticketId: string, includeInternal: boolean): Promise<SupportTicketMessage[]> {
    return prisma.supportTicketMessage.findMany({
      where: { ticketId, ...(includeInternal ? {} : { isInternalNote: false }) },
      orderBy: { createdAt: 'asc' },
    });
  },
};

export type SupportRepository = typeof supportRepository;
