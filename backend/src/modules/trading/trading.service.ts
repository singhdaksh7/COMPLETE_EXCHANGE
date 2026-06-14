import { createHash } from 'node:crypto';
import {
  Prisma,
  type Market,
  type Order,
  type OrderSide,
} from '@prisma/client';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import {
  publishBalanceChanged,
  publishOrderUpdated,
  publishOrderbookChanged,
  publishTradeExecuted,
} from '../../realtime/events';
import { ledgerService } from '../ledger/ledger.service';
import type { LedgerPostingLine } from '../ledger/ledger.types';
import { tradingRepository } from './trading.repository';
import { matchOrder, type EngineFill, type RestingOrder } from './trading.engine';
import {
  BASE_ASSET,
  QUOTE_ASSET,
  INTERVAL_SECONDS,
  LEDGER_KIND,
  REFERENCE_TYPE,
  TradingAction,
  computeFee,
  computeLockRequirement,
  dec,
  toCandleDto,
  toMarketDto,
  toOrderDto,
  toPublicTradeDto,
  toTradeDto,
  type CandleInterval,
  type CandlesDto,
  type MarketDto,
  type MarketParams,
  type OrderBookDto,
  type OrderDto,
  type OrderFillDto,
  type PublicTradeDto,
  type TickerDto,
  type TradeDto,
  type TradingContext,
} from './trading.types';
import type {
  AdminOrderQueryDto,
  AdminTradeQueryDto,
  CreateOrderDto,
} from './trading.validators';

const BOOK_SCAN_LIMIT = 500;

/**
 * Deterministic v5-style UUID from a seed. A fill is uniquely identified by its
 * (taker, maker) order pair, so the same fill always derives the same id — used
 * as the trade's primary key AND the ledger settlement reference, which makes
 * settlement idempotent (the ledger dedups on referenceId, a UUID column).
 */
function deterministicUuid(seed: string): string {
  const b = createHash('sha1').update(seed).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Retry an idempotent ledger posting on a SERIALIZABLE write-conflict (P2034). */
async function postWithRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 15 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Per-market in-process serialization. Matching for a single market is the only
 * mutator of its resting book and of order fill state, so serializing it makes
 * matching deterministic and prevents a maker order being double-spent by two
 * concurrent takers. A multi-process deployment would replace this with a
 * Postgres advisory lock keyed on the market id (noted for future work).
 */
const marketChains = new Map<string, Promise<unknown>>();
function withMarketLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = marketChains.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  marketChains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

interface ResolvedMarket {
  market: Market;
  params: MarketParams;
}

export const tradingService = {
  // ==================================================================
  // 1. Market listing
  // ==================================================================
  async listMarkets(): Promise<MarketDto[]> {
    const markets = await tradingRepository.listMarkets();
    return markets.map(toMarketDto);
  },

  // ==================================================================
  // 2–5. Create order (LIMIT/MARKET × BUY/SELL) → lock → match → settle
  // ==================================================================
  async placeOrder(
    userId: string,
    input: CreateOrderDto,
    ctx: TradingContext = {},
  ): Promise<OrderDto> {
    await this.assertKycApproved(userId);
    const { market, params } = await this.resolveMarket(input.symbol);

    if (market.status !== 'ACTIVE') {
      throw new AppError('Market is not active for trading', 422, 'MARKET_NOT_ACTIVE');
    }

    this.validateAgainstMarket(input, market);

    // Idempotency #1: a duplicate clientOrderId returns the original order
    // rather than creating a second one (complements the Idempotency-Key header).
    if (input.clientOrderId) {
      const dup = await tradingRepository.findOrderByClientId(userId, input.clientOrderId);
      if (dup) return toOrderDto(dup);
    }

    const lock = computeLockRequirement(input, params);

    // Persist the order first (PENDING) so the lock + trades can reference its id.
    let order: Order;
    try {
      order = await tradingRepository.createOrder({
        userId,
        marketId: market.id,
        clientOrderId: input.clientOrderId ?? null,
        side: input.side,
        type: input.type,
        price: input.price ? dec(input.price) : null,
        quantity: input.quantity ? dec(input.quantity) : null,
        quoteBudget: input.quoteBudget ? dec(input.quoteBudget) : null,
        lockedAsset: lock.asset,
        lockedAmount: dec(lock.amount),
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const dup = input.clientOrderId
          ? await tradingRepository.findOrderByClientId(userId, input.clientOrderId)
          : null;
        if (dup) return toOrderDto(dup);
      }
      throw err;
    }

    // Reserve funds: USER_AVAILABLE → USER_LOCKED (idempotent on the order id).
    try {
      const lockTxn = await postWithRetry(() =>
        ledgerService.post(
          {
            kind: LEDGER_KIND.ORDER_LOCK,
            referenceType: REFERENCE_TYPE.ORDER_LOCK,
            referenceId: order.id,
            metadata: { side: input.side, type: input.type, asset: lock.asset },
            lines: [
              { kind: 'USER_AVAILABLE', userId, asset: lock.asset, direction: 'DEBIT', amount: lock.amount },
              { kind: 'USER_LOCKED', userId, asset: lock.asset, direction: 'CREDIT', amount: lock.amount },
            ],
          },
          { userId },
        ),
      );
      order = await tradingRepository.updateOrder(order.id, {
        status: 'OPEN',
        lockTxn: { connect: { id: lockTxn.id } },
      });
    } catch (err) {
      if (err instanceof ConflictError && err.errorCode === 'INSUFFICIENT_BALANCE') {
        await tradingRepository.updateOrder(order.id, {
          status: 'REJECTED',
          closedAt: new Date(),
        });
        await recordAudit({
          actorType: 'USER',
          actorId: userId,
          action: TradingAction.ORDER_REJECTED,
          entityType: 'order',
          entityId: order.id,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
          metadata: { reason: 'INSUFFICIENT_BALANCE', asset: lock.asset, amount: lock.amount },
        });
        throw new AppError(
          `Insufficient ${lock.asset} balance to place this order`,
          422,
          'INSUFFICIENT_BALANCE',
        );
      }
      throw err;
    }

    // Match + settle under the per-market lock for determinism.
    const fills = await withMarketLock(market.id, () =>
      this.matchAndSettle(order, market, params),
    );

    const found = await tradingRepository.findOrderById(order.id);
    const finalOrder = found ?? { ...order, market };
    const fillDtos: OrderFillDto[] = fills.map((f) => ({
      tradeId: f.tradeId,
      price: f.price,
      quantity: f.quantity,
      quoteAmount: f.quoteAmount,
    }));

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: TradingAction.ORDER_CREATED,
      entityType: 'order',
      entityId: order.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        symbol: market.symbol,
        side: input.side,
        type: input.type,
        fills: fills.length,
        status: finalOrder.status,
      },
    });

    return toOrderDto(finalOrder, fillDtos);
  },

  /**
   * Run the deterministic engine against the live book and settle each fill
   * through the ledger. Returns the created trades for the taker's response.
   * MUST be called inside `withMarketLock`.
   */
  async matchAndSettle(
    taker: Order,
    market: Market,
    params: MarketParams,
  ): Promise<Array<EngineFill & { tradeId: string }>> {
    const restingRows = await tradingRepository.loadRestingBook({
      marketId: market.id,
      takerSide: taker.side,
      excludeUserId: taker.userId,
      take: BOOK_SCAN_LIMIT,
    });

    const book: RestingOrder[] = restingRows.map((o) => ({
      id: o.id,
      userId: o.userId,
      price: (o.price ?? new Prisma.Decimal(0)).toFixed(),
      remaining: o.quantity ? o.quantity.sub(o.filledQuantity).toFixed() : '0',
    }));

    const result = matchOrder(
      {
        side: taker.side,
        type: taker.type,
        price: taker.price ? taker.price.toFixed() : null,
        quantity: taker.quantity ? taker.quantity.toFixed() : null,
        quoteBudget: taker.quoteBudget ? taker.quoteBudget.toFixed() : null,
      },
      book,
      params,
    );

    const restingById = new Map(restingRows.map((o) => [o.id, o]));
    const created: Array<EngineFill & { tradeId: string }> = [];
    // Users whose balances moved in this match (taker added by the caller). Each
    // gets one balance.updated regardless of how many fills touched them.
    const affectedUsers = new Set<string>();

    for (const fill of result.fills) {
      const maker = restingById.get(fill.makerOrderId);
      if (!maker) continue;
      const trade = await this.settleFill(taker, maker, fill, market, params);
      created.push({ ...fill, tradeId: trade.id });

      // Advance the maker's fill state and release any surplus when it closes.
      const makerFilled = maker.filledQuantity.add(dec(fill.quantity));
      const makerQuoteSpent = maker.quoteSpent.add(dec(fill.quoteAmount));
      const makerRemaining = (maker.quantity ?? new Prisma.Decimal(0)).sub(makerFilled);
      const makerClosed = makerRemaining.lte(0);
      const updatedMaker = await tradingRepository.updateOrder(maker.id, {
        filledQuantity: makerFilled,
        quoteSpent: makerQuoteSpent,
        status: makerClosed ? 'FILLED' : 'PARTIALLY_FILLED',
        ...(makerClosed ? { closedAt: new Date() } : {}),
      });
      // Keep the in-memory copy current in case the same maker is revisited.
      maker.filledQuantity = makerFilled;
      maker.quoteSpent = makerQuoteSpent;
      if (makerClosed) {
        await this.releaseSurplus({ ...maker, filledQuantity: makerFilled, quoteSpent: makerQuoteSpent });
      }

      // Live updates: public tape + the maker's own order; balances flushed below.
      publishTradeExecuted(market.symbol, {
        id: trade.id,
        price: fill.price,
        quantity: fill.quantity,
        makerSide: maker.side,
        executedAt: trade.executedAt,
      });
      publishOrderUpdated(maker.userId, toOrderDto({ ...updatedMaker, market }));
      affectedUsers.add(maker.userId);
    }

    // Finalize the taker order.
    const takerFilled = dec(result.filledQuantity);
    const takerQuote = dec(result.quoteTotal);
    const isLimit = taker.type === 'LIMIT';
    const target = taker.quantity ?? new Prisma.Decimal(0);

    let status: Order['status'];
    if (isLimit) {
      if (takerFilled.gte(target)) status = 'FILLED';
      else if (takerFilled.gt(0)) status = 'PARTIALLY_FILLED';
      else status = 'OPEN';
    } else {
      // MARKET is immediate-or-cancel: it never rests.
      status = takerFilled.gt(0) ? 'FILLED' : 'CANCELLED';
    }

    const terminal = status === 'FILLED' || status === 'CANCELLED';
    const updated = await tradingRepository.updateOrder(taker.id, {
      filledQuantity: takerFilled,
      quoteSpent: takerQuote,
      status,
      ...(terminal ? { closedAt: new Date() } : {}),
    });

    if (terminal) {
      await this.releaseSurplus(updated);
    }

    // Broadcast the resulting state: taker's order, the (possibly) changed book,
    // and one balance.updated per user whose funds moved (taker always; makers
    // that filled). Publishing is decoupled + non-throwing — never blocks here.
    publishOrderUpdated(taker.userId, toOrderDto({ ...updated, market }));
    publishOrderbookChanged(market.symbol);
    affectedUsers.add(taker.userId);
    for (const uid of affectedUsers) publishBalanceChanged(uid);

    return created;
  },

  /** Settle ONE fill: debit both LOCKED accounts, credit nets + fees. */
  async settleFill(
    taker: Order,
    maker: Order,
    fill: EngineFill,
    market: Market,
    params: MarketParams,
  ) {
    const buyerIsTaker = taker.side === 'BUY';
    const buyerUserId = buyerIsTaker ? taker.userId : maker.userId;
    const sellerUserId = buyerIsTaker ? maker.userId : taker.userId;
    const makerSide: OrderSide = maker.side;

    const quantity = dec(fill.quantity); // base (USDT)
    const quoteAmount = dec(fill.quoteAmount); // quote (INR)
    const buyerBps = buyerIsTaker ? market.takerFeeBps : market.makerFeeBps;
    const sellerBps = buyerIsTaker ? market.makerFeeBps : market.takerFeeBps;

    // Buyer receives base (USDT) → pays base-denominated fee.
    const buyerFee = computeFee(quantity, buyerBps, params.baseScale);
    // Seller receives quote (INR) → pays quote-denominated fee.
    const sellerFee = computeFee(quoteAmount, sellerBps, params.quoteScale);

    const buyerNet = quantity.sub(buyerFee);
    const sellerNet = quoteAmount.sub(sellerFee);

    const fillId = `${taker.id}:${maker.id}`;
    const tradeId = deterministicUuid(fillId);
    const lines: LedgerPostingLine[] = [
      // INR leg: buyer's locked INR → seller available + fee revenue.
      { kind: 'USER_LOCKED', userId: buyerUserId, asset: QUOTE_ASSET, direction: 'DEBIT', amount: quoteAmount.toFixed(params.quoteScale) },
      { kind: 'USER_AVAILABLE', userId: sellerUserId, asset: QUOTE_ASSET, direction: 'CREDIT', amount: sellerNet.toFixed(params.quoteScale) },
      // USDT leg: seller's locked USDT → buyer available + fee revenue.
      { kind: 'USER_LOCKED', userId: sellerUserId, asset: BASE_ASSET, direction: 'DEBIT', amount: quantity.toFixed(params.baseScale) },
      { kind: 'USER_AVAILABLE', userId: buyerUserId, asset: BASE_ASSET, direction: 'CREDIT', amount: buyerNet.toFixed(params.baseScale) },
    ];
    if (sellerFee.gt(0)) {
      lines.push({ kind: 'FEE_REVENUE', userId: null, asset: QUOTE_ASSET, direction: 'CREDIT', amount: sellerFee.toFixed(params.quoteScale) });
    }
    if (buyerFee.gt(0)) {
      lines.push({ kind: 'FEE_REVENUE', userId: null, asset: BASE_ASSET, direction: 'CREDIT', amount: buyerFee.toFixed(params.baseScale) });
    }

    const settle = await postWithRetry(() =>
      ledgerService.post({
        kind: LEDGER_KIND.TRADE_SETTLE,
        referenceType: REFERENCE_TYPE.TRADE,
        referenceId: tradeId,
        metadata: { fillId, price: fill.price, quantity: fill.quantity },
        lines,
      }),
    );

    const makerFee = makerSide === 'BUY' ? buyerFee : sellerFee;
    const takerFee = makerSide === 'BUY' ? sellerFee : buyerFee;

    try {
      return await tradingRepository.createTrade({
        id: tradeId,
        fillId,
        marketId: market.id,
        makerOrderId: maker.id,
        takerOrderId: taker.id,
        makerUserId: maker.userId,
        takerUserId: taker.userId,
        price: dec(fill.price),
        quantity,
        quoteAmount,
        makerFee,
        takerFee,
        makerSide,
        settleTxnId: settle.id,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await tradingRepository.findTradeByFillId(fillId);
        if (existing) return existing;
      }
      throw err;
    }
  },

  /**
   * Release the unspent remainder of an order's lock back to USER_AVAILABLE.
   * BUY locks INR (spent = quoteSpent); SELL locks USDT (spent = filledQuantity).
   * Idempotent on the order id.
   */
  async releaseSurplus(order: {
    id: string;
    userId: string;
    side: OrderSide;
    lockedAsset: string | null;
    lockedAmount: Prisma.Decimal | null;
    filledQuantity: Prisma.Decimal;
    quoteSpent: Prisma.Decimal;
  }): Promise<void> {
    if (!order.lockedAsset || !order.lockedAmount) return;
    const lockedAsset = order.lockedAsset;
    const spent = order.side === 'BUY' ? order.quoteSpent : order.filledQuantity;
    const surplus = order.lockedAmount.sub(spent);
    if (surplus.lte(0)) return;
    const amount = surplus.toFixed();

    await postWithRetry(() =>
      ledgerService.post(
        {
          kind: LEDGER_KIND.ORDER_UNLOCK,
          referenceType: REFERENCE_TYPE.ORDER_UNLOCK,
          referenceId: order.id,
          metadata: { asset: lockedAsset, amount },
          lines: [
            { kind: 'USER_LOCKED', userId: order.userId, asset: lockedAsset, direction: 'DEBIT', amount },
            { kind: 'USER_AVAILABLE', userId: order.userId, asset: lockedAsset, direction: 'CREDIT', amount },
          ],
        },
        { userId: order.userId },
      ),
    );
  },

  // ==================================================================
  // 6. Cancel order
  // ==================================================================
  async cancelOrder(
    userId: string,
    orderId: string,
    ctx: TradingContext = {},
  ): Promise<OrderDto> {
    const order = await tradingRepository.findOrderById(orderId);
    if (!order || order.userId !== userId) {
      throw new NotFoundError('Order not found', 'ORDER_NOT_FOUND');
    }

    const cancelled = await withMarketLock(order.marketId, async () => {
      const current = await tradingRepository.findOrderById(orderId);
      if (!current) throw new NotFoundError('Order not found', 'ORDER_NOT_FOUND');
      if (!['PENDING', 'OPEN', 'PARTIALLY_FILLED'].includes(current.status)) {
        throw new ConflictError('Order can no longer be cancelled', 'ORDER_NOT_CANCELLABLE');
      }
      const updated = await tradingRepository.updateOrder(orderId, {
        status: 'CANCELLED',
        closedAt: new Date(),
      });
      await this.releaseSurplus(updated);
      return { ...updated, market: current.market };
    });

    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: TradingAction.ORDER_CANCELLED,
      entityType: 'order',
      entityId: orderId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { symbol: cancelled.market.symbol, filled: cancelled.filledQuantity.toFixed() },
    });

    // Live updates: cancelled order, the freed book level, and the released lock.
    publishOrderUpdated(userId, toOrderDto(cancelled));
    publishOrderbookChanged(cancelled.market.symbol);
    publishBalanceChanged(userId);

    return toOrderDto(cancelled);
  },

  // ==================================================================
  // 7. Open orders
  // ==================================================================
  async listOpenOrders(input: {
    userId: string;
    symbol?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: OrderDto[]; nextCursor: string | null }> {
    const marketId = await this.marketIdForSymbol(input.symbol);
    const rows = await tradingRepository.listOpenOrders({
      userId: input.userId,
      marketId,
      cursor: input.cursor,
      limit: input.limit,
    });
    return this.pageOrders(rows, input.limit);
  },

  // ==================================================================
  // 8. Order history
  // ==================================================================
  async listOrderHistory(input: {
    userId: string;
    symbol?: string;
    status?: OrderDto['status'];
    side?: OrderSide;
    cursor?: string;
    limit: number;
  }): Promise<{ items: OrderDto[]; nextCursor: string | null }> {
    const marketId = await this.marketIdForSymbol(input.symbol);
    const rows = await tradingRepository.listOrderHistory({
      userId: input.userId,
      marketId,
      status: input.status,
      side: input.side,
      cursor: input.cursor,
      limit: input.limit,
    });
    return this.pageOrders(rows, input.limit);
  },

  // ==================================================================
  // 9. Trade history
  // ==================================================================
  async listTrades(input: {
    userId: string;
    symbol?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: TradeDto[]; nextCursor: string | null }> {
    const marketId = await this.marketIdForSymbol(input.symbol);
    const rows = await tradingRepository.listUserTrades({
      userId: input.userId,
      marketId,
      cursor: input.cursor,
      limit: input.limit,
    });
    return this.pageTrades(rows, input.limit, input.userId);
  },

  // ==================================================================
  // 10. Order book
  // ==================================================================
  async getOrderBook(symbol: string, depth: number): Promise<OrderBookDto> {
    const { market } = await this.resolveMarket(symbol);
    const [bids, asks] = await Promise.all([
      tradingRepository.bookLevels({ marketId: market.id, side: 'BUY', depth }),
      tradingRepository.bookLevels({ marketId: market.id, side: 'SELL', depth }),
    ]);
    return {
      symbol: market.symbol,
      bids: bids.map((l) => ({ price: l.price.toFixed(), quantity: l.quantity.toFixed() })),
      asks: asks.map((l) => ({ price: l.price.toFixed(), quantity: l.quantity.toFixed() })),
    };
  },

  // ==================================================================
  // Public market data — recent trades, 24h ticker, OHLCV candles
  //
  // Derived READ-ONLY projections of the public trades tape. They expose only
  // public fields (price/quantity/time) — never user ids, fees, or ownership.
  // Candles + ticker are computed on the fly from `trades` for the MVP.
  // ==================================================================

  /** Public recent-trades tape, newest first. */
  async getRecentTrades(symbol: string, limit: number): Promise<PublicTradeDto[]> {
    const { market, params } = await this.resolveMarket(symbol);
    const rows = await tradingRepository.recentTrades({ marketId: market.id, limit });
    return rows.map((r) => toPublicTradeDto(r, params));
  },

  /** 24h rolling ticker: last price, high/low, volume, and price change. */
  async getTicker(symbol: string): Promise<TickerDto> {
    const { market, params } = await this.resolveMarket(symbol);
    const since = new Date(Date.now() - INTERVAL_SECONDS['1d'] * 1000);
    const [win, last] = await Promise.all([
      tradingRepository.tickerWindow({ marketId: market.id, since }),
      tradingRepository.latestTrade(market.id),
    ]);

    const q = params.quoteScale;
    const b = params.baseScale;
    // lastPrice is the most-recent trade overall (may predate the 24h window);
    // open24h is the first trade inside the window. Change compares the two.
    const lastPrice = last ? last.price : null;
    const open24h = win.open != null ? dec(win.open) : null;

    let priceChange = new Prisma.Decimal(0);
    let priceChangePct = new Prisma.Decimal(0);
    if (lastPrice && open24h && open24h.gt(0)) {
      priceChange = lastPrice.sub(open24h);
      priceChangePct = priceChange.div(open24h).mul(100);
    }

    return {
      symbol: market.symbol,
      lastPrice: lastPrice ? lastPrice.toFixed(q) : null,
      high24h: win.high != null ? dec(win.high).toFixed(q) : null,
      low24h: win.low != null ? dec(win.low).toFixed(q) : null,
      open24h: open24h ? open24h.toFixed(q) : null,
      priceChange: priceChange.toFixed(q),
      priceChangePct: priceChangePct.toFixed(2),
      baseVolume24h: dec(win.base_volume ?? '0').toFixed(b),
      quoteVolume24h: dec(win.quote_volume ?? '0').toFixed(q),
      tradeCount24h: win.trade_count,
    };
  },

  /** OHLCV candles for a market/interval, computed from the trades tape. */
  async getCandles(
    symbol: string,
    interval: CandleInterval,
    limit: number,
  ): Promise<CandlesDto> {
    const { market, params } = await this.resolveMarket(symbol);
    const bucketSeconds = INTERVAL_SECONDS[interval];
    // Bound the scan to roughly `limit` buckets ending now.
    const since = new Date(Date.now() - bucketSeconds * limit * 1000);
    const rows = await tradingRepository.candleBuckets({
      marketId: market.id,
      bucketSeconds,
      since,
    });
    // Keep the most-recent `limit` buckets (query is ascending by time).
    const trimmed = rows.length > limit ? rows.slice(rows.length - limit) : rows;
    return {
      symbol: market.symbol,
      interval,
      candles: trimmed.map((r) => toCandleDto(r, params)),
    };
  },

  // ==================================================================
  // 17. Admin monitoring
  // ==================================================================
  async adminListMarkets(ctx: TradingContext = {}): Promise<MarketDto[]> {
    const markets = await this.listMarkets();
    await this.audit(ctx, TradingAction.ADMIN_LIST_MARKETS, 'market_list', { count: markets.length });
    return markets;
  },

  async adminListOrders(
    input: AdminOrderQueryDto,
    ctx: TradingContext = {},
  ): Promise<{ items: OrderDto[]; nextCursor: string | null }> {
    const marketId = await this.marketIdForSymbol(input.symbol);
    const rows = await tradingRepository.adminListOrders({
      marketId,
      status: input.status,
      side: input.side,
      userId: input.userId,
      cursor: input.cursor,
      limit: input.limit,
    });
    const result = this.pageOrders(rows, input.limit);
    await this.audit(ctx, TradingAction.ADMIN_LIST_ORDERS, 'order_queue', { count: result.items.length });
    return result;
  },

  async adminListTrades(
    input: AdminTradeQueryDto,
    ctx: TradingContext = {},
  ): Promise<{ items: TradeDto[]; nextCursor: string | null }> {
    const marketId = await this.marketIdForSymbol(input.symbol);
    const rows = await tradingRepository.adminListTrades({
      marketId,
      userId: input.userId,
      cursor: input.cursor,
      limit: input.limit,
    });
    const result = this.pageTrades(rows, input.limit, null);
    await this.audit(ctx, TradingAction.ADMIN_LIST_TRADES, 'trade_tape', { count: result.items.length });
    return result;
  },

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------
  async resolveMarket(symbol: string): Promise<ResolvedMarket> {
    const market = await tradingRepository.findMarketBySymbol(symbol);
    if (!market) throw new NotFoundError('Market not found', 'MARKET_NOT_FOUND');
    const decimals = await tradingRepository.assetDecimals([market.baseAsset, market.quoteAsset]);
    return {
      market,
      params: {
        baseScale: decimals.get(market.baseAsset.toUpperCase()) ?? 6,
        quoteScale: decimals.get(market.quoteAsset.toUpperCase()) ?? 2,
      },
    };
  },

  async marketIdForSymbol(symbol?: string): Promise<string | undefined> {
    if (!symbol) return undefined;
    const market = await tradingRepository.findMarketBySymbol(symbol);
    if (!market) throw new NotFoundError('Market not found', 'MARKET_NOT_FOUND');
    return market.id;
  },

  validateAgainstMarket(input: CreateOrderDto, market: Market): void {
    if (input.type === 'LIMIT') {
      const price = dec(input.price ?? '0');
      const quantity = dec(input.quantity ?? '0');
      if (!price.mod(market.tickSize).isZero()) {
        throw new AppError('Price is not a multiple of the tick size', 422, 'INVALID_PRICE');
      }
      if (!quantity.mod(market.stepSize).isZero()) {
        throw new AppError('Quantity is not a multiple of the step size', 422, 'INVALID_QUANTITY');
      }
      if (price.mul(quantity).lt(market.minNotional)) {
        throw new AppError('Order notional is below the market minimum', 422, 'BELOW_MIN_NOTIONAL');
      }
      return;
    }
    if (input.side === 'BUY') {
      if (dec(input.quoteBudget ?? '0').lt(market.minNotional)) {
        throw new AppError('Quote budget is below the market minimum', 422, 'BELOW_MIN_NOTIONAL');
      }
      return;
    }
    const quantity = dec(input.quantity ?? '0');
    if (!quantity.mod(market.stepSize).isZero()) {
      throw new AppError('Quantity is not a multiple of the step size', 422, 'INVALID_QUANTITY');
    }
  },

  pageOrders(
    rows: Array<Order & { market: { symbol: string } }>,
    limit: number,
  ): { items: OrderDto[]; nextCursor: string | null } {
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: slice.map((o) => toOrderDto(o)),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  pageTrades(
    rows: Array<Parameters<typeof toTradeDto>[0]>,
    limit: number,
    viewerUserId: string | null,
  ): { items: TradeDto[]; nextCursor: string | null } {
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: slice.map((t) => toTradeDto(t, viewerUserId)),
      nextCursor: hasMore ? slice[slice.length - 1].seq.toString() : null,
    };
  },

  async assertKycApproved(userId: string): Promise<void> {
    const user = await tradingRepository.findUserKyc(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_INACTIVE');
    }
    if (user.kycStatus !== 'APPROVED' || user.kycTier < 1) {
      throw new ForbiddenError('KYC approval is required to trade', 'KYC_REQUIRED');
    }
  },

  async audit(
    ctx: TradingContext,
    action: string,
    targetType: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'USER',
      actorId: ctx.actorId ?? ctx.userId,
      action,
      entityType: targetType,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: metadata as Prisma.InputJsonValue,
    });
    if (ctx.actorId) {
      await tradingRepository.writeAdminLog({
        adminId: ctx.actorId,
        action,
        targetType,
        ip: ctx.ip,
        requestId: ctx.requestId,
        afterState: metadata as Prisma.InputJsonValue,
      });
    }
  },
};

export type TradingService = typeof tradingService;
