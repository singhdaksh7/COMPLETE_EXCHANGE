'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { useUserFeatures } from '@/components/feature-gate';

/**
 * Wallet overview. All balances are the ledger's truth (available / locked /
 * total). INR is the only asset with a known INR valuation in INR_ONLY mode, so
 * the "Total Balance" and per-asset value are real INR figures — we never invent
 * a crypto→INR rate. Crypto deposit-address generation and crypto funding actions
 * are gated on the live feature map and stay hidden while crypto is disabled.
 */

const ASSET_NAMES: Record<string, string> = {
  INR: 'Indian Rupee',
  USDT: 'Tether',
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  BNB: 'BNB',
};

export default function WalletPage() {
  const ready = useGuard('user');
  const router = useRouter();
  const { features } = useUserFeatures();
  const q = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    enabled: ready,
  });

  const [search, setSearch] = useState('');

  if (!ready) return null;
  const data = q.data?.data;
  const balances = data?.assets ?? [];

  // Real INR-only total. Non-INR assets are shown but excluded from the INR total
  // because there is no on-platform valuation for them in INR_ONLY mode.
  const inrAsset = balances.find((b) => b.asset.toUpperCase() === 'INR');
  const inrTotal = Number(inrAsset?.total ?? 0);
  const hasAnyBalance = balances.some((b) => Number(b.total) > 0);
  const hasUnvalued = balances.some((b) => b.asset.toUpperCase() !== 'INR' && Number(b.total) > 0);

  const filteredAssets = balances.filter((b) => {
    const asset = b.asset.toUpperCase();
    const name = (ASSET_NAMES[asset] ?? '').toLowerCase();
    return asset.toLowerCase().includes(search.toLowerCase()) || name.includes(search.toLowerCase());
  });

  return (
    <UserShell className="max-w-[1400px]">
      {/* Title & actions */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Wallet Overview</h1>
          <p className="text-xs text-white/50 mt-1">Track your balances and move funds.</p>
        </div>
        <div className="flex gap-2.5">
          {features.inrDeposit && (
            <button
              onClick={() => router.push('/deposit')}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-gold to-gold-glow px-5 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
            >
              <span>📥</span> Deposit INR
            </button>
          )}
          {features.inrWithdrawal && (
            <button
              onClick={() => router.push('/inr-withdraw')}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs font-bold text-white hover:bg-white/[0.06] transition"
            >
              <span>📤</span> Withdraw INR
            </button>
          )}
          <button
            onClick={() => router.push('/transactions')}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs font-bold text-white hover:bg-white/[0.06] transition"
          >
            <span>📜</span> History
          </button>
        </div>
      </div>

      {q.isLoading && <p className="text-sm text-white/40 py-6">Retrieving ledger balances…</p>}
      {q.isError && <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">{errorMessage(q.error)}</div>}

      {data && (
        <div className="space-y-6">
          {/* Total balance */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 min-h-[120px]">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />
            <div className="relative z-10">
              <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Total Balance</span>
              <div className="text-3xl font-black text-white font-mono mt-1.5 tracking-tight">
                ₹{inrTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-white/40 font-mono mt-1">
                {hasAnyBalance ? 'INR ledger balance' : 'No balances yet'}
                {hasUnvalued ? ' · other assets shown below (valuation unavailable)' : ''}
              </div>
            </div>
          </div>

          {/* Search */}
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
          </div>

          {/* Assets table */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] font-bold text-white/45 uppercase tracking-wider border-b border-white/5">
                  <tr>
                    <th className="py-3.5 px-4">Asset</th>
                    <th>Total Balance</th>
                    <th>Available</th>
                    <th>In Order</th>
                    <th>Value (INR)</th>
                    <th className="text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredAssets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-white/40">
                        {hasAnyBalance ? 'No assets match your search.' : 'No balance yet. Deposit INR to get started.'}
                      </td>
                    </tr>
                  ) : (
                    filteredAssets.map((b) => {
                      const asset = b.asset.toUpperCase();
                      const name = ASSET_NAMES[asset] ?? 'Asset';
                      const isInr = asset === 'INR';
                      // Real INR value only for INR; never fabricate a crypto rate.
                      const value = isInr ? Number(b.total) : null;
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
                            {isInr ? `₹${Number(b.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : `${Number(b.total).toFixed(6)} ${asset}`}
                          </td>
                          <td className="font-mono text-white/80">
                            {isInr ? `₹${Number(b.available).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : `${Number(b.available).toFixed(6)} ${asset}`}
                          </td>
                          <td className="font-mono text-white/50">
                            {isInr ? `₹${Number(b.locked).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : `${Number(b.locked).toFixed(6)} ${asset}`}
                          </td>
                          <td className="font-mono text-gold font-bold">
                            {value === null ? '—' : `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </td>
                          <td className="text-right pr-4">
                            <div className="inline-flex gap-2">
                              {isInr && features.inrDeposit && (
                                <button
                                  onClick={() => router.push('/deposit')}
                                  className="rounded bg-white/5 border border-white/5 px-2.5 py-1 text-[10px] font-bold text-gold hover:bg-gold/10 hover:border-gold/20 transition"
                                >
                                  Deposit
                                </button>
                              )}
                              {isInr && features.inrWithdrawal && (
                                <button
                                  onClick={() => router.push('/inr-withdraw')}
                                  className="rounded bg-white/5 border border-white/5 px-2.5 py-1 text-[10px] font-bold text-gold hover:bg-gold/10 hover:border-gold/20 transition"
                                >
                                  Withdraw
                                </button>
                              )}
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
        </div>
      )}
    </UserShell>
  );
}
