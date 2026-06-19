'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import type { FeeAssetTotal } from '@/lib/types';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

/** Renders an asset → amount breakdown, or a clear empty state. */
function AssetTotals({ rows, empty }: { rows: FeeAssetTotal[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-xs text-white/35 py-4 text-center">{empty}</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div
          key={r.asset}
          className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0"
        >
          <span className="text-xs font-semibold text-white/55">{r.asset}</span>
          <span className="font-mono text-sm font-bold text-white">{r.amount}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminFeeReportsPage() {
  const ready = useGuard('admin');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // The applied range only changes when "Apply" is clicked, so typing dates
  // does not refetch on every keystroke.
  const [range, setRange] = useState<{ fromDate?: string; toDate?: string }>({});

  const q = useQuery({
    queryKey: ['admin-fee-report', range],
    queryFn: () =>
      adminApi.feeReport({
        ...(range.fromDate ? { fromDate: new Date(range.fromDate).toISOString() } : {}),
        ...(range.toDate
          ? { toDate: new Date(`${range.toDate}T23:59:59.999`).toISOString() }
          : {}),
      }),
    enabled: ready,
    retry: false,
  });

  if (!ready) return null;
  const report = q.data?.data;

  function apply() {
    setRange({
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
    });
  }

  function clear() {
    setFromDate('');
    setToDate('');
    setRange({});
  }

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-10">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #0B0B0E !important; border-bottom: 1px solid rgba(245,194,66,0.1) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <AdminNav />
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-[1300px] px-6 pt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Fee Revenue Reports</h1>
            <p className="text-xs text-white/50 mt-1">
              Real platform fee revenue from trades, completed withdrawals, and the FEE_REVENUE ledger.
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-up">● Live ledger data</span>
        </div>

        {/* Date range filter */}
        <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">From date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir/80 px-2 py-2 text-xs text-white"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">To date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir/80 px-2 py-2 text-xs text-white"
            />
          </div>
          <button
            onClick={apply}
            className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider"
          >
            Apply
          </button>
          {(range.fromDate || range.toDate) && (
            <button
              onClick={clear}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-bold text-white/60 hover:text-white transition uppercase tracking-wider"
            >
              Clear
            </button>
          )}
          <span className="ml-auto text-[10px] text-white/35 font-mono self-center">
            {range.fromDate || range.toDate
              ? `Range: ${range.fromDate ?? '…'} → ${range.toDate ?? '…'}`
              : 'All-time totals'}
          </span>
        </div>

        {q.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
            {errorMessage(q.error)}
          </div>
        )}

        {q.isLoading && <p className="text-sm text-white/40">Loading fee revenue…</p>}

        {report && (
          <div className="space-y-6">
            {/* Revenue summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Trading Fees</h3>
                  <span className="text-sm">📈</span>
                </div>
                <AssetTotals
                  rows={report.tradingFees.totalByAsset}
                  empty="No trading fees in this range."
                />
              </div>

              <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Withdrawal Fees</h3>
                  <span className="text-sm">💸</span>
                </div>
                <AssetTotals
                  rows={report.withdrawalFees.totalByAsset}
                  empty="No completed-withdrawal fees in this range."
                />
                <p className="text-[10px] text-white/35 border-t border-white/5 pt-2">
                  Current flat fee: <span className="font-mono text-white/60">{report.withdrawalFees.flatFeeUsdt} USDT</span>
                </p>
              </div>

              <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Ledger Fee Revenue</h3>
                  <span className="text-sm">📒</span>
                </div>
                <AssetTotals
                  rows={report.ledgerFeeRevenue.totalByAsset}
                  empty="No FEE_REVENUE ledger entries in this range."
                />
                <p className="text-[10px] text-white/35 border-t border-white/5 pt-2">
                  Source of truth — sum of all FEE_REVENUE credits (trading + withdrawal).
                </p>
              </div>
            </div>

            {/* Market fee settings (read-only) */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Market Fee Settings</h3>
                <span className="text-[10px] text-white/35">Read-only · configured per market</span>
              </div>
              {report.marketFees.length === 0 ? (
                <p className="text-xs text-white/35 py-4 text-center">No markets configured.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-white/40 text-[10px] uppercase tracking-wider">
                      <th className="py-2 pr-2 font-semibold">Market</th>
                      <th className="pr-2 font-semibold">Base</th>
                      <th className="pr-2 font-semibold">Quote</th>
                      <th className="pr-2 font-semibold text-right">Maker</th>
                      <th className="pr-2 font-semibold text-right">Taker</th>
                      <th className="font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {report.marketFees.map((m) => (
                      <tr key={m.symbol}>
                        <td className="py-2.5 pr-2 font-sans font-bold text-white">{m.symbol}</td>
                        <td className="pr-2 text-white/70">{m.baseAsset}</td>
                        <td className="pr-2 text-white/70">{m.quoteAsset}</td>
                        <td className="pr-2 text-right text-gold">
                          {(m.makerFeeBps / 100).toFixed(2)}% <span className="text-white/30">({m.makerFeeBps} bps)</span>
                        </td>
                        <td className="pr-2 text-right text-gold">
                          {(m.takerFeeBps / 100).toFixed(2)}% <span className="text-white/30">({m.takerFeeBps} bps)</span>
                        </td>
                        <td className="font-sans">
                          <span
                            className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                              m.status === 'ACTIVE' ? 'bg-up/10 text-up' : 'bg-white/10 text-white/60'
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
