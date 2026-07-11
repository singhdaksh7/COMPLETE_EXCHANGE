import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { marketDataController } from './market-data.controller';
import { candlesQuerySchema, marketDataSymbolParamSchema } from './market-data.validators';

/**
 * Public live market-data routes (Goals 7/8) — mounted at /market-data,
 * distinct from the internal /markets spot-trading resource. Entirely public
 * (read-only reference data), matching the existing convention that market
 * listing/ticker/candle data on /markets is also unauthenticated.
 */
export const marketDataRouter = Router();

marketDataRouter.get('/', asyncHandler(marketDataController.listSymbols));
marketDataRouter.get('/tickers', asyncHandler(marketDataController.listTickers));
marketDataRouter.get('/health', asyncHandler(marketDataController.health));

marketDataRouter.get(
  '/:symbol/ticker',
  validate({ params: marketDataSymbolParamSchema }),
  asyncHandler(marketDataController.ticker),
);

marketDataRouter.get(
  '/:symbol/candles',
  validate({ params: marketDataSymbolParamSchema, query: candlesQuerySchema }),
  asyncHandler(marketDataController.candles),
);
