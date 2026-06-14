import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { tradingService } from './trading.service';
import type { TradingContext } from './trading.types';
import type {
  CandlesQueryDto,
  CreateOrderDto,
  OpenOrdersQueryDto,
  OrderBookQueryDto,
  OrderHistoryQueryDto,
  RecentTradesQueryDto,
  TradeHistoryQueryDto,
} from './trading.validators';

function ctx(req: Request): TradingContext {
  return {
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

function requireUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

export const tradingController = {
  // GET /markets — list spot markets (feature 1).
  async listMarkets(_req: Request, res: Response): Promise<void> {
    const markets = await tradingService.listMarkets();
    sendSuccess(res, { items: markets });
  },

  // GET /markets/:symbol/orderbook — aggregated order book (feature 10).
  async orderBook(req: Request, res: Response): Promise<void> {
    const { symbol } = req.params as { symbol: string };
    const { depth } = req.query as unknown as OrderBookQueryDto;
    const book = await tradingService.getOrderBook(symbol, depth);
    sendSuccess(res, book);
  },

  // GET /markets/:symbol/trades — public recent-trades tape (no user data).
  async recentTrades(req: Request, res: Response): Promise<void> {
    const { symbol } = req.params as { symbol: string };
    const { limit } = req.query as unknown as RecentTradesQueryDto;
    const items = await tradingService.getRecentTrades(symbol, limit);
    sendSuccess(res, { items });
  },

  // GET /markets/:symbol/ticker — public 24h ticker.
  async ticker(req: Request, res: Response): Promise<void> {
    const { symbol } = req.params as { symbol: string };
    const ticker = await tradingService.getTicker(symbol);
    sendSuccess(res, ticker);
  },

  // GET /markets/:symbol/candles — public OHLCV candles.
  async candles(req: Request, res: Response): Promise<void> {
    const { symbol } = req.params as { symbol: string };
    const { interval, limit } = req.query as unknown as CandlesQueryDto;
    const candles = await tradingService.getCandles(symbol, interval, limit);
    sendSuccess(res, candles);
  },

  // POST /orders — create LIMIT/MARKET × BUY/SELL (features 2–5).
  async create(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const dto = await tradingService.placeOrder(user.id, req.body as CreateOrderDto, ctx(req));
    sendSuccess(res, dto, 201);
  },

  // DELETE /orders/:id — cancel an open order (feature 6).
  async cancel(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const { id } = req.params as { id: string };
    const dto = await tradingService.cancelOrder(user.id, id, ctx(req));
    sendSuccess(res, dto);
  },

  // GET /orders/open — caller's resting orders (feature 7).
  async openOrders(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const { symbol, cursor, limit } = req.query as unknown as OpenOrdersQueryDto;
    const result = await tradingService.listOpenOrders({ userId: user.id, symbol, cursor, limit });
    sendSuccess(res, result);
  },

  // GET /orders — caller's order history (feature 8).
  async orderHistory(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const { symbol, status, side, cursor, limit } = req.query as unknown as OrderHistoryQueryDto;
    const result = await tradingService.listOrderHistory({
      userId: user.id,
      symbol,
      status,
      side,
      cursor,
      limit,
    });
    sendSuccess(res, result);
  },

  // GET /trades — caller's trade history (feature 9).
  async tradeHistory(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const { symbol, cursor, limit } = req.query as unknown as TradeHistoryQueryDto;
    const result = await tradingService.listTrades({ userId: user.id, symbol, cursor, limit });
    sendSuccess(res, result);
  },
};
