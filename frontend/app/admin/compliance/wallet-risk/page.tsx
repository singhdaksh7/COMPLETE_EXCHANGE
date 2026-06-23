'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Button, Card, EmptyState, Input, Select, StatusBadge } from '@/components/ui';
import type { WalletRiskLevel, WalletRiskStatus } from '@/lib/types';

const LEVELS = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['', 'CLEAR', 'REVIEW_REQUIRED', 'BLOCKED', 'FAILED'];

export default function AdminWalletRiskPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [chain, setChain] = useState('ETH');
  const [address, setAddress] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const summaryQ = useQuery({ queryKey: ['wallet-risk-summary'], queryFn: () => adminApi.walletRiskSummary(), enabled: ready, retry: false });
  const q = useQuery({
    queryKey: ['wallet-risk-profiles', level, status],
    queryFn: () => adminApi.walletRiskProfiles({ level: (level || undefined) as WalletRiskLevel | undefined, status: (status || undefined) as WalletRiskStatus | undefined }),
    enabled: ready,
    retry: false,
  });

  const runMut = useMutation({
    mutationFn: () => adminApi.walletRiskRun({ chain, address }),
    onSuccess: (res) => {
      setBanner(`Checked ${chain} ${address} → ${res.data.check.level}/${res.data.check.status}`);
      qc.invalidateQueries({ queryKey: ['wallet-risk-profiles'] });
      qc.invalidateQueries({ queryKey: ['wallet-risk-summary'] });
    },
    onError: (e) => setBanner(errorMessage(e)),
  });

  if (!ready) return null;
  const items = q.data?.data.items ?? [];
  const s = summaryQ.data?.data;

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Wallet Risk</h1>
          <div className="flex items-center gap-3">
            <Link href="/admin/compliance" className="text-xs text-brand hover:underline">← Compliance dashboard</Link>
            <Link href="/admin/compliance/travel-rule" className="text-xs text-brand hover:underline">Travel Rule →</Link>
          </div>
        </div>
        <p className="mb-4 text-xs text-muted">
          Rule-based wallet-risk screening (mock provider). Detection-only — never blocks money movement.
          Values are <span className="text-amber-400 font-semibold">mock</span> in staging.
        </p>

        {banner && <div className="mb-4"><Alert kind="info">{banner}</Alert></div>}

        {s && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'High-risk profiles', val: s.highRiskProfiles },
              { label: 'Blocked profiles', val: s.blockedProfiles },
              { label: 'Checks needing review', val: s.reviewRequiredChecks },
              { label: 'Pending Travel Rule', val: s.pendingTravelRule },
            ].map((c) => (
              <Card key={c.label}><div className="text-2xl font-semibold text-ink">{c.val}</div><div className="text-xs text-muted">{c.label}</div></Card>
            ))}
          </div>
        )}

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Run a wallet-risk check</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28">
              <label className="mb-1 block text-xs text-muted">Chain</label>
              <Input value={chain} onChange={(e) => setChain(e.target.value)} />
            </div>
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-xs text-muted">Address</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x… (try one containing 'risk' or 'block')" />
            </div>
            <Button onClick={() => runMut.mutate()} disabled={runMut.isPending || !address}>{runMut.isPending ? 'Running…' : 'Run check'}</Button>
          </div>
        </Card>

        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Level</label>
              <Select value={level} onChange={(e) => setLevel(e.target.value)}>{LEVELS.map((x) => <option key={x} value={x}>{x || 'All levels'}</option>)}</Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((x) => <option key={x} value={x}>{x || 'All statuses'}</option>)}</Select>
            </div>
          </div>
        </Card>

        {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {!q.isLoading && items.length === 0 ? (
          <EmptyState title="No wallet-risk profiles" hint="Run a check above to populate the list." />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Level</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Chain</th>
                    <th className="py-2 pr-3">Address</th>
                    <th className="py-2 pr-3">Checks</th>
                    <th className="py-2 pr-3">Last screened</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-b border-line/60">
                      <td className="py-2 pr-3"><StatusBadge status={p.level} /></td>
                      <td className="py-2 pr-3"><StatusBadge status={p.status} /></td>
                      <td className="py-2 pr-3 text-muted">{p.chain}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-ink">{p.address.slice(0, 18)}…</td>
                      <td className="py-2 pr-3 font-mono">{p.checkCount}</td>
                      <td className="py-2 pr-3 text-muted">{p.lastScreenedAt ? new Date(p.lastScreenedAt).toLocaleString() : '—'}</td>
                      <td className="py-2"><Link href={`/admin/compliance/wallet-risk/detail?id=${p.id}`} className="text-brand hover:underline">View →</Link></td>
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
