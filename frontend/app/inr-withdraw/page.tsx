'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage, isKycRequired } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { StatusBadge } from '@/components/ui';
import { KycRequiredNotice } from '@/components/wallet-bits';
import { useUserFeatures, AccessUnavailable } from '@/components/feature-gate';
import type { CreateInrWithdrawalInput, InrPayoutMethod } from '@/lib/types';

const INPUT_CLS =
  'w-full rounded-lg border border-white/10 bg-noir/80 py-3 px-4 text-sm text-white focus:border-gold/60 focus:outline-none';

export default function InrWithdrawPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  const { features, loading: featuresLoading } = useUserFeatures();

  const [method, setMethod] = useState<InrPayoutMethod>('UPI');
  const [amount, setAmount] = useState('500');
  const [upiId, setUpiId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [holderName, setHolderName] = useState('');
  const [bankName, setBankName] = useState('');

  const inrWallet = useQuery({
    queryKey: ['wallet', 'INR'],
    queryFn: () => userApi.wallet('INR'),
    enabled: ready,
    retry: false,
  });

  const history = useQuery({
    queryKey: ['inr-withdrawals'],
    queryFn: () => userApi.listInrWithdrawals(),
    enabled: ready,
  });

  const submit = useMutation({
    mutationFn: () => {
      const body: CreateInrWithdrawalInput =
        method === 'UPI'
          ? { amount, method, upiId: upiId.trim() }
          : {
              amount,
              method,
              accountNumber: accountNumber.trim(),
              ifsc: ifsc.trim().toUpperCase(),
              holderName: holderName.trim(),
              ...(bankName.trim() ? { bankName: bankName.trim() } : {}),
            };
      return userApi.createInrWithdrawal(body);
    },
    onSuccess: () => {
      setAmount('500');
      setUpiId('');
      setAccountNumber('');
      setIfsc('');
      setHolderName('');
      setBankName('');
      qc.invalidateQueries({ queryKey: ['inr-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['wallet', 'INR'] });
    },
  });

  if (!ready) return null;

  // Feature gate (presentation only — the backend enforces canWithdrawInr too).
  if (!featuresLoading && !features.inrWithdrawal) {
    return (
      <UserShell className="max-w-[1400px]">
        <AccessUnavailable
          title="INR withdrawal unavailable"
          message="INR withdrawals are not enabled for your account right now."
        />
      </UserShell>
    );
  }

  const available = inrWallet.data?.data.available ?? '0';
  const items = history.data?.data.items ?? [];

  const formValid =
    Number(amount) > 0 &&
    (method === 'UPI'
      ? upiId.trim().length > 3
      : accountNumber.trim().length >= 6 &&
        ifsc.trim().length >= 11 &&
        holderName.trim().length >= 2);

  return (
    <UserShell className="max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight">INR Withdrawal</h1>
        <p className="text-xs text-white/50 mt-1">
          Request a payout to your bank account or UPI. Withdrawals are processed
          manually by our team after review.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Request form */}
        <div className="lg:col-span-5 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-5">
          <div className="flex justify-between items-center border-b border-white/5 pb-3">
            <h2 className="text-sm font-bold text-white tracking-tight uppercase">
              New Withdrawal
            </h2>
            <span className="text-[10px] text-white/45">
              Available: <strong className="text-gold font-mono">₹{available}</strong>
            </span>
          </div>

          {submit.isError &&
            (isKycRequired(submit.error) ? (
              <KycRequiredNotice action="withdraw INR" />
            ) : (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
                {errorMessage(submit.error)}
              </div>
            ))}

          {submit.isSuccess && (
            <div className="rounded-lg bg-up/10 border border-up/20 p-4 text-xs text-up font-semibold">
              Withdrawal request submitted. It is now <strong>pending admin review</strong>.
            </div>
          )}

          {/* Method selector */}
          <div className="flex gap-2">
            {(['UPI', 'BANK'] as InrPayoutMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
                  method === m
                    ? 'border-gold text-gold bg-gold/5'
                    : 'border-white/10 bg-white/[0.02] text-white/55 hover:text-white'
                }`}
              >
                {m === 'UPI' ? 'UPI' : 'Bank Account'}
              </button>
            ))}
          </div>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <Field label="Amount (INR)">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500.00"
                inputMode="decimal"
                className={INPUT_CLS}
              />
            </Field>

            {method === 'UPI' ? (
              <Field label="UPI ID">
                <input
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="name@bank"
                  className={INPUT_CLS}
                />
              </Field>
            ) : (
              <>
                <Field label="Account Holder Name">
                  <input
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    placeholder="As per bank records"
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Account Number">
                  <input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Bank account number"
                    inputMode="numeric"
                    className={`${INPUT_CLS} font-mono`}
                  />
                </Field>
                <Field label="IFSC Code">
                  <input
                    value={ifsc}
                    onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                    placeholder="HDFC0000240"
                    className={`${INPUT_CLS} font-mono`}
                  />
                </Field>
                <Field label="Bank Name (optional)">
                  <input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. HDFC Bank"
                    className={INPUT_CLS}
                  />
                </Field>
              </>
            )}

            <button
              type="submit"
              disabled={submit.isPending || !formValid}
              className="w-full rounded-lg bg-gradient-to-r from-gold to-gold-glow px-6 py-3.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50 tracking-wider uppercase"
            >
              {submit.isPending ? 'Submitting…' : 'Request Withdrawal'}
            </button>
            <p className="text-[10px] text-white/40 text-center pt-1">
              The requested amount is reserved from your available balance until the
              payout is completed or rejected.
            </p>
          </form>
        </div>

        {/* History */}
        <div className="lg:col-span-7 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-white/5 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Withdrawal History</h3>
              <p className="text-[10px] text-white/40 mt-0.5">Status of your INR payout requests.</p>
            </div>
            <button
              onClick={() => history.refetch()}
              className="text-xs text-gold font-bold hover:underline"
            >
              Refresh
            </button>
          </div>

          {history.isError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
              {errorMessage(history.error)}
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-xs text-white/40 py-8 text-center">No withdrawal requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="px-3">Amount</th>
                    <th className="px-3">Destination</th>
                    <th className="px-3">Status</th>
                    <th className="px-3 text-right">Reference / Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {items.map((w) => (
                    <tr key={w.id} className="hover:bg-white/[0.01] transition">
                      <td className="py-3 px-3 text-white/70">
                        {new Date(w.createdAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 font-mono text-gold font-semibold">₹{w.amount}</td>
                      <td className="px-3 text-white/70 text-[11px]">
                        {w.payout.method === 'UPI'
                          ? w.payout.upiId
                          : `${w.payout.bankName ?? 'Bank'} ${w.payout.accountLast4 ?? ''}`}
                      </td>
                      <td className="px-3">
                        <StatusBadge status={w.status} />
                      </td>
                      <td className="px-3 text-right text-white/50 text-[10px]">
                        {w.status === 'PAID'
                          ? `UTR ${w.utr ?? ''}`
                          : w.status === 'REJECTED'
                            ? (w.rejectionReason ?? 'Rejected')
                            : w.status === 'APPROVED'
                              ? 'Approved — payout pending'
                              : 'Pending review'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </UserShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[9px] font-bold text-white/45 uppercase tracking-widest">
        {label}
      </label>
      {children}
    </div>
  );
}
