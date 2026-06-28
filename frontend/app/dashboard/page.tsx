'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { useUserFeatures } from '@/components/feature-gate';
import { Alert } from '@/components/ui';

/**
 * User dashboard. Every figure here is real (ledger balances + ledger activity)
 * or an explicit empty/unavailable state. There is NO fabricated PnL, no mock
 * price conversion, and no sample market data — INR is the only asset with a
 * known on-platform valuation in INR_ONLY mode, so we never invent crypto prices.
 */
export default function DashboardPage() {
  const ready = useGuard('user');
  const { features } = useUserFeatures();

  const meQ = useQuery({ queryKey: ['me'], queryFn: () => userApi.me(), enabled: ready });
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

  if (!ready) return null;

  const me = meQ.data?.data;
  const balances = walletQ.data?.data.balances ?? [];
  const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');

  // Real INR figures from the ledger (strings → numbers only for display).
  const inrAvailable = Number(inr?.available ?? 0);
  const inrLocked = Number(inr?.locked ?? 0);
  const inrTotal = inrAvailable + inrLocked;

  // Recent activity straight from the INR ledger (real, settled entries).
  const transactions = (inrLedgerQ.data?.data.items ?? [])
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Portfolio allocation from REAL balances we can value. Only INR has a known
  // INR valuation; other assets are listed without a fabricated percentage.
  const valued = balances
    .map((b) => ({ asset: b.asset.toUpperCase(), total: Number(b.total) }))
    .filter((b) => b.total > 0);
  const inrValued = valued.filter((b) => b.asset === 'INR');
  const unvaluedAssets = valued.filter((b) => b.asset !== 'INR');
  const allocationTotal = inrValued.reduce((s, b) => s + b.total, 0);

  const firstName = me?.user.fullName ? me.user.fullName.split(' ')[0] : 'Trader';
  const hasInr = inrTotal > 0;

  return (
    <UserShell className="max-w-[1400px]">
      {/* Welcome */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Welcome back, {firstName}! 👋
          </h1>
          <p className="mt-0.5 text-sm text-white/50">
            Here&rsquo;s your account overview.
          </p>
        </div>
      </div>

      {walletQ.isError && (
        <div className="mb-6">
          <Alert>{errorMessage(walletQ.error)}</Alert>
        </div>
      )}

      {/* Top cards */}
      <div className="mb-8 grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {/* Total balance (INR) */}
        <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-5 shadow-gold-soft backdrop-blur-2xl flex flex-col justify-between min-h-[145px]">
          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
          <div className="relative z-10">
            <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">
              Total Balance
            </span>
            <span className="text-2xl font-black text-white font-mono mt-1 block">
              ₹ {inrTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-white/45 font-mono mt-0.5 block">
              {hasInr ? 'INR ledger balance' : 'Deposit INR to fund your account'}
            </span>
          </div>
          <div className="relative z-10 flex gap-4 text-[10px] font-bold mt-4 border-t border-white/5 pt-2">
            <span className="text-white/40">Available ₹{inrAvailable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            <span className="text-white/40">Locked ₹{inrLocked.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* INR balance + deposit CTA */}
        <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-5 shadow-gold-soft backdrop-blur-2xl flex flex-col justify-between min-h-[145px]">
          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">INR Balance</span>
              <span className="h-6 w-6 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-gold text-xs font-bold font-mono">₹</span>
            </div>
            <span className="text-2xl font-black text-white font-mono block">
              ₹ {inrAvailable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-white/40 block mt-1">
              {hasInr ? `Locked: ₹${inrLocked.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'No INR balance yet'}
            </span>
          </div>
          {features.inrDeposit && (
            <Link href="/deposit" className="relative z-10 mt-3 block w-full text-center rounded-lg border border-gold/30 bg-gold/5 py-1.5 text-xs font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider">
              Deposit INR
            </Link>
          )}
        </div>

        {/* Today's PnL — backend does not calculate PnL, so we never fabricate it. */}
        <div className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col justify-between min-h-[145px]">
          <div className="relative z-10">
            <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">Today&rsquo;s PnL</span>
            <span className="text-xl font-black text-white/40 font-mono mt-2 block">Unavailable</span>
            <span className="text-[10px] text-white/30 block mt-1">
              Profit &amp; loss is not yet calculated for your account.
            </span>
          </div>
          <div className="relative z-10 text-[10px] font-bold mt-4 border-t border-white/5 pt-2">
            <span className="text-white/30">No realised PnL data to display.</span>
          </div>
        </div>
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Quick actions — only the rails enabled for this account/mode. */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/45 flex items-center gap-1.5">
              <span>⚡</span> Quick Actions
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {features.inrDeposit && (
                <Link href="/deposit" className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center hover:border-gold/40 hover:bg-white/[0.04] transition">
                  <span className="text-xl">📥</span>
                  <span className="text-xs font-bold text-white mt-2">Deposit INR</span>
                </Link>
              )}
              {features.inrWithdrawal && (
                <Link href="/inr-withdraw" className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center hover:border-gold/40 hover:bg-white/[0.04] transition">
                  <span className="text-xl">📤</span>
                  <span className="text-xs font-bold text-white mt-2">Withdraw INR</span>
                </Link>
              )}
              {features.trading && (
                <Link href="/trade" className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center hover:border-gold/40 hover:bg-white/[0.04] transition">
                  <span className="text-xl">📈</span>
                  <span className="text-xs font-bold text-white mt-2">Trade</span>
                </Link>
              )}
              <Link href="/transactions" className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center hover:border-gold/40 hover:bg-white/[0.04] transition">
                <span className="text-xl">📜</span>
                <span className="text-xs font-bold text-white mt-2">Transactions</span>
              </Link>
            </div>
          </div>

          {/* Recent ledger activity (real) */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/45">Recent INR Ledger Activity</h3>
              <Link href="/portfolio" className="text-[10px] text-gold font-bold hover:underline uppercase tracking-wide">View Ledger →</Link>
            </div>
            {inrLedgerQ.isLoading ? (
              <p className="text-xs text-white/40 py-6 text-center">Loading activity…</p>
            ) : transactions.length === 0 ? (
              <p className="text-xs text-white/40 py-6 text-center">No ledger activity yet.</p>
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

        {/* Right column: real portfolio allocation */}
        <div className="space-y-6">
          <div className="relative rounded-2xl border border-gold/15 bg-white/[0.03] p-5 shadow-gold-soft backdrop-blur-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gold">Portfolio Allocation</h3>
              <Link href="/portfolio" className="text-[9px] text-white/40 hover:text-gold transition font-bold uppercase">View Details</Link>
            </div>

            {allocationTotal === 0 && unvaluedAssets.length === 0 ? (
              <p className="text-xs text-white/40 py-8 text-center">No portfolio allocation yet.</p>
            ) : (
              <div className="space-y-2.5 text-xs pt-1">
                {inrValued.map((b) => (
                  <div key={b.asset} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-gold" />
                      <span className="text-white/60">Indian Rupee (INR)</span>
                    </div>
                    <span className="font-mono font-semibold text-white">
                      {allocationTotal > 0 ? ((b.total / allocationTotal) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </div>
                ))}
                {unvaluedAssets.map((b) => (
                  <div key={b.asset} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-white/30" />
                      <span className="text-white/60">{b.asset}</span>
                    </div>
                    <span className="font-mono text-white/40">valuation unavailable</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </UserShell>
  );
}
