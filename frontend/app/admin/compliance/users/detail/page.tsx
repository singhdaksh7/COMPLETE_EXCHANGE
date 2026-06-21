'use client';

import { Suspense, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Button, Card, Row, Select, StatusBadge } from '@/components/ui';
import type { ScreeningCheckItem, ScreeningDecision } from '@/lib/types';

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function MockBadge() {
  return (
    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
      Mock data
    </span>
  );
}

function ScreeningCheckCard({
  check,
  onDecide,
  pending,
}: {
  check: ScreeningCheckItem;
  onDecide: (checkId: string, decision: ScreeningDecision, note: string) => void;
  pending: boolean;
}) {
  const [decision, setDecision] = useState<ScreeningDecision>('FALSE_POSITIVE');
  const [note, setNote] = useState('');
  const label = check.category.replace('_', ' ');
  return (
    <div className="rounded-lg border border-line bg-panel-2 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">{label}</span>
          <StatusBadge status={check.status} />
          {check.blocking && (
            <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
              Blocking
            </span>
          )}
        </div>
        <span className="font-mono text-xs text-muted">score {check.score}</span>
      </div>
      {check.summary && <p className="text-xs text-muted">{check.summary}</p>}

      {check.matches.length > 0 && (
        <div className="space-y-1">
          {check.matches.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded border border-line/60 px-2 py-1 text-xs">
              <span className="text-ink">{m.name}</span>
              <span className="text-muted font-mono">
                {m.listName ?? '—'} · {m.matchScore}%
              </span>
            </div>
          ))}
        </div>
      )}

      {check.decision ? (
        <p className="text-xs">
          <span className="text-muted">Decision: </span>
          <span className="font-semibold text-ink">{check.decision}</span>
          {check.decisionNote ? <span className="text-muted"> — {check.decisionNote}</span> : null}
        </p>
      ) : (
        check.status !== 'CLEAR' && (
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <div className="w-44">
              <label className="mb-1 block text-[11px] text-muted">Decision</label>
              <Select value={decision} onChange={(e) => setDecision(e.target.value as ScreeningDecision)}>
                <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
                <option value="APPROVED">APPROVED</option>
                <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
                <option value="REJECTED">REJECTED</option>
              </Select>
            </div>
            <input
              className="flex-1 min-w-[160px] rounded-lg border border-line bg-panel px-3 py-2 text-xs text-ink"
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button variant="secondary" disabled={pending} onClick={() => onDecide(check.id, decision, note)}>
              Record
            </Button>
          </div>
        )
      )}
    </div>
  );
}

function DetailInner() {
  const ready = useGuard('admin');
  const userId = useSearchParams().get('id') ?? '';
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['compliance-detail', userId],
    queryFn: () => adminApi.complianceDetail(userId),
    enabled: ready && !!userId,
    retry: false,
  });

  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [riskLevel, setRiskLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'PROHIBITED'>('MEDIUM');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['compliance-detail', userId] });

  const review = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFO') =>
      adminApi.complianceReview(userId, { decision, reason: reason || undefined, complianceNote: note || undefined }),
    onSuccess: (_d, decision) => { setActionMsg(`Review recorded: ${decision}`); invalidate(); },
  });
  const setRisk = useMutation({
    mutationFn: () => adminApi.complianceSetRisk(userId, { level: riskLevel, reason: reason || undefined }),
    onSuccess: () => { setActionMsg(`Risk level set to ${riskLevel}`); invalidate(); },
  });
  const exportMut = useMutation({ mutationFn: () => adminApi.complianceExport(userId) });

  // ---- screening (Stage 5.1) ----
  const screeningQ = useQuery({
    queryKey: ['compliance-screening', userId],
    queryFn: () => adminApi.complianceScreening(userId),
    enabled: ready && !!userId,
    retry: false,
  });
  const invalidateScreening = () => {
    qc.invalidateQueries({ queryKey: ['compliance-screening', userId] });
    invalidate();
  };
  const runScreening = useMutation({
    mutationFn: () => adminApi.complianceRunScreening(userId),
    onSuccess: () => { setActionMsg('Screening run completed'); invalidateScreening(); },
  });
  const decideScreening = useMutation({
    mutationFn: (v: { checkId: string; decision: ScreeningDecision; note?: string }) =>
      adminApi.complianceScreeningDecision(userId, v.checkId, { decision: v.decision, note: v.note }),
    onSuccess: () => { setActionMsg('Screening decision recorded'); invalidateScreening(); },
  });

  if (!ready) return null;
  if (!userId) return <main className="mx-auto max-w-4xl px-4 py-10"><Alert>Missing user id.</Alert></main>;

  const d = q.data?.data;
  const p = d?.profile;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/admin/compliance/users" className="text-xs text-brand hover:underline">← Back to queue</Link>
        {d?.providerMode === 'mock' && <MockBadge />}
      </div>

      {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}
      {actionMsg && <Alert kind="success">{actionMsg}</Alert>}
      {(review.isError || setRisk.isError) && <Alert>{errorMessage(review.error || setRisk.error)}</Alert>}

      {p && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-ink">{p.email}</h1>
              <p className="text-xs text-muted font-mono">{p.userId}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={p.status} />
              <StatusBadge status={`${p.riskLevel} RISK`} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Compliance profile">
              <Row label="Customer type" value={p.customerType} />
              <Row label="Full name" value={p.fullName ?? '—'} />
              <Row label="Date of birth" value={p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : '—'} />
              <Row label="Nationality" value={p.nationality ?? '—'} />
              <Row label="Residence" value={p.countryOfResidence ?? '—'} />
              <Row label="PAN" value={p.panMasked ?? (p.panLast4 ? `••••${p.panLast4}` : '—')} />
              <Row label="Aadhaar" value={p.aadhaarMasked ?? (p.aadhaarLast4 ? `••••${p.aadhaarLast4}` : '—')} />
              <Row label="Address" value={[p.address.city, p.address.state, p.address.country].filter(Boolean).join(', ') || '—'} />
            </Section>

            <Section title="Risk & screening">
              <Row label="Risk level" value={<StatusBadge status={`${p.riskLevel} RISK`} />} />
              <Row label="Risk score" value={<span className="font-mono">{p.riskScore}</span>} />
              <Row label="Risk reason" value={<span className="text-xs">{p.riskReason ?? '—'}</span>} />
              <Row label="Liveness" value={`${p.livenessStatus}${p.livenessScore != null ? ` (${p.livenessScore}%)` : ''}`} />
              <Row label="Sanctions" value={p.sanctionsStatus} />
              <Row label="PEP" value={p.pepStatus} />
              <Row label="Adverse media" value={p.adverseMediaStatus} />
              <Row label="Next review" value={p.nextReviewDueAt ? new Date(p.nextReviewDueAt).toLocaleDateString() : '—'} />
              <Row label="Retention until" value={p.retentionUntil ? new Date(p.retentionUntil).toLocaleDateString() : '—'} />
            </Section>

            <Section title="Onboarding / geo evidence">
              <Row label="IP" value={p.onboarding.ip ?? '—'} />
              <Row label="Country" value={p.onboarding.country ?? '—'} />
              <Row label="Region" value={p.onboarding.region ?? '—'} />
              <Row label="City" value={p.onboarding.city ?? '—'} />
              <Row label="Geo capture" value={p.onboarding.geoCaptureStatus} />
              <Row label="User agent" value={<span className="text-xs break-all">{p.onboarding.userAgent ?? '—'}</span>} />
            </Section>

            <Section title="Consents" action={<span className="text-xs text-muted">v{p.consentVersion ?? '—'}</span>}>
              {d.consents.length === 0 ? <p className="text-sm text-muted">No consent records.</p> : (
                <div className="space-y-1">
                  {d.consents.map((c) => (
                    <div key={c.id} className="flex justify-between text-xs">
                      <span className="text-ink">{c.consentType}</span>
                      <span className="text-muted">{new Date(c.acceptedAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <Section
            title="Sanctions / PEP / Adverse-media screening"
            action={
              <div className="flex items-center gap-2">
                {screeningQ.data?.data?.blocked && (
                  <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                    Approval blocked
                  </span>
                )}
                {screeningQ.data?.data?.providerMode === 'mock' && <MockBadge />}
                <Button variant="secondary" onClick={() => runScreening.mutate()} disabled={runScreening.isPending}>
                  {runScreening.isPending ? 'Running…' : 'Run screening'}
                </Button>
              </div>
            }
          >
            {screeningQ.isLoading && <p className="text-sm text-muted">Loading screening…</p>}
            {screeningQ.isError && <Alert>{errorMessage(screeningQ.error)}</Alert>}
            {decideScreening.isError && <Alert>{errorMessage(decideScreening.error)}</Alert>}
            {runScreening.isError && <Alert>{errorMessage(runScreening.error)}</Alert>}
            {screeningQ.data?.data && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Overall:</span>
                  <StatusBadge status={screeningQ.data.data.overall} />
                </div>
                {(['SANCTIONS', 'PEP', 'ADVERSE_MEDIA'] as const).map((cat) => {
                  const check = screeningQ.data!.data!.byCategory[cat];
                  return check ? (
                    <ScreeningCheckCard
                      key={cat}
                      check={check}
                      pending={decideScreening.isPending}
                      onDecide={(checkId, decision, note) =>
                        decideScreening.mutate({ checkId, decision, note: note || undefined })
                      }
                    />
                  ) : (
                    <div key={cat} className="rounded-lg border border-line bg-panel-2 p-3 text-xs text-muted">
                      {cat.replace('_', ' ')}: not screened yet
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Evidence">
            {d.evidence.length === 0 ? <p className="text-sm text-muted">No evidence.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr className="border-b border-line text-muted uppercase">
                    <th className="py-1.5 pr-3">Type</th><th className="py-1.5 pr-3">Status</th>
                    <th className="py-1.5 pr-3">Provider</th><th className="py-1.5 pr-3">Reference</th><th className="py-1.5">Created</th>
                  </tr></thead>
                  <tbody className="font-mono">
                    {d.evidence.map((e) => (
                      <tr key={e.id} className="border-b border-line/50">
                        <td className="py-1.5 pr-3 text-ink">{e.type}</td>
                        <td className="py-1.5 pr-3">{e.status}</td>
                        <td className="py-1.5 pr-3">{e.provider ?? '—'}</td>
                        <td className="py-1.5 pr-3 truncate max-w-[160px]">{e.referenceId ?? '—'}</td>
                        <td className="py-1.5 text-muted">{new Date(e.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Risk assessment history">
            {d.riskAssessments.length === 0 ? <p className="text-sm text-muted">No assessments.</p> : (
              <div className="space-y-2">
                {d.riskAssessments.map((r) => (
                  <div key={r.id} className="rounded-lg border border-line bg-panel-2 p-2 text-xs">
                    <div className="flex justify-between">
                      <span><StatusBadge status={`${r.level} RISK`} /> <span className="font-mono">score {r.score}</span> · {r.source}</span>
                      <span className="text-muted">{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    {Array.isArray(r.reasons) && r.reasons.length > 0 && (
                      <ul className="mt-1 list-disc pl-4 text-muted">
                        {r.reasons.map((x, i) => <li key={i}>{x.code}: {x.message}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Action panel */}
          <Section title="Review actions" action={<Button variant="secondary" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>{exportMut.isPending ? 'Exporting…' : 'Export evidence (JSON)'}</Button>}>
            <div className="space-y-3">
              <textarea
                className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink"
                rows={2}
                placeholder="Reason (shown to user on reject/request-info)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <textarea
                className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink"
                rows={2}
                placeholder="Internal compliance note (never shown to the user)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="success" onClick={() => review.mutate('APPROVE')} disabled={review.isPending}>Approve</Button>
                <Button variant="secondary" onClick={() => review.mutate('REQUEST_INFO')} disabled={review.isPending}>Request info</Button>
                <Button variant="danger" onClick={() => review.mutate('REJECT')} disabled={review.isPending}>Reject</Button>
              </div>
              <div className="flex items-end gap-2 pt-2 border-t border-line">
                <div className="w-40">
                  <label className="mb-1 block text-xs text-muted">Set risk level</label>
                  <Select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as typeof riskLevel)}>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="PROHIBITED">PROHIBITED</option>
                  </Select>
                </div>
                <Button variant="secondary" onClick={() => setRisk.mutate()} disabled={setRisk.isPending}>Apply risk level</Button>
              </div>
            </div>
          </Section>

          {p.complianceNote && (
            <Section title="Internal compliance note">
              <p className="text-sm text-ink whitespace-pre-wrap">{p.complianceNote}</p>
            </Section>
          )}
        </>
      )}
    </main>
  );
}

export default function AdminComplianceDetailPage() {
  return (
    <>
      <AdminNav />
      <Suspense fallback={<main className="mx-auto max-w-5xl px-4 py-10"><p className="text-sm text-muted">Loading…</p></main>}>
        <DetailInner />
      </Suspense>
    </>
  );
}
