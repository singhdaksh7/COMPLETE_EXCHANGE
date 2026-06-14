import {
  Prisma,
  type Market,
  type Order,
  type OrderSide,
  type OrderStatus,
  type OrderType,
  type Trade,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { CandleRow as CandleBucketRow, TickerWindowRow } from './trading.types';

/**
 * Repository: the ONLY place that talks to Prisma for spot trading
 * (markets, orders, trades, asset precision reads). The schema is frozen.
 *
 * This layer NEVER moves balances — locking and trade settlement go through
 * LedgerService. It only persists order/trade state and the book projection.
 */
export const tradingRepository = {
  findUserKyc(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, kycStatus: true, kycTier: true },
    });
  },

  findMarketBySymbol(symbol: string): Promise<Market | null> {
    return prisma.market.findUnique({ where: { symbol } });
  },

  listMarkets(): Promise<Market[]> {
    return prisma.market.findMany({ orderBy: { symbol: 'asc' } });
  },

  /** Asset decimals for base/quote, keyed by symbol (citext, case-insensitive). */
  async assetDecimals(symbols: string[]): Promise<Map<string, number>> {
    const rows = await prisma.asset.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, decimals: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.symbol.toUpperCase(), r.decimals);
    return map;
  },

  findOrderById(id: string): Promise<(Order & { market: Market }) | null> {
    return prisma.order.findUnique({ where: { id }, include: { market: true } });
  },

  findOrderByClientId(
    userId: string,
    clientOrderId: string,
  ): Promise<(Order & { market: Market }) | null> {
    return prisma.order.findFirst({
      where: { userId, clientOrderId },
      include: { market: true },
    });
  },

  createOrder(data: {
    userId: string;
    marketId: string;
    clientOrderId?: string | null;
    side: OrderSide;
    type: OrderType;
    price: Prisma.Decimal | null;
    quantity: Prisma.Decimal | null;
    quoteBudget: Prisma.Decimal | null;
    lockedAsset: string;
    lockedAmount: Prisma.Decimal;
  }): Promise<Order> {
    return prisma.order.create({
      data: {
        userId: data.userId,
        marketId: data.marketId,
        clientOrderId: data.clientOrderId ?? null,
        side: data.side,
        type: data.type,
        price: data.price,
        quantity: data.quantity,
        quoteBudget: data.quoteBudget,
        lockedAsset: data.lockedAsset,
        lockedAmount: data.lockedAmount,
        status: 'PENDING',
      },
    });
  },

  updateOrder(id: string, data: Prisma.OrderUpdateInput): Promise<Order> {
    return prisma.order.update({ where: { id }, data });
  },

  /**
   * Resting opposite side of the book for matching, in price-time priority.
   * Excludes the taker's own orders (no self-trade). Status is restricted to the
   * live book; `take` bounds a single match pass.
   */
  loadRestingBook(input: {
    marketId: string;
    takerSide: OrderSide;
    excludeUserId: string;
    take: number;
  }): Promise<Order[]> {
    const oppositeSide: OrderSide = input.takerSide === 'BUY' ? 'SELL' : 'BUY';
    return prisma.order.findMany({
      where: {
        marketId: input.marketId,
        side: oppositeSide,
        status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
        userId: { not: input.excludeUserId },
      },
      // BUY taker consumes asks low→high; SELL taker consumes bids high→low.
      // createdAt then id break ties deterministically (time priority).
      orderBy: [
        { price: input.takerSide === 'BUY' ? 'asc' : 'desc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      take: input.take,
    });
  },

  findTradeByFillId(fillId: string): Promise<Trade | null> {
    return prisma.trade.findUnique({ where: { fillId } });
  },

  createTrade(data: {
    id: string;
    fillId: string;
    marketId: string;
    makerOrderId: string;
    takerOrderId: string;
    makerUserId: string;
    takerUserId: string;
    price: Prisma.Decimal;
    quantity: Prisma.Decimal;
    quoteAmount: Prisma.Decimal;
    makerFee: Prisma.Decimal;
    takerFee: Prisma.Decimal;
    makerSide: OrderSide;
    settleTxnId: string;
  }): Promise<Trade> {
    return prisma.trade.create({ data });
  },

  /** Aggregated resting depth per price level for one side of the book. */
  async bookLevels(input: {
    marketId: string;
    side: OrderSide;
    depth: number;
  }): Promise<Array<{ price: Prisma.Decimal; quantity: Prisma.Decimal }>> {
    const rows = await prisma.order.findMany({
      where: {
        marketId: input.marketId,
        side: input.side,
        status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
      },
      select: { price: true, quantity: true, filledQuantity: true },
    });
    const byPrice = new Map<string, { price: Prisma.Decimal; quantity: Prisma.Decimal }>();
    for (const r of rows) {
      if (!r.price || !r.quantity) continue;
      const remaining = r.quantity.sub(r.filledQuantity);
      if (remaining.lte(0)) continue;
      const key = r.price.toFixed();
      const level = byPrice.get(key);
      if (level) {
        level.quantity = level.quantity.add(remaining);
      } else {
        byPrice.set(key, { price: r.price, quantity: remaining });
      }
    }
    const levels = [...byPrice.values()].sort((a, b) =>
      input.side === 'BUY' ? b.price.comparedTo(a.price) : a.price.comparedTo(b.price),
    );
    return levels.slice(0, input.depth);
  },

  listOpenOrders(input: {
    userId: string;
    marketId?: string;
    cursor?: string;
    limit: number;
  }): Promise<Array<Order & { market: Market }>> {
    return prisma.order.findMany({
      where: {
        userId: input.userId,
        status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
        ...(input.marketId ? { marketId: input.marketId } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      include: { market: true },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  listOrderHistory(input: {
    userId: string;
    marketId?: string;
    status?: OrderStatus;
    side?: OrderSide;
    cursor?: string;
    limit: number;
  }): Promise<Array<Order & { market: Market }>> {
    return prisma.order.findMany({
      where: {
        userId: input.userId,
        ...(input.marketId ? { marketId: input.marketId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.side ? { side: input.side } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      include: { market: true },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  listUserTrades(input: {
    userId: string;
    marketId?: string;
    cursor?: string;
    limit: number;
  }): Promise<Array<Trade & { market: Market }>> {
    return prisma.trade.findMany({
      where: {
        OR: [{ makerUserId: input.userId }, { takerUserId: input.userId }],
        ...(input.marketId ? { marketId: input.marketId } : {}),
        ...(input.cursor ? { seq: { lt: BigInt(input.cursor) } } : {}),
      },
      include: { market: true },
      orderBy: { seq: 'desc' },
      take: input.limit + 1,
    });
  },

  fillsForOrder(orderId: string): Promise<Trade[]> {
    return prisma.trade.findMany({
      where: { OR: [{ makerOrderId: orderId }, { takerOrderId: orderId }] },
      orderBy: { seq: 'asc' },
    });
  },

  // ------------------------------------------------------------------
  // Public market data (READ-ONLY projections of the trades tape).
  // These select ONLY public columns — never user ids, order ids, or fees.
  // ------------------------------------------------------------------

  /** Most-recent public tape prints for a market, newest first. */
  recentTrades(input: {
    marketId: string;
    limit: number;
  }): Promise<Array<Pick<Trade, 'id' | 'price' | 'quantity' | 'makerSide' | 'executedAt'>>> {
    return prisma.trade.findMany({
      where: { marketId: input.marketId },
      select: { id: true, price: true, quantity: true, makerSide: true, executedAt: true },
      orderBy: { seq: 'desc' },
      take: input.limit,
    });
  },

  /** The single most-recent trade overall (drives lastPrice). */
  latestTrade(
    marketId: string,
  ): Promise<Pick<Trade, 'price' | 'executedAt'> | null> {
    return prisma.trade.findFirst({
      where: { marketId },
      select: { price: true, executedAt: true },
      orderBy: { seq: 'desc' },
    });
  },

  /**
   * 24h rolling aggregate over the tape: open (first in window), high, low,
   * close (last in window), and base/quote volume + trade count. Decimals are
   * returned as text so the service maps them through Prisma.Decimal without
   * float loss. Returns a single row (all-null aggregates when no trades).
   */
  async tickerWindow(input: {
    marketId: string;
    since: Date;
  }): Promise<TickerWindowRow> {
    const rows = await prisma.$queryRaw<TickerWindowRow[]>`
      SELECT
        count(*)::int                                    AS trade_count,
        (array_agg(price ORDER BY seq ASC))[1]::text     AS open,
        max(price)::text                                 AS high,
        min(price)::text                                 AS low,
        (array_agg(price ORDER BY seq DESC))[1]::text    AS close,
        coalesce(sum(quantity), 0)::text                 AS base_volume,
        coalesce(sum(quote_amount), 0)::text             AS quote_volume
      FROM trades
      WHERE market_id = ${input.marketId}::uuid
        AND executed_at >= ${input.since}
    `;
    return (
      rows[0] ?? {
        trade_count: 0,
        open: null,
        high: null,
        low: null,
        close: null,
        base_volume: '0',
        quote_volume: '0',
      }
    );
  },

  /**
   * OHLCV candles computed on the fly from the trades tape (MVP — no
   * pre-aggregation worker yet). Trades are bucketed into fixed-width windows
   * by epoch seconds, so non-calendar intervals (5m/15m) work uniformly. Open
   * and close use seq ordering within each bucket. Returns ascending by time.
   */
  candleBuckets(input: {
    marketId: string;
    bucketSeconds: number;
    since: Date;
  }): Promise<CandleBucketRow[]> {
    return prisma.$queryRaw<CandleBucketRow[]>`
      SELECT
        to_timestamp(floor(extract(epoch FROM executed_at) / ${input.bucketSeconds})
          * ${input.bucketSeconds})                      AS open_time,
        (array_agg(price ORDER BY seq ASC))[1]::text     AS open,
        max(price)::text                                 AS high,
        min(price)::text                                 AS low,
        (array_agg(price ORDER BY seq DESC))[1]::text    AS close,
        coalesce(sum(quantity), 0)::text                 AS base_volume,
        coalesce(sum(quote_amount), 0)::text             AS quote_volume,
        count(*)::int                                    AS trade_count
      FROM trades
      WHERE market_id = ${input.marketId}::uuid
        AND executed_at >= ${input.since}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  },

  adminListOrders(input: {
    marketId?: string;
    status?: OrderStatus;
    side?: OrderSide;
    userId?: string;
    cursor?: string;
    limit: number;
  }): Promise<Array<Order & { market: Market }>> {
    return prisma.order.findMany({
      where: {
        ...(input.marketId ? { marketId: input.marketId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.side ? { side: input.side } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      include: { market: true },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  adminListTrades(input: {
    marketId?: string;
    userId?: string;
    cursor?: string;
    limit: number;
  }): Promise<Array<Trade & { market: Market }>> {
    return prisma.trade.findMany({
      where: {
        ...(input.marketId ? { marketId: input.marketId } : {}),
        ...(input.userId
          ? { OR: [{ makerUserId: input.userId }, { takerUserId: input.userId }] }
          : {}),
        ...(input.cursor ? { seq: { lt: BigInt(input.cursor) } } : {}),
      },
      include: { market: true },
      orderBy: { seq: 'desc' },
      take: input.limit + 1,
    });
  },

  writeAdminLog(data: {
    adminId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    ip?: string;
    requestId?: string;
    afterState?: Prisma.InputJsonValue;
  }) {
    return prisma.adminLog.create({
      data: {
        adminId: data.adminId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        ip: data.ip,
        requestId: data.requestId,
        afterState: data.afterState,
      },
    });
  },
};

export type TradingRepository = typeof tradingRepository;
