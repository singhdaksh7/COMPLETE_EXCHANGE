import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { ledgerController } from './ledger.controller';
import {
  assetParamSchema,
  inrTransactionQuerySchema,
  internalTransferSchema,
  pageQuerySchema,
} from './ledger.validators';

export const walletRouter = Router();
export const inrLedgerRouter = Router();
export const ledgerRouter = Router();

walletRouter.get(
  '/',
  authenticate,
  asyncHandler(ledgerController.listWallets),
);

walletRouter.get(
  '/:asset',
  authenticate,
  validate({ params: assetParamSchema }),
  asyncHandler(ledgerController.getWallet),
);

walletRouter.get(
  '/:asset/ledger',
  authenticate,
  validate({ params: assetParamSchema, query: pageQuerySchema }),
  asyncHandler(ledgerController.getWalletLedger),
);

inrLedgerRouter.get(
  '/transactions',
  authenticate,
  validate({ query: inrTransactionQuerySchema }),
  asyncHandler(ledgerController.listInrTransactions),
);

ledgerRouter.post(
  '/internal-transfer',
  authenticate,
  validate({ body: internalTransferSchema }),
  idempotency(),
  asyncHandler(ledgerController.internalTransfer),
);
