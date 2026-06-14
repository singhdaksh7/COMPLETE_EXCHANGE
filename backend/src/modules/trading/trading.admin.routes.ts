import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { adminAuthenticate } from '../../middleware/admin-authenticate';
import { adminAuthorize } from '../../middleware/admin-authorize';
import { adminTradingController } from './trading.admin.controller';
import { adminOrderQuerySchema, adminTradeQuerySchema } from './trading.validators';

/**
 * Admin spot-trading monitoring, mounted at /admin/v1/spot.
 *   GET /spot/markets — market configuration
 *   GET /spot/orders  — order book / order queue across users
 *   GET /spot/trades  — execution tape across users
 *
 * Behind adminAuthenticate + adminAuthorize('trading.view'); SUPER_ADMIN bypasses.
 */
export const adminTradingRouter = Router();

adminTradingRouter.get(
  '/markets',
  adminAuthenticate,
  adminAuthorize('trading.view'),
  asyncHandler(adminTradingController.listMarkets),
);

adminTradingRouter.get(
  '/orders',
  adminAuthenticate,
  adminAuthorize('trading.view'),
  validate({ query: adminOrderQuerySchema }),
  asyncHandler(adminTradingController.listOrders),
);

adminTradingRouter.get(
  '/trades',
  adminAuthenticate,
  adminAuthorize('trading.view'),
  validate({ query: adminTradeQuerySchema }),
  asyncHandler(adminTradingController.listTrades),
);
