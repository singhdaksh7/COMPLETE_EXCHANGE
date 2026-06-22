'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Button, Card, EmptyState, Input, Select, StatusBadge } from '@/components/ui';
import type { EvidencePackType } from '@/lib/types';

const TYPES: EvidencePackType[] = ['USER_KYC', 'FULL_USER_COMPLIANCE', 'STR_CASE', 'WALLET_RISK', 'TRAVEL_RULE'];

export default function AdminEvidencePacksPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  // create form
  const [packType, setPackType] = useState<EvidencePackType>('FULL_USER_COMPLIANCE');
  const [userId, setUserId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [ref, setRef] = useState('');

  const q = useQuery({
    queryKey: ['evidence-packs', filterType],
    queryFn: () => adminApi.evidencePacks({ packType: (filterType || undefined) as EvidencePackType | undefined }),
    enabled: ready,
    retry: false,
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminApi.evidencePackCreate({
        packType,
        userId: userId.trim() || undefined,
        caseId: caseId.trim() || undefined,
        ref: ref.trim() || undefined,
      }),
    onSuccess: (res) => {
      setBanner(`Pack generated: ${res.data.itemCount} item(s), checksum ${res.data.checksum?.slice(0, 12)}…`);
      qc.invalidateQueries({ queryKey: ['evidence-packs'] });
    },
    onError: (e) => setBanner(errorMessage(e)),
  });

  if (!ready) return null;
  const items = q.data?.data.items ?? [];
  const needsUser = packType === 'USER_KYC' || packType === 'FULL_USER_COMPLIANCE';
  const needsCase = packType === 'STR_CASE';

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Compliance Evidence Packs</h1>
          <div className="flex gap-3">
            <Link href="/admin/compliance/retention" className="text-xs text-brand hover:underline">Retention →</Link>
            <Link href="/admin/compliance/exports" className="text-xs text-brand hover:underline">Export log →</Link>
          </div>
        </div>
        <p className="mb-4 text-xs text-muted">
          Audit-ready, masked, <span className="text-amber-400 font-semibold">internal-only</span> evidence packs. Aggregated from
          existing compliance data — not an FIU filing and not a legal certification.
        </p>

        {banner && <div className="mb-4"><Alert>{banner}</Alert></div>}

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Generate evidence pack</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Pack type</label>
              <Select value={packType} onChange={(e) => setPackType(e.target.value as EvidencePackType)}>
                {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </Select>
            </div>
            {needsUser || packType === 'WALLET_RISK' || packType === 'TRAVEL_RULE' ? (
              <Input placeholder="User ID (uuid)" value={userId} onChange={(e) => setUserId(e.target.value)} />
            ) : null}
            {needsCase ? <Input placeholder="Case ID (uuid)" value={caseId} onChange={(e) => setCaseId(e.target.value)} /> : null}
            {packType === 'WALLET_RISK' || packType === 'TRAVEL_RULE' ? (
              <Input placeholder="Ref (profile / transfer id, optional)" value={ref} onChange={(e) => setRef(e.target.value)} />
            ) : null}
          </div>
          <div className="mt-3">
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || (needsUser && !userId) || (needsCase && !caseId)}>
              {createMut.isPending ? 'Generating…' : 'Generate pack'}
            </Button>
          </div>
        </Card>

        <Card className="mb-4">
          <label className="mb-1 block text-xs text-muted">Filter by type</label>
          <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </Select>
        </Card>

        {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {!q.isLoading && items.length === 0 ? (
          <EmptyState title="No evidence packs" hint="Generate one above to get started." />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Items</th>
                    <th className="py-2 pr-3">Checksum</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-b border-line/60">
                      <td className="py-2 pr-3 text-ink">{p.packType.replace(/_/g, ' ')}</td>
                      <td className="py-2 pr-3"><StatusBadge status={p.status} /></td>
                      <td className="py-2 pr-3 font-mono">{p.itemCount}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-muted">{p.checksum ? `${p.checksum.slice(0, 12)}…` : '—'}</td>
                      <td className="py-2 pr-3 text-muted">{new Date(p.createdAt).toLocaleString()}</td>
                      <td className="py-2"><Link href={`/admin/compliance/evidence-packs/detail?id=${p.id}`} className="text-brand hover:underline">Open →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
