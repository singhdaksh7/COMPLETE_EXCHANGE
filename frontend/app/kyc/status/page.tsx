'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { Card, Alert, Button, Row, StatusBadge } from '@/components/ui';

export default function KycStatusPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  const router = useRouter();

  // Fetch KYC Profile
  const q = useQuery({
    queryKey: ['kyc'],
    queryFn: () => userApi.getKyc(),
    enabled: ready,
  });

  // Fetch documents list
  const docs = useQuery({
    queryKey: ['kyc-docs'],
    queryFn: () => userApi.listDocuments(),
    enabled: ready,
  });

  // Refresh KYC profile mutation (POST /kyc/refresh)
  const refreshMutation = useMutation({
    mutationFn: () => userApi.refreshKyc(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kyc'] });
      qc.invalidateQueries({ queryKey: ['kyc-docs'] });
    },
  });

  if (!ready) return null;
  const k = q.data?.data;

  // Check statuses
  const isRejected = k?.status === 'REJECTED';
  const isApproved = k?.status === 'APPROVED';
  const isPending =
    k?.status === 'PENDING' ||
    k?.status === 'IN_REVIEW' ||
    k?.status === 'MANUAL_REVIEW';

  // Helper to get helper badges for individual step statuses
  const getSubStatusBadge = (val?: string | null) => {
    if (!val) return <StatusBadge status="UNAVAILABLE" />;
    return <StatusBadge status={val} />;
  };

  return (
    <>
      <UserNav />
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-6 flex items-center justify-between border-b border-line pb-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">KYC Verification Status</h1>
            <p className="text-xs text-muted mt-1">
              Verify your identity to unlock advanced trading capabilities.
            </p>
          </div>
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={q.isLoading || refreshMutation.isPending}
            variant="secondary"
          >
            {refreshMutation.isPending ? 'Syncing...' : 'Force Refresh Status'}
          </Button>
        </div>

        {q.isLoading && <p className="text-sm text-gray-500">Loading your profile details...</p>}
        {q.isError && <div className="mb-4"><Alert>{errorMessage(q.error)}</Alert></div>}
        {refreshMutation.isError && (
          <div className="mb-4">
            <Alert>{errorMessage(refreshMutation.error)}</Alert>
          </div>
        )}

        {k && (
          <div className="space-y-6">
            
            {/* Status Summary Card */}
            <Card className={isApproved ? 'border-up/30 bg-panel' : isRejected ? 'border-down/30 bg-panel' : 'border-line bg-panel'}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold tracking-wider uppercase text-muted">Verification Overview</span>
                <StatusBadge status={k.status} />
              </div>
              
              <div className="space-y-1">
                <Row label="Verification Status" value={<StatusBadge status={k.status} />} />
                <Row label="Current Account Tier" value={`Tier ${k.tier}`} />
                <Row label="Full Name" value={k.fullName ?? '—'} />
                
                {/* Provider info */}
                {k.provider && <Row label="KYC Provider" value={k.provider} />}
                
                {/* Risk score */}
                {k.riskScore !== undefined && k.riskScore !== null && (
                  <Row 
                    label="Provider Risk Assessment" 
                    value={
                      <span className={`font-semibold ${k.riskScore > 50 ? 'text-down' : k.riskScore > 25 ? 'text-brand' : 'text-up'}`}>
                        {k.riskScore} / 100 ({k.riskScore > 50 ? 'High Risk' : k.riskScore > 25 ? 'Medium Risk' : 'Low Risk'})
                      </span>
                    }
                  />
                )}

                {k.reviewedAt && (
                  <Row
                    label="Last Checked / Reviewed"
                    value={new Date(k.reviewedAt).toLocaleString()}
                  />
                )}
              </div>

              {/* Rejection alert */}
              {isRejected && (
                <div className="mt-4 rounded-lg bg-down/10 border border-down/30 p-3">
                  <h4 className="text-sm font-bold text-down mb-1">Reason for Rejection</h4>
                  <p className="text-xs text-ink">{k.rejectedReason ?? 'No reason specified. Please check details and try again.'}</p>
                </div>
              )}

              {/* Pending banner */}
              {isPending && (
                <div className="mt-4 rounded-lg bg-brand/10 border border-brand/30 p-3 text-xs text-muted leading-relaxed">
                  <p className="font-semibold text-brand mb-1">⏳ Verification is Under Review</p>
                  Our compliance providers and manual auditing desks are currently analyzing your submitted files and selfie structures. This usually takes from 5 minutes to 2 hours.
                </div>
              )}

              {/* Action CTAs */}
              {isRejected && (
                <div className="mt-6 flex justify-end">
                  <Button 
                    variant="primary" 
                    className="w-full sm:w-auto"
                    onClick={() => router.push('/kyc/submit')}
                  >
                    Retry Verification Flow
                  </Button>
                </div>
              )}
            </Card>

            {/* Verification Steps Diagnostics Checklist */}
            <Card>
              <h2 className="mb-4 text-sm font-semibold tracking-wider uppercase text-muted">Granular Verification Checks</h2>
              <div className="divide-y divide-line text-sm">
                
                {/* Identity identifiers */}
                <div className="py-3 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-ink block">PAN Card Verification</span>
                    <span className="text-xs text-muted">{k.panMasked ?? 'Not checked'}</span>
                  </div>
                  <div>{getSubStatusBadge(k.panMasked ? 'PASS' : 'PENDING')}</div>
                </div>

                <div className="py-3 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-ink block">Aadhaar Card Verification</span>
                    <span className="text-xs text-muted">{k.aadhaarMasked ?? 'Not checked'}</span>
                  </div>
                  <div>{getSubStatusBadge(k.aadhaarMasked ? 'PASS' : 'PENDING')}</div>
                </div>

                {/* Document verification status */}
                <div className="py-3 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-ink block">Document Integrity & OCR Check</span>
                    <span className="text-xs text-muted">Facial photo match and watermarks check</span>
                  </div>
                  <div>{getSubStatusBadge(k.documentStatus)}</div>
                </div>

                {/* Liveness check */}
                <div className="py-3 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-ink block">Selfie / Biometric Liveness Check</span>
                    <span className="text-xs text-muted">3D map comparison and spoofing checks</span>
                  </div>
                  <div>{getSubStatusBadge(k.livenessStatus)}</div>
                </div>
              </div>
            </Card>

            {/* Document Log table (existing logs compatibility) */}
            {docs.data && docs.data.data.items.length > 0 && (
              <Card>
                <h2 className="mb-3 text-sm font-semibold tracking-wider uppercase text-muted">Uploaded Documents Log</h2>
                <ul className="text-xs space-y-2">
                  {docs.data.data.items.map((d) => (
                    <li
                      key={d.id}
                      className="flex justify-between border-b border-line py-2 last:border-0"
                    >
                      <span className="text-ink font-medium">{d.docType}</span>
                      <div className="flex gap-4 items-center">
                        <span className="text-muted-2">Registered</span>
                        <StatusBadge status={d.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

          </div>
        )}
      </main>
    </>
  );
}
