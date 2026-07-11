import { describe, it, expect } from 'vitest';
import {
  SYMBOL_REGISTRY,
  SUPPORTED_SYMBOLS,
  getSymbolMeta,
  isSupportedSymbol,
  listSymbolMeta,
  symbolsForSource,
} from '../../src/modules/market-data/symbol-registry';

describe('market-data symbol registry', () => {
  it('exposes exactly the four required canonical symbols', () => {
    expect(SUPPORTED_SYMBOLS.sort()).toEqual(['BNBUSDT', 'BTCUSDT', 'ETHUSDT', 'USDTINR'].sort());
  });

  it('uses no-dash canonical symbols, distinct from the internal trading market format', () => {
    for (const symbol of SUPPORTED_SYMBOLS) {
      expect(symbol).not.toContain('-');
    }
  });

  it('routes BTC/ETH/BNB to Binance and USDT/INR to CoinGecko', () => {
    expect(symbolsForSource('BINANCE').sort()).toEqual(['BNBUSDT', 'BTCUSDT', 'ETHUSDT'].sort());
    expect(symbolsForSource('COINGECKO')).toEqual(['USDTINR']);
  });

  it('marks USDTINR as REFERENCE and the rest as TRADABLE_REFERENCE', () => {
    expect(SYMBOL_REGISTRY.USDTINR.marketDataType).toBe('REFERENCE');
    expect(SYMBOL_REGISTRY.BTCUSDT.marketDataType).toBe('TRADABLE_REFERENCE');
    expect(SYMBOL_REGISTRY.ETHUSDT.marketDataType).toBe('TRADABLE_REFERENCE');
    expect(SYMBOL_REGISTRY.BNBUSDT.marketDataType).toBe('TRADABLE_REFERENCE');
  });

  it('isSupportedSymbol / getSymbolMeta agree and reject unknown symbols', () => {
    expect(isSupportedSymbol('BTCUSDT')).toBe(true);
    expect(getSymbolMeta('BTCUSDT')).not.toBeNull();
    expect(isSupportedSymbol('DOGEUSDT')).toBe(false);
    expect(getSymbolMeta('DOGEUSDT')).toBeNull();
    expect(isSupportedSymbol('BTC-USDT')).toBe(false); // internal trading format must not leak in here
  });

  it('listSymbolMeta returns one entry per supported symbol', () => {
    expect(listSymbolMeta()).toHaveLength(SUPPORTED_SYMBOLS.length);
  });
});
