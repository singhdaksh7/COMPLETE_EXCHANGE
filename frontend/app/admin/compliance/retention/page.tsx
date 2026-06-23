'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Button, Card, EmptyState, Input, Select, StatusBadge } from '@/components/ui';
import type { RetentionReviewStatus } from '@/lib/types';

const RECORD_TYPES = ['KYC', 'COMPLIANCE_EVIDENCE', 'STR_CASE', 'WALLET_RISK', 'TRAVEL_RULE', 'AUDIT_LOG', 'TAX_LEGAL'];

export default function AdminRetentionPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);
  const [recordType, setRecordType] = useState('KYC');
  const [years, setYears] = useState('5');
  const [desc, setDesc] = useState('');

  const policiesQ = useQuery({ queryKey: ['retention-policies'], queryFn: () => adminApi.retentionPolicies(), enabled: ready, retry: false });
  const reviewsQ = useQuery({ queryKey: ['retention-reviews'], queryFn: () => adminApi.retentionReviews(), enabled: ready, retry: false });

  const upsertMut = useMutation({
    mutationFn: () => adminApi.retentionPolicyUpsert({ recordType, retentionYears: Number(years), description: desc.trim() || undefined }),
    onSuccess: () => {
      setBanner(`Policy saved for ${recordType}; a new review snapshot was created.`);
      qc.invalidateQueries({ queryKey: ['retention-policies'] });
      qc.invalidateQueries({ queryKey: ['retention-reviews'] });
    },
    onError: (e) => setBanner(errorMessage(e)),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: RetentionReviewStatus }) => adminApi.retentionReviewStatus(v.id, { status: v.status as 'REVIEWED' | 'ESCALATED' }),
    onSuccess: () => { setBanner('Review updated.'); qc.invalidateQueries({ queryKey: ['retention-reviews'] }); },
    onError: (e) => setBanner(errorMessage(e)),
  });

  if (!ready) return null;
  const policies = policiesQ.data?.data.items ?? [];
  const reviews = reviewsQ.data?.data.items ?? [];

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Record Retention</h1>
          <Link href="/admin/compliance/evidence-packs" className="text-xs text-brand hover:underline">← Evidence packs</Link>
        </div>
        <p className="mb-4 text-xs text-muted">
          Review-only retention foundation. <span className="text-amber-400 font-semibold">No records are ever auto-deleted.</span>
        </p>

        {banner && <div className="mb-4"><Alert>{banner}</Alert></div>}

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Set retention policy</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Record type</label>
              <Select value={recordType} onChange={(e) => setRecordType(e.target.value)}>
                {RECORD_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </Select>
            </div>
            <Input placeholder="Retention years" value={years} onChange={(e) => setYears(e.target.value)} />
            <Input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="mt-3">
            <Button onClick={() => upsertMut.mutate()} disabled={upsertMut.isPending || !years}>
              {upsertMut.isPending ? 'Saving…' : 'Save policy'}
            </Button>
          </div>
        </Card>

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Policies</h2>
        {policies.length === 0 ? (
          <EmptyState title="No policies" hint="Baseline policies are seeded on first load." />
        ) : (
          <Card className="mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Record type</th>
                    <th className="py-2 pr-3">Years</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p) => (
                    <tr key={p.id} className="border-b border-line/60">
                      <td className="py-2 pr-3 text-ink">{p.recordType.replace(/_/g, ' ')}</td>
                      <td className="py-2 pr-3 font-mono">{p.retentionYears}</td>
                      <td className="py-2 pr-3"><StatusBadge status={p.status} /></td>
                      <td className="py-2 pr-3 text-muted">{p.description ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Retention reviews</h2>
        {reviews.length === 0 ? (
          <EmptyState title="No reviews" hint="Saving a policy creates a review snapshot." />
        ) : (
          <div className="space-y-2">
            {reviews.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{r.recordType.replace(/_/g, ' ')}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted">
                  <span>Retained: <span className="font-mono text-ink">{r.retainedCount}</span></span>
                  <span>Eligible: <span className="font-mono text-ink">{r.eligibleCount}</span></span>
                  <span>Nearing boundary: <span className="font-mono text-ink">{r.nearingBoundaryCount}</span></span>
                  <span>{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                {r.status === 'PENDING' ? (
                  <div className="mt-2 flex gap-2">
                    <Button variant="secondary" onClick={() => statusMut.mutate({ id: r.id, status: 'REVIEWED' })} disabled={statusMut.isPending}>Mark reviewed</Button>
                    <Button variant="danger" onClick={() => statusMut.mutate({ id: r.id, status: 'ESCALATED' })} disabled={statusMut.isPending}>Escalate</Button>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
