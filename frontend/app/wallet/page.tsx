'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import type { WalletOverviewAsset } from '@/lib/types';
import { CopyButton } from '@/components/wallet-bits';

// Sparkline SVG path representing 24H balance trends
function SparklineChart() {
  return (
    <svg className="w-full h-16 text-gold opacity-80" viewBox="0 0 300 60" fill="none">
      <path
        d="M0,45 Q30,48 60,35 T120,38 T180,20 T240,25 T300,10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M0,45 Q30,48 60,35 T120,38 T180,20 T240,25 T300,10 L300,60 L0,60 Z"
        fill="url(#sparklineGrad)"
        opacity="0.1"
      />
      <defs>
        <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5C242" />
          <stop offset="100%" stopColor="#F5C242" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Doughnut Allocation SVG
function AllocationDoughnut({ btcPercent, ethPercent, usdtPercent, solPercent }: {
  btcPercent: number;
  ethPercent: number;
  usdtPercent: number;
  solPercent: number;
}) {
  const othersPercent = Math.max(0, 100 - (btcPercent + ethPercent + usdtPercent + solPercent));
  
  // Circumference = 2 * PI * r (r=36 -> C = 226)
  const circ = 226;
  const strokeBtc = (btcPercent / 100) * circ;
  const strokeEth = (ethPercent / 100) * circ;
  const strokeUsdt = (usdtPercent / 100) * circ;
  const strokeSol = (solPercent / 100) * circ;
  const strokeOthers = (othersPercent / 100) * circ;

  return (
    <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="36" stroke="#1c1c24" strokeWidth="10" fill="transparent" />
      {/* BTC */}
      <circle
        cx="50" cy="50" r="36"
        stroke="#F5C242" strokeWidth="10" fill="transparent"
        strokeDasharray={`${strokeBtc} ${circ}`}
        strokeDashoffset={0}
      />
      {/* ETH */}
      <circle
        cx="50" cy="50" r="36"
        stroke="#3b82f6" strokeWidth="10" fill="transparent"
        strokeDasharray={`${strokeEth} ${circ}`}
        strokeDashoffset={-strokeBtc}
      />
      {/* USDT */}
      <circle
        cx="50" cy="50" r="36"
        stroke="#10b981" strokeWidth="10" fill="transparent"
        strokeDasharray={`${strokeUsdt} ${circ}`}
        strokeDashoffset={-(strokeBtc + strokeEth)}
      />
      {/* SOL */}
      <circle
        cx="50" cy="50" r="36"
        stroke="#8b5cf6" strokeWidth="10" fill="transparent"
        strokeDasharray={`${strokeSol} ${circ}`}
        strokeDashoffset={-(strokeBtc + strokeEth + strokeUsdt)}
      />
      {/* Others */}
      <circle
        cx="50" cy="50" r="36"
        stroke="#6b7280" strokeWidth="10" fill="transparent"
        strokeDasharray={`${strokeOthers} ${circ}`}
        strokeDashoffset={-(strokeBtc + strokeEth + strokeUsdt + strokeSol)}
      />
    </svg>
  );
}

const ASSET_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  USDT: 'Tether',
  SOL: 'Solana',
  INR: 'Indian Rupee',
  XRP: 'Ripple',
  ADA: 'Cardano',
  BNB: 'BNB Chain',
};

const ASSET_COLORS: Record<string, string> = {
  BTC: '#F5C242',
  ETH: '#3b82f6',
  USDT: '#10b981',
  SOL: '#8b5cf6',
  Others: '#6b7280',
};

export default function WalletPage() {
  const ready = useGuard('user');
  const router = useRouter();
  const q = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    enabled: ready,
  });

  const [search, setSearch] = useState('');
  const [hideSmall, setHideSmall] = useState(false);

  if (!ready) return null;
  const data = q.data?.data;

  // Static Prices in INR for calculation
  const prices: Record<string, number> = {
    INR: 1,
    USDT: 83.20,
    BTC: 5600000,
    ETH: 292000,
    SOL: 13500,
    BNB: 49500,
    XRP: 42.50,
    ADA: 38.20,
  };

  // 24H change rates to display
  const changes24H: Record<string, string> = {
    BTC: '+2.35%',
    ETH: '+1.45%',
    USDT: '+0.01%',
    SOL: '+2.28%',
    INR: '--',
    XRP: '-0.35%',
    ADA: '+1.02%',
    BNB: '+0.85%',
  };

  const balances = data?.assets ?? [];

  // Calculate dynamic totals
  let totalInrVal = 0;
  balances.forEach((b) => {
    const asset = b.asset.toUpperCase();
    const rate = prices[asset] ?? 83.20; // fallback to USDT rate
    totalInrVal += Number(b.total) * rate;
  });

  // Default fallback for demo/empty state
  const displayTotalInr = totalInrVal > 0 ? totalInrVal : 2458320.45;
  const displayTotalBtc = displayTotalInr / prices.BTC;

  // Calculate asset allocations
  const allocations = balances.map((b) => {
    const asset = b.asset.toUpperCase();
    const rate = prices[asset] ?? 83.20;
    const value = Number(b.total) * rate;
    const pct = displayTotalInr > 0 ? (value / displayTotalInr) * 100 : 0;
    return { asset, pct };
  }).sort((a, b) => b.pct - a.pct);

  const btcPct = allocations.find((a) => a.asset === 'BTC')?.pct ?? 44.7;
  const ethPct = allocations.find((a) => a.asset === 'ETH')?.pct ?? 30.4;
  const usdtPct = allocations.find((a) => a.asset === 'USDT')?.pct ?? 9.6;
  const solPct = allocations.find((a) => a.asset === 'SOL')?.pct ?? 6.8;

  const filteredAssets = balances.filter((b) => {
    const asset = b.asset.toUpperCase();
    const name = (ASSET_NAMES[asset] ?? '').toLowerCase();
    const searchMatch = asset.toLowerCase().includes(search.toLowerCase()) || name.includes(search.toLowerCase());
    
    if (hideSmall) {
      const rate = prices[asset] ?? 83.20;
      const inrVal = Number(b.total) * rate;
      return searchMatch && inrVal > 500; // threshold for small balances
    }
    return searchMatch;
  });

  return (
    <UserShell className="max-w-[1400px]">
      
      {/* Title & Top Right Buttons */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Wallet Overview</h1>
          <p className="text-xs text-white/50 mt-1">Manage your crypto assets, track balance and perform transactions.</p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => router.push('/deposit')}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-gold to-gold-glow px-5 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
          >
            <span>📥</span> Deposit
          </button>
          <button
            onClick={() => router.push('/withdraw')}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs font-bold text-white hover:bg-white/[0.06] transition"
          >
            <span>📤</span> Withdraw
          </button>
          <button
            onClick={() => router.push('/trade')}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs font-bold text-white hover:bg-white/[0.06] transition"
          >
            <span>🔄</span> Convert
          </button>
        </div>
      </div>

      {q.isLoading && <p className="text-sm text-white/40 py-6">Retrieving ledger balances...</p>}
      {q.isError && <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">{errorMessage(q.error)}</div>}

      {data && (
        <div className="space-y-6">
          
          {/* Top Cards Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Total Balance Card */}
            <div className="lg:col-span-2 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 flex flex-col justify-between overflow-hidden min-h-[190px]">
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/45 uppercase tracking-wider">
                    <span>Total Wallet Balance</span>
                    <button className="text-white/35 hover:text-white transition">👁️</button>
                  </div>
                  <div className="text-3xl font-black text-white font-mono mt-1.5 tracking-tight">
                    ₹{displayTotalInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-white/40 font-mono mt-1">
                    ≈ {displayTotalBtc.toFixed(3)} BTC
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] bg-up/10 text-up font-bold px-2 py-0.5 rounded-full">+2.35%</span>
                    <select className="bg-noir border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white/50 focus:outline-none">
                      <option>24H</option>
                      <option>7D</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Sparkline & 24H change stats */}
              <div className="relative z-10 grid grid-cols-2 items-end mt-4">
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-white/35 block font-bold">24H Change</span>
                  <span className="text-xs font-bold text-up font-mono mt-0.5 block">
                    +₹{(displayTotalInr * 0.0235).toLocaleString('en-IN', { maximumFractionDigits: 2 })} (+2.35%)
                  </span>
                </div>
                <div className="h-12 w-full max-w-[200px] justify-self-end">
                  <SparklineChart />
                </div>
              </div>
            </div>

            {/* Allocation Doughnut Card */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 flex items-center justify-between">
              <div className="relative flex items-center justify-center">
                <AllocationDoughnut
                  btcPercent={btcPct}
                  ethPercent={ethPct}
                  usdtPercent={usdtPct}
                  solPercent={solPct}
                />
                <div className="absolute text-center">
                  <span className="text-[9px] font-bold text-white/40 block uppercase">Total</span>
                  <span className="text-xs font-bold text-white block">
                    ₹{(displayTotalInr / 100000).toFixed(2)}L
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs flex-1 pl-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ASSET_COLORS.BTC }} />
                    <span className="text-white/60">BTC</span>
                  </div>
                  <span className="font-mono font-semibold">{btcPct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ASSET_COLORS.ETH }} />
                    <span className="text-white/60">ETH</span>
                  </div>
                  <span className="font-mono font-semibold">{ethPct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ASSET_COLORS.USDT }} />
                    <span className="text-white/60">USDT</span>
                  </div>
                  <span className="font-mono font-semibold">{usdtPct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ASSET_COLORS.SOL }} />
                    <span className="text-white/60">SOL</span>
                  </div>
                  <span className="font-mono font-semibold">{solPct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ASSET_COLORS.Others }} />
                    <span className="text-white/60">Others</span>
                  </div>
                  <span className="font-mono font-semibold">
                    {Math.max(0, 100 - (btcPct + ethPct + usdtPct + solPct)).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 border-t border-b border-white/5 py-4">
            <div className="relative flex-1 max-w-sm">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-white/30">🔍</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search asset"
                className="w-full rounded-lg border border-white/10 bg-noir pl-9 pr-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none"
              />
            </div>
            
            <div className="flex items-center gap-4 justify-between sm:justify-end text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-white/60 hover:text-white transition">
                <input
                  type="checkbox"
                  checked={hideSmall}
                  onChange={(e) => setHideSmall(e.target.checked)}
                  className="rounded border-white/10 bg-noir text-gold accent-gold"
                />
                Hide Small Balances
              </label>
              
              <button className="flex items-center gap-1.5 text-gold font-bold hover:underline transition">
                🔄 Convert Small Balances to USDT
              </button>
            </div>
          </div>

          {/* Assets Table */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] font-bold text-white/45 uppercase tracking-wider border-b border-white/5">
                  <tr>
                    <th className="py-3.5 px-4">Asset</th>
                    <th>Total Balance</th>
                    <th>Available Balance</th>
                    <th>In Order</th>
                    <th>Value (INR) ▾</th>
                    <th>24H Change</th>
                    <th className="text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredAssets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-white/40">No assets found matching filters.</td>
                    </tr>
                  ) : (
                    filteredAssets.map((b) => {
                      const asset = b.asset.toUpperCase();
                      const name = ASSET_NAMES[asset] ?? 'Digital Asset';
                      const rate = prices[asset] ?? 83.20;
                      const value = Number(b.total) * rate;
                      const change = changes24H[asset] ?? '--';
                      const isUp = change.startsWith('+');
                      const isDown = change.startsWith('-');

                      return (
                        <tr key={b.asset} className="hover:bg-white/[0.01] transition-colors">
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center font-bold text-xs text-gold border border-white/5">
                                {asset.slice(0, 2)}
                              </div>
                              <div>
                                <span className="font-bold text-white block">{asset}</span>
                                <span className="text-[10px] text-white/40 block">{name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="font-mono text-white">
                            <div>{Number(b.total).toFixed(6)} {asset}</div>
                            <div className="text-[10px] text-white/40 mt-0.5">≈ ₹{value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                          </td>
                          <td className="font-mono text-white/80">
                            {Number(b.available).toFixed(6)} {asset}
                          </td>
                          <td className="font-mono text-white/50">
                            {Number(b.locked).toFixed(6)} {asset}
                          </td>
                          <td className="font-mono text-gold font-bold">
                            ₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`font-mono font-bold ${isUp ? 'text-up' : isDown ? 'text-down' : 'text-white/40'}`}>
                            {change}
                          </td>
                          <td className="text-right pr-4">
                            <div className="inline-flex gap-2">
                              <button
                                onClick={() => router.push(`/deposit?asset=${asset}`)}
                                className="rounded bg-white/5 border border-white/5 px-2.5 py-1 text-[10px] font-bold text-gold hover:bg-gold/10 hover:border-gold/20 transition"
                              >
                                Deposit
                              </button>
                              <button
                                onClick={() => router.push(`/withdraw?asset=${asset}`)}
                                className="rounded bg-white/5 border border-white/5 px-2.5 py-1 text-[10px] font-bold text-gold hover:bg-gold/10 hover:border-gold/20 transition"
                              >
                                Withdraw
                              </button>
                              <button
                                onClick={() => router.push('/trade')}
                                className="rounded bg-white/5 border border-white/5 px-2.5 py-1 text-[10px] font-bold text-gold hover:bg-gold/10 hover:border-gold/20 transition"
                              >
                                Convert
                              </button>
                              <button className="text-white/40 hover:text-white px-1">⋮</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reusable Deposit addresses generation endpoints */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">On-Chain Deposit Address registers</h3>
              <p className="text-[10px] text-white/40 mt-0.5">Choose network endpoints to generate deposit addresses for block scanning.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {balances.map((asset) => (
                <AssetNetworkGenerator key={asset.asset} asset={asset} />
              ))}
            </div>
          </div>

        </div>
      )}
    </UserShell>
  );
}

function AssetNetworkGenerator({ asset }: { asset: WalletOverviewAsset }) {
  const qc = useQueryClient();
  const gen = useMutation({
    mutationFn: (chain: string) => userApi.createDepositAddress(chain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet-overview'] }),
  });

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 space-y-3">
      <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
        <span className="font-bold text-white uppercase tracking-wider">{asset.asset} core network details</span>
        <span className="text-white/45">Balance: {asset.available}</span>
      </div>
      
      <div className="space-y-2">
        {asset.networks.map((n) => (
          <div
            key={n.chain}
            className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2.5 text-xs transition hover:bg-white/[0.03]"
          >
            <div className="min-w-0">
              <div className="text-[9px] font-black text-gold tracking-wide uppercase">
                {n.chain} ({n.family})
              </div>
              {n.depositAddress ? (
                <div className="break-all font-mono text-[11px] text-white mt-1 select-all">
                  {n.depositAddress}
                </div>
              ) : (
                <div className="text-xs text-white/30 mt-1">No address active</div>
              )}
            </div>
            {!n.depositAddress ? (
              <button
                onClick={() => gen.mutate(n.chain)}
                disabled={gen.isPending}
                className="shrink-0 rounded bg-gradient-to-r from-gold to-gold-glow px-3 py-1.5 text-[10px] font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50"
              >
                {gen.isPending ? 'Generating...' : 'Generate'}
              </button>
            ) : (
              <CopyButton value={n.depositAddress} label="Copy" />
            )}
          </div>
        ))}
      </div>
      {gen.isError && (
        <p className="mt-1 text-[10px] text-down">{errorMessage(gen.error)}</p>
      )}
    </div>
  );
}
