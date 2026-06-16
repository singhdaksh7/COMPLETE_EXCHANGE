import { describe, it, expect, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  RESOLUTION_SECONDS,
  normalizeSymbol,
  priceScaleFromTick,
  resolutionToSeconds,
  tvConfig,
} from '../../src/modules/tradingview/tradingview.types';
import {
  REALTIME_EVENT,
  realtimeBus,
} from '../../src/realtime/events';
import {
  activeBarSubscriptions,
  subscribeBars,
  unsubscribeBars,
  type TvBar,
} from '../../src/modules/tradingview/tradingview.stream';

const D = (v: string): Prisma.Decimal => new Prisma.Decimal(v);

describe('TradingView resolution mapping', () => {
  it('maps every supported resolution to the right bucket seconds', () => {
    expect(resolutionToSeconds('1')).toBe(60);
    expect(resolutionToSeconds('5')).toBe(300);
    expect(resolutionToSeconds('15')).toBe(900);
    expect(resolutionToSeconds('30')).toBe(1800);
    expect(resolutionToSeconds('60')).toBe(3600);
    expect(resolutionToSeconds('240')).toBe(14400);
    expect(resolutionToSeconds('1D')).toBe(86400);
    expect(resolutionToSeconds('D')).toBe(86400); // alias
  });

  it('returns null for an unknown resolution', () => {
    expect(resolutionToSeconds('2h')).toBeNull();
    expect(resolutionToSeconds('W')).toBeNull();
  });

  it('config advertises exactly the supported resolutions', () => {
    expect(tvConfig().supported_resolutions).toEqual(['1', '5', '15', '30', '60', '240', '1D']);
    expect(Object.keys(RESOLUTION_SECONDS)).toContain('240');
  });
});

describe('TradingView pricescale derivation from tick size', () => {
  it('derives pricescale + minmov from the tick size', () => {
    expect(priceScaleFromTick(D('0.01'))).toEqual({ pricescale: 100, minmov: 1 });
    expect(priceScaleFromTick(D('0.001'))).toEqual({ pricescale: 1000, minmov: 1 });
    expect(priceScaleFromTick(D('0.005'))).toEqual({ pricescale: 1000, minmov: 5 });
    expect(priceScaleFromTick(D('1'))).toEqual({ pricescale: 1, minmov: 1 });
  });
});

describe('TradingView symbol normalization', () => {
  it('strips an EXCHANGE: prefix and upper-cases', () => {
    expect(normalizeSymbol('MyExchange:btc-usdt')).toBe('BTC-USDT');
    expect(normalizeSymbol('BTC-USDT')).toBe('BTC-USDT');
    expect(normalizeSymbol('  eth-usdt ')).toBe('ETH-USDT');
  });
});

describe('TradingView streaming prep (subscribeBars/unsubscribeBars)', () => {
  afterEach(() => {
    unsubscribeBars('uid-1');
  });

  it('subscribes, aggregates a trade.executed into a bar, then unsubscribes', () => {
    const bars: TvBar[] = [];
    const ok = subscribeBars({
      symbol: 'BTC-USDT',
      resolution: '1',
      subscriberUID: 'uid-1',
      onBar: (b) => bars.push(b),
    });
    expect(ok).toBe(true);
    expect(activeBarSubscriptions()).toBe(1);

    realtimeBus.emit(REALTIME_EVENT.TRADE_EXECUTED, {
      symbol: 'BTC-USDT',
      trade: { id: 't1', price: '100.5', quantity: '2', makerSide: 'SELL', executedAt: new Date() },
    });
    // A trade for a different market is ignored.
    realtimeBus.emit(REALTIME_EVENT.TRADE_EXECUTED, {
      symbol: 'ETH-USDT',
      trade: { id: 't2', price: '50', quantity: '1', makerSide: 'BUY', executedAt: new Date() },
    });

    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ open: 100.5, high: 100.5, low: 100.5, close: 100.5, volume: 2 });

    unsubscribeBars('uid-1');
    expect(activeBarSubscriptions()).toBe(0);
    // After unsubscribe no further bars are produced.
    realtimeBus.emit(REALTIME_EVENT.TRADE_EXECUTED, {
      symbol: 'BTC-USDT',
      trade: { id: 't3', price: '101', quantity: '1', makerSide: 'SELL', executedAt: new Date() },
    });
    expect(bars).toHaveLength(1);
  });

  it('refuses an unknown resolution', () => {
    expect(subscribeBars({ symbol: 'BTC-USDT', resolution: 'W', subscriberUID: 'uid-1', onBar: () => {} })).toBe(false);
    expect(activeBarSubscriptions()).toBe(0);
  });
});
