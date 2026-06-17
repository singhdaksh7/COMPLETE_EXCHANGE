'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Card, Button, Alert, StatusBadge, Row } from '@/components/ui';
import type { AdminKycQueueItem } from '@/lib/types';

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
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-ink">KYC Manual Review Desk</h1>
            <p className="text-xs text-muted mt-1">
              Verify provider signals, risk ratings, and review document scans.
            </p>
          </div>
          <Button onClick={() => q.refetch()} variant="secondary">Refresh Queue</Button>
        </div>

        {q.isLoading && <p className="text-sm text-gray-500">Loading queue...</p>}
        {q.isError && <div className="mb-4"><Alert>{errorMessage(q.error)}</Alert></div>}

        {data && (
          <Card className="overflow-hidden border-line">
            {data.items.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">No KYC submissions pending review.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-muted font-medium bg-panel-2/30">
                      <th className="py-3 px-4 font-semibold">User Details</th>
                      <th className="py-3 px-4 font-semibold">Overall Status</th>
                      <th className="py-3 px-4 font-semibold">Provider</th>
                      <th className="py-3 px-4 font-semibold">Liveness</th>
                      <th className="py-3 px-4 font-semibold">Risk Score</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
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

            <div className="mt-6 flex gap-2 justify-between items-center border-t border-line pt-4 px-4 pb-2">
              <span className="text-xs text-muted">Page Navigation</span>
              <div className="flex gap-2">
                <Button onClick={() => setCursor(undefined)} disabled={!cursor} variant="secondary">
                  First Page
                </Button>
                <Button
                  onClick={() => data.nextCursor && setCursor(data.nextCursor)}
                  disabled={!data.nextCursor}
                  variant="secondary"
                >
                  Next Page
                </Button>
              </div>
            </div>
          </Card>
        )}
      </main>
    </>
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
      {/* Row Summary */}
      <tr 
        className={`border-b border-line/50 hover:bg-panel-2/20 transition cursor-pointer ${isExpanded ? 'bg-panel-2/10' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="py-4 px-4">
          <div className="font-semibold text-ink">{item.fullName ?? 'Unnamed User'}</div>
          <div className="text-xs text-muted mt-0.5">{item.email}</div>
          <div className="text-[10px] text-muted-2 mt-1">Submitted: {new Date(item.submittedAt).toLocaleString()}</div>
        </td>
        <td className="py-4 px-4">
          <StatusBadge status={item.status} />
        </td>
        <td className="py-4 px-4 text-ink font-medium">
          {item.provider ?? '—'}
        </td>
        <td className="py-4 px-4">
          <StatusBadge status={item.livenessStatus ?? 'PENDING'} />
        </td>
        <td className="py-4 px-4 font-mono font-bold">
          {item.riskScore !== undefined && item.riskScore !== null ? (
            <span className={item.riskScore > 50 ? 'text-down' : item.riskScore > 25 ? 'text-brand' : 'text-up'}>
              {item.riskScore}%
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="py-4 px-4 text-right">
          <Button 
            variant="ghost" 
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? 'Collapse ▲' : 'Expand Details ▼'}
          </Button>
        </td>
      </tr>

      {/* Row Expanded Details */}
      {isExpanded && (
        <tr className="bg-panel-2/5 border-b border-line">
          <td colSpan={6} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-panel rounded-xl border border-line p-5 shadow-soft">
              
              {/* Left Column: Diagnostics */}
              <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gold border-b border-line pb-1.5">Verification Signals</h4>
                <div className="space-y-2 text-xs">
                  <Row label="Verification Provider" value={item.provider ?? 'UNAVAILABLE'} />
                  <Row label="Liveness Status" value={<StatusBadge status={item.livenessStatus ?? 'PENDING'} />} />
                  <Row label="Document Authenticity" value={<StatusBadge status={item.documentStatus ?? 'PENDING'} />} />
                  {item.riskScore !== undefined && item.riskScore !== null && (
                    <Row label="Risk Score" value={
                      <span className={`font-semibold ${item.riskScore > 50 ? 'text-down' : 'text-up'}`}>
                        {item.riskScore}%
                      </span>
                    } />
                  )}
                </div>
              </div>

              {/* Middle Column: Credentials */}
              <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gold border-b border-line pb-1.5">Masked PII Credentials</h4>
                <div className="space-y-2 text-xs">
                  <Row label="Masked PAN Card" value={<code className="bg-panel-2 px-1.5 py-0.5 rounded text-ink">{item.panMasked ?? '—'}</code>} />
                  <Row label="Masked Aadhaar Token" value={<code className="bg-panel-2 px-1.5 py-0.5 rounded text-ink">{item.aadhaarMasked ?? '—'}</code>} />
                  <Row label="User Registration ID" value={<code className="text-muted-2 break-all">{item.userId}</code>} />
                </div>
              </div>

              {/* Right Column: Decision Form */}
              <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gold border-b border-line pb-1.5">Manual Review Action</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-muted">Tier to Assign</span>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={tier}
                      onChange={(e) => setTier(Number(e.target.value))}
                      className="w-16 rounded-lg border border-line bg-panel-2 px-3 py-1 text-sm text-ink focus:border-brand focus:outline-none"
                    />
                  </div>
                  
                  <div>
                    <input
                      placeholder="rejection reason (required to reject)"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs text-ink placeholder:text-muted-2 focus:border-brand focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button 
                      onClick={() => m.mutate('APPROVE')} 
                      disabled={m.isPending}
                      variant="success"
                      className="flex-1"
                    >
                      Approve
                    </Button>
                    <Button
                      onClick={() => m.mutate('REJECT')}
                      disabled={m.isPending || !reason}
                      variant="danger"
                      className="flex-1"
                    >
                      Reject
                    </Button>
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
