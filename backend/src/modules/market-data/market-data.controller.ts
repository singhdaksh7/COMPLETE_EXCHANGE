import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { marketDataService } from './market-data.service';
import type { CandlesQueryDto } from './market-data.validators';

/**
 * Public market-data routes (mounted at /market-data — Goals 7/8).
 *
 * Deliberately a NEW resource path, not a reuse of `/markets`: that path is
 * the internal, order-book-derived spot-trading market (see
 * `modules/trading`). Mixing the two under one `:symbol` param would let a
 * client hit `/markets/BTCUSDT/candles` and silently get a 404 from the
 * trading engine instead of a clear external-market-data response.
 */
export const marketDataController = {
  async listSymbols(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, { items: marketDataService.listSymbols() });
  },

  async listTickers(_req: Request, res: Response): Promise<void> {
    const items = await marketDataService.listTickers();
    sendSuccess(res, { items });
  },

  async ticker(req: Request, res: Response): Promise<void> {
    const { symbol } = req.params as { symbol: string };
    const result = await marketDataService.getTicker(symbol);
    sendSuccess(res, result);
  },

  async candles(req: Request, res: Response): Promise<void> {
    const { symbol } = req.params as { symbol: string };
    const query = req.query as unknown as CandlesQueryDto;
    const result = await marketDataService.getCandles(symbol, query);
    sendSuccess(res, result);
  },

  async health(_req: Request, res: Response): Promise<void> {
    const items = await marketDataService.getProviderHealth();
    sendSuccess(res, { items });
  },
};
