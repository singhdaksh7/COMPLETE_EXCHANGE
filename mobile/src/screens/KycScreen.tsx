import React from 'react';
import { AsyncBoundary, Card, H2, Muted, Row, Screen, StatusBadge } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import type { KycProfile, UserCompliance } from '@/types/api';

interface KycData {
  kyc: KycProfile | null;
  compliance: UserCompliance | null;
}

/**
 * READ-ONLY KYC/compliance status for the user. The mobile app intentionally has
 * NO compliance-officer actions (review/approve/screening) — those live only in
 * the separate web admin panel. Full enhanced-KYC submission also stays on web.
 */
export default function KycScreen() {
  const { data, loading, error, reload } = useApi<KycData>(async () => {
    const [kyc, compliance] = await Promise.all([
      userApi.getKyc().then((r) => r.data).catch(() => null),
      userApi.complianceStatus().then((r) => r.data).catch(() => null),
    ]);
    return { kyc, compliance };
  }, []);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <AsyncBoundary loading={loading} error={error} data={data} onRetry={reload}>
        {({ kyc, compliance }) => (
          <>
            <Card>
              <Row label="KYC status" value={<StatusBadge status={kyc?.status ?? 'NOT_STARTED'} />} />
              <Row label="Tier" value={String(kyc?.tier ?? 0)} />
              {kyc?.fullName ? <Row label="Name" value={kyc.fullName} /> : null}
              {kyc?.panMasked ? <Row label="PAN" value={kyc.panMasked} /> : null}
              {kyc?.livenessStatus ? <Row label="Liveness" value={<StatusBadge status={kyc.livenessStatus} />} /> : null}
              {kyc?.rejectedReason ? <Muted>Reason: {kyc.rejectedReason}</Muted> : null}
            </Card>

            {compliance ? (
              <>
                <H2>Compliance</H2>
                <Card>
                  <Row label="Profile status" value={<StatusBadge status={compliance.status} />} />
                  <Row label="Risk level" value={<StatusBadge status={compliance.riskLevel} />} />
                  <Row label="Screening" value={<StatusBadge status={compliance.screeningStatus} />} />
                  <Row label="Sanctions" value={<StatusBadge status={compliance.sanctionsStatus} />} />
                  <Row label="PEP" value={<StatusBadge status={compliance.pepStatus} />} />
                  <Row label="Adverse media" value={<StatusBadge status={compliance.adverseMediaStatus} />} />
                  {compliance.providerMode === 'mock' ? <Muted>Screening values are mock in staging.</Muted> : null}
                </Card>
              </>
            ) : null}

            <Muted>
              To submit or update full KYC documents, use the EXORA web app. This screen is read-only.
            </Muted>
          </>
        )}
      </AsyncBoundary>
    </Screen>
  );
}
