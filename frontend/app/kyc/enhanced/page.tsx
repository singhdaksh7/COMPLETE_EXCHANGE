'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { Alert, Button, Field, Input, Select, StatusBadge } from '@/components/ui';
import type { LivenessVerifyResp, SubmitEnhancedKycInput } from '@/lib/types';

const STEPS = ['Personal', 'Address', 'Documents', 'Liveness', 'Consents', 'Submit'] as const;

const MOCK_BADGE = (
  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
    Mock provider · staging
  </span>
);

export default function EnhancedKycPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ['compliance-status'],
    queryFn: () => userApi.complianceStatus(),
    enabled: ready,
    retry: false,
  });

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    customerType: 'INDIVIDUAL' as 'INDIVIDUAL' | 'BUSINESS',
    fullName: '',
    dateOfBirth: '',
    nationality: 'IN',
    countryOfResidence: 'IN',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'IN',
    pan: '',
    aadhaar: '',
  });
  const [consents, setConsents] = useState({
    kycProcessing: false,
    amlScreening: false,
    dataRetention: false,
    termsAccepted: false,
    riskDisclosure: false,
  });
  const [liveness, setLiveness] = useState<LivenessVerifyResp | null>(null);
  const [livenessRef, setLivenessRef] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const startLiveness = useMutation({
    mutationFn: () => userApi.livenessStart(),
    onSuccess: (r) => setLivenessRef(r.data.providerReference),
  });
  const verifyLiveness = useMutation({
    mutationFn: (outcome: 'PASSED' | 'FAILED' | 'REVIEW_REQUIRED') =>
      userApi.livenessVerify({ providerReference: livenessRef ?? '', simulateOutcome: outcome }),
    onSuccess: (r) => setLiveness(r.data),
  });

  const submit = useMutation({
    mutationFn: () => {
      const body: SubmitEnhancedKycInput = {
        customerType: form.customerType,
        fullName: form.fullName.trim(),
        dateOfBirth: form.dateOfBirth,
        nationality: form.nationality.trim().toUpperCase(),
        countryOfResidence: form.countryOfResidence.trim().toUpperCase(),
        address: {
          line1: form.line1.trim(),
          line2: form.line2.trim() || undefined,
          city: form.city.trim(),
          state: form.state.trim(),
          postalCode: form.postalCode.trim(),
          country: form.country.trim().toUpperCase(),
        },
        pan: form.pan.trim().toUpperCase(),
        aadhaar: form.aadhaar.trim() || undefined,
        consents: {
          kycProcessing: true,
          amlScreening: true,
          dataRetention: true,
          termsAccepted: true,
          riskDisclosure: true,
        },
      };
      return userApi.submitEnhancedKyc(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance-status'] });
      setStep(STEPS.length - 1);
    },
  });

  if (!ready) return null;
  const status = statusQ.data?.data;
  const allConsents = Object.values(consents).every(Boolean);

  const next = () => {
    setFormError(null);
    if (step === 0 && (!form.fullName || !form.dateOfBirth || !form.nationality || !form.countryOfResidence)) {
      setFormError('Please complete all personal details.');
      return;
    }
    if (step === 1 && (!form.line1 || !form.city || !form.state || !form.postalCode || !form.country)) {
      setFormError('Please complete the address.');
      return;
    }
    if (step === 2 && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan.trim().toUpperCase())) {
      setFormError('Enter a valid PAN (e.g. ABCDE1234F). It is masked + encrypted on submit.');
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <UserShell>
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">Identity Verification (KYC)</h1>
            <p className="mt-0.5 text-sm text-muted">
              FIU/PMLA-ready onboarding. Your PAN/Aadhaar are masked and encrypted — never shown back in full.
            </p>
          </div>
          {status && <StatusBadge status={status.status} />}
        </div>

        {/* Already submitted / decided — show status, not the form. */}
        {status && status.status !== 'NOT_STARTED' && status.status !== 'DRAFT' && step !== STEPS.length - 1 ? (
          <StatusView status={status} onRedo={() => setStep(0)} />
        ) : (
          <>
            {/* Step indicator */}
            <div className="flex flex-wrap gap-2">
              {STEPS.map((label, i) => (
                <div
                  key={label}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                    i === step
                      ? 'border-brand/50 bg-brand/10 text-brand'
                      : i < step
                        ? 'border-up/40 bg-up/10 text-up'
                        : 'border-line bg-panel-2 text-muted'
                  }`}
                >
                  <span>{i + 1}.</span> {label}
                </div>
              ))}
            </div>

            {formError && <Alert>{formError}</Alert>}
            {submit.isError && <Alert>{errorMessage(submit.error)}</Alert>}

            <div className="rounded-xl border border-line bg-panel p-5">
              {/* Step 1: personal */}
              {step === 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Account type">
                    <Select value={form.customerType} onChange={(e) => set('customerType', e.target.value)}>
                      <option value="INDIVIDUAL">Individual</option>
                      <option value="BUSINESS">Business</option>
                    </Select>
                  </Field>
                  <Field label="Full name (as per PAN)">
                    <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Full legal name" />
                  </Field>
                  <Field label="Date of birth">
                    <Input type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
                  </Field>
                  <Field label="Nationality (ISO-2)">
                    <Input value={form.nationality} onChange={(e) => set('nationality', e.target.value)} placeholder="IN" maxLength={2} />
                  </Field>
                  <Field label="Country of residence (ISO-2)">
                    <Input value={form.countryOfResidence} onChange={(e) => set('countryOfResidence', e.target.value)} placeholder="IN" maxLength={2} />
                  </Field>
                </div>
              )}

              {/* Step 2: address */}
              {step === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Address line 1"><Input value={form.line1} onChange={(e) => set('line1', e.target.value)} /></Field>
                  <Field label="Address line 2 (optional)"><Input value={form.line2} onChange={(e) => set('line2', e.target.value)} /></Field>
                  <Field label="City"><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
                  <Field label="State"><Input value={form.state} onChange={(e) => set('state', e.target.value)} /></Field>
                  <Field label="Postal code"><Input value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} /></Field>
                  <Field label="Country (ISO-2)"><Input value={form.country} onChange={(e) => set('country', e.target.value)} maxLength={2} /></Field>
                </div>
              )}

              {/* Step 3: documents */}
              {step === 2 && (
                <div className="space-y-3">
                  <Alert kind="info">
                    Your PAN/Aadhaar are encrypted at rest and only ever shown back masked (e.g. ABCDE****F).
                  </Alert>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="PAN"><Input value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} /></Field>
                    <Field label="Aadhaar (optional, 12 digits)"><Input value={form.aadhaar} onChange={(e) => set('aadhaar', e.target.value.replace(/\D/g, ''))} placeholder="123412341234" maxLength={12} /></Field>
                  </div>
                </div>
              )}

              {/* Step 4: liveness */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-ink">Selfie / Liveness</h2>
                    {MOCK_BADGE}
                  </div>
                  <p className="text-sm text-muted">
                    In production this opens a vendor liveness capture. In staging the mock provider
                    lets you simulate the outcome.
                  </p>
                  {!livenessRef ? (
                    <Button onClick={() => startLiveness.mutate()} disabled={startLiveness.isPending}>
                      {startLiveness.isPending ? 'Starting…' : 'Start liveness check'}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted">Session: <span className="font-mono">{livenessRef.slice(0, 16)}…</span></p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="success" onClick={() => verifyLiveness.mutate('PASSED')} disabled={verifyLiveness.isPending}>Simulate pass</Button>
                        <Button variant="secondary" onClick={() => verifyLiveness.mutate('REVIEW_REQUIRED')} disabled={verifyLiveness.isPending}>Simulate review</Button>
                        <Button variant="danger" onClick={() => verifyLiveness.mutate('FAILED')} disabled={verifyLiveness.isPending}>Simulate fail</Button>
                      </div>
                      {liveness && (
                        <Alert kind={liveness.status === 'PASSED' ? 'success' : liveness.status === 'FAILED' ? 'error' : 'info'}>
                          Liveness {liveness.status} · confidence {(liveness.confidence * 100).toFixed(0)}% ({liveness.mode})
                        </Alert>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 5: consents */}
              {step === 4 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-ink">Required consents</h2>
                  {([
                    ['kycProcessing', 'I consent to processing of my KYC data for identity verification.'],
                    ['amlScreening', 'I consent to AML/CFT sanctions, PEP and adverse-media screening.'],
                    ['dataRetention', 'I understand my records are retained per regulatory requirements.'],
                    ['termsAccepted', 'I accept the Terms of Service.'],
                    ['riskDisclosure', 'I have read and understood the Risk Disclosure.'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-start gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={consents[key]}
                        onChange={(e) => setConsents((c) => ({ ...c, [key]: e.target.checked }))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  {!allConsents && <p className="text-xs text-muted">All consents are required to submit.</p>}
                </div>
              )}

              {/* Step 6: submit / done */}
              {step === 5 && (
                <div className="space-y-3 text-center py-6">
                  {status && (status.status === 'SUBMITTED' || status.status === 'UNDER_REVIEW') ? (
                    <>
                      <div className="text-4xl">✅</div>
                      <h2 className="text-lg font-semibold text-ink">Submitted for review</h2>
                      <p className="text-sm text-muted">
                        We received your verification. You will be notified by email when the review is complete.
                      </p>
                      <StatusBadge status={status.status} />
                    </>
                  ) : (
                    <>
                      <h2 className="text-lg font-semibold text-ink">Review &amp; submit</h2>
                      <p className="text-sm text-muted">
                        By submitting you confirm the information is accurate. Your PAN/Aadhaar will be
                        masked and encrypted.
                      </p>
                      <Button onClick={() => submit.mutate()} disabled={submit.isPending || !allConsents}>
                        {submit.isPending ? 'Submitting…' : 'Submit verification'}
                      </Button>
                      {!allConsents && <p className="text-xs text-down">Complete the consents step first.</p>}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Nav buttons */}
            {step < STEPS.length - 1 && (
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                  Back
                </Button>
                <Button onClick={next} disabled={step === 4 && !allConsents}>
                  Continue
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </UserShell>
  );
}

function StatusView({ status, onRedo }: { status: NonNullable<Awaited<ReturnType<typeof userApi.complianceStatus>>['data']>; onRedo: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Verification status</h2>
        <StatusBadge status={status.status} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Info label="Name" value={status.fullName ?? '—'} />
        <Info label="Country" value={status.countryOfResidence ?? '—'} />
        <Info label="PAN" value={status.panMasked ?? '—'} />
        <Info label="Aadhaar" value={status.aadhaarMasked ?? '—'} />
        <Info label="Liveness" value={status.livenessStatus} />
        <Info label="Risk level" value={status.riskLevel} />
        <Info
          label="Screening"
          value={`${status.screeningStatus.replace('_', ' ')}${status.providerMode === 'mock' ? ' (mock)' : ''}`}
        />
        <Info label="Sanctions" value={status.sanctionsStatus} />
        <Info label="PEP" value={status.pepStatus} />
        <Info label="Adverse media" value={status.adverseMediaStatus} />
        <Info label="Next review" value={status.nextReviewDueAt ? new Date(status.nextReviewDueAt).toLocaleDateString() : '—'} />
      </div>
      {status.rejectionReason && <Alert>{status.rejectionReason}</Alert>}
      {(status.status === 'NEEDS_MORE_INFO' || status.status === 'REJECTED') && (
        <Button onClick={onRedo}>Update &amp; resubmit</Button>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-line py-1.5">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
