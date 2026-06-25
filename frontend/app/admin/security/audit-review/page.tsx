'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Card, Button, Alert, Input, Select, EmptyState } from '@/components/ui';
import type { AuditReviewRisk } from '@/lib/types';

interface Filters {
  adminId: string;
  targetId: string;
  action: string;
  riskLevel: '' | AuditReviewRisk;
  ip: string;
  fromDate: string;
  toDate: string;
}

const EMPTY: Filters = {
  adminId: '',
  targetId: '',
  action: '',
  riskLevel: '',
  ip: '',
  fromDate: '',
  toDate: '',
};

function riskClasses(risk: AuditReviewRisk): string {
  if (risk === 'HIGH') return 'bg-down/15 text-down border border-down/30';
  if (risk === 'MEDIUM') return 'bg-brand/15 text-brand border border-brand/30';
  return 'bg-panel-2 text-muted border border-white/10';
}

function RiskBadge({ risk }: { risk: AuditReviewRisk }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${riskClasses(risk)}`}>
      {risk}
    </span>
  );
}

export default function AuditReviewPage() {
  const ready = useGuard('admin');
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);

  const params = (f: Filters) => ({
    adminId: f.adminId || undefined,
    targetId: f.targetId || undefined,
    action: f.action || undefined,
    riskLevel: f.riskLevel || undefined,
    ip: f.ip || undefined,
    fromDate: f.fromDate || undefined,
    toDate: f.toDate || undefined,
  });

  const q = useInfiniteQuery({
    queryKey: ['audit-review', applied],
    enabled: ready,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      adminApi.auditReview({ limit: 50, cursor: pageParam, ...params(applied) }),
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
  });

  if (!ready) return null;

  const pages = q.data?.pages ?? [];
  const items = pages.flatMap((p) => p.data.items);
  const summary = pages[0]?.data.summary;

  const apply = () => setApplied(draft);
  const reset = () => {
    setDraft(EMPTY);
    setApplied(EMPTY);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16">
      <div className="mb-4 flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Audit Review</h1>
        <p className="text-xs text-muted">
          Risk-aware review of admin actions — high-risk financial / access-control changes, account
          locks, session and compliance actions. Read-only.
        </p>
      </div>

      {/* Risk summary */}
      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <span className="block text-[10px] uppercase tracking-widest text-muted">Total</span>
            <span className="mt-1 block font-mono text-2xl font-bold">{summary.total}</span>
          </Card>
          <Card>
            <span className="block text-[10px] uppercase tracking-widest text-muted">High risk</span>
            <span className="mt-1 block font-mono text-2xl font-bold text-down">{summary.high}</span>
          </Card>
          <Card>
            <span className="block text-[10px] uppercase tracking-widest text-muted">Medium</span>
            <span className="mt-1 block font-mono text-2xl font-bold text-brand">{summary.medium}</span>
          </Card>
          <Card>
            <span className="block text-[10px] uppercase tracking-widest text-muted">Low</span>
            <span className="mt-1 block font-mono text-2xl font-bold text-muted">{summary.low}</span>
          </Card>
        </div>
      )}

      <Card>
        {/* Filters */}
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Input
            placeholder="Admin actor id (uuid)"
            value={draft.adminId}
            onChange={(e) => setDraft({ ...draft, adminId: e.target.value })}
          />
          <Input
            placeholder="Affected user / target id"
            value={draft.targetId}
            onChange={(e) => setDraft({ ...draft, targetId: e.target.value })}
          />
          <Input
            placeholder="Action contains (e.g. withdrawal)"
            value={draft.action}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
          />
          <Select
            value={draft.riskLevel}
            onChange={(e) => setDraft({ ...draft, riskLevel: e.target.value as Filters['riskLevel'] })}
          >
            <option value="">All risk levels</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
          <Input
            placeholder="IP address"
            value={draft.ip}
            onChange={(e) => setDraft({ ...draft, ip: e.target.value })}
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
          <div className="flex gap-2">
            <Button onClick={apply}>Apply</Button>
            <Button variant="secondary" onClick={reset}>Reset</Button>
          </div>
        </div>

        {q.isError && <Alert kind="error">{errorMessage(q.error)}</Alert>}

        {/* Results */}
        {q.isLoading ? (
          <p className="py-8 text-center text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState title="No matching admin actions" hint="Adjust the filters or widen the date range." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Risk</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Admin</th>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2 pr-3">IP</th>
                  <th className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="font-mono text-white/80">
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-white/5 last:border-0">
                    <td className="py-2 pr-3 text-muted whitespace-nowrap">{new Date(it.occurredAt).toLocaleString()}</td>
                    <td className="py-2 pr-3"><RiskBadge risk={it.riskLevel} /></td>
                    <td className="py-2 pr-3 font-semibold text-white">{it.action}</td>
                    <td className="py-2 pr-3" title={it.actorAdminId}>{it.actorEmail ?? it.actorAdminId.slice(0, 8)}</td>
                    <td className="py-2 pr-3">
                      {it.targetId ? (
                        <span title={it.targetId}>
                          {it.targetType ?? 'entity'}:{it.targetId.slice(0, 8)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted">{it.ip ?? '—'}</td>
                    <td className="py-2 max-w-[220px] truncate font-sans text-white/60" title={it.reason ?? ''}>{it.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {q.hasNextPage && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => q.fetchNextPage()}
                  disabled={q.isFetchingNextPage}
                >
                  {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </main>
  );
}
