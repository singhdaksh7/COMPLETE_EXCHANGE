'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Button, Card, EmptyState, Input, Select, StatusBadge } from '@/components/ui';
import type { FiuReportScopeType, FiuReportType } from '@/lib/types';

const TYPES: FiuReportType[] = ['STR', 'CTR', 'NTR', 'CBWTR', 'INTERNAL_SUSPICIOUS_ACTIVITY_SUMMARY'];
const SCOPES: FiuReportScopeType[] = ['USER', 'CASE', 'DATE_RANGE', 'TRANSACTION_SET'];

export default function AdminFiuPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);

  const [reportType, setReportType] = useState<FiuReportType>('STR');
  const [scopeType, setScopeType] = useState<FiuReportScopeType>('CASE');
  const [userId, setUserId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [evidencePackId, setEvidencePackId] = useState('');
  const [narrative, setNarrative] = useState('');

  const q = useQuery({ queryKey: ['fiu-reports'], queryFn: () => adminApi.fiuReports(), enabled: ready, retry: false });

  const createMut = useMutation({
    mutationFn: () => adminApi.fiuReportCreate({
      reportType, scopeType,
      userId: userId.trim() || undefined,
      caseId: caseId.trim() || undefined,
      evidencePackId: evidencePackId.trim() || undefined,
      narrative: narrative.trim() || undefined,
    }),
    onSuccess: (res) => { setBanner(`Draft created — status ${res.data.status}, ${res.data.items.length} item(s). Open it to validate.`); qc.invalidateQueries({ queryKey: ['fiu-reports'] }); },
    onError: (e) => setBanner(errorMessage(e)),
  });

  if (!ready) return null;
  const reports = q.data?.data.items ?? [];

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">FIU Draft Reports</h1>
          <Link href="/admin/compliance/evidence-packs" className="text-xs text-brand hover:underline">Evidence packs →</Link>
        </div>
        <p className="mb-4 text-xs text-amber-400 font-semibold">DRAFT-ONLY · NOT_SUBMITTED_TO_FIU — never transmitted to FIU-IND or any regulator.</p>
        {banner && <div className="mb-4"><Alert>{banner}</Alert></div>}

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Create draft report</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select value={reportType} onChange={(e) => setReportType(e.target.value as FiuReportType)}>
              {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
            <Select value={scopeType} onChange={(e) => setScopeType(e.target.value as FiuReportScopeType)}>
              {SCOPES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </Select>
            <Input placeholder="User ID (uuid, optional)" value={userId} onChange={(e) => setUserId(e.target.value)} />
            <Input placeholder="Case ID (uuid, optional)" value={caseId} onChange={(e) => setCaseId(e.target.value)} />
            <Input placeholder="Evidence pack ID (optional)" value={evidencePackId} onChange={(e) => setEvidencePackId(e.target.value)} />
          </div>
          <textarea className="mt-3 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink" rows={3} placeholder="Suspicious reason / narrative" value={narrative} onChange={(e) => setNarrative(e.target.value)} />
          <div className="mt-3"><Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>Generate draft</Button></div>
        </Card>

        {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}
        {!q.isLoading && reports.length === 0 ? (
          <EmptyState title="No FIU draft reports" hint="Create one above from a case or user." />
        ) : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-xs uppercase text-muted"><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Errors</th><th className="py-2 pr-3">Warnings</th><th className="py-2 pr-3">Created</th><th className="py-2"></th></tr></thead>
              <tbody>{reports.map((r) => (
                <tr key={r.id} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-ink">{r.reportType.replace(/_/g, ' ')}</td>
                  <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                  <td className="py-2 pr-3 font-mono text-red-400">{r.errorCount}</td>
                  <td className="py-2 pr-3 font-mono text-amber-400">{r.warningCount}</td>
                  <td className="py-2 pr-3 text-muted">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="py-2"><Link href={`/admin/compliance/fiu/detail?id=${r.id}`} className="text-brand hover:underline">Open →</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
