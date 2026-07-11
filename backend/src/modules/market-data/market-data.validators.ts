import { z } from 'zod';
import { CANDLE_RESOLUTIONS } from './market-data.types';

/** No-dash canonical symbol (e.g. `BTCUSDT`) — distinct from the internal
 * trading module's dash-separated `marketSymbol` (e.g. `USDT-INR`). */
export const marketDataSymbolParamSchema = z.object({
  symbol: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{3,15}$/, 'Invalid symbol')
    .transform((v) => v.toUpperCase()),
});

const MAX_CANDLES_LIMIT = 1000; // mirrors Binance's own per-request cap.

export const candlesQuerySchema = z.object({
  resolution: z.enum(CANDLE_RESOLUTIONS),
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(MAX_CANDLES_LIMIT).default(300),
}).superRefine((v, ctx) => {
  if (v.from !== undefined && v.to !== undefined && v.from > v.to) {
    ctx.addIssue({ code: 'custom', path: ['from'], message: '`from` must be <= `to`' });
  }
});

export type MarketDataSymbolParamDto = z.infer<typeof marketDataSymbolParamSchema>;
export type CandlesQueryDto = z.infer<typeof candlesQuerySchema>;
