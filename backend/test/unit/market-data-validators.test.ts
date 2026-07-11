import { describe, it, expect } from 'vitest';
import {
  candlesQuerySchema,
  marketDataSymbolParamSchema,
} from '../../src/modules/market-data/market-data.validators';

describe('market-data.validators', () => {
  describe('marketDataSymbolParamSchema', () => {
    it('accepts and uppercases a valid symbol', () => {
      expect(marketDataSymbolParamSchema.parse({ symbol: 'btcusdt' })).toEqual({ symbol: 'BTCUSDT' });
    });

    it('rejects a dash (internal trading market format)', () => {
      expect(() => marketDataSymbolParamSchema.parse({ symbol: 'BTC-USDT' })).toThrow();
    });

    it('rejects an empty symbol', () => {
      expect(() => marketDataSymbolParamSchema.parse({ symbol: '' })).toThrow();
    });
  });

  describe('candlesQuerySchema', () => {
    it('accepts every supported resolution', () => {
      for (const resolution of ['1', '5', '15', '30', '60', '240', '1D']) {
        expect(() => candlesQuerySchema.parse({ resolution })).not.toThrow();
      }
    });

    it('rejects an unsupported resolution', () => {
      expect(() => candlesQuerySchema.parse({ resolution: '2' })).toThrow();
    });

    it('defaults limit to 300 and caps it at 1000', () => {
      expect(candlesQuerySchema.parse({ resolution: '1' }).limit).toBe(300);
      expect(() => candlesQuerySchema.parse({ resolution: '1', limit: 5000 })).toThrow();
    });

    it('rejects from > to', () => {
      expect(() =>
        candlesQuerySchema.parse({ resolution: '1', from: 2000, to: 1000 }),
      ).toThrow();
    });

    it('accepts from <= to', () => {
      expect(() =>
        candlesQuerySchema.parse({ resolution: '1', from: 1000, to: 2000 }),
      ).not.toThrow();
    });
  });
});
