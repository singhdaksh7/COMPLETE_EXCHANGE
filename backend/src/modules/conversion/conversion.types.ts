import {
  Prisma,
  type Conversion,
  type ConversionSide,
  type PriceQuote,
} from '@prisma/client';

export const INR = 'INR';
export const USDT = 'USDT';

const ROUND_DOWN = Prisma.Decimal.ROUND_DOWN;

/** Request-scoped forensic context threaded into the service for auditing. */
export interface ConversionContext {
  userId?: string;
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export const ConversionAction = {
  QUOTE_CREATED: 'conversion.quote_created',
  EXECUTED: 'conversion.executed',
  QUOTE_EXPIRED: 'conversion.quote_expired',
  ADMIN_LIST: 'conversion.admin_list',
} as const;

export const LEDGER_KIND = 'CONVERSION';
export const REFERENCE_TYPE = 'conversion';

/** The fully-computed economics of a conversion (all decimal strings). */
export interface ConversionPlan {
  side: ConversionSide;
  rate: string;
  /** INR leg amount the user nets (received for SELL, spent for BUY). */
  inrAmount: string;
  /** USDT leg amount (received for BUY, spent for SELL). */
  usdtAmount: string;
  feeInr: string;
  tdsAmount: string;
  /** Gross INR before fee/TDS (= inrAmount paid for BUY, = pre-deduction for SELL). */
  grossInr: string;
  /** The asset the platform must disburse from treasury liquidity. */
  liquidityAsset: string;
  /** How much of `liquidityAsset` the platform must hold. */
  liquidityNeed: string;
}

/** Redis-persisted execution snapshot binding an amount to a stored quote. */
export interface QuoteSnapshot {
  quoteId: string;
  userId: string;
  plan: ConversionPlan;
}

export interface QuoteDto {
  id: string;
  side: ConversionSide;
  rate: string;
  spreadBps: number;
  expiresAt: Date;
  /** Preview of the economics for the requested amount. */
  inrAmount: string;
  usdtAmount: string;
  feeInr: string;
  tdsAmount: string;
}

export interface ConversionDto {
  id: string;
  side: ConversionSide;
  inrAmount: string;
  usdtAmount: string;
  rate: string;
  feeInr: string;
  tdsAmount: string;
  createdAt: Date;
}

function dp(value: Prisma.Decimal, places: number): Prisma.Decimal {
  return value.toDecimalPlaces(places, ROUND_DOWN);
}

/**
 * Compute conversion economics with EXACT decimal math. Components are derived
 * so the ledger legs balance to the cent/satoshi: for BUY the INR credits sum to
 * the INR debit; for SELL the INR credits (net + fee + tds) sum to the gross
 * INR debit.
 */
export function computePlan(input: {
  side: ConversionSide;
  amount: string;
  rate: string;
  feeBps: number;
  tdsBps: number;
}): ConversionPlan {
  const rate = new Prisma.Decimal(input.rate);
  const amount = new Prisma.Decimal(input.amount);
  const feeBps = new Prisma.Decimal(input.feeBps);
  const tdsBps = new Prisma.Decimal(input.tdsBps);
  const bps = new Prisma.Decimal(10_000);

  if (input.side === 'INR_TO_USDT') {
    const inrAmount = dp(amount, 2); // INR the user spends
    const feeInr = dp(inrAmount.mul(feeBps).div(bps), 2);
    const netInr = inrAmount.sub(feeInr); // INR converted to USDT
    const usdtAmount = dp(netInr.div(rate), 6);
    return {
      side: input.side,
      rate: rate.toFixed(),
      inrAmount: inrAmount.toFixed(2),
      usdtAmount: usdtAmount.toFixed(6),
      feeInr: feeInr.toFixed(2),
      tdsAmount: '0.00',
      grossInr: inrAmount.toFixed(2),
      liquidityAsset: USDT,
      liquidityNeed: usdtAmount.toFixed(6),
    };
  }

  // USDT_TO_INR — user sells USDT, §194S TDS withheld.
  const usdtAmount = dp(amount, 6);
  const grossInr = dp(usdtAmount.mul(rate), 2);
  const feeInr = dp(grossInr.mul(feeBps).div(bps), 2);
  const tdsAmount = dp(grossInr.mul(tdsBps).div(bps), 2);
  const inrAmount = grossInr.sub(feeInr).sub(tdsAmount); // net INR to user
  return {
    side: input.side,
    rate: rate.toFixed(),
    inrAmount: inrAmount.toFixed(2),
    usdtAmount: usdtAmount.toFixed(6),
    feeInr: feeInr.toFixed(2),
    tdsAmount: tdsAmount.toFixed(2),
    grossInr: grossInr.toFixed(2),
    liquidityAsset: INR,
    liquidityNeed: grossInr.toFixed(2),
  };
}

/** Apply the platform spread to a mid price for the given side (decimal-safe). */
export function applySpread(mid: string, side: ConversionSide, spreadBps: number): string {
  const m = new Prisma.Decimal(mid);
  const factor = new Prisma.Decimal(spreadBps).div(10_000);
  const rate =
    side === 'INR_TO_USDT'
      ? m.mul(new Prisma.Decimal(1).add(factor)) // buy USDT → pay more INR
      : m.mul(new Prisma.Decimal(1).sub(factor)); // sell USDT → get less INR
  return dp(rate, 8).toFixed(8);
}

export function toQuoteDto(row: PriceQuote, plan: ConversionPlan): QuoteDto {
  return {
    id: row.id,
    side: row.side,
    rate: row.rate.toFixed(),
    spreadBps: row.spreadBps,
    expiresAt: row.expiresAt,
    inrAmount: plan.inrAmount,
    usdtAmount: plan.usdtAmount,
    feeInr: plan.feeInr,
    tdsAmount: plan.tdsAmount,
  };
}

export function toConversionDto(row: Conversion): ConversionDto {
  return {
    id: row.id,
    side: row.side,
    inrAmount: row.inrAmount.toFixed(2),
    usdtAmount: row.usdtAmount.toFixed(6),
    rate: row.rate.toFixed(),
    feeInr: row.feeInr.toFixed(2),
    tdsAmount: row.tdsAmount.toFixed(2),
    createdAt: row.createdAt,
  };
}
