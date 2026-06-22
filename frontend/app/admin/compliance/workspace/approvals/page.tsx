'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Button, Card, EmptyState, Input, Select, StatusBadge } from '@/components/ui';
import type { ComplianceApprovalType } from '@/lib/types';

const TYPES: ComplianceApprovalType[] = ['FIU_DRAFT_EXPORT', 'CASE_STATUS_CHANGE', 'RISK_OVERRIDE', 'SCREENING_OVERRIDE', 'WALLET_RISK_OVERRIDE', 'LEGAL_POLICY_PUBLISH'];

export default function AdminApprovalsPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);
  const [approvalType, setApprovalType] = useState<ComplianceApprovalType>('FIU_DRAFT_EXPORT');
  const [title, setTitle] = useState('');
  const [targetId, setTargetId] = useState('');

  const meQ = useQuery({ queryKey: ['admin-me'], queryFn: () => adminApi.me(), enabled: ready, retry: false });
  const q = useQuery({ queryKey: ['ws-approvals'], queryFn: () => adminApi.approvals(), enabled: ready, retry: false });

  const createMut = useMutation({
    mutationFn: () => adminApi.approvalCreate({ approvalType, title: title.trim(), targetId: targetId.trim() || undefined }),
    onSuccess: () => { setBanner('Approval request created (PENDING). A different admin must decide it.'); setTitle(''); qc.invalidateQueries({ queryKey: ['ws-approvals'] }); },
    onError: (e) => setBanner(errorMessage(e)),
  });
  const decideMut = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => (v.approve ? adminApi.approvalApprove(v.id) : adminApi.approvalReject(v.id)),
    onSuccess: () => { setBanner('Decision recorded.'); qc.invalidateQueries({ queryKey: ['ws-approvals'] }); },
    onError: (e) => setBanner(errorMessage(e)),
  });

  if (!ready) return null;
  const meId = meQ.data?.data.admin.id;
  const approvals = q.data?.data.items ?? [];

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Maker-Checker Approvals</h1>
          <Link href="/admin/compliance/workspace" className="text-xs text-brand hover:underline">← Workspace</Link>
        </div>
        <p className="mb-4 text-xs text-muted">Sensitive compliance actions require a second admin. <span className="text-amber-400 font-semibold">The maker cannot approve their own request.</span></p>
        {banner && <div className="mb-4"><Alert>{banner}</Alert></div>}

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Request approval</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select value={approvalType} onChange={(e) => setApprovalType(e.target.value as ComplianceApprovalType)}>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</Select>
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Target id (optional)" value={targetId} onChange={(e) => setTargetId(e.target.value)} />
          </div>
          <div className="mt-3"><Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !title}>Create request</Button></div>
        </Card>

        {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {!q.isLoading && approvals.length === 0 ? (
          <EmptyState title="No approval requests" hint="Sensitive actions (e.g. FIU export, legal publish) create requests here." />
        ) : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-xs uppercase text-muted"><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Title</th><th className="py-2 pr-3">Maker</th><th className="py-2"></th></tr></thead>
              <tbody>{approvals.map((a) => {
                const ownRequest = a.makerAdminId === meId;
                return (
                  <tr key={a.id} className="border-b border-line/60">
                    <td className="py-2 pr-3 text-ink">{a.approvalType.replace(/_/g, ' ')}</td>
                    <td className="py-2 pr-3"><StatusBadge status={a.status} /></td>
                    <td className="py-2 pr-3 text-ink">{a.title}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-muted">{a.makerAdminId.slice(0, 8)}…{ownRequest ? ' (you)' : ''}</td>
                    <td className="py-2">
                      {a.status === 'PENDING' && !ownRequest ? (
                        <span className="flex gap-2">
                          <button onClick={() => decideMut.mutate({ id: a.id, approve: true })} className="text-up hover:underline" disabled={decideMut.isPending}>Approve</button>
                          <button onClick={() => decideMut.mutate({ id: a.id, approve: false })} className="text-red-400 hover:underline" disabled={decideMut.isPending}>Reject</button>
                        </span>
                      ) : a.status === 'PENDING' && ownRequest ? (
                        <span className="text-[11px] text-muted">awaiting checker</span>
                      ) : (
                        <span className="text-[11px] text-muted">{a.decidedAt ? new Date(a.decidedAt).toLocaleDateString() : '—'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
