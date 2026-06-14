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
import { Card, Alert } from '@/components/ui';
import type { Candle, CandleInterval } from '@/lib/types';

const INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '1d'];

/**
 * Candlestick chart + 24h ticker for a public market, driven entirely by the
 * public /markets/:symbol/ticker and /candles APIs (no auth, no private data).
 *
 * `live` mirrors the socket connection: when connected we rely on the
 * trade.executed event (which invalidates the ['ticker']/['candles'] caches in
 * use-realtime) and disable polling; when disconnected we poll as a fallback.
 */
export function MarketChart({ symbol, live }: { symbol: string; live: boolean }) {
  const [interval, setInterval] = useState<CandleInterval>('1m');

  const tickerQ = useQuery({
    queryKey: ['ticker', symbol],
    queryFn: () => userApi.ticker(symbol),
    refetchInterval: live ? false : 5000,
  });

  const candlesQ = useQuery({
    queryKey: ['candles', symbol, interval],
    queryFn: () => userApi.candles(symbol, interval, 200),
    refetchInterval: live ? false : 10000,
  });

  const ticker = tickerQ.data?.data;
  const candles = candlesQ.data?.data.candles ?? [];

  const changePct = ticker ? Number(ticker.priceChangePct) : 0;
  const up = changePct >= 0;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold">{symbol}</h2>
          <span className="font-mono text-lg">{ticker?.lastPrice ?? '—'}</span>
          <span
            className={`font-mono text-sm ${up ? 'text-green-600' : 'text-red-600'}`}
            title="24h change"
          >
            {ticker ? `${up ? '+' : ''}${ticker.priceChange} (${up ? '+' : ''}${ticker.priceChangePct}%)` : '—'}
          </span>
        </div>
        <div className="flex gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              className={`rounded px-2 py-1 text-xs font-medium ${
                interval === iv
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {iv}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-4">
        <Stat label="24h High" value={ticker?.high24h} />
        <Stat label="24h Low" value={ticker?.low24h} />
        <Stat label="24h Vol (USDT)" value={ticker?.baseVolume24h} />
        <Stat label="24h Vol (INR)" value={ticker?.quoteVolume24h} />
      </div>

      {(tickerQ.isError || candlesQ.isError) && (
        <Alert>{errorMessage(tickerQ.error ?? candlesQ.error)}</Alert>
      )}

      <CandlestickChart candles={candles} />

      {candlesQ.isSuccess && candles.length === 0 && (
        <p className="py-2 text-center text-xs text-gray-500">
          No trades yet — the chart fills in as the market trades.
        </p>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-gray-400">{label}</div>
      <div className="font-mono text-gray-700">{value ?? '—'}</div>
    </div>
  );
}

/**
 * Imperative lightweight-charts wrapper. The chart instance is created once and
 * resized to its container; candle data is pushed via series.setData whenever
 * the `candles` prop changes.
 */
function CandlestickChart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Create the chart once on mount; tear it down on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#6b7280',
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#e5e7eb' },
      timeScale: { borderColor: '#e5e7eb', timeVisible: true, secondsVisible: false },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderUpColor: '#16a34a',
      borderDownColor: '#dc2626',
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = (): void => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Map domain candles → lightweight-charts data and push them in.
  const data = useMemo<CandlestickData<UTCTimestamp>[]>(
    () =>
      candles.map((c) => ({
        time: Math.floor(new Date(c.openTime).getTime() / 1000) as UTCTimestamp,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      })),
    [candles],
  );

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    seriesRef.current.setData(data);
    chartRef.current.timeScale().fitContent();
  }, [data]);

  return <div ref={containerRef} className="w-full" />;
}
