import { describe, it, expect } from 'vitest';
import { applySpread, computePlan } from '../../src/modules/conversion/conversion.types';
import { mockPriceProvider } from '../../src/modules/conversion/providers/price.mock';

describe('applySpread (decimal-safe)', () => {
  it('raises the rate for buying USDT and lowers it for selling', () => {
    expect(applySpread('90.00', 'INR_TO_USDT', 50)).toBe('90.45000000');
    expect(applySpread('90.00', 'USDT_TO_INR', 50)).toBe('89.55000000');
    expect(applySpread('90.00', 'INR_TO_USDT', 0)).toBe('90.00000000');
  });
});

describe('computePlan INR_TO_USDT', () => {
  it('charges an INR fee and converts the net at the locked rate', () => {
    const plan = computePlan({
      side: 'INR_TO_USDT',
      amount: '900',
      rate: '90.45',
      feeBps: 20,
      tdsBps: 100,
    });
    expect(plan.inrAmount).toBe('900.00');
    expect(plan.feeInr).toBe('1.80'); // 900 * 0.2%
    expect(plan.tdsAmount).toBe('0.00'); // no TDS on buy
    // (900 - 1.80) / 90.45, floored to 6dp
    expect(plan.usdtAmount).toBe('9.930348');
    expect(plan.liquidityAsset).toBe('USDT');
    expect(plan.liquidityNeed).toBe('9.930348');
  });
});

describe('computePlan USDT_TO_INR', () => {
  it('withholds platform fee + §194S TDS from the INR proceeds', () => {
    const plan = computePlan({
      side: 'USDT_TO_INR',
      amount: '10',
      rate: '89.55',
      feeBps: 20,
      tdsBps: 100,
    });
    expect(plan.usdtAmount).toBe('10.000000');
    expect(plan.grossInr).toBe('895.50'); // 10 * 89.55
    expect(plan.feeInr).toBe('1.79'); // 895.50 * 0.2%
    expect(plan.tdsAmount).toBe('8.95'); // 895.50 * 1%
    expect(plan.inrAmount).toBe('884.76'); // gross - fee - tds (exact)
    expect(plan.liquidityAsset).toBe('INR');
    expect(plan.liquidityNeed).toBe('895.50');
  });

  it('net + fee + tds always reconcile to gross (ledger stays balanced)', () => {
    const plan = computePlan({
      side: 'USDT_TO_INR',
      amount: '3.333333',
      rate: '88.77',
      feeBps: 20,
      tdsBps: 100,
    });
    const sum =
      Number(plan.inrAmount) + Number(plan.feeInr) + Number(plan.tdsAmount);
    expect(sum.toFixed(2)).toBe(Number(plan.grossInr).toFixed(2));
  });
});

describe('mock price provider', () => {
  it('returns the configured USDT/INR mid as a decimal string', async () => {
    const p = await mockPriceProvider.getMidPrice({ base: 'USDT', quote: 'INR' });
    expect(p.price).toBe('90.00');
    expect(p.base).toBe('USDT');
  });

  it('rejects unsupported pairs', async () => {
    await expect(
      mockPriceProvider.getMidPrice({ base: 'BTC', quote: 'INR' }),
    ).rejects.toThrow();
  });
});
