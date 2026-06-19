'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import type { Candle, CandleInterval } from '@/lib/types';

const INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

/**
 * Premium Candlestick chart + volume histogram + 24h ticker for a public market,
 * styled to match the Exora dark/metallic-gold design system.
 */
export function MarketChart({ symbol, live }: { symbol: string; live: boolean }) {
  const [interval, setInterval] = useState<CandleInterval>('15m');

  const tickerQ = useQuery({
    queryKey: ['ticker', symbol],
    queryFn: () => userApi.ticker(symbol),
    refetchInterval: live ? false : 5000,
  });

  const candlesQ = useQuery({
    queryKey: ['candles', symbol, interval],
    queryFn: () => userApi.candles(symbol, interval, 300),
    refetchInterval: live ? false : 10000,
  });

  const ticker = tickerQ.data?.data;
  const candles = candlesQ.data?.data.candles ?? [];

  const changePct = ticker ? Number(ticker.priceChangePct) : 0;
  const up = changePct >= 0;

  return (
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4 overflow-hidden">
      <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />

      {/* Header and Interval Switcher */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-3">
        <div className="flex flex-wrap items-baseline gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-[9px] font-black text-gold uppercase shrink-0 font-sans">
              {symbol.split('-')[0]?.slice(0, 2) ?? 'US'}
            </div>
            <span className="text-sm font-bold text-white tracking-tight font-sans">{symbol}</span>
          </div>
          <span className="font-mono text-lg font-black text-white">
            {ticker?.lastPrice ? Number(ticker.lastPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
          </span>
          <span
            className={`font-mono text-xs font-bold ${up ? 'text-up' : 'text-down'}`}
            title="24h Change"
          >
            {ticker ? `${up ? '+' : ''}${Number(ticker.priceChange).toFixed(2)} (${up ? '+' : ''}${Number(ticker.priceChangePct).toFixed(2)}%)` : '—'}
          </span>
        </div>

        {/* Interval switches */}
        <div className="flex flex-wrap gap-1 bg-noir border border-white/10 rounded-lg p-0.5 self-start md:self-auto">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              className={`rounded px-2.5 py-1 text-[10px] font-bold transition-all uppercase tracking-wider font-sans ${
                interval === iv
                  ? 'bg-gold text-noir shadow-gold-glow font-black'
                  : 'text-white/45 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              {iv}
            </button>
          ))}
        </div>
      </div>

      {/* Ticker Stats Row */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white/[0.01] border border-white/5 rounded-xl p-3 text-[10px] font-sans">
        <Stat label="24h High" value={ticker?.high24h ? `₹${Number(ticker.high24h).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'} />
        <Stat label="24h Low" value={ticker?.low24h ? `₹${Number(ticker.low24h).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'} />
        <Stat label="24h Vol (Base)" value={ticker?.baseVolume24h ? `${Number(ticker.baseVolume24h).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${symbol.split('-')[0]}` : '—'} />
        <Stat label="24h Vol (Quote)" value={ticker?.quoteVolume24h ? `₹${Number(ticker.quoteVolume24h).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'} />
      </div>

      {/* Errors display */}
      {(tickerQ.isError || candlesQ.isError) && (
        <div className="relative z-10 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300 font-sans">
          {errorMessage(tickerQ.error ?? candlesQ.error)}
        </div>
      )}

      {/* Chart container */}
      <div className="relative z-10 w-full h-[300px] bg-[#0B0B0E] border border-white/5 rounded-xl overflow-hidden">
        {candlesQ.isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center font-sans text-xs text-white/40">
            <span className="animate-spin text-lg mb-2">⏳</span>
            <span>Loading market chart...</span>
          </div>
        ) : candlesQ.isError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center font-sans p-6 text-center">
            <svg className="w-16 h-16 text-red-500/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h4 className="text-sm font-bold text-white mb-1 tracking-tight">Failed to load chart</h4>
            <p className="text-xs text-white/40 max-w-xs leading-normal">
              {errorMessage(candlesQ.error) || 'Please check your connection.'}
            </p>
          </div>
        ) : candles.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center font-sans p-6 text-center">
            <svg className="w-16 h-16 text-gold/15 mb-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M7 12l3-3 3 3 4-4M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <h4 className="text-sm font-bold text-white mb-1 tracking-tight">No candle data yet</h4>
            <p className="text-xs text-white/40 max-w-xs leading-normal">
              This is a sandbox / test market. Candles appear after trades are
              executed on this environment.
            </p>
          </div>
        ) : (
          <CandlestickChart candles={candles} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-white/35 font-bold uppercase tracking-wider text-[8px]">{label}</div>
      <div className="font-mono text-white font-bold mt-0.5">{value ?? '—'}</div>
    </div>
  );
}

/**
 * Imperative lightweight-charts wrapper, configured with a high-end dark design system.
 */
function CandlestickChart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Initialize the chart
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: '#0B0B0E' },
        textColor: '#8f98a1',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.01)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.01)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(245, 194, 66, 0.35)',
          width: 1,
          style: 3,
        },
        horzLine: {
          color: 'rgba(245, 194, 66, 0.35)',
          width: 1,
          style: 3,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        visible: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Candlesticks series
    const series = chart.addCandlestickSeries({
      upColor: '#0ecb81',
      downColor: '#f6465d',
      borderUpColor: '#0ecb81',
      borderDownColor: '#f6465d',
      wickUpColor: '#0ecb81',
      wickDownColor: '#f6465d',
    });

    // Volume Histogram overlay (overlayed at the bottom 15% of price scale)
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // overlay mode
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;

    const onResize = (): void => {
      chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Format candlestick data
  const data = useMemo<CandlestickData<UTCTimestamp>[]>(
    () =>
      candles.map((c) => ({
        time: Math.floor(new Date(c.openTime).getTime() / 1000) as UTCTimestamp,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      })),
    [candles]
  );

  // Format volume histogram data
  const volumeData = useMemo(() =>
    candles.map((c) => ({
      time: Math.floor(new Date(c.openTime).getTime() / 1000) as UTCTimestamp,
      value: Number(c.baseVolume || c.quoteVolume || 0),
      color: Number(c.close) >= Number(c.open) ? 'rgba(14, 203, 129, 0.25)' : 'rgba(246, 70, 93, 0.25)',
    })),
    [candles]
  );

  // Apply data updates
  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current || !chartRef.current) return;
    
    // Ensure chronological ordering to prevent lightweight-charts errors
    const sortedData = [...data].sort((a, b) => a.time - b.time);
    const sortedVolumeData = [...volumeData].sort((a, b) => a.time - b.time);

    seriesRef.current.setData(sortedData);
    volumeSeriesRef.current.setData(sortedVolumeData);
    chartRef.current.timeScale().fitContent();
  }, [data, volumeData]);

  return <div ref={containerRef} className="w-full h-[300px]" />;
}
