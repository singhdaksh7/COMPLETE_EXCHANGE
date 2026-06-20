import type { NotificationEmailStatus } from '@prisma/client';
import { logger } from '../../lib/logger';
import { mailer } from '../../lib/mailer';
import { NotFoundError } from '../../lib/errors';
import { notificationRepository } from './notification.repository';
import { buildNotification } from './notification.templates';
import {
  toAdminNotificationDto,
  toNotificationDto,
  type AdminNotificationDto,
  type NotificationListResult,
  type NotifyInput,
} from './notification.types';

const MAX_LIMIT = 50;

export const notificationService = {
  /**
   * Create one notification (and, for types with an email template, dispatch a
   * best-effort email). This is FAIL-SAFE: it never throws, so a notification
   * problem can never roll back or break the business action that triggered it.
   * Callers invoke it AFTER the underlying state change has succeeded.
   */
  async notify(input: NotifyInput): Promise<void> {
    try {
      const built = buildNotification(input.type, input.metadata as Record<string, unknown>);

      const wantsEmail = Boolean(built.email);
      let emailStatus: NotificationEmailStatus = wantsEmail ? 'FAILED' : 'SKIPPED';

      // Resolve recipient for the optional email channel.
      let to = input.email ?? undefined;
      if (wantsEmail && to === undefined) {
        const user = await notificationRepository.findUserEmail(input.userId);
        to = user?.email ?? undefined;
      }

      // Send the email first so the stored row reflects the real delivery state.
      if (wantsEmail && built.email && to) {
        try {
          const delivery = await mailer.sendNotification(to, built.email);
          emailStatus = delivery === 'ses' ? 'SENT' : 'LOGGED';
        } catch (err) {
          emailStatus = 'FAILED';
          logger.warn({ err, type: input.type, userId: input.userId }, 'notification email failed');
        }
      } else if (wantsEmail && !to) {
        emailStatus = 'SKIPPED';
      }

      await notificationRepository.create({
        userId: input.userId,
        type: input.type,
        title: built.title,
        message: built.message,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        emailStatus,
      });
    } catch (err) {
      // Swallow — notifications must never break the originating flow.
      logger.error({ err, type: input.type, userId: input.userId }, 'notify failed');
    }
  },

  // ----- user-facing queries -----
  async list(input: { userId: string; cursor?: string; limit?: number }): Promise<NotificationListResult> {
    const limit = Math.min(input.limit ?? 20, MAX_LIMIT);
    const [rows, unread] = await Promise.all([
      notificationRepository.listForUser({ userId: input.userId, cursor: input.cursor, limit }),
      notificationRepository.unreadCount(input.userId),
    ]);
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: slice.map(toNotificationDto),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
      unread,
    };
  },

  unreadCount(userId: string): Promise<number> {
    return notificationRepository.unreadCount(userId);
  },

  async markRead(userId: string, id: string): Promise<{ read: true }> {
    const count = await notificationRepository.markRead(userId, id);
    if (count === 0) {
      // Either it doesn't exist for this user, or it was already read.
      const existing = await notificationRepository.existsForUser(userId, id);
      if (!existing) throw new NotFoundError('Notification not found');
    }
    return { read: true };
  },

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const updated = await notificationRepository.markAllRead(userId);
    return { updated };
  },

  // ----- admin delivery log -----
  async adminRecent(input: {
    type?: AdminRecentType;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: AdminNotificationDto[]; nextCursor: string | null }> {
    const limit = Math.min(input.limit ?? 50, 100);
    const rows = await notificationRepository.adminRecent({ type: input.type, cursor: input.cursor, limit });
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: slice.map(toAdminNotificationDto),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },
};

type AdminRecentType = Parameters<typeof notificationRepository.adminRecent>[0]['type'];

export type NotificationService = typeof notificationService;
