import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize, adminAuthorizeAny } from '../../middleware/admin-authorize';
import { adminTreasuryController } from './treasury.admin.controller';
import {
  rejectBodySchema,
  transferIdParamSchema,
  transferListQuerySchema,
  transferRequestSchema,
  treasuryWalletQuerySchema,
} from './treasury.validators';

/**
 * Admin treasury / custody routes, mounted at /admin/v1/treasury.
 *
 * Permission model:
 *   - READS  (hot/cold wallets, summary, transfers) → 'withdrawal.view'.
 *   - MOVES  (sweep/refill request, approve, reject) → 'withdrawal.approve'
 *            OR 'treasury.manage' (either grants it).
 * SUPER_ADMIN bypasses all. Separation of duties (a requester cannot approve
 * their own transfer) and optional dual-control are enforced in the service.
 * No endpoint ever returns private-key material — only the signer's KMS ref.
 */
export const adminTreasuryRouter = Router();

const canView = adminAuthorize('withdrawal.view');
const canMove = adminAuthorizeAny('withdrawal.approve', 'treasury.manage');

adminTreasuryRouter.get(
  '/hot-wallets',
  adminAuthenticate,
  canView,
  validate({ query: treasuryWalletQuerySchema }),
  asyncHandler(adminTreasuryController.listHotWallets),
);

adminTreasuryRouter.get(
  '/cold-wallets',
  adminAuthenticate,
  canView,
  validate({ query: treasuryWalletQuerySchema }),
  asyncHandler(adminTreasuryController.listColdWallets),
);

adminTreasuryRouter.get(
  '/summary',
  adminAuthenticate,
  canView,
  asyncHandler(adminTreasuryController.summary),
);

adminTreasuryRouter.get(
  '/transfers',
  adminAuthenticate,
  canView,
  validate({ query: transferListQuerySchema }),
  asyncHandler(adminTreasuryController.listTransfers),
);

adminTreasuryRouter.post(
  '/sweeps',
  adminAuthenticate,
  canMove,
  validate({ body: transferRequestSchema }),
  asyncHandler(adminTreasuryController.createSweep),
);

adminTreasuryRouter.post(
  '/refills',
  adminAuthenticate,
  canMove,
  validate({ body: transferRequestSchema }),
  asyncHandler(adminTreasuryController.createRefill),
);

adminTreasuryRouter.post(
  '/transfers/:id/approve',
  adminAuthenticate,
  canMove,
  validate({ params: transferIdParamSchema }),
  asyncHandler(adminTreasuryController.approve),
);

adminTreasuryRouter.post(
  '/transfers/:id/reject',
  adminAuthenticate,
  canMove,
  validate({ params: transferIdParamSchema, body: rejectBodySchema }),
  asyncHandler(adminTreasuryController.reject),
);
