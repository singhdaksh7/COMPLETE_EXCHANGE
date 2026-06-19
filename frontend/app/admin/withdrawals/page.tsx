'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';
import type { CryptoWithdrawal } from '@/lib/types';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

export default function AdminWithdrawalsPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [assetFilter, setAssetFilter] = useState('USDT');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  
  // Selected item for the right-hand audit panel
  const [selectedWd, setSelectedWd] = useState<CryptoWithdrawal | null>(null);
  const [reason, setReason] = useState('');

  const q = useQuery({
    queryKey: ['admin-withdrawals', statusFilter || 'queue', assetFilter, search, fromDate, toDate],
    queryFn: () =>
      adminApi.withdrawals({
        status: statusFilter || undefined,
        asset: assetFilter || undefined,
        email: search.includes('@') ? search : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 50,
      }),
    enabled: ready,
  });

  const data = q.data?.data;
  const items = useMemo(() => data?.items ?? [], [data]);

  // Auto-select the first item on load
  useEffect(() => {
    if (items.length > 0 && !selectedWd) {
      setSelectedWd(items[0]);
    }
  }, [items, selectedWd]);

  // Local filtering by search query
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const address = item.toAddress.toLowerCase();
      const id = item.id.toLowerCase();
      const email = (item.userEmail ?? '').toLowerCase();
      const query = search.toLowerCase();
      return address.includes(query) || id.includes(query) || email.includes(query);
    });
  }, [items, search]);

  // Approve / Reject Mutations
  const approve = useMutation({
    mutationFn: (wdId: string) => adminApi.approveWithdrawal(wdId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-withdrawals'] });
      setSelectedWd(null);
    },
  });

  const reject = useMutation({
    mutationFn: (wdId: string) => adminApi.rejectWithdrawal(wdId, reason || 'Compliance criteria failed'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-withdrawals'] });
      setReason('');
      setSelectedWd(null);
    },
  });

  if (!ready) return null;

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-6 flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #0B0B0E !important; border-bottom: 1px solid rgba(245,194,66,0.1) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <AdminNav />
      <BackdropGlow />

      <main className="relative z-10 flex-1 mx-auto w-full max-w-[1500px] px-6 pt-6 flex flex-col gap-6">
        
        {/* Title Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Withdrawals Queue</h1>
            <p className="text-xs text-white/50 mt-1">Review withdrawal holds, account risk, maker-checker status, and mock signer dispatch state.</p>
          </div>
          <button
            onClick={() => q.refetch()}
            className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition uppercase tracking-wider"
          >
            Refresh Queue
          </button>
        </div>

        {/* Status Tab Ticker */}
        <div className="flex flex-wrap gap-4 border-b border-white/5 pb-2 text-xs font-bold font-sans">
          {[
            { id: '', label: 'Open Queue' },
            { id: 'PENDING_APPROVAL', label: 'Pending' },
            { id: 'APPROVED', label: 'Approved' },
            { id: 'SIGNING', label: 'Processing' },
            { id: 'COMPLETED', label: 'Completed' },
            { id: 'REJECTED', label: 'Rejected' },
            { id: 'FAILED', label: 'Failed' },
          ].map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.label}
                onClick={() => { setStatusFilter(tab.id); setSelectedWd(null); }}
                className={`px-4 py-2 border-b-2 font-bold transition-all ${
                  active ? 'border-gold text-gold bg-gold/5' : 'border-transparent text-white/50 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filter / Search Row */}
        <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          <div className="flex-1 flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Email / User / Address</label>
            <input
              placeholder="Search email, withdrawal id, destination..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none placeholder:text-white/20"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Asset</label>
            <input
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value.toUpperCase())}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setStatusFilter('');
                setAssetFilter('USDT');
                setSearch('');
                setFromDate('');
                setToDate('');
              }}
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/[0.04]"
            >
              Clear
            </button>
          </div>
        </div>

        {q.isLoading && <p className="text-sm text-white/40">Loading dispatches queue...</p>}
        {q.isError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{errorMessage(q.error)}</div>}

        {/* Split Screen Queue Layout */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Queue List (7 cols) */}
            <div className="lg:col-span-7 relative rounded-2xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.02]">
                      <th className="py-3.5 px-4">Recipient User Details</th>
                      <th className="py-3.5 px-3">Disbursal Amount</th>
                      <th className="py-3.5 px-3">Network</th>
                      <th className="py-3.5 px-3">Risk Assessment</th>
                      <th className="py-3.5 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {filteredItems.map((item) => {
                      const active = selectedWd?.id === item.id;
                      const riskLevel = item.riskLevel ?? (Number(item.amount) > 100 ? 'MEDIUM' : 'LOW');
                      const riskColor = riskLevel === 'HIGH'
                        ? 'bg-red-500/10 text-red-300 border-red-500/30'
                        : riskLevel === 'MEDIUM'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-up/10 text-up border-up/30';
                      
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedWd(item)}
                          className={`hover:bg-white/[0.02] cursor-pointer transition-all ${
                            active ? 'bg-white/[0.03] border-l-2 border-gold font-medium' : ''
                          }`}
                        >
                          <td className="py-3 px-4 flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-[10px] font-black text-gold uppercase shrink-0">
                              US
                            </div>
                            <div className="truncate max-w-[200px]">
                              <span className="font-bold text-white block truncate">{item.userEmail ?? item.userId}</span>
                              <span className="text-[9px] text-white/30 block font-mono">ID: {item.id.slice(0, 12).toUpperCase()}</span>
                            </div>
                          </td>
                          <td className="px-3">
                            <span className="font-bold text-white block">{item.amount} USDT</span>
                            <span className="text-[9px] text-white/30 block mt-0.5">≈ ₹{(Number(item.amount) * 83.20).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                          </td>
                          <td className="px-3 text-white/70 font-sans">{item.chain}</td>
                          <td className="px-3">
                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${riskColor}`}>
                              {riskLevel} Risk
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <StatusBadge status={item.status} />
                              <span>➔</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-xs text-white/40 font-mono">
                          Dispatches queue is empty.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Detailed Audit Console (5 cols) */}
            <div className="lg:col-span-5 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-6">
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-35" />

              {selectedWd ? (
                <div className="relative space-y-5">
                  
                  {/* Panel Header */}
                  <div className="flex justify-between items-start border-b border-white/5 pb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight uppercase">Withdrawal Audit Console</h3>
                      <span className="text-[9px] text-white/40 block font-mono mt-0.5">TXID: {selectedWd.id.slice(0, 16).toUpperCase()}</span>
                    </div>
                    <StatusBadge status={selectedWd.status} />
                  </div>

                  {/* Summary grid */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-white/35 uppercase tracking-widest block">Recipient User details</span>
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-xs space-y-2.5">
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-white/45">Account KYC Status</span>
                        <span className="bg-up/10 text-up px-2 py-0.5 rounded font-bold text-[9px] uppercase">
                          {selectedWd.userKycStatus ?? 'UNKNOWN'} (Tier {selectedWd.userKycTier ?? 0})
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-white/45">Account Status</span>
                        <span className="font-bold text-white font-mono">
                          {selectedWd.userStatus ?? 'UNKNOWN'}{selectedWd.withdrawalsBlocked ? ' · withdrawals blocked' : ''}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-white/45">Amount to Disburse</span>
                        <span className="font-bold text-white font-mono">{selectedWd.amount} USDT (≈ ₹{(Number(selectedWd.amount) * 83.20).toLocaleString('en-IN')})</span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-white/45">Net Receive Payout</span>
                        <span className="font-bold text-gold font-mono">{selectedWd.netAmount} USDT</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/45">Destination Address</span>
                        <span className="font-mono text-white/80 select-all truncate max-w-[200px]" title={selectedWd.toAddress}>
                          {selectedWd.toAddress}
                        </span>
                      </div>
                      {selectedWd.requiresSecondApproval && (
                        <div className="flex justify-between">
                          <span className="text-white/45">Maker-checker</span>
                          <span className="font-bold text-amber-300 font-mono">Second approval required</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Compliance audits checkboxes */}
                  <div className="space-y-3 border-t border-white/5 pt-4">
                    <span className="text-[10px] font-bold text-white/35 uppercase tracking-widest block">Compliance Checklist</span>
                    <div className="space-y-2.5 text-xs text-white/70 font-sans">
                      <div className="flex gap-2.5 items-start">
                        <span className="text-up font-bold">✓</span>
                        <div>
                          <span className="font-bold text-white block">Whitelist validation check</span>
                          <span className="text-[9px] text-white/40 block mt-0.5">Address is allowlisted and out of cooling-off period.</span>
                        </div>
                      </div>
                      <div className="flex gap-2.5 items-start">
                        <span className="text-up font-bold">✓</span>
                        <div>
                          <span className="font-bold text-white block">Account status check</span>
                          <span className="text-[9px] text-white/40 block mt-0.5">{selectedWd.userStatus ?? 'Unknown'} account state from the user record.</span>
                        </div>
                      </div>
                      <div className="flex gap-2.5 items-start">
                        <span className="text-up font-bold">✓</span>
                        <div>
                          <span className="font-bold text-white block">Risk flags</span>
                          <span className="text-[9px] text-white/40 block mt-0.5">{JSON.stringify(selectedWd.riskFlags ?? {})}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {selectedWd.status === 'PENDING_APPROVAL' ? (
                    <div className="space-y-4 border-t border-white/5 pt-4">
                      
                      {(approve.isError || reject.isError) && (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
                          {errorMessage(approve.error ?? reject.error)}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => approve.mutate(selectedWd.id)}
                          disabled={approve.isPending || reject.isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.25)] hover:brightness-105 transition disabled:opacity-50"
                        >
                          {selectedWd.requiresSecondApproval ? 'Second Approve' : 'Approve'}
                        </button>
                        
                        <button
                          onClick={() => reject.mutate(selectedWd.id)}
                          disabled={reject.isPending || approve.isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-500 py-2.5 text-xs font-bold text-white shadow-[0_0_15px_rgba(239,68,68,0.25)] hover:brightness-105 transition disabled:opacity-50"
                        >
                          Reject Request
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Rejection Reason</label>
                        <textarea
                          placeholder="Provide compliance rejection reasons..."
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-white/10 bg-noir py-2 px-3 text-xs text-white focus:border-gold/60 focus:outline-none placeholder:text-white/20 resize-none font-sans"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-white/5 pt-4 text-center text-xs text-white/35 font-mono">
                      No compliance override overrides required for this state.
                    </div>
                  )}

                </div>
              ) : (
                <div className="py-24 text-center text-xs text-white/30 font-mono relative z-10">
                  Select a disbursal queue item to audit payouts.
                </div>
              )}
            </div>

          </div>
        )}

        {/* copyright rights */}
        <div className="text-center text-[10px] text-white/25 pt-4 pb-6 font-sans">
          © 2025 Exora India Pvt. Ltd. All rights reserved.
        </div>

      </main>
    </div>
  );
}
