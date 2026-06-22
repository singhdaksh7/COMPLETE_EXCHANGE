'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import type { LegalDocument, LegalAcceptanceItem } from '@/lib/types';

export default function LegalPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const docsQ = useQuery({ queryKey: ['legal-current'], queryFn: () => userApi.legalCurrent(), enabled: ready, retry: false });
  const accQ = useQuery({ queryKey: ['legal-mine'], queryFn: () => userApi.legalMyAcceptances(), enabled: ready, retry: false });

  const acceptMut = useMutation({
    mutationFn: (documentType: string) => userApi.legalAccept({ documentType }),
    onSuccess: () => { setMsg('Acceptance recorded.'); qc.invalidateQueries({ queryKey: ['legal-mine'] }); },
    onError: (e) => setMsg(errorMessage(e)),
  });

  if (!ready) return null;
  const docs = (docsQ.data?.data.items ?? []) as LegalDocument[];
  const acceptances = (accQ.data?.data.items ?? []) as LegalAcceptanceItem[];
  const acceptedTypes = new Set(acceptances.filter((a) => a.status === 'ACCEPTED').map((a) => a.documentType));

  return (
    <UserShell>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-bold text-white">Legal &amp; Policies</h1>
        <p className="mt-1 text-xs text-white/50">Staging/demo documents. Review and accept the current versions.</p>
        {msg && <div className="mt-3 rounded-lg border border-gold/20 bg-gold/5 p-3 text-sm text-gold">{msg}</div>}

        <div className="mt-4 space-y-3">
          {docs.map((d) => (
            <div key={d.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">{d.title}</div>
                  <div className="text-[11px] text-white/40">v{d.version} · checksum {d.checksum.slice(0, 10)}…</div>
                </div>
                {acceptedTypes.has(d.type) ? (
                  <span className="rounded-full bg-up/15 px-2 py-0.5 text-[11px] font-bold text-up">Accepted</span>
                ) : (
                  <button
                    onClick={() => acceptMut.mutate(d.type)}
                    disabled={acceptMut.isPending}
                    className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
                  >
                    Accept
                  </button>
                )}
              </div>
              <button onClick={() => setOpen(open === d.id ? null : d.id)} className="mt-2 text-xs text-gold hover:underline">
                {open === d.id ? 'Hide' : 'Read'} document
              </button>
              {open === d.id && <p className="mt-2 whitespace-pre-wrap text-xs text-white/60">{d.content}</p>}
            </div>
          ))}
          {docsQ.isLoading && <p className="text-sm text-white/40">Loading…</p>}
        </div>

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-white/60">My acceptances</h2>
        <div className="mt-2 space-y-1">
          {acceptances.length === 0 ? (
            <p className="text-xs text-white/40">No acceptances yet.</p>
          ) : (
            acceptances.map((a) => (
              <div key={a.id} className="flex justify-between rounded-lg border border-white/5 px-3 py-1.5 text-xs">
                <span className="text-white/80">{a.documentType.replace(/_/g, ' ')} · v{a.version}</span>
                <span className="text-white/40">{a.status} · {new Date(a.acceptedAt).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </UserShell>
  );
}
