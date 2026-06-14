import { z } from 'zod';

/**
 * Decimal STRING validators (never JS floats). Precision against the market's
 * tick/step is enforced in the service against the frozen market row; here we
 * only guarantee a well-formed positive decimal.
 */
const positiveDecimal = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/, 'Must be a decimal string (≤18 dp)')
  .refine((v) => !/^0(?:\.0+)?$/.test(v), 'Must be greater than zero');

const marketSymbol = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/, 'Invalid market symbol (e.g. USDT-INR)')
  .transform((v) => v.toUpperCase());

const orderSide = z.enum(['BUY', 'SELL']);
const orderType = z.enum(['LIMIT', 'MARKET']);
const orderStatus = z.enum([
  'PENDING',
  'OPEN',
  'PARTIALLY_FILLED',
  'FILLED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
]);

export const createOrderSchema = z
  .object({
    symbol: marketSymbol,
    side: orderSide,
    type: orderType,
    // GTC is the only supported time-in-force for now (market orders are IOC
    // internally). Accepting only GTC keeps matching deterministic.
    tif: z.literal('GTC').default('GTC'),
    price: positiveDecimal.optional(),
    quantity: positiveDecimal.optional(),
    quoteBudget: positiveDecimal.optional(),
    clientOrderId: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.type === 'LIMIT') {
      if (!v.price) {
        ctx.addIssue({ code: 'custom', path: ['price'], message: 'LIMIT orders require a price' });
      }
      if (!v.quantity) {
        ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'LIMIT orders require a quantity' });
      }
      if (v.quoteBudget) {
        ctx.addIssue({ code: 'custom', path: ['quoteBudget'], message: 'LIMIT orders must not set quoteBudget' });
      }
      return;
    }
    // MARKET
    if (v.price) {
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'MARKET orders must not set a price' });
    }
    if (v.side === 'BUY') {
      if (!v.quoteBudget) {
        ctx.addIssue({ code: 'custom', path: ['quoteBudget'], message: 'MARKET BUY requires quoteBudget' });
      }
      if (v.quantity) {
        ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'MARKET BUY must not set quantity' });
      }
    } else {
      if (!v.quantity) {
        ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'MARKET SELL requires quantity' });
      }
      if (v.quoteBudget) {
        ctx.addIssue({ code: 'custom', path: ['quoteBudget'], message: 'MARKET SELL must not set quoteBudget' });
      }
    }
  });

export const orderIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const marketSymbolParamSchema = z
  .object({ symbol: marketSymbol })
  .strict();

export const orderBookQuerySchema = z
  .object({ depth: z.coerce.number().int().min(1).max(200).default(50) })
  .strict();

export const openOrdersQuerySchema = z
  .object({
    symbol: marketSymbol.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const orderHistoryQuerySchema = z
  .object({
    symbol: marketSymbol.optional(),
    status: orderStatus.optional(),
    side: orderSide.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const tradeHistoryQuerySchema = z
  .object({
    symbol: marketSymbol.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

// ---------------------------------------------------------------------------
// Public market data — recent trades tape, 24h ticker, OHLCV candles
// ---------------------------------------------------------------------------

export const recentTradesQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
  .strict();

export const candlesQuerySchema = z
  .object({
    interval: z.enum(['1m', '5m', '15m', '1h', '1d']).default('1m'),
    // Number of candles to return, most-recent first window. Capped to bound
    // the on-the-fly aggregation scan over the trades tape.
    limit: z.coerce.number().int().min(1).max(1000).default(200),
  })
  .strict();

export const adminOrderQuerySchema = z
  .object({
    symbol: marketSymbol.optional(),
    status: orderStatus.optional(),
    side: orderSide.optional(),
    userId: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const adminTradeQuerySchema = z
  .object({
    symbol: marketSymbol.optional(),
    userId: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type CreateOrderDto = z.infer<typeof createOrderSchema>;
export type OrderIdParamDto = z.infer<typeof orderIdParamSchema>;
export type MarketSymbolParamDto = z.infer<typeof marketSymbolParamSchema>;
export type OrderBookQueryDto = z.infer<typeof orderBookQuerySchema>;
export type OpenOrdersQueryDto = z.infer<typeof openOrdersQuerySchema>;
export type OrderHistoryQueryDto = z.infer<typeof orderHistoryQuerySchema>;
export type TradeHistoryQueryDto = z.infer<typeof tradeHistoryQuerySchema>;
export type RecentTradesQueryDto = z.infer<typeof recentTradesQuerySchema>;
export type CandlesQueryDto = z.infer<typeof candlesQuerySchema>;
export type AdminOrderQueryDto = z.infer<typeof adminOrderQuerySchema>;
export type AdminTradeQueryDto = z.infer<typeof adminTradeQuerySchema>;
