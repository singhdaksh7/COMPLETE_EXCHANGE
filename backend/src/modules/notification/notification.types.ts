import type { Notification, NotificationType, Prisma } from '@prisma/client';

/** Request-scoped context (kept symmetric with the other modules). */
export interface NotificationContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Input to create one notification (+ optional email side-channel). */
export interface NotifyInput {
  userId: string;
  type: NotificationType;
  metadata?: Prisma.InputJsonValue;
  /** Override the recipient email; defaults to the user's account email. */
  email?: string | null;
}

/** User-facing notification view. */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: unknown;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationListResult {
  items: NotificationDto[];
  nextCursor: string | null;
  unread: number;
}

/** Admin delivery-log row (across users). Carries no secrets. */
export interface AdminNotificationDto {
  id: string;
  userId: string;
  email: string;
  type: NotificationType;
  title: string;
  emailStatus: string | null;
  read: boolean;
  createdAt: Date;
}

export function toNotificationDto(row: Notification): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    metadata: row.metadata,
    read: row.readAt !== null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export function toAdminNotificationDto(
  row: Notification & { user: { email: string } },
): AdminNotificationDto {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    type: row.type,
    title: row.title,
    emailStatus: row.emailStatus,
    read: row.readAt !== null,
    createdAt: row.createdAt,
  };
}
