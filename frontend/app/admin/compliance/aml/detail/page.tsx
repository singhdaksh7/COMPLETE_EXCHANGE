'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { Alert, Button, Card, Input, Select, StatusBadge } from '@/components/ui';
import type { AmlEvaluationResult, AmlRuleAction, AmlRuleSeverity, AmlRuleType } from '@/lib/types';

const RULE_TYPES: AmlRuleType[] = ['TRANSACTION_MONITORING', 'WALLET_RISK', 'USER_RISK', 'KYC', 'FIU_DRAFT', 'TAX_LEGAL', 'MANUAL'];
const SEVERITIES: AmlRuleSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const ACTIONS: AmlRuleAction[] = ['FLAG_ONLY', 'CREATE_ALERT', 'CREATE_CASE', 'REQUIRE_REVIEW', 'ESCALATE'];
const OPERATORS = ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'contains', 'exists'];

function DetailInner() {
  const ready = useGuard('admin');
  const policyId = useSearchParams().get('id') ?? '';
  const qc = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);

  const [ruleType, setRuleType] = useState<AmlRuleType>('WALLET_RISK');
  const [name, setName] = useState('Blocked wallet → require review');
  const [severity, setSeverity] = useState<AmlRuleSeverity>('CRITICAL');
  const [action, setAction] = useState<AmlRuleAction>('REQUIRE_REVIEW');
  const [conditionKey, setConditionKey] = useState('walletRisk.status');
  const [operator, setOperator] = useState('eq');
  const [thresholdValue, setThresholdValue] = useState('BLOCKED');

  const [ctxJson, setCtxJson] = useState('{\n  "walletRisk": { "status": "BLOCKED", "level": "CRITICAL" },\n  "screening": { "sanctions": "HIT" }\n}');
  const [evalResult, setEvalResult] = useState<AmlEvaluationResult | null>(null);

  const q = useQuery({ queryKey: ['aml-policy', policyId], queryFn: () => adminApi.amlPolicy(policyId), enabled: ready && !!policyId, retry: false });

  const addRuleMut = useMutation({
    mutationFn: () => adminApi.amlRuleCreate(policyId, { ruleType, name, severity, action, conditionKey, operator, thresholdValue }),
    onSuccess: () => { setBanner('Rule added.'); qc.invalidateQueries({ queryKey: ['aml-policy', policyId] }); },
    onError: (e) => setBanner(errorMessage(e)),
  });
  const evalMut = useMutation({
    mutationFn: () => {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(ctxJson); } catch { throw new Error('Context must be valid JSON'); }
      return adminApi.amlEvaluate({ policyId, context: parsed });
    },
    onSuccess: (res) => { setEvalResult(res.data); setBanner(null); },
    onError: (e) => setBanner(errorMessage(e)),
  });

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">AML Policy</h1>
        <Link href="/admin/compliance/aml" className="text-xs text-brand hover:underline">← All policies</Link>
      </div>
      {banner && <div className="mb-4"><Alert>{banner}</Alert></div>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

      {q.data && (() => {
        const p = q.data.data;
        return (
          <>
            <Card className="mb-4">
              <div className="flex items-center justify-between">
                <div><span className="font-mono text-ink">{p.version}</span> · <span className="text-ink">{p.name}</span></div>
                <StatusBadge status={p.status} />
              </div>
            </Card>

            <Card className="mb-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">Add rule</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select value={ruleType} onChange={(e) => setRuleType(e.target.value as AmlRuleType)}>{RULE_TYPES.map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}</Select>
                <Input placeholder="Rule name" value={name} onChange={(e) => setName(e.target.value)} />
                <Select value={severity} onChange={(e) => setSeverity(e.target.value as AmlRuleSeverity)}>{SEVERITIES.map((x) => <option key={x} value={x}>{x}</option>)}</Select>
                <Select value={action} onChange={(e) => setAction(e.target.value as AmlRuleAction)}>{ACTIONS.map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}</Select>
                <Input placeholder="Condition key (e.g. walletRisk.status)" value={conditionKey} onChange={(e) => setConditionKey(e.target.value)} />
                <Select value={operator} onChange={(e) => setOperator(e.target.value)}>{OPERATORS.map((x) => <option key={x} value={x}>{x}</option>)}</Select>
                <Input placeholder="Threshold value" value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} />
              </div>
              <div className="mt-3"><Button onClick={() => addRuleMut.mutate()} disabled={addRuleMut.isPending}>Add rule</Button></div>
            </Card>

            <Card className="mb-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Rules ({p.rules.length})</h2>
              {p.rules.length === 0 ? <p className="text-sm text-muted">No rules.</p> : (
                <div className="space-y-1">
                  {p.rules.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded border border-line/60 px-2 py-1 text-xs">
                      <span className="text-ink">{r.name} <span className="text-muted">[{r.conditionKey} {r.operator} {r.thresholdValue}]</span></span>
                      <span className="flex items-center gap-2"><StatusBadge status={r.severity} /><span className="font-mono text-[10px] text-muted">{r.action}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="mb-2 text-sm font-semibold text-ink">Evaluation playground (review-only)</h2>
              <textarea className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-xs text-ink" rows={6} value={ctxJson} onChange={(e) => setCtxJson(e.target.value)} />
              <div className="mt-2"><Button variant="secondary" onClick={() => evalMut.mutate()} disabled={evalMut.isPending}>Evaluate</Button></div>
              {evalResult && (
                <div className="mt-3 rounded-lg border border-line bg-panel-2 p-3 text-xs">
                  <p className="text-ink">Matched {evalResult.matchedCount} rule(s) · highest severity {evalResult.highestSeverity ?? '—'}</p>
                  <p className="text-muted">Recommended actions: {evalResult.recommendedActions.join(', ') || 'none'}</p>
                  <ul className="mt-1 list-disc pl-4 text-muted">
                    {evalResult.recommendations.map((rec) => <li key={rec.ruleId}>{rec.name} → {rec.action} ({rec.severity})</li>)}
                  </ul>
                  <p className="mt-1 text-amber-400">Review-only — no action was taken.</p>
                </div>
              )}
            </Card>
          </>
        );
      })()}
    </main>
  );
}

export default function AdminAmlDetailPage() {
  return (
    <>
      <Suspense fallback={<main className="mx-auto max-w-4xl px-4 py-10"><p className="text-sm text-muted">Loading…</p></main>}>
        <DetailInner />
      </Suspense>
    </>
  );
}
