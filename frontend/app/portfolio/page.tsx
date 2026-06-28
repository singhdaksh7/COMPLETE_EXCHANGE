'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { useUserFeatures } from '@/components/feature-gate';
import { CopyButton } from '@/components/wallet-bits';
import type { LedgerEntry } from '@/lib/types';

/**
 * Ledger history. Rows are REAL double-entry ledger postings (no fabricated
 * rows, no invented INR conversions). The backend's transaction `kind` is a
 * specific code (e.g. INR_DEPOSIT, INR_WITHDRAWAL_LOCK, TRADE_SETTLE); we map
 * those to user-facing groups so the Deposit/Withdrawal/Trade filters actually
 * match. Ledger postings are settled by construction, so there is no separate
 * pending/failed status here.
 */

type Group = 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE' | 'CONVERT' | 'TRANSFER' | 'OTHER';

/** Map a backend ledger txn kind to a user-facing group. */
function groupOf(kind: string): Group {
  const k = (kind ?? '').toUpperCase();
  if (k.includes('DEPOSIT')) return 'DEPOSIT';
  if (k.includes('WITHDRAW')) return 'WITHDRAWAL';
  if (k.startsWith('ORDER') || k.includes('TRADE')) return 'TRADE';
  if (k.includes('CONVERSION') || k.includes('CONVERT')) return 'CONVERT';
  if (k.includes('TRANSFER')) return 'TRANSFER';
  return 'OTHER';
}

const GROUP_LABEL: Record<Group, string> = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  TRADE: 'Trade',
  CONVERT: 'Convert',
  TRANSFER: 'Transfer',
  OTHER: 'Other',
};

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export default function PortfolioPage() {
  const ready = useGuard('user');
  const { features } = useUserFeatures();

  const [activeTab, setActiveTab] = useState<'ALL' | Group>('ALL');
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const walletQ = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    enabled: ready,
  });

  const inrLedgerQ = useQuery({
    queryKey: ['ledger-portfolio', 'INR'],
    queryFn: () => userApi.walletLedger('INR', 100),
    enabled: ready,
  });

  // Only pull the USDT ledger when the account actually has crypto-wallet access;
  // INR_ONLY users never fetch or see crypto ledger rows.
  const usdtLedgerQ = useQuery({
    queryKey: ['ledger-portfolio', 'USDT'],
    queryFn: () => userApi.walletLedger('USDT', 100),
    enabled: ready && features.cryptoWallet,
  });

  const balances = walletQ.data?.data.balances ?? [];
  const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');
  const usdt = balances.find((b) => b.asset.toUpperCase() === 'USDT');

  const rawActivity: LedgerEntry[] = useMemo(
    () =>
      [
        ...(inrLedgerQ.data?.data.items ?? []),
        ...(features.cryptoWallet ? usdtLedgerQ.data?.data.items ?? [] : []),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [inrLedgerQ.data, usdtLedgerQ.data, features.cryptoWallet],
  );

  const filteredActivity = useMemo(() => {
    const query = search.trim().toLowerCase();
    const fromTs = fromDate ? new Date(fromDate).getTime() : null;
    const toTs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    return rawActivity.filter((e) => {
      const group = groupOf(e.kind);
      const asset = e.asset.toUpperCase();
      const ts = new Date(e.createdAt).getTime();

      if (activeTab !== 'ALL' && group !== activeTab) return false;
      if (assetFilter !== 'ALL' && asset !== assetFilter) return false;
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      if (query) {
        const hay = `${e.id} ${e.kind} ${asset} ${GROUP_LABEL[group]}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [rawActivity, activeTab, assetFilter, fromDate, toDate, search]);

  function clearFilters() {
    setActiveTab('ALL');
    setAssetFilter('ALL');
    setFromDate('');
    setToDate('');
    setSearch('');
  }

  function exportCsv() {
    const header = ['date', 'type', 'kind', 'asset', 'direction', 'amount', 'ledger_id'];
    const lines = [header.join(',')];
    for (const e of filteredActivity) {
      lines.push(
        [
          new Date(e.createdAt).toISOString(),
          GROUP_LABEL[groupOf(e.kind)],
          e.kind,
          e.asset,
          e.direction,
          e.amount,
          e.id,
        ]
          .map(csvCell)
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ledger-history.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!ready) return null;

  const tabs: Array<{ id: 'ALL' | Group; label: string }> = [
    { id: 'ALL', label: 'All Transactions' },
    { id: 'DEPOSIT', label: 'Deposit' },
    { id: 'WITHDRAWAL', label: 'Withdrawal' },
    { id: 'TRADE', label: 'Trade' },
    { id: 'CONVERT', label: 'Convert' },
    { id: 'TRANSFER', label: 'Transfer' },
  ];

  return (
    <UserShell className="max-w-[1400px]">
      {/* Title & Export */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Ledger History</h1>
          <p className="text-xs text-white/50 mt-1">Every settled movement on your account, straight from the ledger.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={filteredActivity.length === 0}
          className="rounded-lg border border-gold/40 bg-gold/5 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {filteredActivity.length === 0 ? 'No data to export' : '📥 Export CSV'}
        </button>
      </div>

      {(inrLedgerQ.isLoading || usdtLedgerQ.isLoading) && (
        <p className="text-sm text-white/40 py-4">Loading ledger…</p>
      )}
      {(inrLedgerQ.isError || usdtLedgerQ.isError) && (
        <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
          {errorMessage(inrLedgerQ.error ?? usdtLedgerQ.error)}
        </div>
      )}

      <div className="space-y-6">
        {/* Balances */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5">
            <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">INR Available</span>
            <span className="text-2xl font-black text-white font-mono mt-1.5 block">
              ₹{Number(inr?.available ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-white/40 mt-1 block">Locked: ₹{Number(inr?.locked ?? 0).toFixed(2)}</span>
          </div>
          {features.cryptoWallet && (
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5">
              <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">USDT Available</span>
              <span className="text-2xl font-black text-white font-mono mt-1.5 block">
                {Number(usdt?.available ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT
              </span>
              <span className="text-[10px] text-white/40 mt-1 block">Locked: {Number(usdt?.locked ?? 0).toFixed(2)} USDT</span>
            </div>
          )}
        </div>

        {/* Filter toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-white/[0.01] border border-white/5 rounded-2xl p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Asset</label>
            <select
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="ALL">All Assets</option>
              <option value="INR">INR</option>
              {features.cryptoWallet && <option value="USDT">USDT</option>}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Search</label>
            <input
              placeholder="Ledger ID, kind, asset…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none placeholder:text-white/20"
            />
          </div>

          <div className="flex flex-col gap-1.5 justify-end">
            <button
              onClick={clearFilters}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/5 transition uppercase tracking-wider"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-white/5 pb-px font-sans text-xs font-bold uppercase tracking-wider">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 border-b-2 transition-all ${
                activeTab === tab.id ? 'border-gold text-gold bg-gold/5' : 'border-transparent text-white/45 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.01]">
                  <th className="py-3.5 px-4">Date &amp; Time</th>
                  <th className="py-3.5 px-3">Type</th>
                  <th className="py-3.5 px-3">Asset</th>
                  <th className="py-3.5 px-3">Amount</th>
                  <th className="py-3.5 px-3">Kind</th>
                  <th className="py-3.5 px-4 text-right">Ledger ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {filteredActivity.map((e) => {
                  const isCredit = e.direction === 'CREDIT';
                  const group = groupOf(e.kind);
                  return (
                    <tr key={`${e.asset}-${e.id}`} className="hover:bg-white/[0.01] transition-all">
                      <td className="py-3.5 px-4 text-white/55 text-[10px]">
                        {new Date(e.createdAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </td>
                      <td className="px-3 font-sans font-bold text-white">{GROUP_LABEL[group]}</td>
                      <td className="px-3 font-sans">
                        <span className="font-bold text-white/80">{e.asset}</span>
                      </td>
                      <td className="px-3">
                        <span className={`font-bold ${isCredit ? 'text-up' : 'text-down'}`}>
                          {isCredit ? '+' : '-'}
                          {e.asset === 'INR'
                            ? `₹${Number(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                            : `${e.amount} ${e.asset}`}
                        </span>
                      </td>
                      <td className="px-3 text-white/40 text-[10px] font-sans">{e.kind}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-[10px] text-white/40 flex items-center justify-end gap-2">
                        <span className="truncate max-w-[120px] select-all">{e.id.slice(0, 16)}</span>
                        <CopyButton value={e.id} />
                      </td>
                    </tr>
                  );
                })}
                {filteredActivity.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-white/40 font-sans">
                      No ledger entries match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center border-t border-white/5 py-4 px-4 bg-white/[0.01] font-sans">
            <span className="text-[10px] text-white/35">
              Showing {filteredActivity.length} of {rawActivity.length} ledger entries
            </span>
          </div>
        </div>
      </div>
    </UserShell>
  );
}
