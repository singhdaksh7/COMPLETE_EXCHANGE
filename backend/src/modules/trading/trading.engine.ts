import { Prisma, type OrderSide, type OrderType } from '@prisma/client';
import { dec, floorTo, type MarketParams } from './trading.types';

/**
 * Deterministic price-time matching engine — PURE (no I/O, no clock, no random).
 *
 * The caller loads the resting opposite side of the book already sorted by
 * price-time priority and passes it in; this function decides the fills. Because
 * it is side-effect-free it is fully unit-testable and reproducible: the same
 * taker + book always yields the same fills in the same order.
 *
 * Execution price is ALWAYS the resting (maker) order's price — the taker
 * crosses the spread and receives any price improvement. Quantities are floored
 * to the base scale and quote amounts to the quote scale so the figures map
 * exactly onto the ledger's NUMERIC columns.
 */

export interface RestingOrder {
  id: string;
  userId: string;
  /** Resting limit price (maker orders always have a price). */
  price: string;
  /** Open base quantity = quantity − filledQuantity. */
  remaining: string;
}

export interface TakerInput {
  side: OrderSide;
  type: OrderType;
  /** Limit price (LIMIT only). */
  price?: string | null;
  /** Base quantity (LIMIT and MARKET SELL). */
  quantity?: string | null;
  /** Quote budget (MARKET BUY only). */
  quoteBudget?: string | null;
}

export interface EngineFill {
  makerOrderId: string;
  makerUserId: string;
  price: string;
  quantity: string;
  quoteAmount: string;
}

export interface EngineResult {
  fills: EngineFill[];
  /** Total base quantity filled for the taker. */
  filledQuantity: string;
  /** Total quote amount the taker spent (BUY) or received (SELL). */
  quoteTotal: string;
}

/** Does the taker's limit price cross a resting maker at `makerPrice`? */
function crosses(
  takerSide: OrderSide,
  takerPrice: Prisma.Decimal,
  makerPrice: Prisma.Decimal,
): boolean {
  return takerSide === 'BUY'
    ? makerPrice.lte(takerPrice) // buy: pay no more than limit
    : makerPrice.gte(takerPrice); // sell: receive no less than limit
}

export function matchOrder(
  taker: TakerInput,
  book: RestingOrder[],
  params: MarketParams,
): EngineResult {
  const fills: EngineFill[] = [];
  const zero = new Prisma.Decimal(0);

  const isMarket = taker.type === 'MARKET';
  const isBudgetDriven = isMarket && taker.side === 'BUY';

  const takerPrice = taker.price ? dec(taker.price) : null;
  // Remaining capacity, tracked in the taker's native unit.
  let remainingQty = isBudgetDriven ? zero : floorTo(dec(taker.quantity ?? '0'), params.baseScale);
  let remainingBudget = isBudgetDriven
    ? floorTo(dec(taker.quoteBudget ?? '0'), params.quoteScale)
    : zero;

  let filledQuantity = zero;
  let quoteTotal = zero;

  for (const maker of book) {
    const makerPrice = dec(maker.price);

    // LIMIT orders stop as soon as the book no longer crosses their price.
    if (!isMarket && takerPrice && !crosses(taker.side, takerPrice, makerPrice)) {
      break;
    }

    const makerRemaining = floorTo(dec(maker.remaining), params.baseScale);
    if (makerRemaining.lte(zero)) continue;

    let fillQty: Prisma.Decimal;
    if (isBudgetDriven) {
      if (remainingBudget.lte(zero)) break;
      // Largest base qty whose notional fits the remaining budget, at base step.
      const affordable = floorTo(remainingBudget.div(makerPrice), params.baseScale);
      fillQty = Prisma.Decimal.min(makerRemaining, affordable);
    } else {
      if (remainingQty.lte(zero)) break;
      fillQty = Prisma.Decimal.min(makerRemaining, remainingQty);
    }

    if (fillQty.lte(zero)) break;

    const quoteAmount = floorTo(fillQty.mul(makerPrice), params.quoteScale);
    if (quoteAmount.lte(zero)) break; // dust below one quote unit — cannot settle

    fills.push({
      makerOrderId: maker.id,
      makerUserId: maker.userId,
      price: makerPrice.toFixed(),
      quantity: fillQty.toFixed(params.baseScale),
      quoteAmount: quoteAmount.toFixed(params.quoteScale),
    });

    filledQuantity = filledQuantity.add(fillQty);
    quoteTotal = quoteTotal.add(quoteAmount);
    if (isBudgetDriven) {
      remainingBudget = remainingBudget.sub(quoteAmount);
    } else {
      remainingQty = remainingQty.sub(fillQty);
    }
  }

  return {
    fills,
    filledQuantity: filledQuantity.toFixed(params.baseScale),
    quoteTotal: quoteTotal.toFixed(params.quoteScale),
  };
}
