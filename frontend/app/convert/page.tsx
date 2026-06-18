'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { StatusBadge } from '@/components/ui';
import type { ConversionSide, Quote } from '@/lib/types';

export default function ConvertPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();

  const [side, setSide] = useState<ConversionSide>('INR_TO_USDT');
  const [amount, setAmount] = useState('1000');
  const [quote, setQuote] = useState<Quote | null>(null);

  const walletQ = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    enabled: ready,
  });

  const getQuote = useMutation({
    mutationFn: () => userApi.createQuote(side, amount),
    onSuccess: (res) => setQuote(res.data),
  });

  const execute = useMutation({
    mutationFn: (quoteId: string) => userApi.convert(quoteId),
    onSuccess: () => {
      setQuote(null);
      qc.invalidateQueries({ queryKey: ['conversions'] });
      qc.invalidateQueries({ queryKey: ['wallet-overview'] });
    },
  });

  const history = useQuery({
    queryKey: ['conversions'],
    queryFn: () => userApi.listConversions(),
    enabled: ready,
  });

  if (!ready) return null;

  const fromAsset = side === 'INR_TO_USDT' ? 'INR' : 'USDT';
  const toAsset = side === 'INR_TO_USDT' ? 'USDT' : 'INR';

  const balances = walletQ.data?.data.balances ?? [];
  const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');
  const usdt = balances.find((b) => b.asset.toUpperCase() === 'USDT');
  const availableBal = side === 'INR_TO_USDT' ? inr?.available ?? '0.00' : usdt?.available ?? '0.00';

  const handleFlip = () => {
    setSide((prev) => (prev === 'INR_TO_USDT' ? 'USDT_TO_INR' : 'INR_TO_USDT'));
    setQuote(null);
  };

  const handlePercent = (pct: number) => {
    const val = Number(availableBal) * pct;
    setAmount(val > 0 ? val.toFixed(2) : '100');
    setQuote(null);
  };

  return (
    <UserShell className="max-w-[1400px]">
      
      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight">Convert INR ↔ USDT</h1>
        <p className="text-xs text-white/50 mt-1">Instantly convert between INR and USDT with zero market slippages.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left: Convert Form (7 cols) */}
        <div className="lg:col-span-7 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-6">
          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />

          {/* Form Content */}
          <div className="relative space-y-5">
            
            {/* Flip Selector Buttons */}
            <div className="flex gap-2 border-b border-white/5 pb-px text-xs font-bold font-sans uppercase">
              <button
                onClick={() => { setSide('INR_TO_USDT'); setQuote(null); }}
                className={`px-4 py-2 border-b-2 transition-all ${
                  side === 'INR_TO_USDT'
                    ? 'border-gold text-gold bg-gold/5'
                    : 'border-transparent text-white/45 hover:text-white'
                }`}
              >
                INR → USDT (Buy)
              </button>
              <button
                onClick={() => { setSide('USDT_TO_INR'); setQuote(null); }}
                className={`px-4 py-2 border-b-2 transition-all ${
                  side === 'USDT_TO_INR'
                    ? 'border-gold text-gold bg-gold/5'
                    : 'border-transparent text-white/45 hover:text-white'
                }`}
              >
                USDT → INR (Sell)
              </button>
            </div>

            {getQuote.isError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
                {errorMessage(getQuote.error)}
              </div>
            )}

            {execute.isSuccess && (
              <div className="rounded-lg bg-up/10 border border-up/20 p-4 text-xs text-up font-semibold">
                Conversion executed successfully! Changed {execute.data?.data.usdtAmount} USDT ⇄ ₹{execute.data?.data.inrAmount}
              </div>
            )}

            {/* Pay Input Block */}
            <div className="rounded-xl border border-white/5 bg-noir-2/80 p-4 space-y-2">
              <div className="flex justify-between items-center text-[10px] font-bold text-white/45 uppercase tracking-wider">
                <span>You Pay</span>
                <span>Available: {side === 'INR_TO_USDT' ? '₹' : ''}{Number(availableBal).toLocaleString('en-IN', { maximumFractionDigits: 2 })} {fromAsset}</span>
              </div>
              
              <div className="flex items-center gap-3">
                <input
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
                  placeholder="1000.00"
                  inputMode="decimal"
                  className="w-full bg-transparent border-0 p-0 text-xl font-mono text-white focus:outline-none focus:ring-0"
                />
                <span className="text-sm font-extrabold text-white bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 font-sans">
                  {fromAsset}
                </span>
              </div>

              {/* Percent shortcuts */}
              <div className="flex gap-2 pt-2 border-t border-white/5">
                {[0.25, 0.5, 0.75, 1].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePercent(p)}
                    className="text-[9px] font-extrabold text-white/50 bg-white/[0.02] border border-white/5 hover:text-white hover:bg-white/5 px-2.5 py-1 rounded transition"
                  >
                    {p === 1 ? 'MAX' : `${p * 100}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Vertical Swap Loop */}
            <div className="flex justify-center -my-2.5">
              <button
                type="button"
                onClick={handleFlip}
                className="h-8 w-8 rounded-full bg-gold border border-gold shadow-gold-glow flex items-center justify-center text-noir font-bold hover:scale-105 transition"
              >
                ⇅
              </button>
            </div>

            {/* Receive Input Block */}
            <div className="rounded-xl border border-white/5 bg-noir-2/80 p-4 space-y-2">
              <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">You Receive</span>
              
              <div className="flex items-center justify-between gap-3">
                <span className="text-xl font-mono text-white/80 select-all">
                  {quote
                    ? side === 'INR_TO_USDT'
                      ? quote.usdtAmount
                      : quote.inrAmount
                    : '—'}
                </span>
                <span className="text-sm font-extrabold text-white bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 font-sans">
                  {toAsset}
                </span>
              </div>
            </div>

            <button
              onClick={() => getQuote.mutate()}
              disabled={getQuote.isPending}
              className="w-full rounded-lg bg-gradient-to-r from-gold to-gold-glow py-3.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition uppercase tracking-wider disabled:opacity-50"
            >
              {getQuote.isPending ? 'Generating Quote...' : 'Get Instant Quote'}
            </button>

            {/* Rate footer */}
            <div className="text-center text-[10px] text-white/40 font-mono">
              1 USDT ≈ ₹83.21 | Sandbox conversion rate
            </div>

          </div>
        </div>

        {/* Right: Summary Pane (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Conversion Details */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-5">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-35" />
            
            <div className="relative space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-white/5 pb-3">Conversion Summary</h3>
              
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <span className="text-white/45">You Pay</span>
                  <span className="font-bold text-white font-mono">{amount} {fromAsset}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <span className="text-white/45">Conversion Rate</span>
                  <span className="font-bold text-white font-mono">{quote ? quote.rate : '83.21'} INR/USDT</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <span className="text-white/45">Net Receive Amount</span>
                  <span className="font-bold text-gold font-mono">
                    {quote
                      ? side === 'INR_TO_USDT'
                        ? `${quote.usdtAmount} USDT`
                        : `₹${quote.inrAmount}`
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <span className="text-white/45">TDS Deductions</span>
                  <span className="font-bold text-white/60 font-mono">
                    {quote ? `₹${quote.tdsAmount}` : '₹0.00'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <span className="text-white/45">Payment Method</span>
                  <span className="font-semibold text-white">Exora Local Wallet</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/45">Estimated Settlement</span>
                  <span className="font-bold text-emerald-400">Instant Credit</span>
                </div>
              </div>

              {quote && (
                <div className="space-y-3 pt-3 border-t border-white/5 animate-fadeIn">
                  {execute.isError && (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
                      {errorMessage(execute.error)}
                    </div>
                  )}

                  <div className="text-[10px] text-white/40 text-center font-mono">
                    Quote expires at {new Date(quote.expiresAt).toLocaleTimeString()}
                  </div>

                  <button
                    onClick={() => execute.mutate(quote.id)}
                    disabled={execute.isPending}
                    className="w-full rounded-lg bg-emerald-500 py-3 text-xs font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.25)] hover:brightness-105 transition"
                  >
                    {execute.isPending ? 'Executing Conversion...' : 'Confirm Conversion'}
                  </button>
                </div>
              )}

              {/* Secure badge */}
              <div className="rounded-xl border border-gold/20 bg-gold/5 p-4 flex gap-3 mt-4">
                <span className="text-gold text-lg leading-none shrink-0">🛡️</span>
                <div>
                  <span className="text-[10px] font-bold text-gold block uppercase tracking-wider">100% Safe & Secure</span>
                  <span className="text-[9px] text-white/50 block mt-0.5">Your swap order is protected with bank-grade encryption.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Features check list */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">Why Convert on Exora?</h3>
            <div className="space-y-3.5 text-xs text-white/70">
              {[
                { label: 'Instant Conversion', desc: 'Get USDT or INR instantly in your ledger wallet.' },
                { label: 'Zero Slippage', desc: 'Guaranteed conversion rate, no market execution slippages.' },
                { label: 'Secure & Reliable', desc: 'Double-backed security and AML validation parameters.' },
              ].map((item, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="text-gold font-bold">✓</span>
                  <div>
                    <span className="font-semibold text-white block">{item.label}</span>
                    <span className="text-[10px] text-white/40 block mt-0.5">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Bottom Table: History */}
      <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4 mt-6">
        <div className="flex justify-between items-center border-b border-white/5 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Conversion History</h3>
            <p className="text-[10px] text-white/40 mt-0.5">History of your instant swap executions.</p>
          </div>
          <button
            onClick={() => history.refetch()}
            className="text-xs text-gold font-bold hover:underline"
          >
            Refresh Logs
          </button>
        </div>

        {history.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
            {errorMessage(history.error)}
          </div>
        )}

        {history.data && history.data.data.items.length === 0 ? (
          <p className="text-xs text-white/40 py-8 text-center">No conversion records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.01]">
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="px-3">Swap Direction</th>
                  <th className="px-3 text-right">Pay Amount</th>
                  <th className="px-3 text-right">Receive Amount</th>
                  <th className="px-3 text-right">Conversion Rate</th>
                  <th className="px-3 text-right">TDS (INR)</th>
                  <th className="px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {history.data?.data.items.map((c) => {
                  const sideStr = c.side === 'INR_TO_USDT' ? 'INR ⇄ USDT' : 'USDT ⇄ INR';
                  const payStr = c.side === 'INR_TO_USDT' ? `₹${c.inrAmount}` : `${c.usdtAmount} USDT`;
                  const recStr = c.side === 'INR_TO_USDT' ? `${c.usdtAmount} USDT` : `₹${c.inrAmount}`;
                  
                  return (
                    <tr key={c.id} className="hover:bg-white/[0.01] transition">
                      <td className="py-3 px-3 text-white/50 text-[10px]">
                        {new Date(c.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 font-sans font-semibold text-white">{sideStr}</td>
                      <td className="px-3 text-right text-white/70">{payStr}</td>
                      <td className="px-3 text-right text-gold font-bold">{recStr}</td>
                      <td className="px-3 text-right text-white/60">{c.rate}</td>
                      <td className="px-3 text-right text-white/50">₹{c.tdsAmount}</td>
                      <td className="py-3 px-3 text-right">
                        <span className="text-[10px] font-bold text-up bg-up/10 px-2 py-0.5 rounded uppercase">
                          Success
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </UserShell>
  );
}
