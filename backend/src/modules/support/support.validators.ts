import { z } from 'zod';

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const;
export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const TICKET_CATEGORIES = [
  'GENERAL',
  'KYC',
  'DEPOSIT',
  'WITHDRAWAL',
  'TRADING',
  'COMPLIANCE',
  'SECURITY',
  'OTHER',
] as const;

export const listQuerySchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assignedAdminId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const ticketIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const createTicketSchema = z
  .object({
    userId: z.string().uuid().optional(),
    subject: z.string().trim().min(3).max(200),
    category: z.enum(TICKET_CATEGORIES).default('GENERAL'),
    priority: z.enum(TICKET_PRIORITIES).default('MEDIUM'),
    body: z.string().trim().max(5000).optional(),
  })
  .strict();

export const updateTicketSchema = z
  .object({
    subject: z.string().trim().min(3).max(200).optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    status: z.enum(TICKET_STATUSES).optional(),
    assignedAdminId: z.string().uuid().nullable().optional(),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.subject !== undefined ||
      v.category !== undefined ||
      v.priority !== undefined ||
      v.status !== undefined ||
      v.assignedAdminId !== undefined,
    { message: 'At least one field to update is required' },
  );

export const addNoteSchema = z
  .object({ body: z.string().trim().min(1).max(5000) })
  .strict();

export type ListQueryDto = z.infer<typeof listQuerySchema>;
export type CreateTicketDto = z.infer<typeof createTicketSchema>;
export type UpdateTicketDto = z.infer<typeof updateTicketSchema>;
export type AddNoteDto = z.infer<typeof addNoteSchema>;
