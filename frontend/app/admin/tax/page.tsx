'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Alert, Button, Card, EmptyState, Input, Select, StatusBadge } from '@/components/ui';
import type { TaxEventType } from '@/lib/types';

const EVENTS: TaxEventType[] = ['TRADE_SELL', 'WITHDRAWAL', 'CONVERSION', 'FEE', 'OTHER'];

export default function AdminTaxPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);

  const [ruleEvent, setRuleEvent] = useState<TaxEventType>('TRADE_SELL');
  const [ruleName, setRuleName] = useState('VDA TDS on sell');
  const [ruleBps, setRuleBps] = useState('100');

  const [genUser, setGenUser] = useState('');
  const [genGross, setGenGross] = useState('100000');

  const rulesQ = useQuery({ queryKey: ['tax-rules'], queryFn: () => adminApi.taxRules(), enabled: ready, retry: false });
  const tdsQ = useQuery({ queryKey: ['tax-tds'], queryFn: () => adminApi.taxTdsRecords(), enabled: ready, retry: false });
  const stmtQ = useQuery({ queryKey: ['tax-statements-admin'], queryFn: () => adminApi.taxStatementsAdmin(), enabled: ready, retry: false });

  const ruleMut = useMutation({
    mutationFn: () => adminApi.taxRuleUpsert({ eventType: ruleEvent, name: ruleName, rateBps: Number(ruleBps) }),
    onSuccess: () => { setBanner('Rule saved.'); qc.invalidateQueries({ queryKey: ['tax-rules'] }); },
    onError: (e) => setBanner(errorMessage(e)),
  });
  const genMut = useMutation({
    mutationFn: () => adminApi.taxStatementGenerate({ userId: genUser.trim(), events: [{ eventType: 'TRADE_SELL', grossAmount: Number(genGross), asset: 'USDT' }] }),
    onSuccess: () => { setBanner('Tax statement generated (calculation-only).'); qc.invalidateQueries({ queryKey: ['tax-statements-admin'] }); qc.invalidateQueries({ queryKey: ['tax-tds'] }); },
    onError: (e) => setBanner(errorMessage(e)),
  });

  if (!ready) return null;
  const rules = rulesQ.data?.data.items ?? [];
  const tds = tdsQ.data?.data.items ?? [];
  const statements = stmtQ.data?.data.items ?? [];

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <h1 className="mb-1 text-xl font-semibold text-ink">Tax / TDS</h1>
        <p className="mb-4 text-xs text-amber-400 font-semibold">CALCULATION-ONLY (staging) — no ledger deduction, no government filing.</p>
        {banner && <div className="mb-4"><Alert>{banner}</Alert></div>}

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Set TDS rule</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select value={ruleEvent} onChange={(e) => setRuleEvent(e.target.value as TaxEventType)}>
              {EVENTS.map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}
            </Select>
            <Input placeholder="Rule name" value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
            <Input placeholder="Rate (bps, 100=1%)" value={ruleBps} onChange={(e) => setRuleBps(e.target.value)} />
          </div>
          <div className="mt-3"><Button onClick={() => ruleMut.mutate()} disabled={ruleMut.isPending}>Save rule</Button></div>
        </Card>

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Generate tax statement (mock event)</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input placeholder="User ID (uuid)" value={genUser} onChange={(e) => setGenUser(e.target.value)} />
            <Input placeholder="Gross amount" value={genGross} onChange={(e) => setGenGross(e.target.value)} />
          </div>
          <div className="mt-3"><Button onClick={() => genMut.mutate()} disabled={genMut.isPending || !genUser}>Generate</Button></div>
        </Card>

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Rules</h2>
        <Card className="mb-4">
          {rules.length === 0 ? <p className="text-sm text-muted">No rules.</p> : (
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-xs uppercase text-muted"><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">Rate</th><th className="py-2 pr-3">Status</th></tr></thead>
              <tbody>{rules.map((r) => (
                <tr key={r.id} className="border-b border-line/60"><td className="py-2 pr-3 text-ink">{r.eventType.replace(/_/g, ' ')}</td><td className="py-2 pr-3 font-mono">{(r.rateBps / 100).toFixed(2)}%</td><td className="py-2 pr-3"><StatusBadge status={r.status} /></td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">TDS records</h2>
        {tds.length === 0 ? <EmptyState title="No TDS records" hint="Generate a statement to create calculation-only records." /> : (
          <Card className="mb-4">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-xs uppercase text-muted"><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">Gross</th><th className="py-2 pr-3">Rate</th><th className="py-2 pr-3">TDS</th><th className="py-2 pr-3">FY</th></tr></thead>
              <tbody>{tds.map((t) => (
                <tr key={t.id} className="border-b border-line/60"><td className="py-2 pr-3 text-ink">{t.eventType.replace(/_/g, ' ')}</td><td className="py-2 pr-3 font-mono">{t.grossAmount}</td><td className="py-2 pr-3 font-mono">{(t.rateBps / 100).toFixed(2)}%</td><td className="py-2 pr-3 font-mono">{t.tdsAmount}</td><td className="py-2 pr-3 text-muted">{t.financialYear ?? '—'}</td></tr>
              ))}</tbody>
            </table>
          </Card>
        )}

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Statements</h2>
        {statements.length === 0 ? <EmptyState title="No statements" /> : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-xs uppercase text-muted"><th className="py-2 pr-3">User</th><th className="py-2 pr-3">FY</th><th className="py-2 pr-3">Total TDS</th><th className="py-2 pr-3">Checksum</th></tr></thead>
              <tbody>{statements.map((s) => (
                <tr key={s.id} className="border-b border-line/60"><td className="py-2 pr-3 font-mono text-xs text-muted">{s.userId.slice(0, 8)}…</td><td className="py-2 pr-3">{s.financialYear}</td><td className="py-2 pr-3 font-mono">{s.totalTds}</td><td className="py-2 pr-3 font-mono text-xs text-muted">{s.checksum?.slice(0, 10) ?? '—'}…</td></tr>
              ))}</tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
