'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { StatusBadge } from '@/components/ui';
import type { KycDecisionBody, KycQueueFilters } from '@/lib/types';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

const STATUS_OPTIONS = [
  'PENDING',
  'IN_REVIEW',
  'MANUAL_REVIEW',
  'NEEDS_MORE_INFO',
  'APPROVED',
  'REJECTED',
  'NOT_STARTED',
];

// User-facing rejection reason templates. The admin can pick one and optionally
// append a custom note; the chosen text is what the user will see.
const REJECT_TEMPLATES = [
  'Document image is unclear or unreadable',
  'Name does not match the submitted document',
  'Address does not match the submitted document',
  'Date of birth does not match the submitted document',
  'Unsupported or invalid document type',
  'Submission flagged as suspicious',
  'Other (add a custom reason below)',
];

type Decision = 'APPROVE' | 'REJECT' | 'REQUEST_INFO';

export default function AdminKycPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();

  // ----- filters (form vs applied) -----
  const [form, setForm] = useState<KycQueueFilters>({ status: 'PENDING' });
  const [applied, setApplied] = useState<KycQueueFilters>({ status: 'PENDING' });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const queueQ = useQuery({
    queryKey: ['admin-kyc', applied],
    queryFn: () => adminApi.kycQueue(applied),
    enabled: ready,
  });
  const summaryQ = useQuery({
    queryKey: ['admin-kyc-summary'],
    queryFn: () => adminApi.complianceSummary(),
    enabled: ready,
    retry: false,
  });

  const items = useMemo(() => queueQ.data?.data.items ?? [], [queueQ.data]);
  const counts = summaryQ.data?.data.counts;

  // Auto-select the first row when the queue loads / changes.
  useEffect(() => {
    if (items.length > 0 && !items.some((i) => i.userId === selectedUserId)) {
      setSelectedUserId(items[0].userId);
    }
    if (items.length === 0) setSelectedUserId(null);
  }, [items, selectedUserId]);

  function applyFilters() {
    setApplied({ ...form });
  }
  function resetFilters() {
    const base = { status: 'PENDING' };
    setForm(base);
    setApplied(base);
  }

  if (!ready) return null;

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-6 flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #0B0B0E !important; border-bottom: 1px solid rgba(245,194,66,0.1) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <BackdropGlow />

      <main className="relative z-10 flex-1 mx-auto w-full max-w-[1500px] px-6 pt-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">KYC Verification Queue</h1>
            <p className="text-xs text-white/50 mt-1">Review identity submissions, request more info, and record compliance decisions.</p>
          </div>
          <button
            onClick={() => { queueQ.refetch(); summaryQ.refetch(); }}
            className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider"
          >
            Refresh
          </button>
        </div>

        {/* Real status counters (from compliance summary) */}
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          {counts ? (
            [
              { label: 'Pending', val: counts.pending, key: 'PENDING' },
              { label: 'In review', val: counts.inReview, key: 'IN_REVIEW' },
              { label: 'Manual review', val: counts.manualReview, key: 'MANUAL_REVIEW' },
              { label: 'Needs info', val: counts.needsMoreInfo, key: 'NEEDS_MORE_INFO' },
              { label: 'Approved', val: counts.approved, key: 'APPROVED' },
              { label: 'Rejected', val: counts.rejected, key: 'REJECTED' },
            ].map((t) => {
              const active = applied.status === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { const f = { ...form, status: t.key }; setForm(f); setApplied(f); }}
                  className={`px-3 py-2 rounded-lg border transition ${
                    active ? 'border-gold text-gold bg-gold/5' : 'border-white/5 bg-white/[0.02] text-white/55 hover:text-white'
                  }`}
                >
                  {t.label} <span className="ml-1 text-[10px] opacity-65 font-mono">({t.val})</span>
                </button>
              );
            })
          ) : (
            <span className="text-[10px] text-white/35">
              {summaryQ.isError ? '(compliance.view permission required for counts)' : 'Loading counts…'}
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 bg-white/[0.01] border border-white/5 rounded-2xl p-4">
          <div className="lg:col-span-2 flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Email / user</label>
            <input
              placeholder="Search by email…"
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value || undefined })}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none placeholder:text-white/20"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Status</label>
            <select
              value={form.status ?? ''}
              onChange={(e) => setForm({ ...form, status: e.target.value || undefined })}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Risk level</label>
            <select
              value={form.riskLevel ?? ''}
              onChange={(e) => setForm({ ...form, riskLevel: e.target.value || undefined })}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="">All</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Account</label>
            <select
              value={form.accountStatus ?? ''}
              onChange={(e) => setForm({ ...form, accountStatus: e.target.value || undefined })}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="FROZEN">Frozen</option>
              <option value="LOCKED">Locked</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Submitted from</label>
            <input
              type="date"
              value={form.submittedFrom ?? ''}
              onChange={(e) => setForm({ ...form, submittedFrom: e.target.value || undefined })}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Submitted to</label>
            <input
              type="date"
              value={form.submittedTo ?? ''}
              onChange={(e) => setForm({ ...form, submittedTo: e.target.value || undefined })}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>
          <div className="lg:col-span-6 flex gap-2">
            <button onClick={applyFilters} className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition uppercase tracking-wider">
              Apply filters
            </button>
            <button onClick={resetFilters} className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-bold text-white/60 hover:text-white transition uppercase tracking-wider">
              Reset
            </button>
          </div>
        </div>

        {/* Split layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Queue table */}
          <div className="lg:col-span-7 relative rounded-2xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col">
            {queueQ.isError && (
              <div className="m-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
                {errorMessage(queueQ.error)}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.02]">
                    <th className="py-3.5 px-4">User</th>
                    <th className="py-3.5 px-3">Submitted</th>
                    <th className="py-3.5 px-3">Risk</th>
                    <th className="py-3.5 px-3">Account</th>
                    <th className="py-3.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {items.map((item) => {
                    const active = selectedUserId === item.userId;
                    return (
                      <tr
                        key={item.userId}
                        onClick={() => setSelectedUserId(item.userId)}
                        className={`hover:bg-white/[0.02] cursor-pointer transition-all ${active ? 'bg-white/[0.03] border-l-2 border-gold' : ''}`}
                      >
                        <td className="py-3 px-4">
                          <span className="font-bold text-white block truncate max-w-[200px]">{item.fullName ?? '—'}</span>
                          <span className="text-[10px] text-white/45 block truncate max-w-[200px]">{item.email}</span>
                          <span className="text-[9px] text-white/30 block font-mono">ID: {item.userId.slice(0, 8)}</span>
                        </td>
                        <td className="px-3 text-white/50 font-mono text-[10px]">
                          {new Date(item.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-3"><StatusBadge status={`${item.riskLevel} RISK`} /></td>
                        <td className="px-3"><StatusBadge status={item.accountStatus} /></td>
                        <td className="py-3 px-4 text-right"><StatusBadge status={item.status} /></td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && !queueQ.isLoading && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-xs text-white/40 font-mono">
                        No KYC submissions match these filters.
                      </td>
                    </tr>
                  )}
                  {queueQ.isLoading && (
                    <tr><td colSpan={5} className="py-12 text-center text-xs text-white/40">Loading queue…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 py-3 px-4 bg-white/[0.01]">
              <span className="text-[10px] text-white/35">{items.length} entries</span>
              <button
                onClick={() => queueQ.data?.data.nextCursor && setApplied({ ...applied, cursor: queueQ.data.data.nextCursor })}
                disabled={!queueQ.data?.data.nextCursor}
                className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-[10px] font-bold text-white/80 hover:border-gold/40 transition disabled:opacity-40"
              >
                Next page
              </button>
            </div>
          </div>

          {/* Detail pane */}
          <div className="lg:col-span-5">
            {selectedUserId ? (
              <DetailPane key={selectedUserId} userId={selectedUserId} onDecided={() => {
                qc.invalidateQueries({ queryKey: ['admin-kyc'] });
                qc.invalidateQueries({ queryKey: ['admin-kyc-summary'] });
              }} />
            ) : (
              <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-12 text-center text-xs text-white/30 font-mono">
                Select a submission to review.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function DetailPane({ userId, onDecided }: { userId: string; onDecided: () => void }) {
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: ['admin-kyc-detail', userId],
    queryFn: () => adminApi.kycDetail(userId),
  });
  const d = detailQ.data?.data;

  const [confirm, setConfirm] = useState<Decision | null>(null);
  const [tier, setTier] = useState(1);
  const [template, setTemplate] = useState(REJECT_TEMPLATES[0]);
  const [customReason, setCustomReason] = useState('');
  const [complianceNote, setComplianceNote] = useState('');
  const [noteDraft, setNoteDraft] = useState('');

  const decideM = useMutation({
    mutationFn: (body: KycDecisionBody) => adminApi.decide(userId, body),
    onSuccess: () => {
      setConfirm(null);
      setCustomReason('');
      setComplianceNote('');
      detailQ.refetch();
      onDecided();
    },
  });

  const noteM = useMutation({
    mutationFn: (note: string) => adminApi.addKycNote(userId, note),
    onSuccess: () => {
      setNoteDraft('');
      qc.invalidateQueries({ queryKey: ['admin-kyc-detail', userId] });
    },
  });

  if (detailQ.isLoading) {
    return <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-12 text-center text-xs text-white/40">Loading detail…</div>;
  }
  if (detailQ.isError || !d) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-xs text-red-300">
        {errorMessage(detailQ.error)}
      </div>
    );
  }

  // Compose the user-facing reason from the chosen template (+ optional custom).
  const isOther = template.startsWith('Other');
  const composedReason = isOther
    ? customReason.trim()
    : customReason.trim()
      ? `${template} — ${customReason.trim()}`
      : template;

  function submitDecision() {
    if (confirm === 'APPROVE') {
      decideM.mutate({ decision: 'APPROVE', tier, ...(complianceNote.trim() ? { complianceNote: complianceNote.trim() } : {}) });
    } else if (confirm === 'REJECT') {
      decideM.mutate({ decision: 'REJECT', reason: composedReason, ...(complianceNote.trim() ? { complianceNote: complianceNote.trim() } : {}) });
    } else if (confirm === 'REQUEST_INFO') {
      decideM.mutate({ decision: 'REQUEST_INFO', reason: composedReason, ...(complianceNote.trim() ? { complianceNote: complianceNote.trim() } : {}) });
    }
  }

  const addr = d.address ? Object.values(d.address).filter(Boolean).join(', ') : null;

  return (
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-5">
      {/* Header */}
      <div className="flex justify-between items-start border-b border-white/5 pb-3">
        <div className="truncate">
          <h3 className="text-sm font-bold text-white tracking-tight">{d.fullName ?? 'Unnamed applicant'}</h3>
          <span className="text-[10px] text-white/45 block truncate">{d.email}</span>
          <span className="text-[9px] text-white/30 block font-mono">ID: {d.userId}</span>
        </div>
        <StatusBadge status={d.status} />
      </div>

      {/* Identity facts (real, masked) */}
      <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
        <Fact label="Tier" value={`Tier ${d.tier}`} />
        <Fact label="Provider" value={d.provider ?? '—'} />
        <Fact label="Date of birth" value={d.dob ? new Date(d.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
        <Fact label="Risk level" value={d.riskLevel} />
        <Fact label="PAN (masked)" value={d.panMasked ?? '—'} mono />
        <Fact label="Aadhaar (masked)" value={d.aadhaarMasked ?? '—'} mono />
        <Fact label="Account status" value={d.accountStatus} />
        <Fact label="Withdrawals" value={d.withdrawalsBlocked ? 'Blocked' : 'Allowed'} />
        {addr && <div className="col-span-2"><Fact label="Address" value={addr} /></div>}
        {d.reviewedAt && <Fact label="Reviewed at" value={new Date(d.reviewedAt).toLocaleString()} />}
        {d.rejectedReason && <div className="col-span-2"><Fact label="Last user-facing reason" value={d.rejectedReason} /></div>}
      </div>

      {/* Activity summary */}
      <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-4 text-xs">
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <span className="text-[9px] text-white/40 uppercase tracking-wider block">Deposits</span>
          <span className="font-mono text-white font-bold">{d.activity.depositCount}</span>
          {d.activity.lastDepositAt && <span className="text-[9px] text-white/35 block">last {new Date(d.activity.lastDepositAt).toLocaleDateString()}</span>}
        </div>
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <span className="text-[9px] text-white/40 uppercase tracking-wider block">Withdrawals</span>
          <span className="font-mono text-white font-bold">{d.activity.withdrawalCount}</span>
          {d.activity.lastWithdrawalAt && <span className="text-[9px] text-white/35 block">last {new Date(d.activity.lastWithdrawalAt).toLocaleDateString()}</span>}
        </div>
      </div>

      {/* Documents */}
      <div className="border-t border-white/5 pt-4">
        <span className="text-[10px] font-bold text-white/35 uppercase tracking-widest block mb-2">Documents ({d.documents.length})</span>
        {d.documents.length === 0 ? (
          <p className="text-[11px] text-white/30">No documents uploaded.</p>
        ) : (
          <div className="space-y-1.5">
            {d.documents.map((doc) => (
              <div key={doc.id} className="flex justify-between items-center text-[11px] bg-white/[0.01] border border-white/5 rounded-lg px-3 py-2">
                <span className="text-white/70">{doc.docType}</span>
                <StatusBadge status={doc.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Internal compliance note */}
      <div className="border-t border-white/5 pt-4 space-y-2">
        <span className="text-[10px] font-bold text-white/35 uppercase tracking-widest block">Internal compliance note <span className="text-white/25 normal-case">(never shown to user)</span></span>
        {d.complianceNote && (
          <p className="text-[11px] text-white/70 bg-amber-500/5 border border-amber-500/15 rounded-lg p-2.5 whitespace-pre-wrap">{d.complianceNote}</p>
        )}
        <textarea
          placeholder="Add an internal note…"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-white/10 bg-noir py-2 px-3 text-xs text-white focus:border-gold/60 focus:outline-none placeholder:text-white/20 resize-none"
        />
        <button
          onClick={() => noteDraft.trim() && noteM.mutate(noteDraft.trim())}
          disabled={!noteDraft.trim() || noteM.isPending}
          className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[10px] font-bold text-white/70 hover:text-white transition disabled:opacity-40 uppercase tracking-wider"
        >
          {noteM.isPending ? 'Saving…' : 'Save note'}
        </button>
        {noteM.isError && <p className="text-[10px] text-red-300">{errorMessage(noteM.error)}</p>}
      </div>

      {/* Decision actions */}
      <div className="border-t border-white/5 pt-4 space-y-3">
        <span className="text-[10px] font-bold text-white/35 uppercase tracking-widest block">Decision</span>
        {decideM.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-[11px] text-red-300">{errorMessage(decideM.error)}</div>
        )}
        <div className="flex gap-2">
          <button onClick={() => setConfirm('APPROVE')} className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white hover:brightness-105 transition">Approve</button>
          <button onClick={() => setConfirm('REQUEST_INFO')} className="flex-1 rounded-lg bg-sky-500 py-2 text-xs font-bold text-white hover:brightness-105 transition">Request info</button>
          <button onClick={() => setConfirm('REJECT')} className="flex-1 rounded-lg bg-red-500 py-2 text-xs font-bold text-white hover:brightness-105 transition">Reject</button>
        </div>
      </div>

      {/* Timeline */}
      <div className="border-t border-white/5 pt-4">
        <span className="text-[10px] font-bold text-white/35 uppercase tracking-widest block mb-2">KYC action timeline</span>
        {d.timeline.length === 0 ? (
          <p className="text-[11px] text-white/30">No admin actions recorded yet.</p>
        ) : (
          <div className="space-y-2 pl-2 border-l border-white/10">
            {d.timeline.map((t) => (
              <div key={t.id} className="relative pl-3">
                <span className="absolute -left-[5px] top-1.5 h-1.5 w-1.5 rounded-full bg-gold" />
                <div className="flex justify-between gap-2 text-[11px]">
                  <span className="font-mono text-white/80">{t.action}</span>
                  <span className="text-white/30 shrink-0">{new Date(t.occurredAt).toLocaleString()}</span>
                </div>
                <span className="text-[9px] text-white/35 block font-mono">{t.actorEmail ?? t.actorAdminId.slice(0, 8)}</span>
                {t.reason && <span className="text-[10px] text-white/50 block">“{t.reason}”</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !decideM.isPending && setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-noir-2 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white">
              {confirm === 'APPROVE' ? 'Approve KYC' : confirm === 'REJECT' ? 'Reject KYC' : 'Request more information'}
            </h3>
            <p className="text-xs text-white/55">
              {confirm === 'APPROVE'
                ? 'This grants the user verified status and unlocks gated features.'
                : confirm === 'REJECT'
                  ? 'The user will see the reason below. Internal notes stay private.'
                  : 'The user will be asked to resubmit with the message below.'}
            </p>

            {confirm === 'APPROVE' && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Tier</label>
                <select value={tier} onChange={(e) => setTier(Number(e.target.value))} className="rounded-lg border border-white/10 bg-noir px-3 py-1.5 text-xs text-white">
                  {[1, 2, 3].map((t) => <option key={t} value={t}>Tier {t}</option>)}
                </select>
              </div>
            )}

            {(confirm === 'REJECT' || confirm === 'REQUEST_INFO') && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Reason (shown to user)</label>
                <select value={template} onChange={(e) => setTemplate(e.target.value)} className="w-full rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white">
                  {REJECT_TEMPLATES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <textarea
                  placeholder={isOther ? 'Enter a custom user-facing reason…' : 'Optional extra detail for the user…'}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-white/10 bg-noir py-2 px-3 text-xs text-white focus:border-gold/60 focus:outline-none resize-none placeholder:text-white/20"
                />
                <p className="text-[10px] text-white/40">User will see: <span className="text-white/70">{composedReason || '—'}</span></p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Internal note (optional, private)</label>
              <input
                value={complianceNote}
                onChange={(e) => setComplianceNote(e.target.value)}
                placeholder="Internal compliance note…"
                className="w-full rounded-lg border border-white/10 bg-noir py-2 px-3 text-xs text-white focus:border-gold/60 focus:outline-none placeholder:text-white/20"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirm(null)} disabled={decideM.isPending} className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] py-2 text-xs font-bold text-white/70 hover:text-white transition disabled:opacity-40">Cancel</button>
              <button
                onClick={submitDecision}
                disabled={decideM.isPending || ((confirm === 'REJECT' || confirm === 'REQUEST_INFO') && !composedReason)}
                className={`flex-1 rounded-lg py-2 text-xs font-bold text-white transition disabled:opacity-40 ${
                  confirm === 'APPROVE' ? 'bg-emerald-500' : confirm === 'REJECT' ? 'bg-red-500' : 'bg-sky-500'
                }`}
              >
                {decideM.isPending ? 'Submitting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-white/45 block text-[10px]">{label}</span>
      <span className={`font-semibold text-white block mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
