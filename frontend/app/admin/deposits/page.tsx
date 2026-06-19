'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Card, Button, Alert, Select, StatusBadge, Input } from '@/components/ui';
import type { InrDeposit } from '@/lib/types';

const STATUSES = ['', 'INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REVERSED'];

interface Filters {
  status: string;
  email: string;
  utr: string;
  minAmount: string;
  maxAmount: string;
  fromDate: string;
  toDate: string;
}

const EMPTY: Filters = {
  status: 'PENDING',
  email: '',
  utr: '',
  minAmount: '',
  maxAmount: '',
  fromDate: '',
  toDate: '',
};

export default function AdminDepositsPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [actionError, setActionError] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminApi.me(),
    enabled: ready,
  });
  const myId = me.data?.data.admin.id;

  // Threshold for maker-checker labels (tolerate missing operations.view).
  const summary = useQuery({
    queryKey: ['ops-summary-threshold'],
    queryFn: () => adminApi.operationsSummary(),
    enabled: ready,
    retry: false,
  });
  const threshold = summary.data?.data.dualApprovalThreshold
    ? Number(summary.data.data.dualApprovalThreshold)
    : null;

  const queryParams = (f: Filters) => ({
    status: f.status || undefined,
    email: f.email || undefined,
    utr: f.utr || undefined,
    minAmount: f.minAmount || undefined,
    maxAmount: f.maxAmount || undefined,
    fromDate: f.fromDate || undefined,
    toDate: f.toDate || undefined,
  });

  const q = useQuery({
    queryKey: ['admin-deposits', applied],
    queryFn: () => adminApi.deposits({ limit: 50, ...queryParams(applied) }),
    enabled: ready,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-deposits'] });
  const onErr = (e: unknown) => setActionError(errorMessage(e));

  const approve = useMutation({
    mutationFn: (id: string) => adminApi.approveDeposit(id),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: onErr,
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.rejectDeposit(id, reason),
    onSuccess: invalidate,
    onError: onErr,
  });

  if (!ready) return null;
  const data = q.data?.data;
  const busy = approve.isPending || reject.isPending;

  function stageLabel(d: InrDeposit): string {
    if (d.status === 'SUCCESS') return 'Credited';
    if (d.status === 'FAILED') return 'Rejected';
    if (d.status !== 'PENDING') return d.status;
    if (d.firstApprovedBy) return 'Needs 2nd approval';
    if (threshold !== null && Number(d.amount) >= threshold) return 'Needs 1st approval';
    return 'Needs approval';
  }

  function onApprove(d: InrDeposit) {
    setActionError(null);
    const dual = d.firstApprovedBy || (threshold !== null && Number(d.amount) >= threshold);
    const msg = dual
      ? d.firstApprovedBy
        ? 'Give the SECOND approval and credit the user’s INR balance?'
        : 'Give the FIRST approval? This does NOT credit yet — a second admin must approve.'
      : 'Approve this deposit and credit the user’s INR balance?';
    if (window.confirm(msg)) approve.mutate(d.id);
  }

  function onReject(id: string) {
    setActionError(null);
    const reason = window.prompt('Reason for rejecting this deposit:')?.trim();
    if (reason) reject.mutate({ id, reason });
  }

  function applyFilters() {
    setApplied(draft);
  }
  function resetFilters() {
    setDraft(EMPTY);
    setApplied(EMPTY);
  }

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">INR Deposits</h1>

        <Card>
          {/* Filters */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s || 'All statuses'}
                </option>
              ))}
            </Select>
            <Input
              placeholder="User email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
            <Input
              placeholder="UTR"
              value={draft.utr}
              onChange={(e) => setDraft({ ...draft, utr: e.target.value })}
            />
            <Input
              placeholder="Min ₹"
              value={draft.minAmount}
              onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })}
            />
            <Input
              placeholder="Max ₹"
              value={draft.maxAmount}
              onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })}
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
              <Button onClick={applyFilters}>Apply</Button>
              <Button onClick={resetFilters}>Reset</Button>
            </div>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <Button onClick={() => q.refetch()}>Refresh</Button>
            <Button onClick={() => adminApi.exportDepositsCsv(queryParams(applied)).catch(onErr)}>
              Export CSV
            </Button>
            {threshold !== null && (
              <span className="text-xs text-gray-500">
                Dual-approval threshold: ₹{threshold.toLocaleString()}
              </span>
            )}
          </div>

          {actionError && <Alert>{actionError}</Alert>}
          {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

          {data && (data.items.length === 0 ? (
            <p className="text-sm text-gray-500">No deposits.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">Ref</th>
                  <th className="pr-2 font-medium">User</th>
                  <th className="pr-2 font-medium">Amount</th>
                  <th className="pr-2 font-medium">UTR</th>
                  <th className="pr-2 font-medium">Status</th>
                  <th className="pr-2 font-medium">Stage</th>
                  <th className="pr-2 font-medium">1st approver</th>
                  <th className="pr-2 font-medium">Created</th>
                  <th className="font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((d) => {
                  const isManual = d.provider === 'MANUAL';
                  const isPending = d.status === 'PENDING';
                  const sameAdminFirst = !!myId && d.firstApprovedBy === myId;
                  return (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-mono text-xs">{d.id.slice(0, 8)}</td>
                      <td className="pr-2 font-mono text-xs">{d.userId.slice(0, 8)}</td>
                      <td className="pr-2">₹{d.amount}</td>
                      <td className="pr-2 font-mono text-xs">{d.utr ?? '—'}</td>
                      <td className="pr-2">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="pr-2 text-xs">{stageLabel(d)}</td>
                      <td className="pr-2 font-mono text-xs">
                        {d.firstApprovedBy ? d.firstApprovedBy.slice(0, 8) : '—'}
                      </td>
                      <td className="pr-2 text-gray-500">
                        {new Date(d.createdAt).toLocaleString()}
                      </td>
                      <td>
                        {isManual && isPending ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex gap-2">
                              <Button
                                onClick={() => onApprove(d)}
                                disabled={busy || sameAdminFirst}
                              >
                                {d.firstApprovedBy ? 'Approve (2nd)' : 'Approve'}
                              </Button>
                              <Button onClick={() => onReject(d.id)} disabled={busy}>
                                Reject
                              </Button>
                            </div>
                            {sameAdminFirst && (
                              <span className="text-[11px] text-amber-600">
                                You gave the 1st approval — a different admin must approve.
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {d.rejectionReason ?? '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
        </Card>
      </main>
    </>
  );
}
