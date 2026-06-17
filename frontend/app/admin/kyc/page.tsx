'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';
import type { AdminKycQueueItem } from '@/lib/types';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

export default function AdminKycPage() {
  const ready = useGuard('admin');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const q = useQuery({
    queryKey: ['admin-kyc', cursor ?? 'first'],
    queryFn: () => adminApi.kycQueue({ cursor, limit: 20 }),
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

      <main className="relative z-10 mx-auto max-w-6xl px-5 pt-8">
        
        {/* Desk Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">
              Compliance Review Command Center
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Audit automated provider risk scores, PII matching, and manual overrides.
            </p>
          </div>
          <button 
            onClick={() => q.refetch()}
            className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-5 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
          >
            Refresh Queue
          </button>
        </div>

        {q.isLoading && <p className="text-sm text-white/40">Loading review queue...</p>}
        {q.isError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{errorMessage(q.error)}</div>}

        {data && (
          <div className="relative rounded-2xl border border-gold/15 bg-white/[0.03] shadow-gold-soft backdrop-blur-2xl overflow-hidden">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
            
            {data.items.length === 0 ? (
              <p className="text-sm text-white/40 py-12 text-center relative z-10">Verification queue is completely clear.</p>
            ) : (
              <div className="overflow-x-auto relative z-10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-left text-white/45 font-semibold bg-white/[0.01]">
                      <th className="py-4 px-5">Applicant Details</th>
                      <th className="py-4 px-5">Overall Status</th>
                      <th className="py-4 px-5">Provider</th>
                      <th className="py-4 px-5">Biometric status</th>
                      <th className="py-4 px-5">Risk score</th>
                      <th className="py-4 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <QueueRow key={item.userId} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination desk footer */}
            <div className="mt-4 flex gap-2 justify-between items-center border-t border-white/5 py-4 px-5 relative z-10">
              <span className="text-xs text-white/35">Desk Queue Navigation</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setCursor(undefined)} 
                  disabled={!cursor}
                  className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-2 text-xs font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition disabled:opacity-40"
                >
                  First Page
                </button>
                <button
                  onClick={() => data.nextCursor && setCursor(data.nextCursor)}
                  disabled={!data.nextCursor}
                  className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-2 text-xs font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition disabled:opacity-40"
                >
                  Next Page
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function QueueRow({ item }: { item: AdminKycQueueItem }) {
  const qc = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [tier, setTier] = useState(item.tier || 1);
  const [reason, setReason] = useState('');

  const m = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REJECT') =>
      adminApi.decide(
        item.userId,
        decision === 'APPROVE' ? { decision, tier } : { decision, reason },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-kyc'] });
    },
  });

  return (
    <>
      <tr 
        className={`border-b border-white/5 hover:bg-white/[0.02] transition cursor-pointer ${isExpanded ? 'bg-white/[0.02]' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="py-4 px-5">
          <div className="font-semibold text-white">{item.fullName ?? 'Anonymous Profile'}</div>
          <div className="text-[11px] text-white/40 mt-0.5">{item.email}</div>
          <div className="text-[9px] text-white/30 mt-1">Submitted: {new Date(item.submittedAt).toLocaleString()}</div>
        </td>
        <td className="py-4 px-5">
          <StatusBadge status={item.status} />
        </td>
        <td className="py-4 px-5 text-white/80 font-medium">
          {item.provider ?? '—'}
        </td>
        <td className="py-4 px-5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
            item.livenessStatus === 'PASS' 
              ? 'bg-up/10 text-up' 
              : item.livenessStatus === 'FAIL' 
              ? 'bg-down/10 text-down' 
              : 'bg-white/5 text-white/35'
          }`}>
            {item.livenessStatus ?? 'PENDING'}
          </span>
        </td>
        <td className="py-4 px-5 font-mono font-bold">
          {item.riskScore !== undefined && item.riskScore !== null ? (
            <span className={item.riskScore > 50 ? 'text-down' : item.riskScore > 25 ? 'text-brand' : 'text-up'}>
              {item.riskScore}%
            </span>
          ) : (
            <span className="text-white/20">—</span>
          )}
        </td>
        <td className="py-4 px-5 text-right">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="text-xs text-gold font-bold hover:underline"
          >
            {isExpanded ? 'Collapse' : 'Audit Details'}
          </button>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-white/[0.01]">
          <td colSpan={6} className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 rounded-xl border border-white/5 bg-noir-2/95 p-5 shadow-gold-soft">
              
              {/* Left Column: Diagnostics */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-gold border-b border-white/5 pb-2">Verification Diagnostics</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-white/40">Provider</span><span className="font-semibold text-white">{item.provider ?? 'UNAVAILABLE'}</span></div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Biometric Liveness</span>
                    <span className={`font-semibold ${item.livenessStatus === 'PASS' ? 'text-up' : 'text-down'}`}>
                      {item.livenessStatus ?? 'PENDING'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Document Scan check</span>
                    <span className={`font-semibold ${item.documentStatus === 'PASS' ? 'text-up' : 'text-down'}`}>
                      {item.documentStatus ?? 'PENDING'}
                    </span>
                  </div>
                  {item.riskScore !== undefined && item.riskScore !== null && (
                    <div className="flex justify-between">
                      <span className="text-white/40">Risk Assessment Index</span>
                      <span className={`font-semibold ${item.riskScore > 50 ? 'text-down' : 'text-up'}`}>
                        {item.riskScore}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Middle Column: Credentials */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-gold border-b border-white/5 pb-2">Vaulted Identifiers</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-white/40">Masked PAN</span><code className="font-mono text-white bg-white/5 px-1.5 py-0.5 rounded text-[10px]">{item.panMasked ?? '—'}</code></div>
                  <div className="flex justify-between"><span className="text-white/40">Masked Aadhaar</span><code className="font-mono text-white bg-white/5 px-1.5 py-0.5 rounded text-[10px]">{item.aadhaarMasked ?? '—'}</code></div>
                  <div className="flex justify-between"><span className="text-white/40">Registration ID</span><code className="font-mono text-white/45 text-[9px] break-all truncate max-w-[120px]">{item.userId}</code></div>
                </div>
              </div>

              {/* Right Column: Decision Form */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-gold border-b border-white/5 pb-2">Manual Audit Action</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-white/50">Tiers Level:</span>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={tier}
                      onChange={(e) => setTier(Number(e.target.value))}
                      className="w-16 rounded-lg border border-white/10 bg-noir/80 px-3 py-1 text-sm text-white focus:border-gold/60 focus:outline-none"
                    />
                  </div>
                  
                  <div>
                    <input
                      placeholder="rejection reasons (required to reject)"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-noir/80 px-3 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-gold/60 focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); m.mutate('APPROVE'); }} 
                      disabled={m.isPending}
                      className="flex-1 rounded-lg bg-gradient-to-r from-gold to-gold-glow px-3 py-2 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
                    >
                      Approve
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); m.mutate('REJECT'); }} 
                      disabled={m.isPending || !reason}
                      className="flex-1 rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-2 text-xs font-bold text-white hover:border-gold/40 hover:bg-white/[0.06] transition disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>

                  {m.isError && (
                    <span className="text-xs text-down block">{errorMessage(m.error)}</span>
                  )}
                  {m.isSuccess && (
                    <span className="text-xs text-up block">Decision registered successfully!</span>
                  )}
                </div>
              </div>

            </div>
          </td>
        </tr>
      )}
    </>
  );
}
