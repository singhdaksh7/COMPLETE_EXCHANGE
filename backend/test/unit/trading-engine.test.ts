import { describe, it, expect } from 'vitest';
import { matchOrder, type RestingOrder } from '../../src/modules/trading/trading.engine';
import {
  computeFee,
  computeLockRequirement,
  dec,
  type MarketParams,
} from '../../src/modules/trading/trading.types';

const PARAMS: MarketParams = { baseScale: 6, quoteScale: 2 };

const asks: RestingOrder[] = [
  { id: 'a1', userId: 'u2', price: '90.00', remaining: '2' },
  { id: 'a2', userId: 'u3', price: '90.50', remaining: '2' },
  { id: 'a3', userId: 'u4', price: '92.00', remaining: '5' },
];

const bids: RestingOrder[] = [
  { id: 'b1', userId: 'u2', price: '89.00', remaining: '2' },
  { id: 'b2', userId: 'u3', price: '88.00', remaining: '5' },
];

describe('matchOrder — LIMIT BUY (price-time, partial cross)', () => {
  it('fills asks up to the limit price and stops when the book no longer crosses', () => {
    const r = matchOrder(
      { side: 'BUY', type: 'LIMIT', price: '91.00', quantity: '5' },
      asks,
      PARAMS,
    );
    expect(r.fills).toHaveLength(2);
    expect(r.fills[0]).toMatchObject({ makerOrderId: 'a1', price: '90', quantity: '2.000000', quoteAmount: '180.00' });
    expect(r.fills[1]).toMatchObject({ makerOrderId: 'a2', price: '90.5', quantity: '2.000000', quoteAmount: '181.00' });
    expect(r.filledQuantity).toBe('4.000000');
    expect(r.quoteTotal).toBe('361.00');
  });

  it('does not match when the limit price is below the best ask', () => {
    const r = matchOrder({ side: 'BUY', type: 'LIMIT', price: '89.00', quantity: '5' }, asks, PARAMS);
    expect(r.fills).toHaveLength(0);
    expect(r.filledQuantity).toBe('0.000000');
  });

  it('respects price-time priority for equal-priced makers (first wins)', () => {
    const equal: RestingOrder[] = [
      { id: 'old', userId: 'u2', price: '90.00', remaining: '1' },
      { id: 'new', userId: 'u3', price: '90.00', remaining: '1' },
    ];
    const r = matchOrder({ side: 'BUY', type: 'LIMIT', price: '90.00', quantity: '1' }, equal, PARAMS);
    expect(r.fills).toHaveLength(1);
    expect(r.fills[0].makerOrderId).toBe('old');
  });
});

describe('matchOrder — MARKET BUY (budget-driven)', () => {
  it('spends the quote budget across levels and never exceeds it', () => {
    // 361 exactly clears the first two levels (180 + 181) with nothing left to
    // afford the 92.00 level.
    const r = matchOrder(
      { side: 'BUY', type: 'MARKET', quoteBudget: '361.00' },
      asks,
      PARAMS,
    );
    expect(r.fills).toHaveLength(2);
    expect(r.filledQuantity).toBe('4.000000');
    expect(r.quoteTotal).toBe('361.00');
    expect(dec(r.quoteTotal).lte(dec('361.00'))).toBe(true);
  });

  it('partially consumes a level when the budget runs out mid-level', () => {
    const r = matchOrder({ side: 'BUY', type: 'MARKET', quoteBudget: '370.00' }, asks, PARAMS);
    // 180 + 181 = 361 spent, then 9 buys 0.097826 USDT at 92.00.
    expect(r.fills).toHaveLength(3);
    expect(dec(r.quoteTotal).lte(dec('370.00'))).toBe(true);
    expect(r.fills[2]).toMatchObject({ makerOrderId: 'a3', price: '92' });
  });

  it('caps the fill quantity by the affordable amount at the step size', () => {
    const r = matchOrder({ side: 'BUY', type: 'MARKET', quoteBudget: '90.00' }, asks, PARAMS);
    expect(r.fills).toHaveLength(1);
    expect(r.fills[0]).toMatchObject({ makerOrderId: 'a1', quantity: '1.000000', quoteAmount: '90.00' });
  });
});

describe('matchOrder — SELL', () => {
  it('MARKET SELL fills bids high→low by quantity', () => {
    const r = matchOrder({ side: 'SELL', type: 'MARKET', quantity: '3' }, bids, PARAMS);
    expect(r.fills).toHaveLength(2);
    expect(r.fills[0]).toMatchObject({ makerOrderId: 'b1', price: '89', quantity: '2.000000', quoteAmount: '178.00' });
    expect(r.fills[1]).toMatchObject({ makerOrderId: 'b2', price: '88', quantity: '1.000000', quoteAmount: '88.00' });
    expect(r.quoteTotal).toBe('266.00');
  });

  it('LIMIT SELL stops when the best bid is below the limit price', () => {
    const r = matchOrder({ side: 'SELL', type: 'LIMIT', price: '90.00', quantity: '4' }, bids, PARAMS);
    expect(r.fills).toHaveLength(0);
    expect(r.filledQuantity).toBe('0.000000');
  });

  it('LIMIT SELL partially fills when the book is thinner than the order', () => {
    const r = matchOrder({ side: 'SELL', type: 'LIMIT', price: '88.00', quantity: '10' }, bids, PARAMS);
    expect(r.filledQuantity).toBe('7.000000'); // 2 + 5 available
    expect(r.quoteTotal).toBe('618.00'); // 178 + 440
  });
});

describe('computeLockRequirement', () => {
  it('SELL locks the base quantity (USDT)', () => {
    expect(computeLockRequirement({ side: 'SELL', type: 'LIMIT', quantity: '5' }, PARAMS)).toEqual({
      asset: 'USDT',
      amount: '5.000000',
    });
  });

  it('LIMIT BUY locks the notional rounded UP to the quote scale', () => {
    expect(computeLockRequirement({ side: 'BUY', type: 'LIMIT', price: '91.00', quantity: '5' }, PARAMS)).toEqual({
      asset: 'INR',
      amount: '455.00',
    });
    // Sub-cent notional rounds up so the lock always covers worst-case spend.
    expect(computeLockRequirement({ side: 'BUY', type: 'LIMIT', price: '90.005', quantity: '1' }, PARAMS)).toEqual({
      asset: 'INR',
      amount: '90.01',
    });
  });

  it('MARKET BUY locks the quote budget', () => {
    expect(computeLockRequirement({ side: 'BUY', type: 'MARKET', quoteBudget: '100' }, PARAMS)).toEqual({
      asset: 'INR',
      amount: '100.00',
    });
  });
});

describe('computeFee', () => {
  it('floors the fee to the asset scale', () => {
    expect(computeFee(dec('100'), 20, 6).toFixed()).toBe('0.2');
    expect(computeFee(dec('181'), 10, 2).toFixed()).toBe('0.18');
    expect(computeFee(dec('900'), 10, 2).toFixed()).toBe('0.9');
  });
});
