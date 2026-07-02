'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import type { SupportMessage, SupportTicketThread } from '@/lib/types';

/**
 * User-facing support (Stage 9A). Single static-export-safe page: the ticket
 * list, a "new ticket" form, and the conversation thread are all driven by
 * client state + a `?ticket=<id>` query param (no dynamic route is generated).
 * Users only ever see their own tickets; internal admin notes are never sent
 * here by the API.
 */

const CATEGORIES = ['ACCOUNT', 'KYC', 'DEPOSIT', 'WITHDRAWAL', 'TRADING', 'SECURITY', 'OTHER'];
const input =
  'w-full rounded-lg border border-white/10 bg-noir-2/80 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-gold/60 focus:outline-none';

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleString('en-IN') : '—';
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls =
    s === 'RESOLVED' ? 'bg-emerald-500/15 text-emerald-300'
      : s === 'CLOSED' ? 'bg-white/10 text-white/50'
        : s === 'WAITING_FOR_USER' ? 'bg-gold/15 text-gold'
          : 'bg-blue-500/15 text-blue-300';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
      {s.replace(/_/g, ' ')}
    </span>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-bold text-white/60 hover:text-gold transition"
    >
      {done ? 'Copied!' : `Copy ${label}`}
    </button>
  );
}

function SupportInner() {
  const ready = useGuard('user');
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const activeId = search.get('ticket');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => userApi.supportTickets(),
    enabled: ready,
    retry: false,
  });

  const detail = useQuery({
    queryKey: ['support-ticket', activeId],
    queryFn: () => userApi.supportTicket(activeId as string),
    enabled: ready && !!activeId,
    retry: false,
  });

  const open = (id: string) => router.push(`/support?ticket=${id}`);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['support-tickets'] });
    if (activeId) qc.invalidateQueries({ queryKey: ['support-ticket', activeId] });
  };

  if (!ready) return null;

  return (
    <UserShell className="max-w-[1100px]">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Support</h1>
          <p className="text-xs text-white/50 mt-1">Raise a ticket and track our replies.</p>
        </div>
        {!activeId && !creating && (
          <button
            onClick={() => { setCreating(true); setErr(null); }}
            className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
          >
            + New ticket
          </button>
        )}
        {(activeId || creating) && (
          <button
            onClick={() => { setCreating(false); router.push('/support'); }}
            className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-white/70 hover:text-white transition"
          >
            ← Back
          </button>
        )}
      </div>

      {err && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">{err}</div>}

      {creating ? (
        <NewTicketForm
          onCancel={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); refresh(); open(id); }}
          onErr={(e) => setErr(errorMessage(e))}
        />
      ) : activeId ? (
        detail.isLoading ? (
          <p className="text-sm text-white/40 py-6">Loading ticket…</p>
        ) : detail.isError ? (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">Ticket unavailable. Please go back and retry.</div>
        ) : detail.data ? (
          <TicketThread t={detail.data.data} onChanged={refresh} onErr={(e) => setErr(errorMessage(e))} />
        ) : null
      ) : (
        <TicketList
          loading={list.isLoading}
          error={list.isError ? errorMessage(list.error) : null}
          items={list.data?.data.items ?? []}
          onOpen={open}
        />
      )}
    </UserShell>
  );
}

function TicketList({
  loading,
  error,
  items,
  onOpen,
}: {
  loading: boolean;
  error: string | null;
  items: import('@/lib/types').SupportTicketSummary[];
  onOpen: (id: string) => void;
}) {
  if (loading) return <p className="text-sm text-white/40 py-6">Loading tickets…</p>;
  if (error) return <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">{error}</div>;
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.01] py-16 text-center">
        <p className="text-sm text-white/50">No support tickets yet.</p>
        <p className="text-xs text-white/30 mt-1">Raise a ticket and our team will help you out.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t.id)}
          className="w-full text-left rounded-xl border border-white/5 bg-white/[0.01] p-4 hover:bg-white/[0.03] transition"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold text-white/90">{t.subject}</span>
            <StatusBadge status={t.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-white/40">
            {t.ticketNumber && <span className="font-mono text-white/50">{t.ticketNumber}</span>}
            <span>· {t.category}</span>
            <span className="ml-auto">Updated {fmt(t.lastMessageAt ?? t.updatedAt)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function NewTicketForm({
  onCancel,
  onCreated,
  onErr,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
  onErr: (e: unknown) => void;
}) {
  const [category, setCategory] = useState('ACCOUNT');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const m = useMutation({
    mutationFn: () =>
      userApi.supportCreateTicket({
        category,
        subject: subject.trim(),
        message: message.trim(),
        referenceId: referenceId.trim() || undefined,
      }),
    onSuccess: (r) => onCreated(r.data.id),
    onError: onErr,
  });
  const invalid = subject.trim().length < 3 || message.trim().length < 1;
  return (
    <div className="rounded-2xl border border-gold/20 bg-white/[0.02] p-5 space-y-3 max-w-2xl">
      <h3 className="text-sm font-bold text-white">Raise a support ticket</h3>
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">Category</label>
        <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">Subject</label>
        <input className={input} placeholder="Brief summary (min 3 chars)" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">Message</label>
        <textarea className={input} rows={5} placeholder="Describe your issue" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">Reference / UTR (optional)</label>
        <input className={input} placeholder="e.g. a UTR / transaction id" value={referenceId} onChange={(e) => setReferenceId(e.target.value)} maxLength={120} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => m.mutate()}
          disabled={m.isPending || invalid}
          className="rounded-lg bg-gold/90 px-4 py-2 text-xs font-bold text-noir hover:bg-gold transition disabled:opacity-40"
        >
          {m.isPending ? 'Submitting…' : 'Submit ticket'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-white/60 hover:text-white transition">Cancel</button>
      </div>
    </div>
  );
}

function TicketThread({
  t,
  onChanged,
  onErr,
}: {
  t: SupportTicketThread;
  onChanged: () => void;
  onErr: (e: unknown) => void;
}) {
  const [reply, setReply] = useState('');
  const closed = t.status.toUpperCase() === 'CLOSED';
  const send = useMutation({
    mutationFn: () => userApi.supportReply(t.id, reply.trim()),
    onSuccess: () => { setReply(''); onChanged(); },
    onError: onErr,
  });
  const close = useMutation({
    mutationFn: () => userApi.supportCloseTicket(t.id),
    onSuccess: onChanged,
    onError: onErr,
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">{t.subject}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
              <StatusBadge status={t.status} />
              <span>{t.category}</span>
              {t.ticketNumber && (
                <span className="flex items-center gap-1.5 font-mono text-white/50">
                  {t.ticketNumber} <CopyButton value={t.ticketNumber} label="no." />
                </span>
              )}
            </div>
            {t.referenceId && (
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/40">
                Ref: <span className="font-mono">{t.referenceId}</span>
                <CopyButton value={t.referenceId} label="ref" />
              </div>
            )}
            <p className="mt-1 text-[10px] text-white/30">Created {fmt(t.createdAt)}</p>
          </div>
          {!closed && (
            <button
              onClick={() => close.mutate()}
              disabled={close.isPending}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-bold text-white/60 hover:text-red-300 transition disabled:opacity-40"
            >
              {close.isPending ? '…' : 'Close ticket'}
            </button>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className="space-y-3">
        {t.messages.map((m: SupportMessage) => {
          const mine = m.senderType === 'USER';
          const system = m.senderType === 'SYSTEM';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  system
                    ? 'bg-white/[0.03] text-white/50 text-xs italic mx-auto'
                    : mine
                      ? 'bg-gold/15 text-white border border-gold/20'
                      : 'bg-white/[0.04] text-white/90 border border-white/5'
                }`}
              >
                {!system && (
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-white/40 mb-0.5">
                    {mine ? 'You' : 'Support'}
                  </span>
                )}
                <p className="whitespace-pre-wrap">{m.body}</p>
                <span className="mt-1 block text-[9px] text-white/30">{fmt(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply */}
      {closed ? (
        <p className="rounded-lg border border-white/5 bg-white/[0.01] p-3 text-center text-xs text-white/40">
          This ticket is closed. Please open a new ticket if you need more help.
        </p>
      ) : (
        <div className="space-y-2">
          <textarea
            className={input}
            rows={3}
            placeholder="Type your reply…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={5000}
          />
          <button
            onClick={() => send.mutate()}
            disabled={send.isPending || reply.trim().length === 0}
            className="rounded-lg bg-gold/90 px-4 py-2 text-xs font-bold text-noir hover:bg-gold transition disabled:opacity-40"
          >
            {send.isPending ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      )}
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
