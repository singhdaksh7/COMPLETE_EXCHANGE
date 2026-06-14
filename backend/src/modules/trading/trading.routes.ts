import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { tradingController } from './trading.controller';
import {
  candlesQuerySchema,
  createOrderSchema,
  marketSymbolParamSchema,
  openOrdersQuerySchema,
  orderBookQuerySchema,
  orderHistoryQuerySchema,
  orderIdParamSchema,
  recentTradesQuerySchema,
  tradeHistoryQuerySchema,
} from './trading.validators';

/**
 * User-facing spot-trading routers.
 *   - marketRouter → /markets
 *   - orderRouter  → /orders
 *   - tradeRouter  → /trades
 *
 * Market listing and the order book are public market data; everything that
 * touches an account is behind `authenticate` (+ idempotency on order creation).
 */
export const marketRouter = Router();

marketRouter.get('/', asyncHandler(tradingController.listMarkets));

marketRouter.get(
  '/:symbol/orderbook',
  validate({ params: marketSymbolParamSchema, query: orderBookQuerySchema }),
  asyncHandler(tradingController.orderBook),
);

// Public market data — recent trades tape, 24h ticker, OHLCV candles. All
// derived read-only projections of the public trades tape (no user data).
marketRouter.get(
  '/:symbol/trades',
  validate({ params: marketSymbolParamSchema, query: recentTradesQuerySchema }),
  asyncHandler(tradingController.recentTrades),
);

marketRouter.get(
  '/:symbol/ticker',
  validate({ params: marketSymbolParamSchema }),
  asyncHandler(tradingController.ticker),
);

marketRouter.get(
  '/:symbol/candles',
  validate({ params: marketSymbolParamSchema, query: candlesQuerySchema }),
  asyncHandler(tradingController.candles),
);

export const orderRouter = Router();

orderRouter.post(
  '/',
  authenticate,
  validate({ body: createOrderSchema }),
  idempotency(),
  asyncHandler(tradingController.create),
);

// Static path declared before `/:id` so it is not shadowed.
orderRouter.get(
  '/open',
  authenticate,
  validate({ query: openOrdersQuerySchema }),
  asyncHandler(tradingController.openOrders),
);

orderRouter.get(
  '/',
  authenticate,
  validate({ query: orderHistoryQuerySchema }),
  asyncHandler(tradingController.orderHistory),
);

orderRouter.delete(
  '/:id',
  authenticate,
  validate({ params: orderIdParamSchema }),
  asyncHandler(tradingController.cancel),
);

export const tradeRouter = Router();

tradeRouter.get(
  '/',
  authenticate,
  validate({ query: tradeHistoryQuerySchema }),
  asyncHandler(tradingController.tradeHistory),
);
