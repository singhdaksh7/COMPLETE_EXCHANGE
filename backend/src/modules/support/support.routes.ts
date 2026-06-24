import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { supportController } from './support.controller';
import {
  addNoteSchema,
  createTicketSchema,
  listQuerySchema,
  ticketIdParamSchema,
  updateTicketSchema,
} from './support.validators';

/**
 * Internal support / operations tickets (Stage 8C), mounted at
 * /admin/v1/support.
 *
 * RBAC:
 *   - list / detail            → support.view
 *   - create / update / notes  → support.manage
 * support.view is held by the VIEW_ONLY roles (SUPPORT / READ_ONLY /
 * SUPPORT_ADMIN); support.manage is granted to SUPPORT_ADMIN (and SUPER_ADMIN
 * via the wildcard). Every write is audit-logged.
 */
export const adminSupportRouter = Router();

adminSupportRouter.get(
  '/tickets',
  adminAuthenticate,
  adminAuthorize('support.view'),
  validate({ query: listQuerySchema }),
  asyncHandler(supportController.list),
);

adminSupportRouter.post(
  '/tickets',
  adminAuthenticate,
  adminAuthorize('support.manage'),
  validate({ body: createTicketSchema }),
  asyncHandler(supportController.create),
);

adminSupportRouter.get(
  '/tickets/:id',
  adminAuthenticate,
  adminAuthorize('support.view'),
  validate({ params: ticketIdParamSchema }),
  asyncHandler(supportController.detail),
);

adminSupportRouter.patch(
  '/tickets/:id',
  adminAuthenticate,
  adminAuthorize('support.manage'),
  validate({ params: ticketIdParamSchema, body: updateTicketSchema }),
  asyncHandler(supportController.update),
);

adminSupportRouter.post(
  '/tickets/:id/notes',
  adminAuthenticate,
  adminAuthorize('support.manage'),
  validate({ params: ticketIdParamSchema, body: addNoteSchema }),
  asyncHandler(supportController.addNote),
);
