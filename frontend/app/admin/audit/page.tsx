'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Card, Button, Alert, Input } from '@/components/ui';

interface Filters {
  action: string;
  targetId: string;
  adminId: string;
  fromDate: string;
  toDate: string;
}
const EMPTY: Filters = { action: '', targetId: '', adminId: '', fromDate: '', toDate: '' };

export default function AdminAuditPage() {
  const ready = useGuard('admin');
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [err, setErr] = useState<string | null>(null);

  const params = (f: Filters) => ({
    action: f.action || undefined,
    targetId: f.targetId || undefined,
    adminId: f.adminId || undefined,
    fromDate: f.fromDate || undefined,
    toDate: f.toDate || undefined,
  });

  const q = useQuery({
    queryKey: ['admin-audit', applied],
    queryFn: () => adminApi.audit({ limit: 100, ...params(applied) }),
    enabled: ready,
  });

  if (!ready) return null;
  const items = q.data?.data.items ?? [];

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">Audit Log</h1>

        <Card>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Input
              placeholder="Action (e.g. inr.deposit)"
              value={draft.action}
              onChange={(e) => setDraft({ ...draft, action: e.target.value })}
            />
            <Input
              placeholder="Target id"
              value={draft.targetId}
              onChange={(e) => setDraft({ ...draft, targetId: e.target.value })}
            />
            <Input
              placeholder="Actor admin id"
              value={draft.adminId}
              onChange={(e) => setDraft({ ...draft, adminId: e.target.value })}
            />
            <Input
              type="date"
              value={draft.fromDate}
              onChange={(e) => setDraft({ ...draft, fromDate: e.target.value })}
            />
            <Input
              type="date"
              value={draft.toDate}
              onChange={(e) => setDraft({ ...draft, toDate: e.target.value })}
            />
          </div>
          <div className="mb-3 flex gap-2">
            <Button onClick={() => setApplied(draft)}>Apply</Button>
            <Button
              onClick={() => {
                setDraft(EMPTY);
                setApplied(EMPTY);
              }}
            >
              Reset
            </Button>
            <Button onClick={() => adminApi.exportAuditCsv(params(applied)).catch((e) => setErr(errorMessage(e)))}>
              Export CSV
            </Button>
          </div>

          {err && <Alert>{err}</Alert>}
          {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

          {items.length === 0 && !q.isLoading ? (
            <p className="text-sm text-gray-500">No log entries.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">When</th>
                  <th className="pr-2 font-medium">Actor</th>
                  <th className="pr-2 font-medium">Action</th>
                  <th className="pr-2 font-medium">Target</th>
                  <th className="pr-2 font-medium">IP</th>
                  <th className="font-medium">Before → After</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id} className="border-b align-top last:border-0">
                    <td className="py-2 pr-2 text-gray-500">
                      {new Date(l.occurredAt).toLocaleString()}
                    </td>
                    <td className="pr-2 font-mono text-xs">
                      {l.actorEmail ?? l.actorAdminId.slice(0, 8)}
                    </td>
                    <td className="pr-2 font-mono text-xs">{l.action}</td>
                    <td className="pr-2 font-mono text-xs">
                      {l.targetType ?? ''}
                      {l.targetId ? ` ${l.targetId.slice(0, 8)}` : ''}
                    </td>
                    <td className="pr-2 font-mono text-xs">{l.ip ?? '—'}</td>
                    <td className="max-w-[280px] truncate font-mono text-[11px] text-gray-500">
                      {l.beforeState ? JSON.stringify(l.beforeState) : '—'} →{' '}
                      {l.afterState ? JSON.stringify(l.afterState) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </main>
    </>
  );
}
