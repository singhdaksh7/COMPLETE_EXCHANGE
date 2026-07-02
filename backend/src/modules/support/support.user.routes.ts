import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { authRateLimiter } from '../../middleware/rate-limit';
import { validate } from '../../middleware/validate';
import { supportUserController } from './support.user.controller';
import {
  userCreateTicketSchema,
  userMessageSchema,
  userTicketIdParamSchema,
  userTicketListQuerySchema,
} from './support.validators';

/**
 * User-facing support routes (Stage 9A), mounted at /api/v1/support.
 *
 *   route → authenticate → rate-limit → validate → controller → service → repo
 *
 * Every handler scopes to the authenticated user's OWN tickets. Ticket creation
 * and message posting carry the tighter `authRateLimiter` (abuse control).
 * Internal admin notes are never returned here.
 */
export const supportUserRouter = Router();

supportUserRouter.post(
  '/tickets',
  authenticate,
  authRateLimiter,
  validate({ body: userCreateTicketSchema }),
  asyncHandler(supportUserController.create),
);

supportUserRouter.get(
  '/tickets',
  authenticate,
  validate({ query: userTicketListQuerySchema }),
  asyncHandler(supportUserController.list),
);

supportUserRouter.get(
  '/tickets/:ticketId',
  authenticate,
  validate({ params: userTicketIdParamSchema }),
  asyncHandler(supportUserController.detail),
);

supportUserRouter.post(
  '/tickets/:ticketId/messages',
  authenticate,
  authRateLimiter,
  validate({ params: userTicketIdParamSchema, body: userMessageSchema }),
  asyncHandler(supportUserController.addMessage),
);

supportUserRouter.post(
  '/tickets/:ticketId/close',
  authenticate,
  validate({ params: userTicketIdParamSchema }),
  asyncHandler(supportUserController.close),
);
