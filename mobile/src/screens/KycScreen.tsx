import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AsyncBoundary, Row, Screen, StatusBadge } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { colors, font, radius, spacing } from '@/theme';
import type { KycProfile, UserCompliance } from '@/types/api';

interface KycData {
  kyc: KycProfile | null;
  compliance: UserCompliance | null;
}

export default function KycScreen() {
  const { data, loading, error, reload } = useApi<KycData>(async () => {
    const [kyc, compliance] = await Promise.all([
      userApi.getKyc().then((r) => r.data).catch(() => null),
      userApi.complianceStatus().then((r) => r.data).catch(() => null),
    ]);
    return { kyc, compliance };
  }, []);

  const getKycStatusText = (status: string | undefined) => {
    if (!status) return 'KYC not submitted';
    switch (status.toUpperCase()) {
      case 'APPROVED':
        return 'KYC approved';
      case 'PENDING':
      case 'UNDER_REVIEW':
        return 'KYC under review';
      case 'REJECTED':
        return 'KYC rejected';
      default:
        return 'KYC not submitted';
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={reload} contentStyle={{ gap: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        
        {/* Verification Header */}
        <View style={styles.header}>
          <View style={styles.goldGlowRing}>
            <Ionicons name="finger-print-outline" size={48} color={colors.brand} />
          </View>
          <Text style={styles.title}>Identity Verification</Text>
          <Text style={styles.subtitle}>
            Compliance-ready workflows matching regional INR digital asset standards.
          </Text>
        </View>

        <AsyncBoundary loading={loading} error={error} data={data} onRetry={reload}>
          {({ kyc, compliance }) => {
            const statusLabel = getKycStatusText(kyc?.status);
            const isApproved = kyc?.status?.toUpperCase() === 'APPROVED';

            return (
              <View style={{ gap: spacing.lg }}>
                {/* KYC Details Card */}
                <Text style={styles.sectionHeading}>Verification Profile</Text>
                <GlassCard padded style={{ gap: spacing.xs }}>
                  <Row label="Verification Status" value={
                    <View style={styles.statusRow}>
                      <View style={[styles.statusDot, { backgroundColor: isApproved ? colors.up : colors.brand }]} />
                      <Text style={[styles.statusText, { color: isApproved ? colors.up : colors.brand }]}>
                        {statusLabel}
                      </Text>
                    </View>
                  } />
                  <Row label="Verification Level" value={`Tier ${kyc?.tier ?? 0}`} />
                  {kyc?.fullName ? <Row label="Legal Full Name" value={kyc.fullName} /> : null}
                  {kyc?.panMasked ? <Row label="PAN Number" value={kyc.panMasked} /> : null}
                  {kyc?.livenessStatus ? (
                    <Row label="Liveness Check" value={<StatusBadge status={kyc.livenessStatus} />} />
                  ) : null}
                  {kyc?.rejectedReason ? (
                    <View style={styles.rejectionCard}>
                      <Ionicons name="alert-circle-outline" size={14} color={colors.down} />
                      <Text style={styles.rejectionText}>Reason: {kyc.rejectedReason}</Text>
                    </View>
                  ) : null}
                </GlassCard>

                {/* Compliance Screening Card */}
                {compliance ? (
                  <View style={{ gap: spacing.sm }}>
                    <Text style={styles.sectionHeading}>Security Checkpoints</Text>
                    <GlassCard padded style={{ gap: spacing.xs }}>
                      <Row label="Profile Status" value={<StatusBadge status={compliance.status} />} />
                      <Row label="Risk Profile" value={<StatusBadge status={compliance.riskLevel} />} />
                      <Row label="Screening Status" value={<StatusBadge status={compliance.screeningStatus} />} />
                      <Row label="Sanctions Check" value={<StatusBadge status={compliance.sanctionsStatus} />} />
                      <Row label="PEP Check" value={<StatusBadge status={compliance.pepStatus} />} />
                      <Row label="Adverse Media" value={<StatusBadge status={compliance.adverseMediaStatus} />} />
                    </GlassCard>
                  </View>
                ) : null}

                {/* Info block */}
                <GlassCard padded style={styles.infoCard}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.brand} />
                  <Text style={styles.infoText}>
                    To submit or update full KYC documents, please use the EXORA web application. This screen is read-only.
                  </Text>
                </GlassCard>
              </View>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md, paddingHorizontal: spacing.md },
  goldGlowRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: 'rgba(245,194,66,0.15)',
    backgroundColor: 'rgba(245,194,66,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: font.xl, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: font.xs, textAlign: 'center', lineHeight: 16 },

  sectionHeading: { color: colors.ink, fontSize: font.sm, fontWeight: '800', marginBottom: spacing.xs },

  // Status mapping styles
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: font.sm, fontWeight: '800' },

  rejectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(234,57,67,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(234,57,67,0.1)',
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  rejectionText: { color: colors.down, fontSize: font.xs, fontWeight: '600' },

  // Bottom info card
  infoCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(245,194,66,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(245,194,66,0.1)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  infoText: { color: colors.muted, fontSize: font.xs, lineHeight: 16, flex: 1 },
});
