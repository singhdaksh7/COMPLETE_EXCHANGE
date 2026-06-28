'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Card, Button, Alert, Select, StatusBadge, Input } from '@/components/ui';
import type { AdminInrWithdrawal } from '@/lib/types';

const STATUSES = ['', 'PENDING', 'APPROVED', 'PAID', 'REJECTED', 'FAILED'];

interface Filters {
  status: string;
  email: string;
  fromDate: string;
  toDate: string;
}

const EMPTY: Filters = { status: 'PENDING', email: '', fromDate: '', toDate: '' };

export default function AdminInrWithdrawalsPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminInrWithdrawal | null>(null);

  const queryParams = (f: Filters) => ({
    status: f.status || undefined,
    email: f.email || undefined,
    fromDate: f.fromDate || undefined,
    toDate: f.toDate || undefined,
  });

  const q = useQuery({
    queryKey: ['admin-inr-withdrawals', applied],
    queryFn: () => adminApi.inrWithdrawals({ limit: 50, ...queryParams(applied) }),
    enabled: ready,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-inr-withdrawals'] });
    if (selected) {
      adminApi.inrWithdrawal(selected.id).then((r) => setSelected(r.data)).catch(() => {});
    }
  };
  const onErr = (e: unknown) => setActionError(errorMessage(e));

  const approve = useMutation({
    mutationFn: (id: string) => adminApi.approveInrWithdrawal(id),
    onSuccess: () => { setActionError(null); invalidate(); },
    onError: onErr,
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.rejectInrWithdrawal(id, reason),
    onSuccess: () => { setActionError(null); invalidate(); },
    onError: onErr,
  });
  const markPaid = useMutation({
    mutationFn: ({ id, utr, note }: { id: string; utr: string; note?: string }) =>
      adminApi.markInrWithdrawalPaid(id, utr, note),
    onSuccess: () => { setActionError(null); invalidate(); },
    onError: onErr,
  });

  if (!ready) return null;
  const data = q.data?.data;
  const busy = approve.isPending || reject.isPending || markPaid.isPending;

  function openDetail(id: string) {
    setActionError(null);
    adminApi.inrWithdrawal(id).then((r) => setSelected(r.data)).catch(onErr);
  }

  function onApprove(id: string) {
    setActionError(null);
    if (window.confirm('Approve this withdrawal? Funds stay reserved until you mark it paid.'))
      approve.mutate(id);
  }
  function onReject(id: string) {
    setActionError(null);
    const reason = window.prompt('Reason for rejecting (funds will be released back):')?.trim();
    if (reason) reject.mutate({ id, reason });
  }
  function onMarkPaid(id: string) {
    setActionError(null);
    const utr = window.prompt('Enter the bank UTR / payout reference number:')?.trim();
    if (!utr) return;
    const note = window.prompt('Optional internal note (leave blank to skip):')?.trim() || undefined;
    markPaid.mutate({ id, utr, note });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16">
      <h1 className="mb-4 text-xl font-semibold">INR Withdrawals</h1>

      <Card>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s || 'All statuses'}</option>
            ))}
          </Select>
          <Input placeholder="User email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <Input type="date" value={draft.fromDate} onChange={(e) => setDraft({ ...draft, fromDate: e.target.value })} />
          <Input type="date" value={draft.toDate} onChange={(e) => setDraft({ ...draft, toDate: e.target.value })} />
          <div className="flex gap-2">
            <Button onClick={() => setApplied(draft)}>Apply</Button>
            <Button onClick={() => { setDraft(EMPTY); setApplied(EMPTY); }}>Reset</Button>
          </div>
        </div>
        <div className="mb-3">
          <Button onClick={() => q.refetch()}>Refresh</Button>
        </div>

        {actionError && <Alert>{actionError}</Alert>}
        {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {data && (data.items.length === 0 ? (
          <p className="text-sm text-gray-500">No withdrawals.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-2 font-medium">Ref</th>
                <th className="pr-2 font-medium">User</th>
                <th className="pr-2 font-medium">Amount</th>
                <th className="pr-2 font-medium">Method</th>
                <th className="pr-2 font-medium">Destination</th>
                <th className="pr-2 font-medium">Status</th>
                <th className="pr-2 font-medium">Created</th>
                <th className="font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((w) => {
                const dest =
                  w.payout.method === 'UPI'
                    ? w.payout.upiId
                    : `${w.payout.bankName ?? 'Bank'} ${w.payout.accountLast4 ?? ''}`;
                return (
                  <tr key={w.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-mono text-xs">
                      <button className="underline" onClick={() => openDetail(w.id)}>
                        {w.id.slice(0, 8)}
                      </button>
                    </td>
                    <td className="pr-2 font-mono text-xs">{w.userId.slice(0, 8)}</td>
                    <td className="pr-2">₹{w.amount}</td>
                    <td className="pr-2">{w.payout.method}</td>
                    <td className="pr-2 text-xs">{dest}</td>
                    <td className="pr-2"><StatusBadge status={w.status} /></td>
                    <td className="pr-2 text-gray-500">{new Date(w.createdAt).toLocaleString()}</td>
                    <td>
                      <div className="flex gap-2">
                        {w.status === 'PENDING' && (
                          <>
                            <Button onClick={() => onApprove(w.id)} disabled={busy}>Approve</Button>
                            <Button onClick={() => onReject(w.id)} disabled={busy}>Reject</Button>
                          </>
                        )}
                        {w.status === 'APPROVED' && (
                          <>
                            <Button onClick={() => onMarkPaid(w.id)} disabled={busy}>Mark paid</Button>
                            <Button onClick={() => onReject(w.id)} disabled={busy}>Reject</Button>
                          </>
                        )}
                        {(w.status === 'PAID' || w.status === 'REJECTED' || w.status === 'FAILED') && (
                          <span className="text-xs text-gray-400">
                            {w.status === 'PAID' ? `UTR ${w.utr ?? ''}` : (w.rejectionReason ?? '—')}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </Card>

      {selected && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Withdrawal {selected.id.slice(0, 8)} · <StatusBadge status={selected.status} />
            </h2>
            <Button onClick={() => setSelected(null)}>Close</Button>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <Detail k="User" v={selected.userId} mono />
            <Detail k="Amount" v={`₹${selected.amount}`} />
            <Detail k="Method" v={selected.payout.method} />
            <Detail k="Holder" v={selected.payout.holderName ?? '—'} />
            <Detail k="UPI ID" v={selected.payout.upiId ?? '—'} mono />
            <Detail k="Account no." v={selected.payout.accountNumber ?? '—'} mono />
            <Detail k="Account last4" v={selected.payout.accountLast4 ?? '—'} />
            <Detail k="IFSC" v={selected.payout.ifsc ?? '—'} mono />
            <Detail k="Bank" v={selected.payout.bankName ?? '—'} />
            <Detail k="UTR" v={selected.utr ?? '—'} mono />
            <Detail k="Reject reason" v={selected.rejectionReason ?? '—'} />
            <Detail k="Admin note" v={selected.adminNote ?? '—'} />
            <Detail k="Lock ledger txn" v={selected.lockLedgerTxnId ?? '—'} mono />
            <Detail k="Payout ledger txn" v={selected.finalLedgerTxnId ?? '—'} mono />
            <Detail k="Approved by" v={selected.approvedBy ?? '—'} mono />
            <Detail k="Paid by" v={selected.paidBy ?? '—'} mono />
            <Detail k="Created" v={new Date(selected.createdAt).toLocaleString()} />
            <Detail k="Paid at" v={selected.paidAt ? new Date(selected.paidAt).toLocaleString() : '—'} />
          </dl>
        </Card>
      )}
    </main>
  );
}

function Detail({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{k}</dt>
      <dd className={mono ? 'font-mono text-xs break-all' : ''}>{v}</dd>
    </div>
  );
}
