'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * TEMPORARY chart presentation layer using TradingView's free hosted
 * "Advanced Chart" widget (embed-widget-advanced-chart.js).
 *
 * This is NOT the licensed TradingView Advanced Charts library and does NOT
 * use EXORA's prepared Datafeed API (`frontend/lib/tradingview/datafeed-adapter.ts`)
 * — that adapter is untouched and stays reserved for the later licensed
 * integration. This widget renders TradingView-hosted market data in an
 * iframe-like embed; EXORA's own live-price cards (`LiveMarketPrices`,
 * EXORA `/market-data` API) remain the source of truth for EXORA prices and
 * are rendered separately, never fed into this widget.
 *
 * Only a hardcoded allowlist of symbols is supported — no free-text/user
 * input ever reaches the TradingView symbol field.
 */

const SYMBOL_MAP = {
  'BTC/USDT': { tv: 'BINANCE:BTCUSDT', attributionPath: 'BTCUSDT' },
  'ETH/USDT': { tv: 'BINANCE:ETHUSDT', attributionPath: 'ETHUSDT' },
  'BNB/USDT': { tv: 'BINANCE:BNBUSDT', attributionPath: 'BNBUSDT' },
} as const;

export type ExoraChartSymbol = keyof typeof SYMBOL_MAP;
const SYMBOLS = Object.keys(SYMBOL_MAP) as ExoraChartSymbol[];

const EMBED_SCRIPT_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

function buildConfig(symbol: ExoraChartSymbol) {
  return {
    autosize: true,
    symbol: SYMBOL_MAP[symbol].tv,
    interval: '5',
    timezone: 'Asia/Kolkata',
    theme: 'dark',
    style: '1',
    locale: 'en',
    backgroundColor: '#0B0B0D', // EXORA noir
    gridColor: 'rgba(245, 194, 66, 0.08)', // EXORA gold, low opacity
    allow_symbol_change: false, // EXORA's own tabs control the symbol, not the embedded widget
    calendar: false,
    details: false,
    hide_side_toolbar: false, // keep drawing/indicator tools available
    hide_top_toolbar: false,
    hide_legend: false,
    hide_volume: false,
    hotlist: false,
    save_image: true,
    withdateranges: true,
    support_host: 'https://www.tradingview.com',
  };
}

/** Renders the widget into `container` for `symbol`, replacing any prior content. */
function mountWidget(container: HTMLDivElement, symbol: ExoraChartSymbol): void {
  container.innerHTML = ''; // clear before reinitializing — no duplicate widgets

  const widgetDiv = document.createElement('div');
  widgetDiv.className = 'tradingview-widget-container__widget';
  widgetDiv.style.height = '100%';
  widgetDiv.style.width = '100%';
  container.appendChild(widgetDiv);

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = EMBED_SCRIPT_SRC;
  script.async = true;
  script.innerHTML = JSON.stringify(buildConfig(symbol));
  container.appendChild(script);
}

export function TradingViewFreeChart() {
  const [symbol, setSymbol] = useState<ExoraChartSymbol>('BTC/USDT');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    mountWidget(container, symbol);
    // Cleanup runs on symbol change AND unmount — also guards against React
    // Strict Mode's mount→unmount→mount double-invoke leaving a duplicate
    // widget behind (mountWidget always clears first, but clearing here too
    // means an interrupted mount never leaves an orphaned script/iframe).
    return () => {
      container.innerHTML = '';
    };
  }, [symbol]);

  const attribution = SYMBOL_MAP[symbol].attributionPath;

  return (
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4 overflow-hidden">
      <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            TradingView Market Chart
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
              Temporary
            </span>
          </h2>
          <p className="text-[10px] text-white/40 mt-1">
            Chart data displayed by TradingView. EXORA reference prices are shown separately.
          </p>
        </div>

        {/* EXORA-styled symbol tabs — hardcoded allowlist only, no free-text symbol input */}
        <div className="flex gap-1 bg-noir border border-white/10 rounded-lg p-0.5 self-start sm:self-auto">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSymbol(s)}
              className={`rounded px-3 py-1.5 text-[11px] font-bold transition-all uppercase tracking-wider ${
                symbol === s
                  ? 'bg-gold text-noir shadow-gold-glow font-black'
                  : 'text-white/45 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="relative z-10 w-full h-[440px] sm:h-[480px] md:h-[520px] lg:h-[620px] rounded-xl overflow-hidden border border-white/5">
        <div ref={containerRef} className="tradingview-widget-container h-full w-full" />
      </div>

      {/* Required TradingView attribution — never removed, never replaced with EXORA branding. */}
      <div className="relative z-10 text-[10px] text-white/30">
        <a
          href={`https://www.tradingview.com/symbols/${attribution}/`}
          target="_blank"
          rel="noopener nofollow"
          className="text-white/50 hover:text-gold transition"
        >
          {attribution} chart
        </a>{' '}
        by TradingView
      </div>
    </div>
  );
}
