import {
  Prisma,
  type SupportTicket,
  type SupportTicketNote,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

export type SupportTicketWithUser = SupportTicket & {
  user: { id: string; email: string } | null;
};

export type SupportTicketDetail = SupportTicketWithUser & {
  notes: SupportTicketNote[];
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
};

export type SupportRepository = typeof supportRepository;
