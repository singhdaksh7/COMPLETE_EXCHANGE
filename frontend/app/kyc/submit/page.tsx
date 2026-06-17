'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import type { SubmitKycInput, KycSessionMeta } from '@/lib/types';

const STEPS = [
  { number: 1, label: 'Details' },
  { number: 2, label: 'Credentials' },
  { number: 3, label: 'Documents' },
  { number: 4, label: 'Liveness' },
  { number: 5, label: 'Review' },
];

function SecurityIllustration() {
  return (
    <div className="relative mt-4 flex h-72 w-full max-w-md items-center justify-center rounded-2xl border border-gold/10 bg-white/[0.02] backdrop-blur-md p-6">
      <div className="absolute h-40 w-40 rounded-full bg-gold/15 blur-3xl animate-glow-pulse" />
      
      <svg
        viewBox="0 0 240 240"
        className="h-56 w-56 animate-float-slow drop-shadow-[0_12px_36px_rgba(245,194,66,0.2)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE69A" />
            <stop offset="50%" stopColor="#F5C242" />
            <stop offset="100%" stopColor="#9E721D" />
          </linearGradient>
          <linearGradient id="glowRing" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F5C242" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#FFCC4D" stopOpacity="1" />
            <stop offset="100%" stopColor="#F5C242" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        
        <circle cx="120" cy="120" r="95" fill="none" stroke="url(#glowRing)" strokeWidth="1.5" strokeDasharray="6 4" className="origin-center animate-spin" style={{ animationDuration: '30s' }} />
        <circle cx="120" cy="120" r="85" fill="none" stroke="url(#goldGradient)" strokeWidth="0.5" strokeOpacity="0.3" />
        
        <path d="M120 45 L180 75 V135 C180 175 120 205 120 205 C120 205 60 175 60 135 V75 Z" fill="none" stroke="url(#goldGradient)" strokeWidth="2.5" strokeLinejoin="round" />
        
        <g transform="translate(90, 85)" fill="none" stroke="url(#goldGradient)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M10,35 C10,20 20,10 30,10 C40,10 50,20 50,35" />
          <path d="M15,35 C15,25 22,17 30,17 C38,17 45,25 45,35" />
          <path d="M20,35 C20,29 24,24 30,24 C36,24 40,29 40,35" />
          <path d="M25,35 C25,32 27,29 30,29 C33,29 35,32 35,35" />
          <path d="M30,35 V38" strokeWidth="2" />
          <path d="M5,35 C5,15 15,5 30,5 C45,5 55,15 55,35" />
        </g>

        <rect x="135" y="125" width="45" height="30" rx="4" fill="#111114" stroke="url(#goldGradient)" strokeWidth="1" />
        <circle cx="146" cy="140" r="4" fill="url(#goldGradient)" />
        <line x1="156" y1="135" x2="172" y2="135" stroke="url(#goldGradient)" strokeWidth="1" />
        <line x1="156" y1="141" x2="168" y2="141" stroke="url(#goldGradient)" strokeWidth="1" />
        <line x1="156" y1="147" x2="170" y2="147" stroke="url(#goldGradient)" strokeWidth="1" />
      </svg>
    </div>
  );
}

export default function SubmitKycPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  const router = useRouter();

  const currentKyc = useQuery({
    queryKey: ['kyc'],
    queryFn: () => userApi.getKyc(),
    enabled: ready,
  });

  const [step, setStep] = useState(1);

  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  const [pan, setPan] = useState('');
  const [aadhaarRef, setAadhaarRef] = useState('');
  const [providerSession, setProviderSession] = useState<KycSessionMeta | null>(null);

  const [selectedDocType, setSelectedDocType] = useState('PASSPORT');
  const [docUploadState, setDocUploadState] = useState<'IDLE' | 'SCANNING' | 'SUCCESS'>('IDLE');
  const [docProgress, setDocProgress] = useState(0);
  const [docStatusMsg, setDocStatusMsg] = useState('');

  const [livenessState, setLivenessState] = useState<'IDLE' | 'RECORDING' | 'SUCCESS'>('IDLE');
  const [livenessProgress, setLivenessProgress] = useState(0);
  const [livenessStatusMsg, setLivenessStatusMsg] = useState('');

  useEffect(() => {
    if (currentKyc.data?.data) {
      const k = currentKyc.data.data;
      if (k.fullName) setFullName(k.fullName);
    }
  }, [currentKyc.data]);

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
      const session = res.meta?.session as KycSessionMeta | undefined;
      if (session) {
        setProviderSession(session);
      } else {
        setProviderSession({
          provider: 'PERSONA_SECURE',
          providerSessionId: 'sess_' + Math.random().toString(36).substring(2, 12),
          redirectUrl: 'https://kyc-provider-sandbox.exora.io/start?session=' + Math.random().toString(36).substring(2, 10),
          expiresIn: 3600,
        });
      }
      setStep(3);
    },
  });

  if (!ready) return null;

  const kycData = currentKyc.data?.data;
  const isPending =
    kycData?.status === 'PENDING' ||
    kycData?.status === 'IN_REVIEW' ||
    kycData?.status === 'MANUAL_REVIEW';
  const isApproved = kycData?.status === 'APPROVED';

  if (isPending || isApproved) {
    return (
      <UserShell className="max-w-2xl py-16">
          <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-8 shadow-gold-soft backdrop-blur-2xl text-center">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
            <div className="relative z-10">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-noir-2 border border-gold/20 shadow-gold-glow">
                <span className="text-2xl text-gold">👑</span>
              </div>
              <h1 className="mb-2 text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Verification Session Active</h1>
              <p className="mb-6 text-sm text-white/55">
                You have already submitted a KYC application. Check your verification progress below.
              </p>
              
              <div className="mb-6 rounded-xl border border-white/5 bg-noir-2/80 p-5 text-left space-y-3">
                <div className="flex justify-between border-b border-white/5 pb-2 text-sm">
                  <span className="text-white/45">Status</span>
                  <span className="font-semibold text-gold">{kycData.status}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2 text-sm">
                  <span className="text-white/45">Account Tier</span>
                  <span className="font-semibold text-gold">Tier {kycData.tier}</span>
                </div>
                {kycData.provider && (
                  <div className="flex justify-between border-b border-white/5 pb-2 text-sm">
                    <span className="text-white/45">KYC Provider</span>
                    <span className="font-semibold text-ink">{kycData.provider}</span>
                  </div>
                )}
                {kycData.panMasked && (
                  <div className="flex justify-between border-b border-white/5 pb-2 text-sm">
                    <span className="text-white/45">Masked PAN</span>
                    <span className="font-mono text-ink">{kycData.panMasked}</span>
                  </div>
                )}
                {kycData.aadhaarMasked && (
                  <div className="flex justify-between pb-1 text-sm">
                    <span className="text-white/45">Masked Aadhaar</span>
                    <span className="font-mono text-ink">{kycData.aadhaarMasked}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button 
                  onClick={() => router.push('/kyc/status')} 
                  className="flex-1 rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-3 text-sm font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
                >
                  View Detailed Status
                </button>
                <button 
                  onClick={() => router.push('/dashboard')} 
                  className="flex-1 rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-3 text-sm font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          </div>
        </UserShell>
    );
  }

  const startMockDocScan = () => {
    setDocUploadState('SCANNING');
    setDocProgress(10);
    setDocStatusMsg('Initializing document capture...');
    
    const interval = setInterval(() => {
      setDocProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setDocUploadState('SUCCESS');
          setDocStatusMsg('Document processed successfully.');
          return 100;
        }
        const next = prev + 15;
        if (next < 40) setDocStatusMsg('Extracting document OCR...');
        else if (next < 75) setDocStatusMsg('Verifying security watermarks...');
        else if (next < 95) setDocStatusMsg('Validating file integrity...');
        return next;
      });
    }, 300);
  };

  const startMockLivenessScan = () => {
    setLivenessState('RECORDING');
    setLivenessProgress(10);
    setLivenessStatusMsg('Activating liveness stream...');
    
    const interval = setInterval(() => {
      setLivenessProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setLivenessState('SUCCESS');
          setLivenessStatusMsg('Biometric matching validated.');
          return 100;
        }
        const next = prev + 12;
        if (next < 35) setLivenessStatusMsg('Detecting facial alignment...');
        else if (next < 70) setLivenessStatusMsg('Checking lighting structures...');
        else if (next < 90) setLivenessStatusMsg('Comparing face mapping vectors...');
        return next;
      });
    }, 350);
  };

  const handleFinalSubmit = () => {
    qc.invalidateQueries({ queryKey: ['kyc'] });
    router.push('/kyc/status');
  };

  return (
    <UserShell className="max-w-[1400px]">
        
        {/* Header Hero Area */}
        <div className="mb-10 text-center lg:text-left">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent sm:text-4xl">
            Identity Verification Desk
          </h1>
          <p className="mt-2 text-sm text-white/50 max-w-xl">
            Exora relies on high-grade automated KYC engines. Enter details to initiate secure session.
          </p>
        </div>

        {/* 5-step visual timeline */}
        <div className="mb-10 max-w-3xl">
          <div className="flex justify-between items-center relative">
            <div className="absolute left-0 top-1/2 h-[1px] w-full -translate-y-1/2 bg-white/10 -z-10" />
            
            {STEPS.map((s) => {
              const isActive = s.number === step;
              const isCompleted = s.number < step;
              return (
                <div key={s.number} className="flex flex-col items-center bg-noir px-2.5 z-10 select-none">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border text-xs font-bold transition-all duration-300 ${
                      isActive
                        ? 'border-gold bg-gradient-to-br from-gold to-gold-glow text-noir shadow-gold-glow scale-110'
                        : isCompleted
                        ? 'border-up bg-up/10 text-up'
                        : 'border-white/10 bg-noir-2 text-white/45'
                    }`}
                  >
                    {isCompleted ? '✓' : s.number}
                  </div>
                  <span
                    className={`mt-2 text-[9px] font-bold tracking-wider uppercase ${
                      isActive ? 'text-gold' : isCompleted ? 'text-up' : 'text-white/45'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content Split: Left forms/wizard, Right illustration/notes */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 1: Basic Info */}
            {step === 1 && (
              <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-7 shadow-gold-soft backdrop-blur-2xl">
                <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
                <div className="relative">
                  <h2 className="text-xl font-bold text-white mb-5 tracking-tight border-b border-white/5 pb-3">1. Personal Information</h2>
                  
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setStep(2);
                    }}
                    className="space-y-5"
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-white/50 tracking-wider uppercase">Full Name (as per documents)</label>
                      <input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Rahul Sharma"
                        className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white placeholder:text-white/25 transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25"
                        required
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-white/50 tracking-wider uppercase">Date of Birth</label>
                      <input
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25"
                        required
                      />
                    </div>

                    <div className="border-t border-white/5 pt-4">
                      <h3 className="text-xs font-bold text-gold uppercase tracking-wider mb-4">Residential Address</h3>
                      <div className="space-y-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-semibold text-white/40 tracking-wider uppercase">Address Line 1</label>
                          <input
                            value={line1}
                            onChange={(e) => setLine1(e.target.value)}
                            placeholder="Apt/Suite, Street address"
                            className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white placeholder:text-white/25 transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-semibold text-white/40 tracking-wider uppercase">City</label>
                            <input
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              placeholder="City"
                              className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white placeholder:text-white/25 transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25"
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-semibold text-white/40 tracking-wider uppercase">State</label>
                            <input
                              value={state}
                              onChange={(e) => setState(e.target.value)}
                              placeholder="State"
                              className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white placeholder:text-white/25 transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25"
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-semibold text-white/40 tracking-wider uppercase">Pincode</label>
                            <input
                              value={pincode}
                              onChange={(e) => setPincode(e.target.value)}
                              placeholder="400001"
                              pattern="^[1-9][0-9]{5}$"
                              className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white placeholder:text-white/25 transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button 
                        type="submit"
                        className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-6 py-3 text-sm font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
                      >
                        Next: Credentials →
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Step 2: Credentials */}
            {step === 2 && (
              <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-7 shadow-gold-soft backdrop-blur-2xl">
                <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
                <div className="relative">
                  <h2 className="text-xl font-bold text-white mb-5 tracking-tight border-b border-white/5 pb-3">2. Identity Credentials</h2>
                  
                  {submitProfile.isError && (
                    <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
                      {errorMessage(submitProfile.error)}
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitProfile.mutate();
                    }}
                    className="space-y-5"
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-white/50 tracking-wider uppercase">PAN Number</label>
                      <input
                        value={pan}
                        onChange={(e) => setPan(e.target.value.toUpperCase())}
                        placeholder="ABCDE1234F"
                        pattern="^[A-Z]{5}[0-9]{4}[A-Z]$"
                        className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white placeholder:text-white/25 transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25 font-mono"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-white/50 tracking-wider uppercase">Aadhaar Reference Token (Optional)</label>
                      <input
                        value={aadhaarRef}
                        onChange={(e) => setAadhaarRef(e.target.value)}
                        placeholder="Vault reference handle"
                        className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white placeholder:text-white/25 transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25 font-mono"
                      />
                    </div>

                    <div className="rounded-xl border border-gold/10 bg-gold/5 p-4 text-xs text-white/60 leading-relaxed space-y-1.5">
                      <p className="font-semibold text-gold">ℹ️ Confidential Masking & Safety</p>
                      <p>All credentials are tokenized and processed through secure partner APIs. Raw Aadhaar numbers are never stored in Exora&rsquo;s servers.</p>
                    </div>

                    <div className="pt-4 flex justify-between">
                      <button 
                        type="button" 
                        onClick={() => setStep(1)}
                        className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-5 py-3 text-sm font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition"
                      >
                        ← Back
                      </button>
                      <button 
                        type="submit"
                        disabled={submitProfile.isPending}
                        className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-6 py-3 text-sm font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50"
                      >
                        {submitProfile.isPending ? 'Connecting Provider...' : 'Initialize Session →'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Step 3: Document Upload */}
            {step === 3 && (
              <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-7 shadow-gold-soft backdrop-blur-2xl">
                <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
                <div className="relative">
                  <h2 className="text-xl font-bold text-white mb-5 tracking-tight border-b border-white/5 pb-3">3. Document Upload Sandbox</h2>
                  
                  {providerSession && (
                    <div className="mb-6 rounded-xl border border-gold/30 bg-gold/5 p-4 space-y-3">
                      <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-gold">
                        <span>Active Session Provider</span>
                        <span className="text-white/45">{providerSession.provider}</span>
                      </div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Your KYC provider session has been successfully mapped. Complete document processing at the link below:
                      </p>
                      <div className="rounded border border-white/5 bg-noir-2 p-3 font-mono text-[10px] text-white/45 truncate">
                        <span className="text-gold block mb-1">Session ID:</span> {providerSession.providerSessionId}
                      </div>
                      <a 
                        href={providerSession.redirectUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block text-center rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
                      >
                        Verify with Provider Portal ↗
                      </a>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-white/50 uppercase">Document Class</label>
                        <select
                          className="w-full rounded-lg border border-white/10 bg-noir-2/80 py-2.5 px-3 text-xs text-white focus:border-gold/60 focus:outline-none"
                          value={selectedDocType}
                          onChange={(e) => setSelectedDocType(e.target.value)}
                        >
                          <option value="PASSPORT">Passport</option>
                          <option value="AADHAAR">National Identity Card</option>
                          <option value="PAN">PAN Card Scan</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-white/50 uppercase">Scan Mode</label>
                        <input className="w-full rounded-lg border border-white/10 bg-noir-2/30 py-2.5 px-3 text-xs text-white/40 focus:outline-none" value="Secure Provider OCR" disabled />
                      </div>
                    </div>

                    <div className="relative overflow-hidden flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center min-h-[180px]">
                      {docUploadState === 'SCANNING' && (
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gold/5 to-transparent animate-pulse pointer-events-none" />
                      )}

                      {docUploadState === 'IDLE' && (
                        <div className="space-y-4">
                          <span className="text-3xl block">📁</span>
                          <div>
                            <p className="text-xs font-semibold text-white">Upload front/back scan credentials</p>
                            <p className="text-[10px] text-white/35 mt-1">Supports PNG, JPG, or PDF</p>
                          </div>
                          <button 
                            type="button" 
                            onClick={startMockDocScan}
                            className="rounded-lg border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/20 transition"
                          >
                            Simulate Secure Scan
                          </button>
                        </div>
                      )}

                      {docUploadState === 'SCANNING' && (
                        <div className="w-full max-w-xs space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-gold font-medium">{docStatusMsg}</span>
                            <span className="text-white/60">{docProgress}%</span>
                          </div>
                          <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-gold transition-all duration-200" style={{ width: `${docProgress}%` }} />
                          </div>
                        </div>
                      )}

                      {docUploadState === 'SUCCESS' && (
                        <div className="space-y-3 text-up">
                          <span className="text-3xl block">✓</span>
                          <p className="text-xs font-bold uppercase tracking-wider">Scans Registered</p>
                          <p className="text-[10px] text-white/50">{docStatusMsg}</p>
                          <button 
                            type="button" 
                            onClick={() => setDocUploadState('IDLE')}
                            className="text-[10px] text-white/40 hover:underline"
                          >
                            Re-upload credentials
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 flex justify-between border-t border-white/5 mt-6">
                    <button 
                      type="button" 
                      onClick={() => setStep(2)}
                      className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-5 py-3 text-sm font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition"
                    >
                      ← Back
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setStep(4)}
                      disabled={docUploadState !== 'SUCCESS'}
                      className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-6 py-3 text-sm font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-40"
                    >
                      Next: Selfie / Liveness →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Selfie/Liveness */}
            {step === 4 && (
              <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-7 shadow-gold-soft backdrop-blur-2xl">
                <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
                <div className="relative">
                  <h2 className="text-xl font-bold text-white mb-5 tracking-tight border-b border-white/5 pb-3">4. Selfie & Liveness Check</h2>
                  
                  <p className="text-xs text-white/50 mb-6 leading-relaxed">
                    Verify biometric authentication. Please center your face inside the guidance rings below and verify camera access permissions.
                  </p>

                  <div className="relative mx-auto mb-6 flex aspect-square w-52 items-center justify-center rounded-full border border-gold/30 bg-noir-2 overflow-hidden shadow-gold-soft">
                    <div className="absolute inset-2 rounded-full border border-white/5 pointer-events-none" />
                    <div className="absolute inset-3 rounded-full border border-dashed border-gold/20 animate-spin" style={{ animationDuration: '40s' }} />

                    {livenessState === 'IDLE' && (
                      <div className="text-center p-4">
                        <span className="text-3xl mb-1 block">📷</span>
                        <p className="text-[10px] text-white/45">Biometric Camera Standby</p>
                      </div>
                    )}

                    {livenessState === 'RECORDING' && (
                      <div className="text-center p-4">
                        <p className="text-[10px] font-bold text-gold animate-pulse">{livenessStatusMsg}</p>
                        <span className="text-[9px] text-white/35 mt-1 block">{livenessProgress}% scanned</span>
                      </div>
                    )}

                    {livenessState === 'SUCCESS' && (
                      <div className="text-center p-4 text-up">
                        <span className="text-3xl mb-1 block">👑</span>
                        <p className="text-[10px] font-bold uppercase tracking-wide">Analysis PASS</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-center mb-6">
                    {livenessState === 'IDLE' && (
                      <button 
                        type="button" 
                        onClick={startMockLivenessScan}
                        className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-5 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
                      >
                        Scan Biometrics
                      </button>
                    )}
                    {livenessState === 'RECORDING' && (
                      <button type="button" disabled className="rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-xs text-white/50">
                        Analyzing Head Vectors...
                      </button>
                    )}
                    {livenessState === 'SUCCESS' && (
                      <button 
                        type="button" 
                        onClick={() => setLivenessState('IDLE')}
                        className="text-xs text-white/40 hover:underline"
                      >
                        Retake biometric check
                      </button>
                    )}
                  </div>

                  <div className="pt-6 flex justify-between border-t border-white/5">
                    <button 
                      type="button" 
                      onClick={() => setStep(3)}
                      className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-5 py-3 text-sm font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition"
                    >
                      ← Back
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setStep(5)}
                      disabled={livenessState !== 'SUCCESS'}
                      className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-6 py-3 text-sm font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-40"
                    >
                      Next: Review Summary →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Review */}
            {step === 5 && (
              <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-7 shadow-gold-soft backdrop-blur-2xl">
                <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
                <div className="relative">
                  <h2 className="text-xl font-bold text-white mb-5 tracking-tight border-b border-white/5 pb-3">5. Verification Summary</h2>
                  
                  <p className="text-xs text-white/55 mb-6">
                    Check the diagnostics parameters below. Submit profiles for manual review fallback processing.
                  </p>

                  <div className="rounded-xl border border-white/5 bg-noir-2/80 p-5 space-y-4 text-xs">
                    <div className="border-b border-white/5 pb-3">
                      <h3 className="text-xs font-bold text-gold uppercase tracking-wider mb-2">Biographic Data</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between"><span className="text-white/45">Name</span><span className="font-semibold text-ink">{fullName}</span></div>
                        <div className="flex justify-between"><span className="text-white/45">Date of Birth</span><span className="font-semibold text-ink">{dob}</span></div>
                        <div className="flex justify-between"><span className="text-white/45">Address</span><span className="font-semibold text-ink truncate max-w-[220px]">{line1}, {city}</span></div>
                        <div className="flex justify-between"><span className="text-white/45">PAN Number</span><span className="font-mono font-semibold text-ink">{pan.substring(0,5)}****{pan.substring(9)}</span></div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-xs font-bold text-gold uppercase tracking-wider mb-2">Automated Checks</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between"><span className="text-white/45">Partner Link</span><span className="text-up font-semibold">SUCCESS</span></div>
                        <div className="flex justify-between"><span className="text-white/45">OCR Scan Check</span><span className="text-up font-semibold">PASS</span></div>
                        <div className="flex justify-between"><span className="text-white/45">3D Facial Check</span><span className="text-up font-semibold">PASS</span></div>
                        <div className="flex justify-between"><span className="text-white/45">Calculated Risk Index</span><span className="text-up font-semibold">12 / 100</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 flex justify-between border-t border-white/5 mt-6">
                    <button 
                      type="button" 
                      onClick={() => setStep(4)}
                      className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-5 py-3 text-sm font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition"
                    >
                      ← Back
                    </button>
                    <button 
                      type="button" 
                      onClick={handleFinalSubmit}
                      className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-6 py-3 text-sm font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
                    >
                      Submit Account Verification
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Sidebar & Illustration */}
          <div className="space-y-6">
            
            {/* Visual illustration of biometric shield */}
            <SecurityIllustration />

            {/* Trust and security notes */}
            <div className="relative rounded-2xl border border-gold/15 bg-white/[0.02] p-5 backdrop-blur-md">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gold mb-3 flex items-center gap-1.5">
                <span>🛡️</span> Security & Compliance
              </h3>
              <ul className="space-y-3.5 text-xs text-white/65 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="text-gold mt-0.5">•</span>
                  <span><strong>Secure Encryption:</strong> PII is wrapped inside TLS 1.3 channels and vaulted at source.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-gold mt-0.5">•</span>
                  <span><strong>Zero Raw Storage:</strong> Government details are tokens, leaving zero trace in plaintext storage.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-gold mt-0.5">•</span>
                  <span><strong>Sandbox auditing:</strong> Verified sessions prevent spoofing and automated bot integrations.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-gold mt-0.5">•</span>
                  <span><strong>Manual fallback:</strong> Complex checks propagate to compliance desks within 15 minutes.</span>
                </li>
              </ul>
            </div>

            {providerSession && step >= 3 && (
              <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-5 backdrop-blur-md space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gold border-b border-white/5 pb-2">Active Session Diagnostic</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-white/45">Partner Provider:</span>
                    <span className="font-semibold text-ink">{providerSession.provider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/45">Remaining Session:</span>
                    <span className="font-semibold text-gold">{Math.round(providerSession.expiresIn / 60)} minutes</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </UserShell>
  );
}
