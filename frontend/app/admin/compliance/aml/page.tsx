'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Button, Card, EmptyState, Input, StatusBadge } from '@/components/ui';

export default function AdminAmlPoliciesPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);
  const [version, setVersion] = useState('v1');
  const [name, setName] = useState('Baseline AML policy');

  const q = useQuery({ queryKey: ['aml-policies'], queryFn: () => adminApi.amlPolicies(), enabled: ready, retry: false });

  const createMut = useMutation({
    mutationFn: () => adminApi.amlPolicyCreate({ version, name }),
    onSuccess: () => { setBanner('Policy created (DRAFT).'); qc.invalidateQueries({ queryKey: ['aml-policies'] }); },
    onError: (e) => setBanner(errorMessage(e)),
  });
  const activateMut = useMutation({
    mutationFn: (id: string) => adminApi.amlPolicyActivate(id),
    onSuccess: () => { setBanner('Policy activated (any other active policy was disabled).'); qc.invalidateQueries({ queryKey: ['aml-policies'] }); },
    onError: (e) => setBanner(errorMessage(e)),
  });

  if (!ready) return null;
  const policies = q.data?.data.items ?? [];

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">AML Policies</h1>
          <Link href="/admin/compliance/workspace" className="text-xs text-brand hover:underline">Workspace →</Link>
        </div>
        <p className="mb-4 text-xs text-muted">Versioned AML policy engine. Evaluation is <span className="text-amber-400 font-semibold">review-only</span> — it recommends actions, never blocks money movement.</p>
        {banner && <div className="mb-4"><Alert>{banner}</Alert></div>}

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Create policy version</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input placeholder="Version (e.g. v1)" value={version} onChange={(e) => setVersion(e.target.value)} />
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="mt-3"><Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !version || !name}>Create</Button></div>
        </Card>

        {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {!q.isLoading && policies.length === 0 ? (
          <EmptyState title="No AML policies" hint="Create one above, then add rules." />
        ) : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-xs uppercase text-muted"><th className="py-2 pr-3">Version</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Rules</th><th className="py-2"></th></tr></thead>
              <tbody>{policies.map((p) => (
                <tr key={p.id} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-mono text-ink">{p.version}</td>
                  <td className="py-2 pr-3 text-ink">{p.name}</td>
                  <td className="py-2 pr-3"><StatusBadge status={p.status} /></td>
                  <td className="py-2 pr-3 font-mono">{p._count?.rules ?? 0}</td>
                  <td className="py-2 flex gap-3">
                    <Link href={`/admin/compliance/aml/detail?id=${p.id}`} className="text-brand hover:underline">Open →</Link>
                    {p.status !== 'ACTIVE' && p.status !== 'ARCHIVED' ? (
                      <button onClick={() => activateMut.mutate(p.id)} className="text-up hover:underline" disabled={activateMut.isPending}>Activate</button>
                    ) : null}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
