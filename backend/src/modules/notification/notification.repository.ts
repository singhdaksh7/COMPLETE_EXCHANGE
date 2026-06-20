import type {
  Notification,
  NotificationEmailStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const notificationRepository = {
  create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
    emailStatus?: NotificationEmailStatus;
  }): Promise<Notification> {
    return prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
        ...(data.emailStatus ? { emailStatus: data.emailStatus } : {}),
      },
    });
  },

  setEmailStatus(id: string, emailStatus: NotificationEmailStatus): Promise<Notification> {
    return prisma.notification.update({ where: { id }, data: { emailStatus } });
  },

  findUserEmail(userId: string): Promise<{ email: string } | null> {
    return prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  },

  /** A user's notifications, newest first, with one extra row for pagination. */
  listForUser(input: { userId: string; cursor?: string; limit: number }): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: { userId: input.userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
  },

  unreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, readAt: null } });
  },

  /** Mark one notification read — scoped to the owner (returns affected count). */
  async markRead(userId: string, id: string): Promise<number> {
    const res = await prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  },

  /** Ensure a notification with this id belongs to the user. */
  existsForUser(userId: string, id: string): Promise<Notification | null> {
    return prisma.notification.findFirst({ where: { id, userId } });
  },

  async markAllRead(userId: string): Promise<number> {
    const res = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  },

  /** Admin delivery log across all users (most recent first). */
  adminRecent(input: { type?: NotificationType; limit: number; cursor?: string }) {
    return prisma.notification.findMany({
      where: { ...(input.type ? { type: input.type } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { user: { select: { email: true } } },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
  },
};

export type NotificationRepository = typeof notificationRepository;
