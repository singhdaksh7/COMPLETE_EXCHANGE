import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminWalletController } from './wallet.admin.controller';
import {
  adminAddressQuerySchema,
  adminHotWalletQuerySchema,
  adminSignerQuerySchema,
} from './wallet.validators';

/**
 * Admin wallet monitoring routes, mounted at /admin/v1/wallets.
 *
 * Deposit-address monitoring is deposit-side ('deposit.view'); hot-wallet and
 * signer registries are treasury/withdrawal-side ('withdrawal.view'). Both are
 * seeded permissions; SUPER_ADMIN bypasses either.
 */
export const adminWalletRouter = Router();

adminWalletRouter.get(
  '/deposit-addresses',
  adminAuthenticate,
  adminAuthorize('deposit.view'),
  validate({ query: adminAddressQuerySchema }),
  asyncHandler(adminWalletController.listDepositAddresses),
);

adminWalletRouter.get(
  '/hot-wallets',
  adminAuthenticate,
  adminAuthorize('withdrawal.view'),
  validate({ query: adminHotWalletQuerySchema }),
  asyncHandler(adminWalletController.listHotWallets),
);

adminWalletRouter.get(
  '/signers',
  adminAuthenticate,
  adminAuthorize('withdrawal.view'),
  validate({ query: adminSignerQuerySchema }),
  asyncHandler(adminWalletController.listSigners),
);
