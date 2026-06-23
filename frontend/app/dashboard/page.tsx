'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { StatusBadge, Alert } from '@/components/ui';

export default function DashboardPage() {
  const ready = useGuard('user');
  
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => userApi.me(),
    enabled: ready,
  });

  const walletQ = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    enabled: ready,
  });

  const inrLedgerQ = useQuery({
    queryKey: ['ledger', 'INR'],
    queryFn: () => userApi.walletLedger('INR', 5),
    enabled: ready,
  });
  const usdtLedgerQ = useQuery({
    queryKey: ['ledger', 'USDT'],
    queryFn: () => userApi.walletLedger('USDT', 5),
    enabled: ready,
  });

  if (!ready) return null;

  const me = meQ.data?.data;
  const balances = walletQ.data?.data.balances ?? [];
  const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');
  const usdt = balances.find((b) => b.asset.toUpperCase() === 'USDT');

  // Dynamically calculate live portfolio value in INR (using mock rate USDT/INR = 83.20)
  const inrVal = Number(inr?.available ?? 0) + Number(inr?.locked ?? 0);
  const usdtVal = Number(usdt?.available ?? 0) + Number(usdt?.locked ?? 0);
  const totalInrPortfolio = inrVal + (usdtVal * 83.20);
  const totalBtcPortfolio = totalInrPortfolio / 5600000; // indic. BTC rate in INR

  // Combine ledger items for transactions
  const transactions = [
    ...(inrLedgerQ.data?.data.items ?? []),
    ...(usdtLedgerQ.data?.data.items ?? []),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const firstName = me?.user.fullName ? me.user.fullName.split(' ')[0] : 'Trader';
  const hasBalances = balances.length > 0 && (Number(inr?.available ?? 0) + Number(inr?.available ?? 0) > 0 || Number(usdt?.available ?? 0) > 0);

  return (
    <UserShell className="max-w-[1400px]">
        
        {/* Welcome Section */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Welcome back, {firstName}! 👋
            </h1>
            <p className="mt-0.5 text-sm text-white/50">
              Here&rsquo;s what&rsquo;s happening with your portfolio today.
            </p>
          </div>
          {hasBalances && (
            <span className="text-[10px] text-white/30 font-semibold tracking-wider uppercase bg-white/5 border border-white/5 rounded-lg px-3 py-1.5 font-mono">
              Last updated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {walletQ.isError && <div className="mb-6"><Alert>{errorMessage(walletQ.error)}</Alert></div>}

        {/* Top 4 Dashboard Cards Row */}
        <div className="mb-8 grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          
          {/* Card 1: Total Portfolio Value */}
          <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-5 shadow-gold-soft backdrop-blur-2xl flex flex-col justify-between min-h-[145px]">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">Total Portfolio Value</span>
                {hasBalances ? (
                  <>
                    <span className="text-2xl font-black text-white font-mono mt-1 block">
                      ₹ {totalInrPortfolio.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-white/45 font-mono mt-0.5 block">
                      ≈ {totalBtcPortfolio.toFixed(4)} BTC
                    </span>
                  </>
                ) : (
                  <span className="text-2xl font-black text-white font-mono mt-1 block">₹ 0.00</span>
                )}
              </div>
              {hasBalances && (
                <svg className="w-20 h-10 text-gold" viewBox="0 0 100 40" fill="none">
                  <path d="M0 30 Q 20 15, 40 25 T 80 5 T 100 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <div className="relative z-10 flex gap-4 text-[10px] font-bold mt-4 border-t border-white/5 pt-2">
              {hasBalances ? (
                <span className="text-white/40">Indicative valuation at ≈ ₹83.20/USDT</span>
              ) : (
                <span className="text-white/30">Deposit funds to see your portfolio value</span>
              )}
            </div>
          </div>

          {/* Card 2: INR Balance */}
          <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-5 shadow-gold-soft backdrop-blur-2xl flex flex-col justify-between min-h-[145px]">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">INR Balance</span>
                <span className="h-6 w-6 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-gold text-xs font-bold font-mono">₹</span>
              </div>
              {Number(inr?.available ?? 0) > 0 ? (
                <>
                  <span className="text-2xl font-black text-white font-mono block">
                    ₹ {Number(inr?.available ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-white/40 block mt-1">Locked: ₹{inr?.locked ?? '0.00'}</span>
                </>
              ) : (
                <>
                  <span className="text-2xl font-black text-white font-mono block">₹ 0.00</span>
                  <span className="text-[10px] text-white/30 block mt-1">No INR balance</span>
                </>
              )}
            </div>
            <Link href="/deposit" className="relative z-10 mt-3 block w-full text-center rounded-lg border border-gold/30 bg-gold/5 py-1.5 text-xs font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider">
              Deposit INR
            </Link>
          </div>

          {/* Card 3: USDT Balance */}
          <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-5 shadow-gold-soft backdrop-blur-2xl flex flex-col justify-between min-h-[145px]">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">USDT Balance</span>
                <span className="h-6 w-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xs font-bold font-mono">₮</span>
              </div>
              {Number(usdt?.available ?? 0) > 0 ? (
                <>
                  <span className="text-2xl font-black text-white font-mono block">
                    {Number(usdt?.available ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                  </span>
                  <span className="text-[10px] text-white/40 block mt-1">≈ ₹{Number(Number(usdt?.available ?? 0) * 83.20).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </>
              ) : (
                <>
                  <span className="text-2xl font-black text-white font-mono block">0.00 USDT</span>
                  <span className="text-[10px] text-white/30 block mt-1">No USDT balance</span>
                </>
              )}
            </div>
            <Link href="/wallet" className="relative z-10 mt-3 block w-full text-center rounded-lg border border-gold/30 bg-gold/5 py-1.5 text-xs font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider">
              Deposit USDT
            </Link>
          </div>

          {/* Card 4: Today's PnL */}
          <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-5 shadow-gold-soft backdrop-blur-2xl flex flex-col justify-between min-h-[145px]">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
            <div className="relative z-10 flex justify-between items-start">
              <div>
                {hasBalances ? (
                  <>
                    <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider flex items-center gap-1.5">
                      Today&rsquo;s PnL
                      <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[8px] font-bold text-amber-300">SAMPLE</span>
                    </span>
                    <span className="text-2xl font-black text-up font-mono mt-1 block">
                      + ₹ 45,320.50
                    </span>
                    <span className="text-[10px] text-up font-mono mt-0.5 block">
                      +2.35%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider block">Today&rsquo;s PnL</span>
                    <span className="text-2xl font-black text-white/30 font-mono mt-1 block">—</span>
                    <span className="text-[10px] text-white/20 font-mono mt-0.5 block">No trades yet</span>
                  </>
                )}
              </div>
              {hasBalances && (
                <div className="flex items-end gap-1 h-10 pt-2 text-up">
                  <div className="w-1.5 h-4 bg-up/40 rounded-sm" />
                  <div className="w-1.5 h-6 bg-up/60 rounded-sm" />
                  <div className="w-1.5 h-8 bg-up rounded-sm" />
                  <div className="w-1.5 h-5 bg-up/70 rounded-sm" />
                  <div className="w-1.5 h-7 bg-up rounded-sm" />
                </div>
              )}
            </div>
            <div className="relative z-10 flex gap-4 text-[10px] font-bold mt-4 border-t border-white/5 pt-2">
              {hasBalances ? (
                <>
                  <span className="text-white/40">This Week PnL</span>
                  <span className="text-up">+ ₹ 1,25,450.75</span>
                </>
              ) : (
                <span className="text-white/30">Start trading to track PnL</span>
              )}
            </div>
          </div>

        </div>

        {/* Dashboard Panels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1 & 2: Quick Actions, Market stats, recent txs */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Quick Actions Card */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-white/45 flex items-center gap-1.5">
                <span>⚡</span> Quick Actions Panel
              </h2>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Link href="/deposit" className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center hover:border-gold/40 hover:bg-white/[0.04] transition">
                  <span className="text-xl">📥</span>
                  <span className="text-xs font-bold text-white mt-2">Deposit INR</span>
                </Link>
                <Link href="/withdraw" className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center hover:border-gold/40 hover:bg-white/[0.04] transition">
                  <span className="text-xl">📤</span>
                  <span className="text-xs font-bold text-white mt-2">Withdraw</span>
                </Link>
                <Link href="/convert" className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center hover:border-gold/40 hover:bg-white/[0.04] transition">
                  <span className="text-xl">🔄</span>
                  <span className="text-xs font-bold text-white mt-2">Convert Quote</span>
                </Link>
                <Link href="/trade" className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center hover:border-gold/40 hover:bg-white/[0.04] transition">
                  <span className="text-xl">📈</span>
                  <span className="text-xs font-bold text-white mt-2">Trading Desk</span>
                </Link>
              </div>

              <Link href="/markets" className="block w-full text-center rounded-lg bg-gradient-to-r from-gold to-gold-glow py-3 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition uppercase tracking-wider">
                Buy Crypto Assets
              </Link>
            </div>

            {/* Market Overview Indicators */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/45 flex items-center gap-1.5">
                  Market Global Overview
                  <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[8px] font-bold text-amber-300">SAMPLE</span>
                </h3>
                <Link href="/markets" className="text-[10px] text-gold font-bold hover:underline uppercase tracking-wide">View All Markets →</Link>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div className="rounded-xl bg-white/[0.02] p-4">
                  <span className="text-[10px] text-white/40 uppercase font-semibold">Crypto Market Cap</span>
                  <div className="text-lg font-black text-white font-mono mt-1">$ 2.45 T</div>
                  <span className="text-[9px] text-up font-bold mt-1 block">+2.35% (24h)</span>
                </div>
                <div className="rounded-xl bg-white/[0.02] p-4">
                  <span className="text-[10px] text-white/40 uppercase font-semibold">Total 24h Volume</span>
                  <div className="text-lg font-black text-white font-mono mt-1">$ 78.45 B</div>
                  <span className="text-[9px] text-up font-bold mt-1 block">+6.21% (24h)</span>
                </div>
                <div className="rounded-xl bg-white/[0.02] p-4">
                  <span className="text-[10px] text-white/40 uppercase font-semibold">Bitcoin Dominance</span>
                  <div className="text-lg font-black text-white font-mono mt-1">52.45%</div>
                  <span className="text-[9px] text-down font-bold mt-1 block">-0.35% (24h)</span>
                </div>
              </div>
            </div>

            {/* Recent Transactions List */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/45">Recent Ledger Transactions</h3>
                <Link href="/portfolio" className="text-[10px] text-gold font-bold hover:underline uppercase tracking-wide">View Portfolio →</Link>
              </div>

              {transactions.length === 0 ? (
                <p className="text-xs text-white/40 py-6 text-center">No transaction records found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-white/45 font-semibold text-[9px] uppercase tracking-wider bg-white/[0.01]">
                        <th className="py-2.5 px-3">Type</th>
                        <th className="px-3">Asset</th>
                        <th className="px-3">Amount</th>
                        <th className="px-3">Direction</th>
                        <th className="px-3 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-white/[0.01]">
                          <td className="py-3 px-3 font-semibold text-white">{tx.kind}</td>
                          <td className="px-3 text-white/70">{tx.asset}</td>
                          <td className="px-3 font-mono font-medium text-white">{tx.amount}</td>
                          <td className="px-3">
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${tx.direction === 'CREDIT' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                              {tx.direction}
                            </span>
                          </td>
                          <td className="px-3 text-right text-white/45 font-mono text-[10px]">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* Column 3: Top Gainers/Losers, Portfolio Allocation */}
          <div className="space-y-6">
            
            {/* Top Gainers */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3.5">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/45">Top Gainers</h3>
                <Link href="/markets" className="text-[9px] text-white/40 hover:text-gold transition font-bold uppercase">View All</Link>
              </div>
              <div className="space-y-2.5">
                {[
                  { pair: 'SOL/USDT', price: '162.88', change: '+12.45%' },
                  { pair: 'AVAX/USDT', price: '45.32', change: '+9.85%' },
                  { pair: 'NEAR/USDT', price: '8.65', change: '+8.24%' },
                  { pair: 'MATIC/USDT', price: '0.78', change: '+7.12%' },
                  { pair: 'LINK/USDT', price: '17.45', change: '+6.85%' },
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-white">{item.pair}</span>
                    <div className="flex gap-4">
                      <span className="font-mono text-white/80">{item.price}</span>
                      <span className="font-mono font-semibold text-up w-14 text-right">{item.change}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Losers */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3.5">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/45">Top Losers</h3>
                <Link href="/markets" className="text-[9px] text-white/40 hover:text-gold transition font-bold uppercase">View All</Link>
              </div>
              <div className="space-y-2.5">
                {[
                  { pair: 'LUNA/USDT', price: '0.245', change: '-8.24%' },
                  { pair: 'FTM/USDT', price: '0.45', change: '-6.85%' },
                  { pair: 'XEM/USDT', price: '0.032', change: '-5.45%' },
                  { pair: 'ICP/USDT', price: '12.45', change: '-4.24%' },
                  { pair: 'AR/USDT', price: '15.32', change: '-3.85%' },
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-white">{item.pair}</span>
                    <div className="flex gap-4">
                      <span className="font-mono text-white/80">{item.price}</span>
                      <span className="font-mono font-semibold text-down w-14 text-right">{item.change}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Portfolio Allocation */}
            <div className="relative rounded-2xl border border-gold/15 bg-white/[0.03] p-5 shadow-gold-soft backdrop-blur-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gold">Portfolio Allocation</h3>
                <Link href="/portfolio" className="text-[9px] text-white/40 hover:text-gold transition font-bold uppercase">View Details</Link>
              </div>

              {/* Doughnut Chart mockup using CSS */}
              <div className="flex justify-center py-2 relative">
                <div className="h-28 w-28 rounded-full border-8 border-gold flex items-center justify-center relative shadow-gold-glow">
                  {/* segment lines */}
                  <div className="absolute inset-0 rounded-full border-8 border-t-emerald-500 border-r-amber-500 border-b-sky-500 border-l-gold transform rotate-45 pointer-events-none" />
                  <div className="text-center">
                    <span className="text-[9px] font-bold text-white/45 uppercase tracking-widest block">Alloc Value</span>
                    <span className="text-xs font-black text-white font-mono mt-0.5 block">100%</span>
                  </div>
                </div>
              </div>

              {/* Legend checklist */}
              <div className="space-y-2.5 text-xs pt-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-gold" />
                    <span className="text-white/60">Bitcoin (BTC)</span>
                  </div>
                  <span className="font-mono font-semibold text-white">35.45%</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-sky-500" />
                    <span className="text-white/60">Ethereum (ETH)</span>
                  </div>
                  <span className="font-mono font-semibold text-white">25.30%</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-white/60">USDT Token</span>
                  </div>
                  <span className="font-mono font-semibold text-white">18.15%</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-white/60">BNB Chain</span>
                  </div>
                  <span className="font-mono font-semibold text-white">8.35%</span>
                </div>
              </div>
            </div>

          </div>

        </div>

      </UserShell>
  );
}
