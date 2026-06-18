'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { StatusBadge } from '@/components/ui';
import { CopyButton, ExplorerLink } from '@/components/wallet-bits';
import type { LedgerEntry } from '@/lib/types';

export default function PortfolioPage() {
  const ready = useGuard('user');
  const [activeTab, setActiveTab] = useState('ALL');
  
  // Filter states
  const [txType, setTxType] = useState('ALL');
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const walletQ = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    enabled: ready,
  });

  const inrLedgerQ = useQuery({
    queryKey: ['ledger-portfolio', 'INR'],
    queryFn: () => userApi.walletLedger('INR', 50),
    enabled: ready,
  });

  const usdtLedgerQ = useQuery({
    queryKey: ['ledger-portfolio', 'USDT'],
    queryFn: () => userApi.walletLedger('USDT', 50),
    enabled: ready,
  });

  const balances = walletQ.data?.data.balances ?? [];
  const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');
  const usdt = balances.find((b) => b.asset.toUpperCase() === 'USDT');

  // Combine ledger items
  const rawActivity: LedgerEntry[] = [
    ...(inrLedgerQ.data?.data.items ?? []),
    ...(usdtLedgerQ.data?.data.items ?? []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Filter combined ledger items dynamically
  const filteredActivity = useMemo(() => {
    return rawActivity.filter((e: any) => {
      const kind = e.kind.toUpperCase();
      const asset = e.asset.toUpperCase();
      const status = (e.status ?? 'COMPLETED').toUpperCase();
      const query = search.toLowerCase();

      const searchMatch =
        e.id.toLowerCase().includes(query) ||
        (e.remarks ?? '').toLowerCase().includes(query) ||
        kind.includes(query) ||
        asset.includes(query);

      let tabMatch = true;
      if (activeTab === 'DEPOSIT') tabMatch = kind === 'DEPOSIT';
      else if (activeTab === 'WITHDRAWAL') tabMatch = kind === 'WITHDRAW' || kind === 'WITHDRAWAL';
      else if (activeTab === 'TRADE') tabMatch = kind === 'TRADE' || kind === 'ORDER' || kind === 'FEE';
      else if (activeTab === 'TRANSFER') tabMatch = kind === 'TRANSFER';
      else if (activeTab === 'CONVERT') tabMatch = kind === 'CONVERT';

      let typeDropdownMatch = true;
      if (txType !== 'ALL') {
        typeDropdownMatch = kind === txType;
      }

      let assetDropdownMatch = true;
      if (assetFilter !== 'ALL') {
        assetDropdownMatch = asset === assetFilter;
      }

      let statusDropdownMatch = true;
      if (statusFilter !== 'ALL') {
        statusDropdownMatch = status === statusFilter;
      }

      return searchMatch && tabMatch && typeDropdownMatch && assetDropdownMatch && statusDropdownMatch;
    });
  }, [rawActivity, search, activeTab, txType, assetFilter, statusFilter]);

  // Static Prices in INR for calculation
  const prices: Record<string, number> = {
    INR: 1,
    USDT: 83.20,
    BTC: 5600000,
    ETH: 292000,
  };

  if (!ready) return null;

  return (
    <UserShell className="max-w-[1400px]">
      
      {/* Title & Export */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Ledger History</h1>
          <p className="text-xs text-white/50 mt-1">View all your account transaction history in one place.</p>
        </div>
        <button className="rounded-lg border border-gold/40 bg-gold/5 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider">
          📥 Export
        </button>
      </div>

      {(inrLedgerQ.isLoading || usdtLedgerQ.isLoading) && <p className="text-sm text-white/40 py-4">Calculating ledger logs...</p>}
      {(inrLedgerQ.isError || usdtLedgerQ.isError) && (
        <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
          {errorMessage(inrLedgerQ.error ?? usdtLedgerQ.error)}
        </div>
      )}

      {/* Main Ledger Section */}
      <div className="space-y-6">
        
        {/* Balances widgets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5">
            <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">INR Available Ledger</span>
            <span className="text-2xl font-black text-white font-mono mt-1.5 block">
              ₹{Number(inr?.available ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-white/40 mt-1 block">Locked: ₹{Number(inr?.locked ?? 0).toFixed(2)}</span>
          </div>
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5">
            <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">USDT Cryptographic Ledger</span>
            <span className="text-2xl font-black text-white font-mono mt-1.5 block">
              {Number(usdt?.available ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT
            </span>
            <span className="text-[10px] text-white/40 mt-1 block">Locked: {Number(usdt?.locked ?? 0).toFixed(2)} USDT</span>
          </div>
        </div>

        {/* Filter Toolbar Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-white/[0.01] border border-white/5 rounded-2xl p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Transaction Type</label>
            <select
              value={txType}
              onChange={(e) => setTxType(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="ALL">All Types</option>
              <option value="DEPOSIT">Deposit</option>
              <option value="WITHDRAW">Withdrawal</option>
              <option value="TRADE">Trade</option>
              <option value="TRANSFER">Transfer</option>
              <option value="CONVERT">Convert</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Asset</label>
            <select
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="ALL">All Assets</option>
              <option value="INR">INR</option>
              <option value="USDT">USDT</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="ALL">All Status</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Processing</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Date Range</label>
            <div className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white/60 flex items-center gap-2">
              <span>📅</span>
              <span>May 01, 2025 - May 12, 2025</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Search</label>
            <input
              placeholder="Search by TxID or remarks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none placeholder:text-white/20"
            />
          </div>
        </div>

        {/* Horizontal Navigation Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-white/5 pb-px font-sans text-xs font-bold uppercase tracking-wider">
          {[
            { id: 'ALL', label: 'All Transactions' },
            { id: 'DEPOSIT', label: 'Deposit' },
            { id: 'WITHDRAWAL', label: 'Withdrawal' },
            { id: 'TRADE', label: 'Trading' },
            { id: 'TRANSFER', label: 'Transfer' },
            { id: 'CONVERT', label: 'Convert' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-gold text-gold bg-gold/5'
                  : 'border-transparent text-white/45 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dense Table */}
        <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.01]">
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-3">Type</th>
                  <th className="py-3.5 px-3">Asset</th>
                  <th className="py-3.5 px-3">Amount</th>
                  <th className="py-3.5 px-3">Network</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-4 text-right">TX ID / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {filteredActivity.map((e: any) => {
                  const isCredit = e.direction === 'CREDIT';
                  const kind = e.kind.toUpperCase();
                  
                  // Direction Arrow Icon
                  let dirIcon = '🔄';
                  if (kind === 'DEPOSIT') dirIcon = '📥';
                  else if (kind === 'WITHDRAW' || kind === 'WITHDRAWAL') dirIcon = '📤';
                  else if (kind === 'TRADE') dirIcon = '📈';
                  else if (kind === 'TRANSFER') dirIcon = '↔️';

                  // Network representation
                  let net = 'Spot';
                  if (e.asset.toUpperCase() === 'USDT') net = 'TRC20';
                  else if (e.remarks?.toUpperCase().includes('UPI')) net = 'UPI';
                  else if (e.remarks?.toUpperCase().includes('IMPS')) net = net = 'IMPS';

                  const amountNum = Number(e.amount);
                  const rate = prices[e.asset.toUpperCase()] ?? 83.20;
                  const inrEquiv = amountNum * rate;

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
                      <td className="px-3 font-sans">
                        <span className="flex items-center gap-1.5 text-white font-bold">
                          <span>{dirIcon}</span>
                          {e.kind}
                        </span>
                      </td>
                      <td className="px-3 font-sans">
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-5 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center font-bold text-gold text-[8px] shrink-0">
                            {e.asset.slice(0, 2)}
                          </div>
                          <span className="font-bold text-white/80">{e.asset}</span>
                        </div>
                      </td>
                      <td className="px-3">
                        <span className={`font-bold block ${isCredit ? 'text-up' : 'text-down'}`}>
                          {isCredit ? '+' : '-'}
                          {amountNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })} {e.asset}
                        </span>
                        <span className="text-[9px] text-white/30 block mt-0.5">
                          ≈ ₹{inrEquiv.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-3 text-white/70 font-sans">{net}</td>
                      <td className="px-3">
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-[10px] text-white/40 flex items-center justify-end gap-2">
                        <span className="truncate max-w-[120px] select-all">{e.id.slice(0, 16)}</span>
                        <CopyButton value={e.id} />
                      </td>
                    </tr>
                  );
                })}
                {filteredActivity.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-white/40 font-sans">
                      No matching transaction records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center border-t border-white/5 py-4 px-4 bg-white/[0.01] font-sans">
            <span className="text-[10px] text-white/35">
              Showing 1 to {filteredActivity.length} of {rawActivity.length} records
            </span>
            <div className="flex gap-1">
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
    </UserShell>
  );
}
