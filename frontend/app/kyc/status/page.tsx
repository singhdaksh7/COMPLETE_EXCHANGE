'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { StatusBadge } from '@/components/ui';

function StatusRing({ status }: { status: string }) {
  let percentage = 0;
  let color = 'stroke-white/10';
  let label = 'Unknown';
  let glow = 'shadow-none';

  if (status === 'APPROVED') {
    percentage = 100;
    color = 'stroke-up';
    label = 'Verified';
    glow = 'shadow-[0_0_25px_rgba(14,203,129,0.25)]';
  } else if (status === 'PENDING' || status === 'IN_REVIEW' || status === 'MANUAL_REVIEW') {
    percentage = 80;
    color = 'stroke-gold';
    label = 'Checking';
    glow = 'shadow-gold-glow';
  } else if (status === 'REJECTED') {
    percentage = 100;
    color = 'stroke-down';
    label = 'Rejected';
    glow = 'shadow-[0_0_25px_rgba(246,70,93,0.25)]';
  } else {
    percentage = 15;
    color = 'stroke-white/20';
    label = 'Not Setup';
  }

  const radius = 50;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div className={`relative flex h-36 w-36 items-center justify-center rounded-full bg-noir-2 border border-white/5 ${glow}`}>
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            className="stroke-white/5"
            strokeWidth={strokeWidth}
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            className={`transition-all duration-1000 ${color}`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="text-center z-10">
          <span className="text-2xl font-black text-white">{percentage}%</span>
          <span className="block text-[9px] font-bold uppercase tracking-widest text-white/40 mt-0.5">{label}</span>
        </div>
      </div>
    </div>
  );
}

export default function KycStatusPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  const router = useRouter();

  const q = useQuery({
    queryKey: ['kyc'],
    queryFn: () => userApi.getKyc(),
    enabled: ready,
  });

  const docs = useQuery({
    queryKey: ['kyc-docs'],
    queryFn: () => userApi.listDocuments(),
    enabled: ready,
  });

  const refreshMutation = useMutation({
    mutationFn: () => userApi.refreshKyc(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kyc'] });
      qc.invalidateQueries({ queryKey: ['kyc-docs'] });
    },
  });

  if (!ready) return null;
  const k = q.data?.data;

  const isRejected = k?.status === 'REJECTED';
  const isApproved = k?.status === 'APPROVED';
  const isPending =
    k?.status === 'PENDING' ||
    k?.status === 'IN_REVIEW' ||
    k?.status === 'MANUAL_REVIEW';

  const checkStatusLabel = (val?: string | null) => {
    if (!val) return 'PENDING';
    return val;
  };

  return (
    <UserShell className="max-w-[1400px]">
        
        {/* Header Section */}
        <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">
              Identity Status Overview
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Audit automated provider responses and limits tier level parameters.
            </p>
          </div>
          
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={q.isLoading || refreshMutation.isPending}
            className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-5 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50"
          >
            {refreshMutation.isPending ? 'Synchronizing Desk...' : 'Synchronize Status'}
          </button>
        </div>

        {q.isLoading && <p className="text-sm text-white/40">Loading diagnostic details...</p>}
        {q.isError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{errorMessage(q.error)}</div>}
        {refreshMutation.isError && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
            {errorMessage(refreshMutation.error)}
          </div>
        )}

        {k && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Summary and Status ring */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Premium Status Hero Card */}
              <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-6 shadow-gold-soft backdrop-blur-2xl">
                <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
                
                <div className="relative flex flex-col items-center text-center space-y-5">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gold-glow">Diagnostics Ring</h2>
                  
                  <StatusRing status={k.status} />

                  <div className="w-full border-t border-white/5 pt-4 space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-white/45">Verification Status</span><span className="font-semibold text-gold">{k.status}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-white/45">Account Tier Level</span><span className="font-semibold text-gold">Tier {k.tier}</span></div>
                    {k.fullName && <div className="flex justify-between text-xs"><span className="text-white/45">Authorized Name</span><span className="font-semibold text-ink">{k.fullName}</span></div>}
                    {k.provider && <div className="flex justify-between text-xs"><span className="text-white/45">Provider Integration</span><span className="font-semibold text-ink">{k.provider}</span></div>}
                  </div>

                  {isRejected && (
                    <button 
                      onClick={() => router.push('/kyc/submit')}
                      className="w-full rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
                    >
                      Retry Verification Flow
                    </button>
                  )}
                </div>
              </div>

              {/* Premium Risk Score Gauge */}
              {k.riskScore !== undefined && k.riskScore !== null && (
                <div className="relative rounded-2xl border border-gold/15 bg-white/[0.02] p-5 backdrop-blur-md">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gold mb-3">Assessment Index</h3>
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-black font-mono text-ink">{k.riskScore}%</div>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${k.riskScore > 50 ? 'bg-down' : k.riskScore > 25 ? 'bg-brand' : 'bg-up'}`}
                        style={{ width: `${k.riskScore}%` }}
                      />
                    </div>
                  </div>
                  <span className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mt-2">
                    Risk Category: {k.riskScore > 50 ? 'HIGH ASSESSMENT RISK' : k.riskScore > 25 ? 'MEDIUM WARNING INDEX' : 'SECURE COMPLIANT INDEX'}
                  </span>
                </div>
              )}
            </div>

            {/* Right Column: Steps diagnostic and docs logs */}
            <div className="lg:col-span-2 space-y-6">
              
              {isRejected && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
                  <h4 className="text-sm font-bold text-red-400 mb-1 flex items-center gap-1.5">
                    <span>⚠️</span> Verification Rejected
                  </h4>
                  <p className="text-xs text-white/70 leading-relaxed">
                    {k.rejectedReason ?? 'The automated verification engine flag matched spoofing indicators. Please retry with high resolution credentials.'}
                  </p>
                </div>
              )}

              {isPending && (
                <div className="rounded-xl border border-gold/20 bg-gold/5 p-5">
                  <h4 className="text-sm font-bold text-gold mb-1 flex items-center gap-1.5">
                    <span>⏳</span> Session Audit in Progress
                  </h4>
                  <p className="text-xs text-white/70 leading-relaxed">
                    Biometric face scan and document OCR verification is currently propagating. If automatic checks timeout, the file passes to compliance desks for manual override.
                  </p>
                </div>
              )}

              {/* Sleek Diagnostic Checklist Cards */}
              <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6">
                <h3 className="text-sm font-bold text-white mb-4 tracking-tight">Granular Compliance Metrics</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* PAN status check */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">PAN Verification</span>
                      <span className="text-xs font-semibold text-ink mt-0.5 block">{k.panMasked ?? 'Unavailable'}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${k.panMasked ? 'bg-up/10 text-up' : 'bg-white/5 text-white/35'}`}>
                      {k.panMasked ? 'PASS' : 'PENDING'}
                    </span>
                  </div>

                  {/* Aadhaar status check */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">Aadhaar Token</span>
                      <span className="text-xs font-semibold text-ink mt-0.5 block">{k.aadhaarMasked ?? 'Unavailable'}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${k.aadhaarMasked ? 'bg-up/10 text-up' : 'bg-white/5 text-white/35'}`}>
                      {k.aadhaarMasked ? 'PASS' : 'PENDING'}
                    </span>
                  </div>

                  {/* Document integrity check */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">Scan Authenticity</span>
                      <span className="text-xs font-semibold text-ink mt-0.5 block">OCR & layout check</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      checkStatusLabel(k.documentStatus) === 'PASS' 
                        ? 'bg-up/10 text-up' 
                        : checkStatusLabel(k.documentStatus) === 'FAIL' 
                        ? 'bg-down/10 text-down' 
                        : 'bg-white/5 text-white/35'
                    }`}>
                      {checkStatusLabel(k.documentStatus)}
                    </span>
                  </div>

                  {/* Liveness check */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">Liveness Check</span>
                      <span className="text-xs font-semibold text-ink mt-0.5 block">Facial spoof test</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      checkStatusLabel(k.livenessStatus) === 'PASS' 
                        ? 'bg-up/10 text-up' 
                        : checkStatusLabel(k.livenessStatus) === 'FAIL' 
                        ? 'bg-down/10 text-down' 
                        : 'bg-white/5 text-white/35'
                    }`}>
                      {checkStatusLabel(k.livenessStatus)}
                    </span>
                  </div>

                </div>
              </div>

              {/* Uploaded Documents List */}
              {docs.data && docs.data.data.items.length > 0 && (
                <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6">
                  <h3 className="text-sm font-bold text-white mb-4 tracking-tight">Vaulted Document Registers</h3>
                  <div className="space-y-3">
                    {docs.data.data.items.map((d) => (
                      <div key={d.id} className="flex justify-between items-center bg-white/[0.01] border border-white/5 rounded-xl p-3.5 text-xs">
                        <div>
                          <span className="font-semibold text-ink block">{d.docType} Scan</span>
                          <span className="text-[9px] text-white/35 block mt-0.5">Uploaded: {new Date(d.createdAt).toLocaleDateString()}</span>
                        </div>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          d.status === 'APPROVED' ? 'bg-up/15 text-up' : d.status === 'REJECTED' ? 'bg-down/15 text-down' : 'bg-gold/15 text-gold'
                        }`}>
                          {d.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </UserShell>
  );
}
