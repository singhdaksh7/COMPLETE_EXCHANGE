import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { withdrawalController } from './withdrawal.controller';
import {
  addAddressSchema,
  addressQuerySchema,
  createWithdrawalSchema,
  withdrawalIdParamSchema,
  withdrawalQuerySchema,
} from './withdrawal.validators';

/**
 * User-facing crypto withdrawal routes, mounted at /withdrawals.
 * Static `/addresses` paths are declared before `/:id` so they are not shadowed.
 */
export const withdrawalRouter = Router();

withdrawalRouter.post(
  '/addresses',
  authenticate,
  validate({ body: addAddressSchema }),
  asyncHandler(withdrawalController.addAddress),
);

withdrawalRouter.get(
  '/addresses',
  authenticate,
  validate({ query: addressQuerySchema }),
  asyncHandler(withdrawalController.listAddresses),
);

withdrawalRouter.post(
  '/',
  authenticate,
  validate({ body: createWithdrawalSchema }),
  idempotency(),
  asyncHandler(withdrawalController.create),
);

withdrawalRouter.get(
  '/',
  authenticate,
  validate({ query: withdrawalQuerySchema }),
  asyncHandler(withdrawalController.list),
);

withdrawalRouter.get(
  '/:id',
  authenticate,
  validate({ params: withdrawalIdParamSchema }),
  asyncHandler(withdrawalController.get),
);
