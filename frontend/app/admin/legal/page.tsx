'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Button, Card, EmptyState, Input, Select, StatusBadge } from '@/components/ui';
import type { LegalDocumentType } from '@/lib/types';

const TYPES: LegalDocumentType[] = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'RISK_DISCLOSURE', 'AML_POLICY_NOTICE', 'FEE_POLICY', 'TAX_DISCLOSURE'];

export default function AdminLegalPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);
  const [type, setType] = useState<LegalDocumentType>('TERMS_OF_SERVICE');
  const [version, setVersion] = useState('v2');
  const [title, setTitle] = useState('Terms of Service');
  const [content, setContent] = useState('');

  const docsQ = useQuery({ queryKey: ['admin-legal-docs'], queryFn: () => adminApi.legalDocuments(), enabled: ready, retry: false });
  const accQ = useQuery({ queryKey: ['admin-legal-acceptances'], queryFn: () => adminApi.legalAcceptancesAdmin(), enabled: ready, retry: false });

  const createMut = useMutation({
    mutationFn: () => adminApi.legalDocumentCreate({ type, version, title, content }),
    onSuccess: () => { setBanner('Document version published and set current.'); setContent(''); qc.invalidateQueries({ queryKey: ['admin-legal-docs'] }); },
    onError: (e) => setBanner(errorMessage(e)),
  });

  if (!ready) return null;
  const docs = docsQ.data?.data.items ?? [];
  const acceptances = accQ.data?.data.items ?? [];

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <h1 className="mb-1 text-xl font-semibold text-ink">Legal Documents</h1>
        <p className="mb-4 text-xs text-muted">Versioned legal documents (checksummed) and user acceptance records.</p>
        {banner && <div className="mb-4"><Alert>{banner}</Alert></div>}

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Publish new version</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select value={type} onChange={(e) => setType(e.target.value as LegalDocumentType)}>
              {TYPES.map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}
            </Select>
            <Input placeholder="Version (e.g. v2)" value={version} onChange={(e) => setVersion(e.target.value)} />
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <textarea className="mt-3 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink" rows={4} placeholder="Document content" value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="mt-3"><Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !content}>Publish version</Button></div>
        </Card>

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Document versions</h2>
        <Card className="mb-4">
          {docs.length === 0 ? <p className="text-sm text-muted">No documents.</p> : (
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-xs uppercase text-muted"><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Version</th><th className="py-2 pr-3">Current</th><th className="py-2 pr-3">Checksum</th></tr></thead>
              <tbody>{docs.map((d) => (
                <tr key={d.id} className="border-b border-line/60"><td className="py-2 pr-3 text-ink">{d.type.replace(/_/g, ' ')}</td><td className="py-2 pr-3 font-mono">{d.version}</td><td className="py-2 pr-3">{d.isCurrent ? <StatusBadge status="CURRENT" /> : <span className="text-muted">—</span>}</td><td className="py-2 pr-3 font-mono text-xs text-muted">{d.checksum.slice(0, 10)}…</td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Recent acceptances</h2>
        {acceptances.length === 0 ? <EmptyState title="No acceptances" /> : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-xs uppercase text-muted"><th className="py-2 pr-3">User</th><th className="py-2 pr-3">Document</th><th className="py-2 pr-3">Version</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">When</th></tr></thead>
              <tbody>{acceptances.map((a) => (
                <tr key={a.id} className="border-b border-line/60"><td className="py-2 pr-3 font-mono text-xs text-muted">{a.userId.slice(0, 8)}…</td><td className="py-2 pr-3 text-ink">{a.documentType.replace(/_/g, ' ')}</td><td className="py-2 pr-3 font-mono">{a.version}</td><td className="py-2 pr-3"><StatusBadge status={a.status} /></td><td className="py-2 pr-3 text-muted">{new Date(a.acceptedAt).toLocaleString()}</td></tr>
              ))}</tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
