import { z } from 'zod';
import { NotificationType } from '@prisma/client';

export const notificationListQuerySchema = z
  .object({
    cursor: z.string().uuid('Invalid cursor').optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const notificationIdParamSchema = z
  .object({ id: z.string().uuid('Invalid notification id') })
  .strict();

export const adminNotificationQuerySchema = z
  .object({
    cursor: z.string().uuid('Invalid cursor').optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    type: z.nativeEnum(NotificationType).optional(),
  })
  .strict();

export type NotificationListQueryDto = z.infer<typeof notificationListQuerySchema>;
export type AdminNotificationQueryDto = z.infer<typeof adminNotificationQuerySchema>;
