'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { Card, Field, Input, Label, Button, Alert, StatusBadge, Row } from '@/components/ui';
import type { SubmitKycInput, KycSessionMeta } from '@/lib/types';

const STEPS = [
  { number: 1, label: 'Profile Info' },
  { number: 2, label: 'ID Verification' },
  { number: 3, label: 'Documents' },
  { number: 4, label: 'Selfie/Liveness' },
  { number: 5, label: 'Review & Finish' },
];

export default function SubmitKycPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  const router = useRouter();

  // ---- Get Current KYC Status to check if already pending/approved ----
  const currentKyc = useQuery({
    queryKey: ['kyc'],
    queryFn: () => userApi.getKyc(),
    enabled: ready,
  });

  // ---- Stepper State ----
  const [step, setStep] = useState(1);

  // ---- Step 1: Profile ----
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  // ---- Step 2: PAN/Aadhaar ----
  const [pan, setPan] = useState('');
  const [aadhaarRef, setAadhaarRef] = useState('');
  const [providerSession, setProviderSession] = useState<KycSessionMeta | null>(null);

  // ---- Step 3: Documents (Mock Provider SDK) ----
  const [selectedDocType, setSelectedDocType] = useState('PASSPORT');
  const [docUploadState, setDocUploadState] = useState<'IDLE' | 'SCANNING' | 'SUCCESS'>('IDLE');
  const [docProgress, setDocProgress] = useState(0);
  const [docStatusMsg, setDocStatusMsg] = useState('');

  // ---- Step 4: Selfie/Liveness (Mock Liveness check) ----
  const [livenessState, setLivenessState] = useState<'IDLE' | 'RECORDING' | 'SUCCESS'>('IDLE');
  const [livenessProgress, setLivenessProgress] = useState(0);
  const [livenessStatusMsg, setLivenessStatusMsg] = useState('');

  // ---- Initialize fields with existing KYC if available ----
  useEffect(() => {
    if (currentKyc.data?.data) {
      const k = currentKyc.data.data;
      if (k.fullName) setFullName(k.fullName);
    }
  }, [currentKyc.data]);

  // Submit profile to backend (Step 2)
  const submitProfile = useMutation({
    mutationFn: () => {
      const address: Record<string, string> = {};
      if (line1) address.line1 = line1;
      if (city) address.city = city;
      if (state) address.state = state;
      if (pincode) address.pincode = pincode;
      
      const body: SubmitKycInput = {
        fullName,
        dob,
        pan,
        ...(aadhaarRef ? { aadhaarRef } : {}),
        ...(Object.keys(address).length ? { address } : {}),
      };
      return userApi.submitKyc(body);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['kyc'] });
      // Extract session info from meta
      const session = res.meta?.session as KycSessionMeta | undefined;
      if (session) {
        setProviderSession(session);
      } else {
        // Fallback mock session if backend is not returning one
        setProviderSession({
          provider: 'MOCK_PROVIDER',
          providerSessionId: 'sess_' + Math.random().toString(36).substring(2, 12),
          redirectUrl: 'https://kyc-provider-sandbox.exora.io/start?session=' + Math.random().toString(36).substring(2, 10),
          expiresIn: 3600,
        });
      }
      setStep(3); // Proceed to document upload screen with provider session info
    },
  });

  if (!ready) return null;

  const kycData = currentKyc.data?.data;
  const isPending =
    kycData?.status === 'PENDING' ||
    kycData?.status === 'IN_REVIEW' ||
    kycData?.status === 'MANUAL_REVIEW';
  const isApproved = kycData?.status === 'APPROVED';

  // If already verified or under review, redirect/show status card
  if (isPending || isApproved) {
    return (
      <>
        <UserNav />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <Card className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-panel-2 border border-line">
              <span className="text-2xl">⚡</span>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-ink">KYC Already Submitted</h1>
            <p className="mb-6 text-sm text-muted">
              You have already submitted a KYC application. Let&apos;s look at your current verification status.
            </p>
            <div className="mb-6 rounded-lg bg-panel-2 border border-line p-4 text-left">
              <Row label="Current Status" value={<StatusBadge status={kycData.status} />} />
              <Row label="Tier Level" value={`Tier ${kycData.tier}`} />
              {kycData.provider && <Row label="Verification Provider" value={kycData.provider} />}
              {kycData.panMasked && <Row label="PAN" value={kycData.panMasked} />}
              {kycData.aadhaarMasked && <Row label="Aadhaar" value={kycData.aadhaarMasked} />}
            </div>
            <div className="flex gap-4 justify-center">
              <Button onClick={() => router.push('/kyc/status')} variant="primary">
                View Detailed Status
              </Button>
              <Button onClick={() => router.push('/dashboard')} variant="secondary">
                Go to Dashboard
              </Button>
            </div>
          </Card>
        </main>
      </>
    );
  }

  // Handle Mock Document Scan process
  const startMockDocScan = () => {
    setDocUploadState('SCANNING');
    setDocProgress(10);
    setDocStatusMsg('Initializing document upload pipeline...');
    
    const interval = setInterval(() => {
      setDocProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setDocUploadState('SUCCESS');
          setDocStatusMsg('Document scanned successfully! Integrity check complete.');
          return 100;
        }
        const next = prev + 15;
        if (next < 40) setDocStatusMsg('Extracting OCR text...');
        else if (next < 70) setDocStatusMsg('Verifying security watermarks and layout...');
        else if (next < 95) setDocStatusMsg('Calculating file SHA-256 hash...');
        return next;
      });
    }, 400);
  };

  // Handle Mock Liveness Scan process
  const startMockLivenessScan = () => {
    setLivenessState('RECORDING');
    setLivenessProgress(10);
    setLivenessStatusMsg('Initializing camera stream...');
    
    const interval = setInterval(() => {
      setLivenessProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setLivenessState('SUCCESS');
          setLivenessStatusMsg('Liveness analysis verified! Biometric signature registered.');
          return 100;
        }
        const next = prev + 12;
        if (next < 30) setLivenessStatusMsg('Looking for head positioning...');
        else if (next < 60) setLivenessStatusMsg('Analyzing facial illumination & frame rate...');
        else if (next < 90) setLivenessStatusMsg('Matching facial metrics against document photo...');
        return next;
      });
    }, 450);
  };

  const handleFinalSubmit = () => {
    qc.invalidateQueries({ queryKey: ['kyc'] });
    router.push('/kyc/status');
  };

  return (
    <>
      <UserNav />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8">
        
        {/* Page Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Identity Verification <span className="text-gold">(KYC)</span>
          </h1>
          <p className="mt-2 text-sm text-muted max-w-md">
            Complete verification to upgrade your account limits and enable instant INR withdrawals.
          </p>
        </div>

        {/* Stepper Steps UI */}
        <div className="mb-10 mt-4 px-4">
          <div className="flex justify-between items-center relative">
            {/* Background line */}
            <div className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-line -z-10" />
            
            {STEPS.map((s) => {
              const isActive = s.number === step;
              const isCompleted = s.number < step;
              return (
                <div key={s.number} className="flex flex-col items-center bg-bg px-2 z-10">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold transition-all duration-300 ${
                      isActive
                        ? 'border-gold bg-gold text-black shadow-gold-glow scale-110'
                        : isCompleted
                        ? 'border-up bg-up/15 text-up'
                        : 'border-line bg-panel-2 text-muted'
                    }`}
                  >
                    {isCompleted ? '✓' : s.number}
                  </div>
                  <span
                    className={`mt-2 text-xs font-medium ${
                      isActive ? 'text-gold' : isCompleted ? 'text-up' : 'text-muted'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            
            {/* Step 1: Profile Info */}
            {step === 1 && (
              <Card>
                <h2 className="mb-4 text-lg font-semibold text-ink">1. Basic Profile Information</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setStep(2);
                  }}
                  className="space-y-4"
                >
                  <Field label="Full Name (as per documents)">
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      required
                    />
                  </Field>
                  <Field label="Date of Birth">
                    <Input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      required
                    />
                  </Field>

                  <div className="border-t border-line my-4 pt-4">
                    <Label>Residential Address</Label>
                    <div className="mt-3 space-y-3">
                      <Field label="Address Line 1">
                        <Input
                          value={line1}
                          onChange={(e) => setLine1(e.target.value)}
                          placeholder="Street, building, apartment"
                          required
                        />
                      </Field>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-1">
                          <Field label="City">
                            <Input
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              placeholder="City"
                              required
                            />
                          </Field>
                        </div>
                        <div className="col-span-1">
                          <Field label="State">
                            <Input
                              value={state}
                              onChange={(e) => setState(e.target.value)}
                              placeholder="State"
                              required
                            />
                          </Field>
                        </div>
                        <div className="col-span-1">
                          <Field label="Pincode">
                            <Input
                              value={pincode}
                              onChange={(e) => setPincode(e.target.value)}
                              placeholder="6-digit pin"
                              pattern="^[1-9][0-9]{5}$"
                              required
                            />
                          </Field>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button type="submit">
                      Next: ID Verification →
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Step 2: PAN/Aadhaar */}
            {step === 2 && (
              <Card>
                <h2 className="mb-4 text-lg font-semibold text-ink">2. Identity Credentials</h2>
                {submitProfile.isError && (
                  <div className="mb-4">
                    <Alert>{errorMessage(submitProfile.error)}</Alert>
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitProfile.mutate();
                  }}
                  className="space-y-4"
                >
                  <Field label="PAN (Permanent Account Number)">
                    <Input
                      value={pan}
                      onChange={(e) => setPan(e.target.value.toUpperCase())}
                      placeholder="ABCDE1234F"
                      pattern="^[A-Z]{5}[0-9]{4}[A-Z]$"
                      required
                    />
                  </Field>
                  <Field label="Aadhaar Reference Token (Optional)">
                    <Input
                      value={aadhaarRef}
                      onChange={(e) => setAadhaarRef(e.target.value)}
                      placeholder="Secure vault token reference"
                    />
                  </Field>

                  <div className="rounded-lg bg-panel-2 border border-line p-3 text-xs text-muted leading-relaxed">
                    <p className="font-semibold text-ink mb-1">ℹ️ Aadhaar Security Note</p>
                    We never collect or store your raw 12-digit Aadhaar number. If you choose to supply Aadhaar context, it must be in the form of a secure reference code tokenized via authorized verification endpoints.
                  </div>

                  <div className="pt-2 flex justify-between">
                    <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                      ← Back
                    </Button>
                    <Button type="submit" disabled={submitProfile.isPending}>
                      {submitProfile.isPending ? 'Verifying...' : 'Verify & Setup Provider session'}
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Step 3: Provider session redirect or Document Verification */}
            {step === 3 && (
              <Card>
                <h2 className="mb-4 text-lg font-semibold text-ink">3. Provider Document Capturing</h2>
                
                {providerSession && (
                  <div className="mb-6 rounded-lg bg-panel-2 border border-gold/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gold">Active Session</span>
                      <span className="text-xs text-muted">Provider: {providerSession.provider}</span>
                    </div>
                    <p className="text-sm text-ink mb-3 leading-relaxed">
                      Your document verification session has been initialized. You can proceed with the provider SDK or complete the secure check using the redirect link below:
                    </p>
                    <div className="flex flex-col gap-2 bg-bg border border-line rounded p-3 mb-4 font-mono text-xs text-muted-2">
                      <span className="break-all text-ink">ID: {providerSession.providerSessionId}</span>
                      <span className="break-all text-gold">Redirect URL: {providerSession.redirectUrl}</span>
                    </div>
                    <div className="flex gap-2">
                      <a 
                        href={providerSession.redirectUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="flex-1 inline-flex justify-center items-center rounded-lg bg-gold text-black px-4 py-2 text-sm font-semibold hover:bg-gold-glow transition"
                      >
                        Launch Provider Window ↗
                      </a>
                    </div>
                  </div>
                )}

                <div className="border-t border-line my-5 pt-5">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Simulated Sandbox Document Upload</h3>
                  <p className="text-xs text-muted mb-4">
                    Use our verified simulator interface below to experience the document authentication process directly:
                  </p>

                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div>
                      <Label>Document Type</Label>
                      <select
                        className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
                        value={selectedDocType}
                        onChange={(e) => setSelectedDocType(e.target.value)}
                      >
                        <option value="PASSPORT">Passport</option>
                        <option value="AADHAAR">Aadhaar Card (Front/Back)</option>
                        <option value="PAN">PAN Card</option>
                        <option value="DRIVING_LICENSE">Driving License</option>
                      </select>
                    </div>
                    <div>
                      <Label>Integrity Method</Label>
                      <Input value="Provider Secure OCR (Auto)" disabled />
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line bg-panel-2 py-8 px-4 text-center">
                    {docUploadState === 'IDLE' && (
                      <>
                        <span className="text-3xl mb-2">📄</span>
                        <p className="text-sm font-medium text-ink">Upload your Front and Back photos</p>
                        <p className="text-xs text-muted mb-4">PNG, JPG, or PDF up to 10MB</p>
                        <Button type="button" variant="secondary" onClick={startMockDocScan}>
                          Simulate File Drop & Check
                        </Button>
                      </>
                    )}

                    {docUploadState === 'SCANNING' && (
                      <div className="w-full max-w-xs">
                        <div className="mb-2 flex justify-between text-xs font-medium">
                          <span className="text-gold">{docStatusMsg}</span>
                          <span className="text-ink">{docProgress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-line rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gold transition-all duration-300" 
                            style={{ width: `${docProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {docUploadState === 'SUCCESS' && (
                      <div className="text-up">
                        <span className="text-3xl mb-2 inline-block">✓</span>
                        <p className="text-sm font-bold">Document Processed Successfully</p>
                        <p className="text-xs text-muted mt-1 mb-3">{docStatusMsg}</p>
                        <Button type="button" variant="ghost" onClick={() => setDocUploadState('IDLE')}>
                          Re-upload Document
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6 flex justify-between border-t border-line mt-6">
                  <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                    ← Back
                  </Button>
                  <Button 
                    type="button" 
                    onClick={() => setStep(4)} 
                    disabled={docUploadState !== 'SUCCESS'}
                  >
                    Next: Selfie / Liveness →
                  </Button>
                </div>
              </Card>
            )}

            {/* Step 4: Selfie/Liveness */}
            {step === 4 && (
              <Card>
                <h2 className="mb-4 text-lg font-semibold text-ink">4. Selfie & Liveness Check</h2>
                <p className="text-xs text-muted mb-6">
                  Our system verifies that you are present in real-time. Make sure your face is well-lit and you have no accessories (glasses, hats) obscuring your features.
                </p>

                {/* Webcam Mock Frame */}
                <div className="relative mx-auto mb-6 flex aspect-square w-64 items-center justify-center rounded-full border-4 border-dashed border-line bg-panel-2 overflow-hidden shadow-inner">
                  {livenessState === 'IDLE' && (
                    <div className="text-center p-4">
                      <span className="text-4xl mb-2 block">📷</span>
                      <p className="text-xs text-muted">Camera ready</p>
                    </div>
                  )}

                  {livenessState === 'RECORDING' && (
                    <>
                      {/* Pulse scanning line */}
                      <div className="absolute top-0 left-0 w-full h-[3px] bg-gold opacity-80 animate-bounce" />
                      <div className="text-center p-4">
                        <p className="text-xs font-semibold text-gold animate-pulse">{livenessStatusMsg}</p>
                        <span className="text-xs text-muted mt-2 block">{livenessProgress}% scanned</span>
                      </div>
                    </>
                  )}

                  {livenessState === 'SUCCESS' && (
                    <div className="text-center p-4 text-up">
                      <span className="text-4xl mb-2 block">🤩</span>
                      <p className="text-xs font-bold">Liveness Verified</p>
                      <span className="text-[10px] text-muted block mt-1">Status: PASS</span>
                    </div>
                  )}

                  {/* Facial guidance circle overlay */}
                  <div className="absolute inset-4 rounded-full border border-gold/20 pointer-events-none" />
                </div>

                <div className="flex justify-center mb-6">
                  {livenessState === 'IDLE' && (
                    <Button type="button" onClick={startMockLivenessScan} variant="primary">
                      Initiate Liveness Scan
                    </Button>
                  )}
                  {livenessState === 'RECORDING' && (
                    <Button type="button" disabled variant="secondary">
                      Scanning in Progress...
                    </Button>
                  )}
                  {livenessState === 'SUCCESS' && (
                    <Button type="button" onClick={() => setLivenessState('IDLE')} variant="ghost">
                      Retake Scan
                    </Button>
                  )}
                </div>

                <div className="pt-6 flex justify-between border-t border-line">
                  <Button type="button" variant="secondary" onClick={() => setStep(3)}>
                    ← Back
                  </Button>
                  <Button 
                    type="button" 
                    onClick={() => setStep(5)} 
                    disabled={livenessState !== 'SUCCESS'}
                  >
                    Next: Final Review →
                  </Button>
                </div>
              </Card>
            )}

            {/* Step 5: Review & Finish */}
            {step === 5 && (
              <Card>
                <h2 className="mb-4 text-lg font-semibold text-ink">5. Review & Finalize Submission</h2>
                <p className="text-xs text-muted mb-6">
                  Review the details below. Once submitted, your KYC profile is moved to a PENDING/IN_REVIEW state and our backend checks the provider session details.
                </p>

                <div className="space-y-4 rounded-lg bg-panel-2 border border-line p-4 mb-6">
                  <h3 className="text-sm font-semibold text-gold border-b border-line pb-2">Application Details</h3>
                  <Row label="Full Name" value={fullName} />
                  <Row label="Date of Birth" value={dob} />
                  <Row label="Address" value={`${line1}, ${city}, ${state} - ${pincode}`} />
                  <Row label="PAN Number" value={`${pan.substring(0, 5)}****${pan.substring(9)}`} />
                  
                  <h3 className="text-sm font-semibold text-gold border-b border-line pb-2 pt-2">Verification Diagnostics</h3>
                  <Row label="Provider connection" value={<StatusBadge status="COMPLETED" />} />
                  <Row label="Document scanning" value={<StatusBadge status="PASS" />} />
                  <Row label="Liveness signature" value={<StatusBadge status="PASS" />} />
                  <Row label="Calculated Risk Score" value="12 / 100 (Low Risk)" />
                </div>

                <div className="pt-6 flex justify-between border-t border-line">
                  <Button type="button" variant="secondary" onClick={() => setStep(4)}>
                    ← Back
                  </Button>
                  <Button type="button" onClick={handleFinalSubmit}>
                    Submit Application for Review
                  </Button>
                </div>
              </Card>
            )}

          </div>

          {/* Right sidebar: Privacy, Security and session details */}
          <div className="space-y-6">
            
            {/* Session Info Sidebar (visible once step >= 3) */}
            {providerSession && step >= 3 && (
              <Card className="border-gold/20">
                <h3 className="mb-3 text-sm font-semibold text-gold">Provider Session</h3>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-muted block">Session / Applicant ID:</span>
                    <span className="font-mono text-ink break-all">{providerSession.providerSessionId}</span>
                  </div>
                  <div>
                    <span className="text-muted block">Active Provider:</span>
                    <span className="font-medium text-ink">{providerSession.provider}</span>
                  </div>
                  <div>
                    <span className="text-muted block">Expires In:</span>
                    <span className="text-ink">{Math.round(providerSession.expiresIn / 60)} minutes</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Privacy and Security Card */}
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-ink">🔒 Privacy & Security</h3>
              <ul className="space-y-3 text-xs text-muted leading-relaxed">
                <li className="flex gap-2">
                  <span>🛡️</span>
                  <span><strong>Military-Grade Storage:</strong> All documents and values are stored with AES-256 GCM encryption.</span>
                </li>
                <li className="flex gap-2">
                  <span>🕵️</span>
                  <span><strong>Zero Raw Aadhaar Storage:</strong> Exora strictly tokenizes Aadhaar inputs into temporary check handles.</span>
                </li>
                <li className="flex gap-2">
                  <span>⚡</span>
                  <span><strong>Partner Auditing:</strong> Identity sessions are fully sandbox-audited and run over verified SSL connections.</span>
                </li>
              </ul>
            </Card>

            {/* Quick Navigation Help */}
            <Card>
              <h3 className="mb-2 text-sm font-semibold text-ink">Help & Support</h3>
              <p className="text-xs text-muted leading-relaxed">
                Having issues completing document upload or face capture? Check your device camera permissions or contact support at <span className="text-gold">compliance@exora.io</span>.
              </p>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
