'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { StatusBadge } from '@/components/ui';
import { LiveMarketPrices } from '@/components/live-market-prices';
import type { Market } from '@/lib/types';

export default function MarketsPage() {
  const ready = useGuard('user');
  const [activeTab, setActiveTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [chain, setChain] = useState('ALL');
  const [favorites, setFavorites] = useState<string[]>(['USDT-INR']);

  const q = useQuery({
    queryKey: ['markets'],
    queryFn: () => userApi.listMarkets(),
    enabled: ready,
  });

  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  };

  const markets = q.data?.data.items ?? [];

  // Filter markets dynamically
  const filteredMarkets = useMemo(() => {
    return markets.filter((m) => {
      const symbol = m.symbol.toUpperCase();
      const base = m.baseAsset.toUpperCase();
      const quote = m.quoteAsset.toUpperCase();
      const searchMatch =
        symbol.includes(search.toUpperCase()) ||
        base.includes(search.toUpperCase()) ||
        quote.includes(search.toUpperCase());

      let tabMatch = true;
      if (activeTab === 'FAV') tabMatch = favorites.includes(m.symbol);
      else if (activeTab === 'INR') tabMatch = quote === 'INR';
      else if (activeTab === 'USDT') tabMatch = quote === 'USDT';
      else if (activeTab === 'BTC') tabMatch = quote === 'BTC';
      else if (activeTab === 'ETH') tabMatch = quote === 'ETH';

      let chainMatch = true;
      if (chain !== 'ALL') {
        // Mock matching chain family
        chainMatch = (m as any).family === chain;
      }

      return searchMatch && tabMatch && chainMatch;
    });
  }, [markets, search, activeTab, chain, favorites]);

  if (!ready) return null;

  return (
    <UserShell className="max-w-[1440px]">
      
      {/* Title Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          Markets
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">Sandbox</span>
        </h1>
        <p className="text-xs text-white/50 mt-1">Sandbox / test markets. Prices, volume and depth reflect activity on this environment only — not a live exchange.</p>
      </div>

      {q.isLoading && <p className="text-sm text-white/40 py-6">Loading market indices...</p>}
      {q.isError && (
        <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
          {errorMessage(q.error)}
        </div>
      )}

      {/* Main Content Layout */}
      {q.data && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Side (9 cols): Pairs Table */}
          <div className="lg:col-span-9 space-y-4">
            
            {/* Horizontal Tabs selector */}
            <div className="flex flex-wrap gap-1 border-b border-white/5 pb-px">
              {[
                { id: 'FAV', label: '★ Favorites' },
                { id: 'INR', label: 'INR Markets' },
                { id: 'USDT', label: 'USDT Markets' },
                { id: 'BTC', label: 'BTC Markets' },
                { id: 'ETH', label: 'ETH Markets' },
                { id: 'DEFI', label: 'DeFi' },
                { id: 'L1', label: 'Layer 1' },
                { id: 'MEME', label: 'Meme' },
                { id: 'ALL', label: 'All Markets' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 ${
                    activeTab === tab.id
                      ? 'border-gold text-gold bg-gold/5'
                      : 'border-transparent text-white/45 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Sub-Filters Toolbar */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white/[0.01] border border-white/5 rounded-xl p-3">
              <div className="sm:col-span-4 relative">
                <input
                  placeholder="Search coin, pairs or markets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-noir py-2 pl-8 pr-3 text-xs text-white focus:border-gold/60 focus:outline-none placeholder:text-white/20"
                />
                <span className="absolute left-2.5 top-2.5 text-xs text-white/30">🔍</span>
              </div>

              <div className="sm:col-span-3">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-noir px-2 py-2 text-xs text-white/60 focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="SPOT">Spot</option>
                  <option value="FUTURES">Futures</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <select
                  value={chain}
                  onChange={(e) => setChain(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-noir px-2 py-2 text-xs text-white/60 focus:outline-none"
                >
                  <option value="ALL">All Chains</option>
                  <option value="TRON">TRON</option>
                  <option value="EVM">Ethereum</option>
                  <option value="UTXO">Bitcoin</option>
                </select>
              </div>

              <div className="sm:col-span-2 flex gap-1.5">
                <button className="flex-1 rounded-lg border border-white/10 bg-noir px-2 py-2 text-xs text-white/50 hover:text-white transition">
                  ⚙️ Filters
                </button>
              </div>
            </div>

            {/* Main Pairs Grid Table */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.01]">
                      <th className="py-3 px-4 w-10">★</th>
                      <th className="py-3 px-2 w-10">#</th>
                      <th className="py-3 px-3">Coin</th>
                      <th className="py-3 px-3">Pair</th>
                      <th className="py-3 px-3 text-right">Price</th>
                      <th className="py-3 px-3 text-right">24h Change</th>
                      <th className="py-3 px-3 text-right">24h High</th>
                      <th className="py-3 px-3 text-right">24h Low</th>
                      <th className="py-3 px-3 text-right">24h Volume</th>
                      <th className="py-3 px-3 text-right">Market Cap</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {filteredMarkets.map((m, idx) => {
                      const isFav = favorites.includes(m.symbol);
                      return (
                        <MarketRow
                          key={m.symbol}
                          market={m}
                          index={idx + 1}
                          isFav={isFav}
                          onToggleFav={toggleFavorite}
                        />
                      );
                    })}
                    {filteredMarkets.length === 0 && (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-xs text-white/30 font-sans">
                          No matching pairs found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination */}
              <div className="flex justify-between items-center border-t border-white/5 py-4 px-4 bg-white/[0.01] font-sans">
                <span className="text-[10px] text-white/35">
                  Showing 1 to {filteredMarkets.length} of {markets.length} pairs
                </span>
                <div className="flex gap-1.5 text-[10px] font-bold">
                  <button className="rounded border border-white/10 bg-white/[0.02] px-2.5 py-1 text-white/80 hover:bg-white/5 transition">
                    ‹
                  </button>
                  <button className="rounded bg-gold px-2.5 py-1 text-noir shadow-gold-glow">
                    1
                  </button>
                  <button className="rounded border border-white/10 bg-white/[0.02] px-2.5 py-1 text-white/80 hover:bg-white/5 transition">
                    ›
                  </button>
                </div>
              </div>

            </div>

          </div>

          {/* Right Side (3 cols): Live reference prices + Leaderboards */}
          <div className="lg:col-span-3 space-y-6">
            <LiveMarketPrices />
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 text-center space-y-4 overflow-hidden">
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />
              <div className="relative z-10 py-12">
                <div className="mx-auto h-12 w-12 rounded-full bg-gold/10 flex items-center justify-center text-xl text-gold mb-3 animate-pulse">
                  📊
                </div>
                <h3 className="text-sm font-bold text-white tracking-tight uppercase">Leaderboards</h3>
                <span className="text-[10px] text-gold font-bold uppercase block mt-1 tracking-widest">Coming Soon</span>
                <p className="text-xs text-white/40 mt-3 leading-relaxed max-w-[200px] mx-auto">
                  Top Gainers, Losers, and Volume leaderboards will populate dynamically when active trading starts.
                </p>
              </div>
            </div>
          </div>

        </div>
      )}
    </UserShell>
  );
}

function MarketRow({
  market,
  index,
  isFav,
  onToggleFav,
}: {
  market: Market;
  index: number;
  isFav: boolean;
  onToggleFav: (symbol: string) => void;
}) {
  const tickerQ = useQuery({
    queryKey: ['ticker', market.symbol],
    queryFn: () => userApi.ticker(market.symbol),
    refetchInterval: 5000,
  });

  const ticker = tickerQ.data?.data;

  if (tickerQ.isLoading) {
    return (
      <tr className="animate-pulse border-b border-white/5">
        <td className="py-4 px-4"><div className="h-3 bg-white/5 rounded w-4" /></td>
        <td className="px-2"><div className="h-3 bg-white/5 rounded w-4" /></td>
        <td className="px-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-white/5 animate-pulse" />
            <div className="space-y-1">
              <div className="h-3 bg-white/5 rounded w-12" />
              <div className="h-2 bg-white/5 rounded w-8" />
            </div>
          </div>
        </td>
        <td className="px-3"><div className="h-3 bg-white/5 rounded w-16" /></td>
        <td className="px-3 text-right"><div className="h-3 bg-white/5 rounded w-16 ml-auto" /></td>
        <td className="px-3 text-right"><div className="h-3 bg-white/5 rounded w-12 ml-auto" /></td>
        <td className="px-3 text-right"><div className="h-3 bg-white/5 rounded w-12 ml-auto" /></td>
        <td className="px-3 text-right"><div className="h-3 bg-white/5 rounded w-12 ml-auto" /></td>
        <td className="px-3 text-right"><div className="h-3 bg-white/5 rounded w-16 ml-auto" /></td>
        <td className="px-3 text-right"><div className="h-3 bg-white/5 rounded w-12 ml-auto" /></td>
        <td className="py-4 px-4 text-right"><div className="h-6 bg-white/5 rounded w-14 ml-auto" /></td>
      </tr>
    );
  }

  const priceDisplay = ticker?.lastPrice
    ? `${market.quoteAsset === 'INR' ? '₹' : ''}${Number(ticker.lastPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    : '—';

  const pctNum = ticker?.priceChangePct ? Number(ticker.priceChangePct) : 0;
  const changeDisplay = ticker?.priceChangePct
    ? `${pctNum >= 0 ? '+' : ''}${pctNum.toFixed(2)}%`
    : '—';
  const isUp = pctNum >= 0;

  const highDisplay = ticker?.high24h
    ? `${market.quoteAsset === 'INR' ? '₹' : ''}${Number(ticker.high24h).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    : '—';

  const lowDisplay = ticker?.low24h
    ? `${market.quoteAsset === 'INR' ? '₹' : ''}${Number(ticker.low24h).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    : '—';

  const volumeDisplay = ticker?.baseVolume24h
    ? `${Number(ticker.baseVolume24h).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${market.baseAsset}`
    : '—';

  return (
    <tr className="hover:bg-white/[0.01] transition-all">
      <td className="py-3.5 px-4">
        <button
          onClick={() => onToggleFav(market.symbol)}
          className={`text-sm focus:outline-none transition ${isFav ? 'text-gold' : 'text-white/20 hover:text-white/40'}`}
        >
          ★
        </button>
      </td>
      <td className="px-2 text-white/30 text-[10px] font-mono">{index}</td>
      <td className="px-3 font-sans">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-[9px] font-black text-gold uppercase shrink-0">
            {market.baseAsset.slice(0, 2)}
          </div>
          <div>
            <span className="font-bold text-white block leading-tight">{market.baseAsset}</span>
            <span className="text-[9px] text-white/40 block font-mono mt-0.5">{market.baseAsset}</span>
          </div>
        </div>
      </td>
      <td className="px-3 text-white font-bold">{market.symbol}</td>
      <td className="px-3 text-right text-white font-mono font-bold">{priceDisplay}</td>
      <td className={`px-3 text-right font-bold ${isUp ? 'text-up' : 'text-down'}`}>{changeDisplay}</td>
      <td className="px-3 text-right text-white/70">{highDisplay}</td>
      <td className="px-3 text-right text-white/70">{lowDisplay}</td>
      <td className="px-3 text-right text-white/60">{volumeDisplay}</td>
      <td className="px-3 text-right text-white/60">—</td>
      <td className="py-3.5 px-4 text-right font-sans">
        <Link
          href={`/trade?symbol=${encodeURIComponent(market.symbol)}`}
          className="rounded bg-gradient-to-r from-gold to-gold-glow px-3.5 py-1.5 text-[10px] font-extrabold text-noir shadow-gold-glow hover:brightness-105 transition uppercase tracking-wider block text-center"
        >
          Trade
        </Link>
      </td>
    </tr>
  );
}
