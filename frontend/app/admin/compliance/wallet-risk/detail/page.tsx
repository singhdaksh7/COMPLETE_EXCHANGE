'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Button, Card, Select, StatusBadge } from '@/components/ui';
import type { WalletRiskLevel, WalletRiskStatus } from '@/lib/types';

const DECISIONS: WalletRiskStatus[] = ['CLEAR', 'REVIEW_REQUIRED', 'BLOCKED', 'FAILED'];
const LEVELS: WalletRiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function DetailInner() {
  const ready = useGuard('admin');
  const profileId = useSearchParams().get('id') ?? '';
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [decision, setDecision] = useState<WalletRiskStatus>('CLEAR');
  const [level, setLevel] = useState<WalletRiskLevel>('LOW');
  const [note, setNote] = useState('');

  const q = useQuery({
    queryKey: ['wallet-risk-profile', profileId],
    queryFn: () => adminApi.walletRiskProfile(profileId),
    enabled: ready && !!profileId,
    retry: false,
  });

  const reviewMut = useMutation({
    mutationFn: (checkId: string) => adminApi.walletRiskReview(checkId, { decision, level, note: note || undefined }),
    onSuccess: () => { setMsg('Review recorded'); setNote(''); qc.invalidateQueries({ queryKey: ['wallet-risk-profile', profileId] }); },
    onError: (e) => setMsg(errorMessage(e)),
  });

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Wallet Risk Profile</h1>
        <Link href="/admin/compliance/wallet-risk" className="text-xs text-brand hover:underline">← All profiles</Link>
      </div>

      {msg && <div className="mb-4"><Alert kind="info">{msg}</Alert></div>}
      {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

      {q.data && (() => {
        const p = q.data.data;
        return (
          <>
            <Card className="mb-4">
              <div className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-3">
                <div><span className="text-muted">Level: </span><StatusBadge status={p.level} /></div>
                <div><span className="text-muted">Status: </span><StatusBadge status={p.status} /></div>
                <div><span className="text-muted">Score: </span><span className="font-mono">{p.score}</span></div>
                <div><span className="text-muted">Chain: </span>{p.chain}</div>
                <div className="col-span-2"><span className="text-muted">Address: </span><span className="font-mono text-xs">{p.address}</span></div>
                {p.overriddenLevel && <div><span className="text-muted">Override: </span><StatusBadge status={p.overriddenLevel} /></div>}
              </div>
              {p.notes && <p className="mt-2 text-xs text-muted">Notes: {p.notes}</p>}
            </Card>

            <Card className="mb-4">
              <h2 className="mb-3 text-sm font-semibold text-ink">Checks ({p.checks.length})</h2>
              {p.checks.length === 0 ? <p className="text-sm text-muted">No checks.</p> : (
                <div className="space-y-2">
                  {p.checks.map((c) => (
                    <div key={c.id} className="rounded-lg border border-line bg-panel-2 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={c.level} />
                          <StatusBadge status={c.status} />
                          <span className="text-xs text-muted">{c.provider} ({c.providerMode})</span>
                        </div>
                        <span className="font-mono text-xs text-muted">score {c.score}</span>
                      </div>
                      {c.summary && <p className="mt-1 text-xs text-muted">{c.summary}</p>}
                      <p className="mt-1 text-[11px] text-muted">{new Date(c.createdAt).toLocaleString()}{c.reviewedAt ? ` · reviewed ${c.reviewDecision}` : ''}</p>
                      <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-line/60 pt-2">
                        <div className="w-40"><label className="mb-1 block text-[11px] text-muted">Decision</label>
                          <Select value={decision} onChange={(e) => setDecision(e.target.value as WalletRiskStatus)}>{DECISIONS.map((d) => <option key={d} value={d}>{d}</option>)}</Select>
                        </div>
                        <div className="w-32"><label className="mb-1 block text-[11px] text-muted">Level</label>
                          <Select value={level} onChange={(e) => setLevel(e.target.value as WalletRiskLevel)}>{LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</Select>
                        </div>
                        <input className="min-w-[140px] flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-ink" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                        <Button variant="secondary" disabled={reviewMut.isPending} onClick={() => reviewMut.mutate(c.id)}>Record review</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">History</h2>
              {p.events.length === 0 ? <p className="text-sm text-muted">No events.</p> : (
                <ul className="space-y-1 text-xs">
                  {p.events.map((e) => (
                    <li key={e.id} className="flex justify-between border-b border-line/40 py-1">
                      <span className="text-ink">{e.action}{e.actorAdminId ? '' : ' (system)'}</span>
                      <span className="text-muted">{new Date(e.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        );
      })()}
    </main>
  );
}

export default function AdminWalletRiskDetailPage() {
  return (
    <>
      <Suspense fallback={<main className="mx-auto max-w-5xl px-4 py-10"><p className="text-sm text-muted">Loading…</p></main>}>
        <DetailInner />
      </Suspense>
    </>
  );
}
