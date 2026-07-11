import { config } from '../../../config';
import { createBinanceProvider } from './binance.provider';
import { createCoinGeckoProvider } from './coingecko.provider';
import type { MarketDataProvider, MarketDataSourceName } from '../market-data.types';

/**
 * Provider resolver (mirrors the pattern in `modules/conversion/providers` /
 * `modules/scanner/providers`) — memoized singletons so start()/stop() and
 * in-memory state are shared across every caller in the process.
 */

let binance: MarketDataProvider | undefined;
let coingecko: MarketDataProvider | undefined;

export function getBinanceProvider(): MarketDataProvider {
  if (!binance) {
    binance = createBinanceProvider({
      restBase: config.marketData.binance.restBase,
      wsBase: config.marketData.binance.wsBase,
      staleMs: config.marketData.binance.tickerStaleMs,
    });
  }
  return binance;
}

export function getCoinGeckoProvider(): MarketDataProvider {
  if (!coingecko) {
    coingecko = createCoinGeckoProvider({
      apiBase: config.marketData.coingecko.apiBase,
      apiKey: config.marketData.coingecko.demoApiKey,
      pollMs: config.marketData.coingecko.pollMs,
      staleMs: config.marketData.coingecko.staleMs,
    });
  }
  return coingecko;
}

export function listProviders(): MarketDataProvider[] {
  return [getBinanceProvider(), getCoinGeckoProvider()];
}

export function providerForSource(source: MarketDataSourceName): MarketDataProvider {
  return source === 'BINANCE' ? getBinanceProvider() : getCoinGeckoProvider();
}

/** Test helper: drop memoized providers so config changes take effect. */
export function resetProviders(): void {
  binance = undefined;
  coingecko = undefined;
}
