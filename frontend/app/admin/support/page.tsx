'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';

const STATUSES = ['', 'OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const CATEGORIES = ['GENERAL', 'KYC', 'DEPOSIT', 'WITHDRAWAL', 'TRADING', 'COMPLIANCE', 'SECURITY', 'OTHER'];

const sel = 'rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:border-gold/40 focus:outline-none';
const input = 'w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white focus:border-gold/40 focus:outline-none';

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleString() : '—';
}
function Pill({ text }: { text: string }) {
  const t = text.toUpperCase();
  const cls = ['HIGH', 'URGENT', 'CLOSED'].some((k) => t.includes(k)) ? 'bg-red-500/15 text-red-300'
    : ['MEDIUM', 'WAITING', 'IN_PROGRESS', 'OPEN'].some((k) => t.includes(k)) ? 'bg-gold/15 text-gold'
    : 'bg-white/5 text-white/50';
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${cls}`}>{text}</span>;
}

function SupportInner() {
  const ready = useGuard('admin');
  const search = useSearchParams();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const me = useQuery({ queryKey: ['admin-me'], queryFn: () => adminApi.me(), enabled: ready });
  const roles = me.data?.data.roles ?? [];
  const perms = me.data?.data.permissions ?? [];
  const canManage = roles.includes('SUPER_ADMIN') || perms.includes('support.manage');

  const list = useQuery({
    queryKey: ['support-tickets', status],
    queryFn: () => adminApi.supportTickets({ status: status || undefined }),
    enabled: ready,
    retry: false,
  });

  const activeId = selectedId ?? search.get('id');
  const detail = useQuery({
    queryKey: ['support-ticket', activeId],
    queryFn: () => adminApi.supportTicket(activeId as string),
    enabled: ready && !!activeId,
    retry: false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['support-tickets'] });
    if (activeId) qc.invalidateQueries({ queryKey: ['support-ticket', activeId] });
  };
  const onErr = (e: unknown) => setErr(errorMessage(e));

  if (!ready) return null;

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-10">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #0B0B0E !important; border-bottom: 1px solid rgba(245,194,66,0.1) !important; }
        header span, header nav a { color: #eaecef !important; }
      `}} />
      <main className="relative z-10 mx-auto max-w-[1300px] px-6 pt-6 space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Support Tickets</h1>
            <p className="text-xs text-white/50 mt-1">Internal operations tickets. {!canManage && 'Read-only (requires support.manage to edit).'}</p>
          </div>
          <div className="flex items-center gap-2">
            <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s ? s : 'All statuses'}</option>)}
            </select>
            {canManage && (
              <button onClick={() => { setCreating(true); setErr(null); }} className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-1.5 text-[10px] font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider">New ticket</button>
            )}
          </div>
        </div>

        {err && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">{err}</div>}

        {creating && canManage && <CreateForm onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); setSelectedId(id); refresh(); }} onErr={onErr} />}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* List */}
          <div className="lg:col-span-2 rounded-2xl border border-white/5 bg-white/[0.01] p-4">
            {list.isLoading && <p className="text-sm text-white/40">Loading tickets…</p>}
            {list.isError && <p className="text-sm text-red-300">{errorMessage(list.error)} — support.view required.</p>}
            {list.data && list.data.data.items.length === 0 && <p className="py-12 text-center text-xs text-white/35">No tickets.</p>}
            <div className="space-y-1.5">
              {list.data?.data.items.map((t) => (
                <button key={t.id} onClick={() => setSelectedId(t.id)} className={`w-full text-left rounded-lg border p-3 transition ${activeId === t.id ? 'border-gold/30 bg-gold/[0.04]' : 'border-white/5 hover:bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-white/90">{t.subject}</span>
                    <Pill text={t.priority} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-white/40">
                    <Pill text={t.status} />
                    <span>{t.category}</span>
                    {t.userEmail && <span className="truncate">· {t.userEmail}</span>}
                    <span className="ml-auto">{fmt(t.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Detail */}
          <div className="lg:col-span-3 rounded-2xl border border-white/5 bg-white/[0.01] p-5">
            {!activeId ? (
              <p className="py-16 text-center text-sm text-white/35">Select a ticket to view details.</p>
            ) : detail.isLoading ? (
              <p className="text-sm text-white/40">Loading…</p>
            ) : detail.data ? (
              <TicketDetail t={detail.data.data} canManage={canManage} onChanged={refresh} onErr={onErr} />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

function CreateForm({ onClose, onDone, onErr }: { onClose: () => void; onDone: (id: string) => void; onErr: (e: unknown) => void }) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [priority, setPriority] = useState('MEDIUM');
  const [userId, setUserId] = useState('');
  const [body, setBody] = useState('');
  const m = useMutation({
    mutationFn: () => adminApi.supportTicketCreate({ subject: subject.trim(), category, priority, userId: userId.trim() || undefined, body: body.trim() || undefined }),
    onSuccess: (r) => onDone(r.data.id),
    onError: onErr,
  });
  return (
    <div className="rounded-2xl border border-gold/20 bg-white/[0.02] p-5 space-y-3">
      <h3 className="text-sm font-bold text-white">New ticket</h3>
      <input className={input} placeholder="Subject (min 3 chars)" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <select className={sel} value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select className={sel} value={priority} onChange={(e) => setPriority(e.target.value)}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <input className={`${sel} flex-1`} placeholder="Linked user id (optional UUID)" value={userId} onChange={(e) => setUserId(e.target.value)} />
      </div>
      <textarea className={input} rows={3} placeholder="Opening note (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={() => m.mutate()} disabled={m.isPending || subject.trim().length < 3} className="rounded-lg bg-gold/90 px-4 py-2 text-xs font-bold text-noir hover:bg-gold transition disabled:opacity-40">{m.isPending ? 'Creating…' : 'Create ticket'}</button>
        <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-white/60 hover:text-white transition">Cancel</button>
      </div>
    </div>
  );
}

function TicketDetail({ t, canManage, onChanged, onErr }: { t: import('@/lib/types').SupportTicketDetail; canManage: boolean; onChanged: () => void; onErr: (e: unknown) => void }) {
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminApi.supportTicketUpdate(t.id, { ...body, reason: reason.trim() || undefined }),
    onSuccess: () => { setReason(''); onChanged(); },
    onError: onErr,
  });
  const addNote = useMutation({
    mutationFn: () => adminApi.supportTicketAddNote(t.id, note.trim()),
    onSuccess: () => { setNote(''); onChanged(); },
    onError: onErr,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">{t.subject}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
            <Pill text={t.status} /><Pill text={t.priority} /><span>{t.category}</span>
            {t.userId && <Link href={`/admin/users/detail?id=${t.userId}`} className="text-gold hover:underline">{t.userEmail ?? 'user'} →</Link>}
          </div>
          <p className="mt-1 text-[10px] text-white/30">Created {fmt(t.createdAt)} · Updated {fmt(t.updatedAt)}{t.closedAt ? ` · Closed ${fmt(t.closedAt)}` : ''}</p>
        </div>
      </div>

      {canManage && (
        <div className="rounded-xl border border-white/5 bg-white/[0.01] p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select className={sel} value={t.status} onChange={(e) => update.mutate({ status: e.target.value })} disabled={update.isPending}>
              {STATUSES.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={sel} value={t.priority} onChange={(e) => update.mutate({ priority: e.target.value })} disabled={update.isPending}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className={`${sel} flex-1`} placeholder="Reason (optional, audited)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Notes</h3>
        {t.notes.length === 0 ? <p className="text-xs text-white/35">No notes yet.</p> : (
          <div className="space-y-2">
            {t.notes.map((n) => (
              <div key={n.id} className="rounded-lg border border-white/5 bg-white/[0.01] p-3">
                <p className="whitespace-pre-wrap text-sm text-white/80">{n.body}</p>
                <p className="mt-1 text-[10px] text-white/30">{n.authorAdminId ? `by ${n.authorAdminId.slice(0, 8)} · ` : ''}{fmt(n.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
        {canManage && (
          <div className="mt-3 space-y-2">
            <textarea className={input} rows={2} placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
            <button onClick={() => addNote.mutate()} disabled={addNote.isPending || note.trim().length === 0} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-white/70 hover:text-gold transition disabled:opacity-40">{addNote.isPending ? 'Adding…' : 'Add note'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportInner />
    </Suspense>
  );
}
