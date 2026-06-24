import { z } from 'zod';
import { PROFILE_SECTIONS } from './admin-user-profile.types';

export const userIdParamSchema = z.object({ userId: z.string().uuid() }).strict();

export const sectionParamSchema = z
  .object({
    userId: z.string().uuid(),
    section: z.enum(PROFILE_SECTIONS),
  })
  .strict();

export const sessionRevokeParamSchema = z
  .object({
    userId: z.string().uuid(),
    sessionId: z.string().uuid(),
  })
  .strict();

export const sectionQuerySchema = z
  .object({
    cursor: z.string().trim().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type SectionQueryDto = z.infer<typeof sectionQuerySchema>;
