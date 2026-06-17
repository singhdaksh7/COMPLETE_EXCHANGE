import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { scannerController } from './scanner.controller';
import { userDepositQuerySchema } from './scanner.validators';

/**
 * User-facing crypto deposit routes, mounted at /wallets.
 *
 * Registered BEFORE the ledger wallet router so the static `/deposits` path is
 * matched before the ledger router's `/:asset` balance route would shadow it.
 */
export const cryptoDepositRouter = Router();

cryptoDepositRouter.get(
  '/deposits',
  authenticate,
  validate({ query: userDepositQuerySchema }),
  asyncHandler(scannerController.listDeposits),
);
