import {
  Prisma,
  type Market,
  type MarketStatus,
  type Order,
  type OrderSide,
  type OrderStatus,
  type OrderType,
  type TimeInForce,
  type Trade,
} from '@prisma/client';

/**
 * Spot trading shared types + PURE economics.
 *
 * Mirrors the conversion module's split: this file holds DTO shapes, stable
 * action/kind constants, and side-effect-free decimal math (lock sizing, fee
 * computation, tick/step validation). The order-matching loop lives in
 * trading.engine.ts; both are unit-testable without a database.
 *
 * Money invariants (frozen schema §Orders/Trades):
 *   - USDT/INR only for now (base = USDT, quote = INR; price = INR per USDT).
 *   - BUY locks the QUOTE asset (INR); SELL locks the BASE asset (USDT).
 *   - MARKET BUY is budget-driven (quote_budget); MARKET SELL is quantity-driven.
 *   - All amounts are decimal STRINGS — never JS floats.
 */

export const BASE_ASSET = 'USDT';
export const QUOTE_ASSET = 'INR';
export const DEFAULT_MARKET_SYMBOL = 'USDT-INR';

const ROUND_DOWN = Prisma.Decimal.ROUND_DOWN;
const ROUND_UP = Prisma.Decimal.ROUND_UP;
const BPS = new Prisma.Decimal(10_000);

export const REFERENCE_TYPE = {
  ORDER_LOCK: 'order_lock',
  ORDER_UNLOCK: 'order_unlock',
  TRADE: 'trade',
} as const;

export const LEDGER_KIND = {
  ORDER_LOCK: 'ORDER_LOCK',
  ORDER_UNLOCK: 'ORDER_UNLOCK',
  TRADE_SETTLE: 'TRADE_SETTLE',
} as const;

export const TradingAction = {
  ORDER_CREATED: 'trading.order_created',
  ORDER_REJECTED: 'trading.order_rejected',
  ORDER_CANCELLED: 'trading.order_cancelled',
  ORDER_FILLED: 'trading.order_filled',
  TRADE_EXECUTED: 'trading.trade_executed',
  ADMIN_LIST_MARKETS: 'trading.admin_list_markets',
  ADMIN_LIST_ORDERS: 'trading.admin_list_orders',
  ADMIN_LIST_TRADES: 'trading.admin_list_trades',
} as const;

export type DecimalString = string;

/** Request-scoped forensic context threaded into the service for auditing. */
export interface TradingContext {
  userId?: string;
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Asset precision for a market, derived from the assets reference table. */
export interface MarketParams {
  baseScale: number; // base asset decimals (USDT = 6)
  quoteScale: number; // quote asset decimals (INR = 2)
}

export interface MarketDto {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: MarketStatus;
  tickSize: string;
  stepSize: string;
  minNotional: string;
  makerFeeBps: number;
  takerFeeBps: number;
}

export interface OrderFillDto {
  tradeId: string;
  price: string;
  quantity: string;
  quoteAmount: string;
}

export interface OrderDto {
  id: string;
  marketSymbol: string;
  side: OrderSide;
  type: OrderType;
  tif: TimeInForce;
  price: string | null;
  quantity: string | null;
  quoteBudget: string | null;
  filledQuantity: string;
  quoteSpent: string;
  lockedAsset: string | null;
  lockedAmount: string | null;
  status: OrderStatus;
  clientOrderId: string | null;
  createdAt: Date;
  closedAt: Date | null;
  fills?: OrderFillDto[];
}

export interface TradeDto {
  id: string;
  marketSymbol: string;
  price: string;
  quantity: string;
  quoteAmount: string;
  side: OrderSide; // the viewer's side in this trade (when user-scoped)
  role: 'MAKER' | 'TAKER' | null; // the viewer's role (when user-scoped)
  fee: string | null; // the viewer's fee (when user-scoped)
  feeAsset: string | null;
  makerSide: OrderSide;
  executedAt: Date;
}

export interface OrderBookLevel {
  price: string;
  quantity: string;
}

export interface OrderBookDto {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

// ============================================================================
// PUBLIC MARKET DATA — recent trades tape, 24h ticker, OHLCV candles
//
// These are derived, READ-ONLY projections of the public `trades` tape. They
// expose ONLY public fields (price/quantity/time) — never user ids, fees, or
// order ownership. For the MVP candles + ticker are computed on the fly from
// `trades`; the `candles`/`market_tickers` tables exist in the schema for a
// future pre-aggregation worker (see trading.repository → candlesFromTrades).
// ============================================================================

/** Public candle intervals the API accepts (mapped to bucket seconds below). */
export const CANDLE_INTERVALS = ['1m', '5m', '15m', '1h', '1d'] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

/** Bucket width in seconds for each public interval. */
export const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '1d': 86_400,
};

/** A single public tape print — no user/fee data. `side` is the maker's side,
 * matching the `trade.executed` socket event so clients can append either. */
export interface PublicTradeDto {
  id: string;
  price: string;
  quantity: string;
  side: OrderSide;
  executedAt: Date;
}

export interface CandleDto {
  openTime: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  baseVolume: string; // base traded (USDT)
  quoteVolume: string; // quote traded (INR)
  tradeCount: number;
}

export interface CandlesDto {
  symbol: string;
  interval: CandleInterval;
  candles: CandleDto[];
}

export interface TickerDto {
  symbol: string;
  lastPrice: string | null;
  high24h: string | null;
  low24h: string | null;
  open24h: string | null;
  priceChange: string; // lastPrice − open24h (quote)
  priceChangePct: string; // percent, 2dp
  baseVolume24h: string;
  quoteVolume24h: string;
  tradeCount24h: number;
}

export function dec(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** Round to N decimal places, truncating toward zero (never over-credits). */
export function floorTo(value: Prisma.Decimal, places: number): Prisma.Decimal {
  return value.toDecimalPlaces(places, ROUND_DOWN);
}

/** Round UP to N places — used to size locks so they always cover execution. */
export function ceilTo(value: Prisma.Decimal, places: number): Prisma.Decimal {
  return value.toDecimalPlaces(places, ROUND_UP);
}

/**
 * The exact asset + amount a new order must reserve from USER_AVAILABLE into
 * USER_LOCKED. BUY locks INR, SELL locks USDT. MARKET BUY locks the budget.
 *
 * The BUY notional is rounded UP to the quote scale so the lock can never be a
 * sub-cent short of the worst-case spend; the surplus is released on close.
 */
export function computeLockRequirement(
  input: {
    side: OrderSide;
    type: OrderType;
    price?: string | null;
    quantity?: string | null;
    quoteBudget?: string | null;
  },
  params: MarketParams,
): { asset: string; amount: string } {
  if (input.side === 'SELL') {
    // SELL always locks the base quantity (USDT), exact at base scale.
    const qty = floorTo(dec(input.quantity ?? '0'), params.baseScale);
    return { asset: BASE_ASSET, amount: qty.toFixed(params.baseScale) };
  }

  // BUY locks INR.
  if (input.type === 'MARKET') {
    const budget = floorTo(dec(input.quoteBudget ?? '0'), params.quoteScale);
    return { asset: QUOTE_ASSET, amount: budget.toFixed(params.quoteScale) };
  }
  const notional = dec(input.price ?? '0').mul(dec(input.quantity ?? '0'));
  return {
    asset: QUOTE_ASSET,
    amount: ceilTo(notional, params.quoteScale).toFixed(params.quoteScale),
  };
}

/** Fee on a received amount at a bps rate, floored to the asset scale. */
export function computeFee(
  received: Prisma.Decimal,
  bps: number,
  scale: number,
): Prisma.Decimal {
  return floorTo(received.mul(new Prisma.Decimal(bps)).div(BPS), scale);
}

export function toMarketDto(m: Market): MarketDto {
  return {
    symbol: m.symbol,
    baseAsset: m.baseAsset,
    quoteAsset: m.quoteAsset,
    status: m.status,
    tickSize: m.tickSize.toFixed(),
    stepSize: m.stepSize.toFixed(),
    minNotional: m.minNotional.toFixed(),
    makerFeeBps: m.makerFeeBps,
    takerFeeBps: m.takerFeeBps,
  };
}

export function toOrderDto(
  order: Order & { market?: { symbol: string } },
  fills?: OrderFillDto[],
): OrderDto {
  return {
    id: order.id,
    marketSymbol: order.market?.symbol ?? '',
    side: order.side,
    type: order.type,
    tif: order.tif,
    price: order.price ? order.price.toFixed() : null,
    quantity: order.quantity ? order.quantity.toFixed() : null,
    quoteBudget: order.quoteBudget ? order.quoteBudget.toFixed() : null,
    filledQuantity: order.filledQuantity.toFixed(),
    quoteSpent: order.quoteSpent.toFixed(),
    lockedAsset: order.lockedAsset ?? null,
    lockedAmount: order.lockedAmount ? order.lockedAmount.toFixed() : null,
    status: order.status,
    clientOrderId: order.clientOrderId ?? null,
    createdAt: order.createdAt,
    closedAt: order.closedAt ?? null,
    ...(fills ? { fills } : {}),
  };
}

/**
 * Render a trade from a viewer's perspective. When `viewerUserId` is provided we
 * annotate the viewer's side/role/fee; admin monitoring passes null for a raw view.
 */
export function toTradeDto(
  trade: Trade & { market?: { symbol: string } },
  viewerUserId: string | null,
): TradeDto {
  const isMaker = viewerUserId != null && trade.makerUserId === viewerUserId;
  const isTaker = viewerUserId != null && trade.takerUserId === viewerUserId;
  // makerSide is the maker's side; the taker's side is the opposite.
  const viewerSide: OrderSide | null = isMaker
    ? trade.makerSide
    : isTaker
      ? trade.makerSide === 'BUY'
        ? 'SELL'
        : 'BUY'
      : null;
  const fee = isMaker ? trade.makerFee : isTaker ? trade.takerFee : null;
  // The fee is charged on the asset the side RECEIVES: buyers receive base
  // (USDT), sellers receive quote (INR).
  const feeAsset =
    viewerSide === 'BUY' ? BASE_ASSET : viewerSide === 'SELL' ? QUOTE_ASSET : null;
  return {
    id: trade.id,
    marketSymbol: trade.market?.symbol ?? '',
    price: trade.price.toFixed(),
    quantity: trade.quantity.toFixed(),
    quoteAmount: trade.quoteAmount.toFixed(),
    side: viewerSide ?? trade.makerSide,
    role: isMaker ? 'MAKER' : isTaker ? 'TAKER' : null,
    fee: fee ? fee.toFixed() : null,
    feeAsset,
    makerSide: trade.makerSide,
    executedAt: trade.executedAt,
  };
}

// ----------------------------------------------------------------------------
// Public market-data mappers
// ----------------------------------------------------------------------------

/** Public tape row → DTO. Only public columns are read by the repository. */
export function toPublicTradeDto(
  row: { id: string; price: Prisma.Decimal; quantity: Prisma.Decimal; makerSide: OrderSide; executedAt: Date },
  params: MarketParams,
): PublicTradeDto {
  return {
    id: row.id,
    price: row.price.toFixed(params.quoteScale),
    quantity: row.quantity.toFixed(params.baseScale),
    side: row.makerSide,
    executedAt: row.executedAt,
  };
}

/** Raw aggregate row from the candle bucket query (decimals come back as text). */
export interface CandleRow {
  open_time: Date;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  base_volume: string | null;
  quote_volume: string | null;
  trade_count: number;
}

/** Raw 24h aggregate row from the ticker window query (decimals as text). */
export interface TickerWindowRow {
  trade_count: number;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  base_volume: string | null;
  quote_volume: string | null;
}

export function toCandleDto(row: CandleRow, params: MarketParams): CandleDto {
  const q = params.quoteScale;
  const b = params.baseScale;
  return {
    openTime: row.open_time,
    open: dec(row.open ?? '0').toFixed(q),
    high: dec(row.high ?? '0').toFixed(q),
    low: dec(row.low ?? '0').toFixed(q),
    close: dec(row.close ?? '0').toFixed(q),
    baseVolume: dec(row.base_volume ?? '0').toFixed(b),
    quoteVolume: dec(row.quote_volume ?? '0').toFixed(q),
    tradeCount: row.trade_count,
  };
}
