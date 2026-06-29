'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage, fieldErrors, isKycRequired } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { StatusBadge } from '@/components/ui';
import { KycRequiredNotice } from '@/components/wallet-bits';
import { useUserFeatures, AccessUnavailable } from '@/components/feature-gate';
import type { CreateInrWithdrawalInput, InrPayoutMethod } from '@/lib/types';

const INPUT_CLS =
  'w-full rounded-lg border border-white/10 bg-noir/80 py-3 px-4 text-sm text-white focus:border-gold/60 focus:outline-none';

// Mirror the backend zod validators (inr-withdrawal.validators.ts) exactly so the
// user gets a precise inline error before we ever hit the API.
const AMOUNT_RE = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{6,20}$/;

/** Returns a map of field → message for anything the backend would reject. */
function validateWithdrawal(v: {
  amount: string;
  method: InrPayoutMethod;
  upiId: string;
  accountNumber: string;
  ifsc: string;
  holderName: string;
}): Record<string, string> {
  const e: Record<string, string> = {};
  if (!AMOUNT_RE.test(v.amount.trim()) || /^0(?:\.0{1,2})?$/.test(v.amount.trim())) {
    e.amount = 'Enter an amount greater than zero (up to 2 decimals).';
  }
  if (v.method === 'UPI') {
    if (!UPI_RE.test(v.upiId.trim())) e.upiId = 'Enter a valid UPI ID (e.g. name@okhdfcbank).';
  } else {
    if (!ACCOUNT_RE.test(v.accountNumber.trim())) e.accountNumber = 'Account number must be 6–20 digits.';
    if (!IFSC_RE.test(v.ifsc.trim().toUpperCase())) e.ifsc = 'Enter a valid IFSC code (e.g. HDFC0000240).';
    if (v.holderName.trim().length < 2) e.holderName = 'Enter the account holder name.';
  }
  return e;
}

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
  const [touched, setTouched] = useState(false);

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

  // Whether the account has TOTP 2FA — decides which factor the step-up prompt
  // asks for (authenticator/backup code vs. account password).
  const twoFaQ = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => userApi.get2faStatus(),
    enabled: ready,
  });
  const twoFaEnabled = twoFaQ.data?.data.enabled ?? false;

  // Step-up re-authentication: a fresh factor is required immediately before a
  // payout request is accepted (backend enforces X-Step-Up-Token).
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpCode, setStepUpCode] = useState('');

  const submit = useMutation({
    mutationFn: (stepUpToken: string) => {
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
      return userApi.createInrWithdrawal(body, stepUpToken);
    },
    onSuccess: () => {
      setAmount('500');
      setUpiId('');
      setAccountNumber('');
      setIfsc('');
      setHolderName('');
      setBankName('');
      setStepUpOpen(false);
      setStepUpPassword('');
      setStepUpCode('');
      qc.invalidateQueries({ queryKey: ['inr-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['wallet', 'INR'] });
    },
  });

  // Verify the fresh factor → obtain a short-lived step-up token → submit.
  const verifyStepUp = useMutation({
    mutationFn: () =>
      userApi.stepUp(
        twoFaEnabled ? { code: stepUpCode.trim() } : { password: stepUpPassword },
      ),
    onSuccess: (res) => submit.mutate(res.data.stepUpToken),
  });

  function closeStepUp() {
    setStepUpOpen(false);
    setStepUpPassword('');
    setStepUpCode('');
    verifyStepUp.reset();
    submit.reset();
  }

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

  const errors = validateWithdrawal({ amount, method, upiId, accountNumber, ifsc, holderName });
  const serverErrors = submit.isError ? fieldErrors(submit.error) : {};
  const formValid = Object.keys(errors).length === 0;
  // Show a client error once the user has tried to submit; otherwise fall back to
  // any field-specific message the backend returned.
  const fieldErr = (field: string): string | undefined =>
    (touched ? errors[field] : undefined) ?? serverErrors[field];

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
                {Object.keys(serverErrors).length > 0
                  ? 'Please correct the highlighted fields and try again.'
                  : errorMessage(submit.error)}
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
              setTouched(true);
              if (!formValid) return;
              verifyStepUp.reset();
              submit.reset();
              setStepUpOpen(true);
            }}
          >
            <Field label="Amount (INR)" error={fieldErr('amount')}>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500.00"
                inputMode="decimal"
                className={INPUT_CLS}
              />
            </Field>

            {method === 'UPI' ? (
              <Field label="UPI ID" error={fieldErr('upiId')}>
                <input
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="name@okhdfcbank"
                  className={INPUT_CLS}
                />
              </Field>
            ) : (
              <>
                <Field label="Account Holder Name" error={fieldErr('holderName')}>
                  <input
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    placeholder="As per bank records"
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Account Number" error={fieldErr('accountNumber')}>
                  <input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Bank account number"
                    inputMode="numeric"
                    className={`${INPUT_CLS} font-mono`}
                  />
                </Field>
                <Field label="IFSC Code" error={fieldErr('ifsc')}>
                  <input
                    value={ifsc}
                    onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                    placeholder="HDFC0000240"
                    className={`${INPUT_CLS} font-mono`}
                  />
                </Field>
                <Field label="Bank Name (optional)" error={fieldErr('bankName')}>
                  <input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. HDFC Bank"
                    className={INPUT_CLS}
                  />
                </Field>
              </>
            )}

            {!stepUpOpen ? (
              <button
                type="submit"
                disabled={touched && !formValid}
                className="w-full rounded-lg bg-gradient-to-r from-gold to-gold-glow px-6 py-3.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50 tracking-wider uppercase"
              >
                Request Withdrawal
              </button>
            ) : (
              <StepUpPrompt
                twoFaEnabled={twoFaEnabled}
                password={stepUpPassword}
                code={stepUpCode}
                onPassword={setStepUpPassword}
                onCode={setStepUpCode}
                pending={verifyStepUp.isPending || submit.isPending}
                error={
                  verifyStepUp.isError
                    ? errorMessage(verifyStepUp.error)
                    : submit.isError
                      ? errorMessage(submit.error)
                      : null
                }
                onConfirm={() => verifyStepUp.mutate()}
                onCancel={closeStepUp}
              />
            )}
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

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[9px] font-bold text-white/45 uppercase tracking-widest">
        {label}
      </label>
      {children}
      {error ? <span className="text-[10px] text-red-300">{error}</span> : null}
    </div>
  );
}

/**
 * Step-up re-authentication shown immediately before a payout is submitted.
 * If the account has TOTP 2FA we require a fresh authenticator/backup code;
 * otherwise we require the account password. The verified factor yields a
 * short-lived token that authorises this single request.
 */
function StepUpPrompt({
  twoFaEnabled,
  password,
  code,
  onPassword,
  onCode,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  twoFaEnabled: boolean;
  password: string;
  code: string;
  onPassword: (v: string) => void;
  onCode: (v: string) => void;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ready = twoFaEnabled ? code.trim().length >= 6 : password.length > 0;
  return (
    <div className="rounded-lg border border-gold/25 bg-gold/[0.04] p-4 space-y-3">
      <div>
        <p className="text-xs font-bold text-gold uppercase tracking-wide">
          Confirm it&rsquo;s you
        </p>
        <p className="mt-1 text-[11px] text-white/55">
          {twoFaEnabled
            ? 'Enter a code from your authenticator app (or a backup code) to authorise this withdrawal.'
            : 'Re-enter your account password to authorise this withdrawal.'}
        </p>
      </div>

      {twoFaEnabled ? (
        <input
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          placeholder="Authenticator or backup code"
          value={code}
          onChange={(e) => onCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready && !pending) {
              e.preventDefault();
              onConfirm();
            }
          }}
          className="w-full rounded-lg border border-white/10 bg-noir/80 py-2.5 px-3 text-sm text-white focus:border-gold/60 focus:outline-none"
        />
      ) : (
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          placeholder="Account password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready && !pending) {
              e.preventDefault();
              onConfirm();
            }
          }}
          className="w-full rounded-lg border border-white/10 bg-noir/80 py-2.5 px-3 text-sm text-white focus:border-gold/60 focus:outline-none"
        />
      )}

      {error ? <p className="text-[11px] text-red-300">{error}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || !ready}
          className="flex-1 rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50 uppercase tracking-wider"
        >
          {pending ? 'Verifying…' : 'Confirm & submit'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg border border-white/10 px-4 py-2.5 text-xs text-white/60 hover:text-white transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
