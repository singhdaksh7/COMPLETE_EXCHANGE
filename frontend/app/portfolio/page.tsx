'use client';

import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';
import type { LedgerEntry } from '@/lib/types';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[350px] w-[350px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[350px] w-[350px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

export default function PortfolioPage() {
  const ready = useGuard('user');

  const walletQ = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    enabled: ready,
  });
  const inrLedgerQ = useQuery({
    queryKey: ['ledger', 'INR'],
    queryFn: () => userApi.walletLedger('INR', 15),
    enabled: ready,
  });
  const usdtLedgerQ = useQuery({
    queryKey: ['ledger', 'USDT'],
    queryFn: () => userApi.walletLedger('USDT', 15),
    enabled: ready,
  });

  if (!ready) return null;

  const balances = walletQ.data?.data.balances ?? [];
  const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');
  const usdt = balances.find((b) => b.asset.toUpperCase() === 'USDT');

  const activity: LedgerEntry[] = [
    ...(inrLedgerQ.data?.data.items ?? []),
    ...(usdtLedgerQ.data?.data.items ?? []),
  ].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-20">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #111114 !important; border-bottom: 1px solid rgba(245,194,66,0.15) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <UserNav />
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-4xl px-5 pt-8">
        
        {/* Header */}
        <div className="mb-8 flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Asset Portfolio</h1>
            <p className="text-xs text-white/50 mt-1">Audit ledger balances and historical transaction entries.</p>
          </div>
        </div>

        {walletQ.isLoading && <p className="text-sm text-white/40">Calculating balances...</p>}
        {walletQ.isError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{errorMessage(walletQ.error)}</div>}

        {/* Balance Tiles */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          
          <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-5 shadow-gold-soft backdrop-blur-2xl">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
            <div className="relative z-10">
              <h2 className="text-[10px] font-bold text-white/45 uppercase tracking-wider mb-1">INR Valued Balance</h2>
              <div className="text-3xl font-black text-gold font-mono">₹{inr?.available ?? '0'}</div>
              <div className="mt-2 text-xs text-white/40 flex justify-between border-t border-white/5 pt-2">
                <span>Locked: ₹{inr?.locked ?? '0'}</span>
                <span>Total: ₹{inr?.total ?? '0'}</span>
              </div>
            </div>
          </div>

          <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-5 shadow-gold-soft backdrop-blur-2xl">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
            <div className="relative z-10">
              <h2 className="text-[10px] font-bold text-white/45 uppercase tracking-wider mb-1">USDT Cryptographic Balance</h2>
              <div className="text-3xl font-black text-gold font-mono">{usdt?.available ?? '0'}</div>
              <div className="mt-2 text-xs text-white/40 flex justify-between border-t border-white/5 pt-2">
                <span>Locked: {usdt?.locked ?? '0'}</span>
                <span>Total: {usdt?.total ?? '0'}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Ledger Activity list */}
        <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-6">
          
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-sm font-bold text-white tracking-tight">Recent Ledger Activities</h3>
            <p className="text-[10px] text-white/40 mt-0.5">Audit log of credits & debits processed securely.</p>
          </div>

          {(inrLedgerQ.isError || usdtLedgerQ.isError) && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
              {errorMessage(inrLedgerQ.error ?? usdtLedgerQ.error)}
            </div>
          )}

          {activity.length === 0 ? (
            <p className="text-xs text-white/40 py-6 text-center">No ledger logs matching criteria found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-white/45 uppercase tracking-wider font-semibold bg-white/[0.01] text-[10px]">
                    <th className="py-3 px-3">Transaction Time</th>
                    <th className="py-3 px-3">Class</th>
                    <th className="py-3 px-3">Asset</th>
                    <th className="py-3 px-3">Direction</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {activity.map((e) => (
                    <tr key={`${e.asset}-${e.id}`} className="hover:bg-white/[0.01] transition">
                      <td className="py-3.5 px-3 text-white/45 font-mono text-[10px]">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-3 font-medium text-white">{e.kind}</td>
                      <td className="py-3.5 px-3 text-white/70">{e.asset}</td>
                      <td className="py-3.5 px-3">
                        <span className={`font-bold text-[10px] uppercase px-1.5 py-0.5 rounded ${e.direction === 'CREDIT' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                          {e.direction}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-semibold text-white">
                        {e.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
