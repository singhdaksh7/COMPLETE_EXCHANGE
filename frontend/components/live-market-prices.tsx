'use client';

import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { useMarketDataRealtime } from '@/lib/use-market-data-realtime';
import type { MarketDataTickerLookup } from '@/lib/types';

/**
 * Live reference prices for BTC/USDT, ETH/USDT, BNB/USDT and USDT/INR
 * (Goal 11) — sourced from EXORA's own `/market-data` API/stream (Binance +
 * CoinGecko upstream), never called directly from the browser.
 *
 * These assets are NOT tradable on EXORA today (crypto execution stays off
 * — see `CRYPTO_*_GLOBAL_ENABLED`), so this panel is informational only and
 * deliberately has no "Trade" CTA, unlike the sandbox USDT-INR market table
 * below it.
 */
const DISPLAY_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'USDTINR'];

function formatPrice(price: string, quoteAsset: string): string {
  const n = Number(price);
  if (!Number.isFinite(n)) return '—';
  const prefix = quoteAsset === 'INR' ? '₹' : quoteAsset === 'USDT' ? '$' : '';
  return `${prefix}${n.toLocaleString('en-IN', { maximumFractionDigits: quoteAsset === 'INR' && prefix === '₹' ? 4 : 2 })}`;
}

function Row({ row }: { row: MarketDataTickerLookup }) {
  const symbol = row.available ? row.ticker.symbol : row.symbol;
  const displaySymbol = `${symbol.replace(/(USDT|INR)$/, '/$1')}`;

  if (!row.available) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.01] px-4 py-3">
        <span className="text-xs font-bold text-white/70 font-mono">{displaySymbol}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">Unavailable</span>
      </div>
    );
  }

  const { ticker } = row;
  const changePct = ticker.change24hPercent ? Number(ticker.change24hPercent) : null;
  const up = changePct !== null && changePct >= 0;

  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.01] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-white font-mono">{displaySymbol}</span>
        {ticker.stale && (
          <span
            title="No fresh update recently — showing last known price"
            className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300"
          >
            Stale
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs font-bold text-white">
          {formatPrice(ticker.price, ticker.quoteAsset)}
        </span>
        {changePct !== null && (
          <span className={`font-mono text-[10px] font-bold ${up ? 'text-up' : 'text-down'}`}>
            {up ? '+' : ''}
            {changePct.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
}

export function LiveMarketPrices() {
  const q = useQuery({
    queryKey: ['market-data-tickers'],
    queryFn: () => userApi.marketDataTickers(),
    // REST fallback cadence — the socket subscription (below) supersedes this
    // whenever connected, per Goal 11 "live updates" + "reconnect handling".
    refetchInterval: 15_000,
  });

  const { connected } = useMarketDataRealtime(DISPLAY_SYMBOLS);

  const rows = q.data?.data.items ?? [];

  return (
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3 overflow-hidden">
      <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />
      <div className="relative z-10 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white tracking-tight">Live Reference Prices</h2>
        <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-white/35">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-up' : 'bg-white/20'}`} />
          {connected ? 'Live' : 'Polling'}
        </span>
      </div>
      <p className="relative z-10 text-[10px] text-white/40">
        External reference prices only — not tradable on EXORA yet.
      </p>

      {q.isLoading && (
        <div className="relative z-10 space-y-2">
          {DISPLAY_SYMBOLS.map((s) => (
            <div key={s} className="h-11 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      )}

      {q.isError && (
        <div className="relative z-10 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-[10px] text-red-300">
          Live prices are temporarily unavailable.
        </div>
      )}

      {!q.isLoading && !q.isError && (
        <div className="relative z-10 space-y-2">
          {rows.map((row) => (
            <Row key={row.available ? row.ticker.symbol : row.symbol} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
