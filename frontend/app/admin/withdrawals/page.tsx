'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';
import type { CryptoWithdrawal } from '@/lib/types';

const STATUSES = [
  '',
  'PENDING_APPROVAL',
  'APPROVED',
  'BROADCAST',
  'CONFIRMING',
  'COMPLETED',
  'REJECTED',
  'FAILED',
];

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[350px] w-[350px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[350px] w-[350px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

export default function AdminWithdrawalsPage() {
  const ready = useGuard('admin');
  const [status, setStatus] = useState('');

  const q = useQuery({
    queryKey: ['admin-withdrawals', status || 'queue'],
    queryFn: () => adminApi.withdrawals({ status: status || undefined, limit: 50 }),
    enabled: ready,
  });

  if (!ready) return null;
  const data = q.data?.data;

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-20">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #111114 !important; border-bottom: 1px solid rgba(245,194,66,0.15) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <AdminNav />
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-5xl px-5 pt-8">
        
        {/* Header */}
        <div className="mb-8 flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">USDT Disbursal Queue</h1>
            <p className="text-xs text-white/50 mt-1">Audit outbox transactions and sign approvals.</p>
          </div>
        </div>

        <div className="relative rounded-2xl border border-gold/15 bg-white/[0.03] shadow-gold-soft backdrop-blur-2xl overflow-hidden p-6 space-y-6">
          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
          
          <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3 justify-between border-b border-white/5 pb-4">
            <div className="w-full sm:w-56 flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Queue Filter Status</label>
              <select 
                value={status} 
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s} className="bg-noir">
                    {s || 'Pending Approval queue (default)'}
                  </option>
                ))}
              </select>
            </div>
            <button 
              onClick={() => q.refetch()}
              className="w-full sm:w-auto rounded-lg border border-white/[0.12] bg-white/[0.02] px-5 py-2.5 text-xs font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition"
            >
              Refresh Queue
            </button>
          </div>

          {q.isLoading && <p className="text-sm text-white/40">Loading dispatches...</p>}
          {q.isError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{errorMessage(q.error)}</div>}

          {data && (data.items.length === 0 ? (
            <p className="text-xs text-white/30 py-6 text-center relative z-10">Withdrawal queue is clear.</p>
          ) : (
            <div className="overflow-x-auto relative z-10">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.01]">
                    <th className="py-3 px-3">Destination Address</th>
                    <th className="py-3 px-3">Amount</th>
                    <th className="py-3 px-3">Net (USDT)</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Manual Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.items.map((w) => (
                    <QueueRow key={w.id} item={w} />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function QueueRow({ item }: { item: CryptoWithdrawal }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  const approve = useMutation({
    mutationFn: () => adminApi.approveWithdrawal(item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-withdrawals'] }),
  });
  const reject = useMutation({
    mutationFn: () => adminApi.rejectWithdrawal(item.id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-withdrawals'] }),
  });

  const decidable = item.status === 'PENDING_APPROVAL';

  return (
    <tr className="hover:bg-white/[0.01] transition align-top">
      <td className="py-4 px-3 font-mono text-[10px] text-white/50">{item.toAddress}</td>
      <td className="py-4 px-3 font-mono text-white">{item.amount}</td>
      <td className="py-4 px-3 font-mono text-gold font-semibold">{item.netAmount}</td>
      <td className="py-4 px-3">
        <StatusBadge status={item.status} />
      </td>
      <td className="py-3 px-3">
        {decidable ? (
          <div className="flex flex-col items-start gap-2 max-w-[240px]">
            <input
              placeholder="rejection reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-noir py-1.5 px-3 text-xs text-white placeholder:text-white/20 focus:border-gold/60 focus:outline-none"
            />
            <div className="flex gap-2 w-full">
              <button 
                onClick={() => approve.mutate()} 
                disabled={approve.isPending}
                className="flex-1 rounded-lg bg-gradient-to-r from-gold to-gold-glow py-1.5 text-[10px] font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
              >
                Approve
              </button>
              <button
                onClick={() => reject.mutate()}
                disabled={reject.isPending || !reason}
                className="flex-1 rounded-lg border border-white/[0.12] bg-white/[0.03] py-1.5 text-[10px] font-bold text-white hover:border-gold/40 hover:bg-white/[0.06] transition disabled:opacity-40"
              >
                Reject
              </button>
            </div>
            {(approve.isError || reject.isError) && (
              <span className="text-[10px] text-down">
                {errorMessage(approve.error ?? reject.error)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-white/20">—</span>
        )}
      </td>
    </tr>
  );
}
