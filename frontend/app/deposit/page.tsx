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

export default function DepositPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  const [amount, setAmount] = useState('500');

  const history = useQuery({
    queryKey: ['inr-deposits'],
    queryFn: () => userApi.listInrDeposits(),
    enabled: ready,
  });

  const create = useMutation({
    mutationFn: () => userApi.createInrDeposit(amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inr-deposits'] }),
  });

  if (!ready) return null;
  const intent = create.data?.data;

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
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Instant INR Deposit</h1>
            <p className="text-xs text-white/50 mt-1">Create gateway orders to instant fund your INR ledger.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            
            {/* Create deposit card */}
            <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-6 shadow-gold-soft backdrop-blur-2xl">
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
              
              <div className="relative space-y-4">
                <h2 className="text-sm font-bold text-white tracking-tight border-b border-white/5 pb-3">Initiate Razorpay Gateway Order</h2>

                {create.isError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
                    {errorMessage(create.error)}
                  </div>
                )}
                {intent && (
                  <div className="rounded-lg bg-up/10 border border-up/20 p-4 text-xs text-up">
                    Gateway order registered! Complete the payment steps in the sandbox frame to credit balance.
                  </div>
                )}

                <form
                  className="flex flex-col sm:flex-row items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    create.mutate();
                  }}
                >
                  <div className="flex-1 w-full flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-white/50 uppercase">Amount (INR)</label>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="500.00"
                      inputMode="decimal"
                      className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white focus:border-gold/60 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={create.isPending}
                    className="w-full sm:w-auto rounded-lg bg-gradient-to-r from-gold to-gold-glow px-6 py-3.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50"
                  >
                    {create.isPending ? 'Generating...' : 'Create Order'}
                  </button>
                </form>

                {intent && (
                  <div className="mt-4 rounded-xl border border-white/5 bg-noir-2/80 p-4 text-xs space-y-2.5">
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-white/45">Gateway Provider</span>
                      <span className="font-semibold text-white">{intent.provider}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-white/45">Merchant Order ID</span>
                      <span className="font-mono text-white truncate max-w-[180px]">{intent.providerOrderId}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-white/45">Key Reference ID</span>
                      <span className="font-mono text-white/40">{intent.keyId ?? '—'}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-white/45">Invoice Amount</span>
                      <span className="font-bold text-gold font-mono">₹{intent.amount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/45">Status</span>
                      <StatusBadge status={intent.status} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Deposit History */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Deposit History</h3>
                  <p className="text-[10px] text-white/40 mt-0.5">Audit trail of INR gateway deposits.</p>
                </div>
                <button 
                  onClick={() => history.refetch()}
                  className="text-xs text-gold font-bold hover:underline"
                >
                  Refresh History
                </button>
              </div>

              {history.isError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">{errorMessage(history.error)}</div>}
              
              {history.data && history.data.data.items.length === 0 ? (
                <p className="text-xs text-white/40 py-6 text-center">No deposit logs found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider">
                        <th className="py-2.5">Order ID</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th className="text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {history.data?.data.items.map((d) => (
                        <tr key={d.id} className="hover:bg-white/[0.01]">
                          <td className="py-3 font-mono text-[10px] text-white/50">
                            {d.providerOrderId ?? d.id.slice(0, 8)}
                          </td>
                          <td className="font-mono text-gold font-semibold">₹{d.amount}</td>
                          <td>
                            <StatusBadge status={d.status} />
                          </td>
                          <td className="text-right text-white/45">
                            {new Date(d.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* Right sidebar: help notes */}
          <div className="space-y-6">
            <div className="relative rounded-2xl border border-gold/15 bg-white/[0.02] p-5 backdrop-blur-md">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gold mb-3 flex items-center gap-1.5">
                <span>🛡️</span> Fund Safety & Capture
              </h3>
              <ul className="space-y-3.5 text-xs text-white/65 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="text-gold mt-0.5">•</span>
                  <span><strong>Sandbox Mode:</strong> Razorpay payments are currently run under sandbox test rules. Real cash is not charged.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-gold mt-0.5">•</span>
                  <span><strong>Automatic Capture:</strong> Webhooks catch success transactions and trigger credits to ledger instantly.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-gold mt-0.5">•</span>
                  <span><strong>Limits check:</strong> Complete KYC tier levels validation before depositing larger quantities.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
