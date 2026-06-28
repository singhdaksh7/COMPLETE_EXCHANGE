'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { useUserFeatures } from '@/components/feature-gate';

type TxnKind = 'INR Deposit' | 'INR Withdrawal' | 'Crypto Deposit' | 'Crypto Withdrawal';
type Bucket = 'SUCCESS' | 'FAILED' | 'PENDING' | 'NEEDS_SECOND_APPROVAL';

interface Row {
  id: string;
  date: string;
  type: TxnKind;
  asset: string;
  amount: string;
  status: string; // raw backend status
  bucket: Bucket;
  reference: string; // UTR / txHash / address
}

const SUCCESSY = new Set(['SUCCESS', 'CREDITED', 'COMPLETED', 'PAID']);
const FAILEDY = new Set(['FAILED', 'REJECTED', 'REVERSED', 'ORPHANED', 'CANCELLED']);

function bucketOf(status: string, opts: { needsSecond?: boolean } = {}): Bucket {
  if (opts.needsSecond) return 'NEEDS_SECOND_APPROVAL';
  if (SUCCESSY.has(status)) return 'SUCCESS';
  if (FAILEDY.has(status)) return 'FAILED';
  return 'PENDING';
}

function Badge({ bucket }: { bucket: Bucket }) {
  const cls =
    bucket === 'SUCCESS'
      ? 'bg-up/15 text-up'
      : bucket === 'FAILED'
        ? 'bg-red-500/15 text-red-300'
        : bucket === 'NEEDS_SECOND_APPROVAL'
          ? 'bg-amber-500/15 text-amber-300'
          : 'bg-white/10 text-white/60';
  const label = bucket === 'NEEDS_SECOND_APPROVAL' ? 'NEEDS 2ND APPROVAL' : bucket;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export default function TransactionsPage() {
  const ready = useGuard('user');
  const { features } = useUserFeatures();

  // INR rails are always fetched. Crypto deposit/withdrawal history is only
  // fetched when the account actually has that feature — INR_ONLY users never
  // load or see crypto rows or crypto filters.
  const inrQ = useQuery({ queryKey: ['inr-deposits'], queryFn: () => userApi.listInrDeposits(), enabled: ready });
  const inrWdQ = useQuery({ queryKey: ['inr-withdrawals'], queryFn: () => userApi.listInrWithdrawals(), enabled: ready });
  const cryptoQ = useQuery({
    queryKey: ['crypto-deposits'],
    queryFn: () => userApi.listCryptoDeposits(),
    enabled: ready && features.cryptoDeposit,
  });
  const wdQ = useQuery({
    queryKey: ['withdrawals'],
    queryFn: () => userApi.listWithdrawals(),
    enabled: ready && features.cryptoWithdrawal,
  });

  const [type, setType] = useState('');
  const [bucket, setBucket] = useState('');
  const [asset, setAsset] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const d of inrQ.data?.data.items ?? []) {
      const needsSecond = d.status === 'PENDING' && !!d.firstApprovedBy;
      out.push({
        id: `inr-${d.id}`,
        date: d.createdAt,
        type: 'INR Deposit',
        asset: 'INR',
        amount: d.amount,
        status: d.status,
        bucket: bucketOf(d.status, { needsSecond }),
        reference: d.utr ?? d.providerOrderId ?? '',
      });
    }
    for (const w of inrWdQ.data?.data.items ?? []) {
      const dest =
        w.payout.method === 'UPI'
          ? w.payout.upiId ?? ''
          : `${w.payout.bankName ?? 'Bank'} ${w.payout.accountLast4 ?? ''}`.trim();
      out.push({
        id: `inrwd-${w.id}`,
        date: w.createdAt,
        type: 'INR Withdrawal',
        asset: 'INR',
        amount: w.amount,
        status: w.status,
        bucket: bucketOf(w.status),
        reference: w.utr ?? dest,
      });
    }
    if (features.cryptoDeposit) {
      for (const d of cryptoQ.data?.data.items ?? []) {
        out.push({
          id: `cd-${d.id}`,
          date: d.detectedAt,
          type: 'Crypto Deposit',
          asset: d.asset,
          amount: d.amount,
          status: d.status,
          bucket: bucketOf(d.status),
          reference: d.txHash ?? '',
        });
      }
    }
    if (features.cryptoWithdrawal) {
      for (const w of wdQ.data?.data.items ?? []) {
        out.push({
          id: `wd-${w.id}`,
          date: w.requestedAt,
          type: 'Crypto Withdrawal',
          asset: w.asset,
          amount: w.netAmount ?? w.amount,
          status: w.status,
          bucket: bucketOf(w.status),
          reference: w.txHash ?? w.toAddress ?? '',
        });
      }
    }
    return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inrQ.data, inrWdQ.data, cryptoQ.data, wdQ.data, features.cryptoDeposit, features.cryptoWithdrawal]);

  const assets = useMemo(() => [...new Set(rows.map((r) => r.asset))], [rows]);

  const filtered = rows.filter((r) => {
    if (type && r.type !== type) return false;
    if (bucket && r.bucket !== bucket) return false;
    if (asset && r.asset !== asset) return false;
    if (fromDate && new Date(r.date) < new Date(fromDate)) return false;
    if (toDate && new Date(r.date) > new Date(`${toDate}T23:59:59`)) return false;
    return true;
  });

  function exportCsv() {
    const header = ['date', 'type', 'asset', 'amount', 'status', 'reference'];
    const lines = [header.join(',')];
    for (const r of filtered) {
      lines.push(
        [new Date(r.date).toISOString(), r.type, r.asset, r.amount, r.status, r.reference]
          .map(csvCell)
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transaction-history.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!ready) return null;
  const loading = inrQ.isLoading || inrWdQ.isLoading || cryptoQ.isLoading || wdQ.isLoading;
  const anyError = inrQ.error || inrWdQ.error || cryptoQ.error || wdQ.error;

  return (
    <UserShell className="max-w-[1200px] space-y-6">
      <div className="border-b border-white/5 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-white">Transaction History</h1>
        <p className="text-[10px] text-white/45 tracking-wide uppercase mt-1">
          INR deposits · INR withdrawals{features.cryptoDeposit || features.cryptoWithdrawal ? ' · crypto' : ''}
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-white/10 bg-noir/80 px-2 py-2 text-xs text-white">
          <option value="">All types</option>
          <option>INR Deposit</option>
          <option>INR Withdrawal</option>
          {features.cryptoDeposit && <option>Crypto Deposit</option>}
          {features.cryptoWithdrawal && <option>Crypto Withdrawal</option>}
        </select>
        <select value={bucket} onChange={(e) => setBucket(e.target.value)} className="rounded-lg border border-white/10 bg-noir/80 px-2 py-2 text-xs text-white">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="NEEDS_SECOND_APPROVAL">Needs 2nd approval</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
        </select>
        <select value={asset} onChange={(e) => setAsset(e.target.value)} className="rounded-lg border border-white/10 bg-noir/80 px-2 py-2 text-xs text-white">
          <option value="">All assets</option>
          {assets.map((a) => <option key={a}>{a}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-white/10 bg-noir/80 px-2 py-2 text-xs text-white" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-white/10 bg-noir/80 px-2 py-2 text-xs text-white" />
        <button onClick={exportCsv} disabled={filtered.length === 0} className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition disabled:opacity-40">
          Export CSV
        </button>
      </div>

      {anyError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
          {errorMessage(anyError)}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        {loading ? (
          <p className="text-sm text-white/40 py-6 text-center">Loading transactions…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-white/40 py-8 text-center">
            No transactions match these filters.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-white/40 text-[10px] uppercase tracking-wider">
                <th className="py-2 pr-2 font-semibold">Date</th>
                <th className="pr-2 font-semibold">Type</th>
                <th className="pr-2 font-semibold">Asset</th>
                <th className="pr-2 font-semibold">Amount</th>
                <th className="pr-2 font-semibold">Reference / UTR</th>
                <th className="font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 pr-2 text-white/60">{new Date(r.date).toLocaleString()}</td>
                  <td className="pr-2 text-white/80">{r.type}</td>
                  <td className="pr-2 font-mono text-white/70">{r.asset}</td>
                  <td className="pr-2 font-mono text-white">{r.amount}</td>
                  <td className="pr-2 font-mono text-[11px] text-white/50 truncate max-w-[200px]">{r.reference || '—'}</td>
                  <td><Badge bucket={r.bucket} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </UserShell>
  );
}
