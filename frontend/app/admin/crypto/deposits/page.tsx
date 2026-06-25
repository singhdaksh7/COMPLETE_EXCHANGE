'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Card, Button, Alert, Select, StatusBadge, Input, Field } from '@/components/ui';
import type { AdminMasterCryptoDeposit } from '@/lib/types';

const STATUSES = [
  '',
  'SUBMITTED',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'REJECTED',
  'DUPLICATE',
  'FAILED',
];
const CHAINS = ['', 'BSC', 'ETH', 'TRON'];

// Statuses where re-running on-chain verification can still change the outcome.
const RECHECKABLE = new Set(['submitted', 'pending_confirmation', 'failed']);

interface Filters {
  status: string;
  chain: string;
  txHash: string;
  userId: string;
}

const EMPTY: Filters = { status: '', chain: '', txHash: '', userId: '' };

function short(s: string, head = 8, tail = 6): string {
  return s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
}

export default function AdminCryptoDepositsPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [actionError, setActionError] = useState<string | null>(null);

  const params = (f: Filters) => ({
    status: f.status || undefined,
    chain: f.chain || undefined,
    txHash: f.txHash.trim() || undefined,
    userId: f.userId.trim() || undefined,
  });

  const depositsQ = useQuery({
    queryKey: ['admin-crypto-deposits', applied],
    queryFn: () => adminApi.cryptoDeposits(params(applied)),
    enabled: ready,
    retry: false,
  });

  const recheckM = useMutation({
    mutationFn: (id: string) => adminApi.recheckCryptoDeposit(id),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ['admin-crypto-deposits'] });
    },
    onError: (e) => setActionError(errorMessage(e)),
  });

  if (!ready) return null;

  const items: AdminMasterCryptoDeposit[] = depositsQ.data?.data.items ?? [];

  return (
    <div className="min-h-screen bg-noir px-6 py-8 text-white">
      <div className="mx-auto w-full max-w-[1400px] space-y-6">
        <div className="border-b border-white/5 pb-4">
          <h1 className="text-2xl font-bold tracking-tight">Crypto Deposits (USDT)</h1>
          <p className="mt-1 text-xs text-white/50">
            Master-wallet USDT deposits submitted by users. Recheck re-runs on-chain
            verification and credits a confirmed deposit exactly once.
          </p>
        </div>

        {/* Filters */}
        <Card className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Status">
            <Select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s || 'All statuses'}</option>
              ))}
            </Select>
          </Field>
          <Field label="Chain">
            <Select
              value={draft.chain}
              onChange={(e) => setDraft({ ...draft, chain: e.target.value })}
            >
              {CHAINS.map((c) => (
                <option key={c} value={c}>{c || 'All chains'}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tx hash">
            <Input
              placeholder="0x… / hash"
              value={draft.txHash}
              onChange={(e) => setDraft({ ...draft, txHash: e.target.value })}
            />
          </Field>
          <Field label="User ID">
            <Input
              placeholder="uuid"
              value={draft.userId}
              onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button onClick={() => setApplied({ ...draft })} className="flex-1">
              Apply
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setDraft(EMPTY); setApplied(EMPTY); }}
            >
              Reset
            </Button>
          </div>
        </Card>

        {actionError && <Alert kind="error">{actionError}</Alert>}
        {depositsQ.isError && <Alert kind="error">{errorMessage(depositsQ.error)}</Alert>}

        {/* Table */}
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02] text-[10px] uppercase tracking-wider text-white/45">
                <th className="px-4 py-3">User</th>
                <th className="px-3 py-3">Chain</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3">Tx hash</th>
                <th className="px-3 py-3 text-center">Confirms</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Submitted</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((d) => (
                <tr key={d.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <span className="block text-white/80">{d.userEmail ?? '—'}</span>
                    <span className="block font-mono text-[9px] text-white/30">
                      {short(d.userId)}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-semibold">{d.chain}</td>
                  <td className="px-3 py-3 text-right font-mono">{d.amount} USDT</td>
                  <td className="px-3 py-3 font-mono text-[10px] text-white/60">
                    {short(d.txHash, 10, 8)}
                  </td>
                  <td className="px-3 py-3 text-center font-mono">
                    {d.confirmations}
                    {d.minConfirmations != null && (
                      <span className="text-white/30">/{d.minConfirmations}</span>
                    )}
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={d.status} /></td>
                  <td className="px-3 py-3 text-white/50">
                    {new Date(d.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {RECHECKABLE.has(d.status) ? (
                      <Button
                        variant="ghost"
                        onClick={() => recheckM.mutate(d.id)}
                        disabled={recheckM.isPending}
                      >
                        {recheckM.isPending && recheckM.variables === d.id
                          ? 'Rechecking…'
                          : 'Recheck'}
                      </Button>
                    ) : (
                      <span className="text-[10px] text-white/25">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && !depositsQ.isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-xs text-white/40">
                    No crypto deposits match these filters.
                  </td>
                </tr>
              )}
              {depositsQ.isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-xs text-white/40">
                    Loading deposits…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
