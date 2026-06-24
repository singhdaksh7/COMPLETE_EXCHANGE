import { z } from 'zod';

export const listQuerySchema = z
  .object({
    unreadOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    type: z.string().trim().max(64).optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const notificationIdParamSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export type ListQueryDto = z.infer<typeof listQuerySchema>;
