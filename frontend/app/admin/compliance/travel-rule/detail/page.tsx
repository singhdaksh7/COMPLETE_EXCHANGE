'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Button, Card, Row, StatusBadge } from '@/components/ui';
import type { TravelRuleAction } from '@/lib/types';

function DetailInner() {
  const ready = useGuard('admin');
  const transferId = useSearchParams().get('id') ?? '';
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const q = useQuery({
    queryKey: ['travel-rule-detail', transferId],
    queryFn: () => adminApi.travelRuleTransfer(transferId),
    enabled: ready && !!transferId,
    retry: false,
  });

  const actionMut = useMutation({
    mutationFn: (action: TravelRuleAction) =>
      adminApi.travelRuleAction(transferId, { action, exemptedReason: action === 'EXEMPTED' ? (reason || 'Exempted') : undefined }),
    onSuccess: (_d, action) => { setMsg(`Applied: ${action}`); qc.invalidateQueries({ queryKey: ['travel-rule-detail', transferId] }); },
    onError: (e) => setMsg(errorMessage(e)),
  });
  const exportMut = useMutation({ mutationFn: () => adminApi.travelRuleExport(transferId), onError: (e) => setMsg(errorMessage(e)) });

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Travel Rule Record</h1>
        <Link href="/admin/compliance/travel-rule" className="text-xs text-brand hover:underline">← All records</Link>
      </div>

      {msg && <div className="mb-4"><Alert kind="info">{msg}</Alert></div>}
      {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

      {q.data && (() => {
        const t = q.data.data;
        return (
          <>
            <Card className="mb-4">
              <div className="mb-3 flex items-center gap-2">
                <StatusBadge status={t.status} />
                <span className="text-xs text-muted">{t.direction}</span>
              </div>
              <Row label="Asset" value={t.asset} />
              <Row label="Amount" value={<span className="font-mono">{t.amount}</span>} />
              <Row label="Threshold" value={<span className="font-mono">{t.thresholdAmount ?? '—'}</span>} />
              <Row label="Counterparty address" value={<span className="font-mono text-xs">{t.counterpartyAddress ?? '—'}</span>} />
              <Row label="Originator" value={t.originatorName ?? '—'} />
              <Row label="Beneficiary" value={t.beneficiaryName ?? '—'} />
              <Row label="Info collected" value={t.infoCollectedAt ? new Date(t.infoCollectedAt).toLocaleString() : '—'} />
              <Row label="Mock-sent" value={t.sentMockAt ? new Date(t.sentMockAt).toLocaleString() : '—'} />
              {t.exemptedReason && <Row label="Exempted reason" value={t.exemptedReason} />}
            </Card>

            <Card className="mb-4">
              <h2 className="mb-3 text-sm font-semibold text-ink">Manage</h2>
              <input className="mb-3 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink" placeholder="Exemption reason (for Exempt)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={actionMut.isPending} onClick={() => actionMut.mutate('REQUEST_INFO')}>Request info</Button>
                <Button variant="secondary" disabled={actionMut.isPending} onClick={() => actionMut.mutate('COLLECTED')}>Mark collected</Button>
                <Button disabled={actionMut.isPending} onClick={() => actionMut.mutate('SENT_MOCK')}>Send (mock)</Button>
                <Button variant="danger" disabled={actionMut.isPending} onClick={() => actionMut.mutate('EXEMPTED')}>Exempt</Button>
                <Button variant="secondary" disabled={exportMut.isPending} onClick={() => exportMut.mutate()}>{exportMut.isPending ? 'Exporting…' : 'Export mock packet'}</Button>
              </div>
              <p className="mt-3 text-[11px] text-muted">“Send (mock)” records a SENT_MOCK status only — no Travel Rule message is transmitted to any VASP or network.</p>
            </Card>
          </>
        );
      })()}
    </main>
  );
}

export default function AdminTravelRuleDetailPage() {
  return (
    <>
      <Suspense fallback={<main className="mx-auto max-w-3xl px-4 py-10"><p className="text-sm text-muted">Loading…</p></main>}>
        <DetailInner />
      </Suspense>
    </>
  );
}
