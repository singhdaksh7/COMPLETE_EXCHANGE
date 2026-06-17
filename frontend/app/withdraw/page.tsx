'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[350px] w-[350px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[350px] w-[350px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

export default function WithdrawPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();

  const addresses = useQuery({
    queryKey: ['wd-addresses'],
    queryFn: () => userApi.listWithdrawalAddresses(),
    enabled: ready,
  });
  const history = useQuery({
    queryKey: ['withdrawals'],
    queryFn: () => userApi.listWithdrawals(),
    enabled: ready,
  });

  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const addAddr = useMutation({
    mutationFn: () =>
      userApi.addWithdrawalAddress({
        chain: 'TRON',
        address,
        ...(label ? { label } : {}),
      }),
    onSuccess: () => {
      setAddress('');
      setLabel('');
      qc.invalidateQueries({ queryKey: ['wd-addresses'] });
    },
  });

  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('10');
  const request = useMutation({
    mutationFn: () => userApi.createWithdrawal(toAddress, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      qc.invalidateQueries({ queryKey: ['wallet-overview'] });
    },
  });

  if (!ready) return null;
  const allow = addresses.data?.data.items ?? [];

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-20">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #111114 !important; border-bottom: 1px solid rgba(245,194,66,0.15) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <UserNav />
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-4xl px-5 pt-8">
        
        {/* Header */}
        <div className="mb-8 flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Instant USDT Withdrawal</h1>
            <p className="text-xs text-white/50 mt-1">Disburse USDT tokens instantly to allowlisted TRON blockchain destinations.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            
            {/* Allowlist section */}
            <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-6 shadow-gold-soft backdrop-blur-2xl">
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
              
              <div className="relative space-y-4">
                <h2 className="text-sm font-bold text-white tracking-tight border-b border-white/5 pb-3">Allowlisted Dest Address registers</h2>
                
                {addAddr.isError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
                    {errorMessage(addAddr.error)}
                  </div>
                )}
                
                <form
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addAddr.mutate();
                  }}
                >
                  <div className="sm:col-span-2 flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-white/50 uppercase">TRON Dest Address</label>
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="T..."
                      className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white focus:border-gold/60 focus:outline-none font-mono"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-white/50 uppercase">Optional Label</label>
                    <input 
                      value={label} 
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g. My Ledger"
                      className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white focus:border-gold/60 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-3 pt-2">
                    <button 
                      type="submit" 
                      disabled={addAddr.isPending}
                      className="w-full rounded-lg bg-gradient-to-r from-gold to-gold-glow px-5 py-3 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50"
                    >
                      {addAddr.isPending ? 'Registering...' : 'Add Address'}
                    </button>
                  </div>
                </form>

                <div className="border-t border-white/5 pt-4">
                  {allow.length === 0 ? (
                    <p className="text-xs text-white/30 text-center py-4">No allowlisted destinations yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {allow.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="break-all font-mono text-white text-xs">{a.address}</span>
                            {a.label && (
                              <span className="ml-2 text-white/40">({a.label})</span>
                            )}
                          </div>
                          <span
                            className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                              a.usable ? 'bg-up/10 text-up' : 'bg-brand/10 text-brand'
                            }`}
                          >
                            {a.usable ? 'usable' : 'cooling-off'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Request withdrawal */}
            <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-6 shadow-gold-soft backdrop-blur-2xl">
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
              
              <div className="relative space-y-4">
                <h2 className="text-sm font-bold text-white tracking-tight border-b border-white/5 pb-3">Initiate USDT Withdrawal request</h2>

                {request.isError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
                    {errorMessage(request.error)}
                  </div>
                )}
                {request.isSuccess && (
                  <div className="rounded-lg bg-up/10 border border-up/20 p-4 text-xs text-up space-y-1">
                    <div className="font-semibold">USDT Disbursed Successfully</div>
                    <div>Net amount: {request.data.data.netAmount} USDT (fee {request.data.data.fee} USDT)</div>
                  </div>
                )}

                <form
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    request.mutate();
                  }}
                >
                  <div className="sm:col-span-2 flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-white/50 uppercase">To Address (Allowlisted)</label>
                    <select 
                      value={toAddress} 
                      onChange={(e) => setToAddress(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3.5 px-3 text-xs text-white focus:border-gold/60 focus:outline-none"
                    >
                      <option value="" className="bg-noir">Select allowlisted address...</option>
                      {allow.map((a) => (
                        <option key={a.id} value={a.address} disabled={!a.usable} className="bg-noir">
                          {a.address} {a.usable ? '' : ' (cooling-off)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-white/50 uppercase">Amount (USDT)</label>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white focus:border-gold/60 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-3 pt-2">
                    <button 
                      type="submit" 
                      disabled={request.isPending || !toAddress}
                      className="w-full rounded-lg bg-gradient-to-r from-gold to-gold-glow px-5 py-3 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-40"
                    >
                      {request.isPending ? 'Requesting...' : 'Disburse USDT'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Withdrawal history */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Withdrawal Logs</h3>
                  <p className="text-[10px] text-white/40 mt-0.5">Audit trail of outbound USDT disbursements.</p>
                </div>
                <button 
                  onClick={() => history.refetch()}
                  className="text-xs text-gold font-bold hover:underline"
                >
                  Refresh Logs
                </button>
              </div>

              {history.isError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">{errorMessage(history.error)}</div>}
              
              {history.data && history.data.data.items.length === 0 ? (
                <p className="text-xs text-white/40 py-6 text-center">No withdrawal records found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider">
                        <th className="py-2.5">To Address</th>
                        <th>Gross</th>
                        <th>Net (USDT)</th>
                        <th>State</th>
                        <th className="text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {history.data?.data.items.map((w) => (
                        <tr key={w.id} className="hover:bg-white/[0.01]">
                          <td className="py-3 font-mono text-[10px] text-white/50">
                            {w.toAddress.slice(0, 10)}…
                          </td>
                          <td className="font-mono text-white">{w.amount}</td>
                          <td className="font-mono text-gold font-semibold">{w.netAmount}</td>
                          <td>
                            <StatusBadge status={w.status} />
                          </td>
                          <td className="text-right text-white/45">
                            {new Date(w.requestedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* Right sidebar */}
          <div className="space-y-6">
            <div className="relative rounded-2xl border border-gold/15 bg-white/[0.02] p-5 backdrop-blur-md">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gold mb-3 flex items-center gap-1.5">
                <span>🛡️</span> Security & Disbursal rules
              </h3>
              <ul className="space-y-3.5 text-xs text-white/65 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="text-gold mt-0.5">•</span>
                  <span><strong>Cooling-off Period:</strong> Newly added allowlist destinations require a 24-hour cooling-off lock before usable.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-gold mt-0.5">•</span>
                  <span><strong>Instant Processing:</strong> Validated requests propagate to scanners and post transactions in seconds.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-gold mt-0.5">•</span>
                  <span><strong>Network Gas Fee:</strong> Standard TRON protocol gas fees are calculated and deducted automatically.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
