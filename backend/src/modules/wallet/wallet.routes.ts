import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { walletController } from './wallet.controller';
import {
  addressQuerySchema,
  createDepositAddressSchema,
  networksQuerySchema,
} from './wallet.validators';

/**
 * Wallet-infrastructure user routes.
 *
 * Mounted at /wallets and registered BEFORE the ledger module's wallet router
 * so the specific static paths here (/overview, /networks, /addresses) are
 * matched before the ledger router's `/:asset` balance route. Anything this
 * router does not handle (e.g. /wallets/:asset) falls through to the ledger
 * router.
 */
export const walletInfraRouter = Router();

walletInfraRouter.get(
  '/overview',
  authenticate,
  asyncHandler(walletController.overview),
);

walletInfraRouter.get(
  '/networks',
  authenticate,
  validate({ query: networksQuerySchema }),
  asyncHandler(walletController.networks),
);

walletInfraRouter.get(
  '/addresses',
  authenticate,
  validate({ query: addressQuerySchema }),
  asyncHandler(walletController.listAddresses),
);

walletInfraRouter.post(
  '/addresses',
  authenticate,
  validate({ body: createDepositAddressSchema }),
  idempotency(),
  asyncHandler(walletController.createAddress),
);
