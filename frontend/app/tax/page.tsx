'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import type { TaxSummary, TaxStatementItem, UserTaxProfile } from '@/lib/types';

export default function TaxPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);

  const profileQ = useQuery({ queryKey: ['tax-profile'], queryFn: () => userApi.taxProfile(), enabled: ready, retry: false });
  const summaryQ = useQuery({ queryKey: ['tax-summary'], queryFn: () => userApi.taxSummary(), enabled: ready, retry: false });
  const stmtQ = useQuery({ queryKey: ['tax-statements'], queryFn: () => userApi.taxStatements(), enabled: ready, retry: false });

  const profile = profileQ.data?.data as UserTaxProfile | undefined;
  const summary = summaryQ.data?.data as TaxSummary | undefined;
  const statements = (stmtQ.data?.data as { items: TaxStatementItem[] } | undefined)?.items ?? [];

  const setPanMut = useMutation({
    mutationFn: (panAvailable: boolean) => userApi.setTaxProfile({ panAvailable }),
    onSuccess: () => { setMsg('Tax profile updated.'); qc.invalidateQueries({ queryKey: ['tax-profile'] }); },
    onError: (e) => setMsg(errorMessage(e)),
  });

  if (!ready) return null;

  return (
    <UserShell>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-bold text-white">Tax &amp; TDS</h1>
        <p className="mt-1 text-xs text-amber-400 font-semibold">CALCULATION-ONLY (staging) — not filed with any tax authority.</p>
        {msg && <div className="mt-3 rounded-lg border border-gold/20 bg-gold/5 p-3 text-sm text-gold">{msg}</div>}

        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-sm font-semibold text-white">Tax profile</div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-white/60">PAN available</span>
            <div className="flex gap-2">
              <button onClick={() => setPanMut.mutate(true)} disabled={setPanMut.isPending} className={`rounded-lg px-3 py-1 text-xs font-bold ${profile?.panAvailable ? 'bg-up text-black' : 'border border-white/15 text-white/70'}`}>Yes</button>
              <button onClick={() => setPanMut.mutate(false)} disabled={setPanMut.isPending} className={`rounded-lg px-3 py-1 text-xs font-bold ${profile && !profile.panAvailable ? 'bg-red-500 text-white' : 'border border-white/15 text-white/70'}`}>No</button>
            </div>
          </div>
          {profile?.higherTdsApplicable && <p className="mt-2 text-[11px] text-amber-400">Higher TDS may apply when PAN is not available (illustrative).</p>}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: 'TDS records', val: summary?.recordCount ?? 0 },
            { label: 'Total gross', val: summary ? summary.totalGross.toLocaleString() : '0' },
            { label: 'Total TDS', val: summary ? summary.totalTds.toLocaleString() : '0' },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-lg font-bold text-white">{c.val}</div>
              <div className="text-[11px] text-white/50">{c.label}</div>
            </div>
          ))}
        </div>
        {summary && <p className="mt-1 text-[11px] text-white/40">Financial year {summary.financialYear}</p>}

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-white/60">Statements</h2>
        <div className="mt-2 space-y-1">
          {statements.length === 0 ? (
            <p className="text-xs text-white/40">No tax statements yet.</p>
          ) : (
            statements.map((s) => (
              <div key={s.id} className="flex justify-between rounded-lg border border-white/5 px-3 py-1.5 text-xs">
                <span className="text-white/80">FY {s.financialYear} · {s.status}</span>
                <span className="text-white/40">TDS {s.totalTds} · {new Date(s.createdAt).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </UserShell>
  );
}
