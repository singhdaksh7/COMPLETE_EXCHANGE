import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Modal, Clipboard, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, StatusBadge } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useAuth } from '@/store/auth';
import { colors, font, spacing, radius } from '@/theme';
import { fmtDate, fmtAmount } from '@/utils/format';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function InfoRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueWrap}>
        {typeof value === 'string' ? (
          <Text style={styles.infoValueText}>{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: IoniconName }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={16} color={colors.brand} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  
  // Real data hooks
  const kycProfile = useApi(() => userApi.getKyc().then(r => r.data).catch(() => null), []);
  const sessions = useApi(() => userApi.listSessions().then(r => r.data.items).catch(() => []), []);
  const walletOverview = useApi(() => userApi.walletOverview().then(r => r.data).catch(() => null), []);

  const [copied, setCopied] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  const userInitials = useMemo(() => {
    if (!user?.email) return 'EX';
    return user.email.slice(0, 2).toUpperCase();
  }, [user?.email]);

  const userName = useMemo(() => {
    if (user?.fullName) return user.fullName;
    if (!user?.email) return 'Exora Member';
    return user.email.split('@')[0];
  }, [user?.fullName, user?.email]);

  const completionPercent = useMemo(() => {
    let pct = 0;
    if (user?.emailVerifiedAt) pct += 25;
    if (user?.phone) pct += 25;
    if (user?.kycStatus === 'APPROVED') pct += 25;
    if (user?.totpEnabled) pct += 25;
    return pct;
  }, [user]);

  const kycNextAction = useMemo(() => {
    const status = user?.kycStatus ?? 'NOT_STARTED';
    switch (status) {
      case 'NOT_STARTED':
        return 'Verify Identity to start trading';
      case 'PENDING':
      case 'IN_REVIEW':
        return 'Identity is under review';
      case 'NEEDS_MORE_INFO':
        return 'Action required: upload documents';
      case 'REJECTED':
        return 'Verification failed. Contact support';
      case 'APPROVED':
        return 'Identity verified';
      default:
        return 'Verify Identity';
    }
  }, [user?.kycStatus]);

  const inrBalance = useMemo(() => {
    const balances = walletOverview.data?.balances ?? [];
    const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');
    return {
      available: inr?.available ?? '0.00',
      locked: inr?.locked ?? '0.00',
      total: inr?.total ?? '0.00',
    };
  }, [walletOverview.data]);

  const handleCopyUid = () => {
    if (user?.id) {
      Clipboard.setString(user.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeSessionsCount = sessions.data?.length ?? 1;
  const lastLogin = useMemo(() => {
    const firstSession = sessions.data?.[0] as any;
    if (firstSession?.lastSeenAt) {
      return fmtDate(firstSession.lastSeenAt);
    }
    return user?.createdAt ? fmtDate(user.createdAt) : 'Just now';
  }, [sessions.data, user?.createdAt]);
  
  const locationCaptured = useMemo(() => {
    const firstSession = sessions.data?.[0] as any;
    return !!(firstSession?.location);
  }, [sessions.data]);

  return (
    <Screen refreshing={kycProfile.loading || sessions.loading || walletOverview.loading} onRefresh={() => { kycProfile.reload(); sessions.reload(); walletOverview.reload(); }} contentStyle={{ gap: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        
        {/* Header Branding Row */}
        <View style={styles.brandingHeader}>
          <Image 
            source={require('../../assets/exora-logo.png')} 
            style={{ width: 24, height: 24 }} 
            resizeMode="contain" 
          />
          <Text style={styles.brandingHeaderTitle}>EXORA</Text>
        </View>

        {/* User Profile Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.goldGlowRing}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{userInitials}</Text>
            </View>
          </View>
          <Text style={styles.userName}>{userName}</Text>
          <Text style={styles.userEmail}>{user?.email ?? '—'}</Text>
          
          {/* UID Box with Copy Button */}
          {user?.id ? (
            <Pressable style={styles.uidContainer} onPress={handleCopyUid}>
              <Text style={styles.uidText} numberOfLines={1}>UID: {user.id}</Text>
              <Ionicons 
                name={copied ? "checkmark-circle" : "copy-outline"} 
                size={14} 
                color={copied ? colors.up : colors.brand} 
                style={{ marginLeft: 4 }}
              />
              {copied && <Text style={styles.copiedFeedback}>Copied</Text>}
            </Pressable>
          ) : null}
        </View>

        {/* Profile Completion Card */}
        <GlassCard padded style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Profile Setup Completion</Text>
            <Text style={styles.progressPercent}>{completionPercent}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${completionPercent}%` }]} />
          </View>
          <Text style={styles.progressHint}>
            {user?.kycStatus !== 'APPROVED' ? kycNextAction : 'Your profile security and identity are fully verified.'}
          </Text>
        </GlassCard>

        {/* INR Wallet Summary */}
        <SectionHeader title="INR Wallet Balance" icon="wallet-outline" />
        <GlassCard padded style={{ gap: spacing.sm }}>
          <View style={styles.walletHeader}>
            <Text style={styles.walletTitle}>Total INR Balance</Text>
            <Text style={styles.walletTotal}>₹{fmtAmount(inrBalance.total)}</Text>
          </View>
          <View style={styles.walletDetailsRow}>
            <View style={styles.walletDetailCol}>
              <Text style={styles.walletDetailLabel}>Available</Text>
              <Text style={[styles.walletDetailVal, { color: colors.up }]}>₹{fmtAmount(inrBalance.available)}</Text>
            </View>
            <View style={styles.walletDetailCol}>
              <Text style={styles.walletDetailLabel}>Locked</Text>
              <Text style={styles.walletDetailVal}>₹{fmtAmount(inrBalance.locked)}</Text>
            </View>
          </View>
        </GlassCard>

        {/* Account Details Block */}
        <SectionHeader title="Account Information" icon="person-circle-outline" />
        <GlassCard padded style={{ gap: spacing.xs }}>
          <InfoRow label="Email Address" value={user?.email ?? '—'} />
          <InfoRow label="Mobile Phone" value={user?.phone ?? 'Not provided'} />
          <InfoRow label="Account Status" value={<StatusBadge status={user?.status ?? 'INACTIVE'} />} />
          <InfoRow label="KYC Status" value={<StatusBadge status={user?.kycStatus ?? 'NOT_STARTED'} />} />
          <InfoRow label="KYC Tier Level" value={`Tier ${user?.kycTier ?? 0}`} />
          <InfoRow label="Date of Birth" value="Not provided" />
          <InfoRow label="Address / City" value="Not provided" />
          <InfoRow label="Member Since" value={user?.createdAt ? fmtDate(user.createdAt) : '—'} />
        </GlassCard>

        {/* Trading Summary */}
        <SectionHeader title="Trading Performance" icon="analytics-outline" />
        <GlassCard padded style={{ gap: spacing.xs }}>
          <InfoRow label="Total Trades" value="0" />
          <InfoRow label="Total Volume" value="₹0" />
          <InfoRow label="PnL Today" value="₹0 (0.00%)" />
          <InfoRow label="Win Rate" value="0%" />
        </GlassCard>

        {/* Security Summary */}
        <SectionHeader title="Security & Sessions" icon="shield-checkmark-outline" />
        <GlassCard padded style={{ gap: spacing.xs }}>
          <InfoRow label="2FA / TOTP" value={user?.totpEnabled ? 'Enabled' : 'Disabled'} />
          <InfoRow label="Active Sessions" value={`${activeSessionsCount} active device(s)`} />
          <InfoRow label="Last Active At" value={lastLogin} />
          <InfoRow label="Login Geolocation" value={locationCaptured ? 'Captured (Consented)' : 'Not captured'} />
        </GlassCard>

        {/* Settings & Actions */}
        <SectionHeader title="Preferences & Actions" icon="settings-outline" />
        <GlassCard padded style={styles.actionMenu}>
          <Pressable style={styles.actionItem} onPress={() => setShowEditModal(true)}>
            <Ionicons name="create-outline" size={18} color={colors.brand} />
            <Text style={styles.actionLabel}>Edit profile details</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.muted2} />
          </Pressable>
          
          <View style={styles.separator} />
          
          <Pressable style={styles.actionItem} onPress={() => setShowSupportModal(true)}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand} />
            <Text style={styles.actionLabel}>Support & helpdesk</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.muted2} />
          </Pressable>

          <View style={styles.separator} />

          <Pressable style={styles.actionItem} onPress={() => router.push('/security')}>
            <Ionicons name="key-outline" size={18} color={colors.brand} />
            <Text style={styles.actionLabel}>Security credentials</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.muted2} />
          </Pressable>

          <View style={styles.separator} />

          <Pressable style={styles.actionItem} onPress={logout}>
            <Ionicons name="log-out-outline" size={18} color={colors.down} />
            <Text style={[styles.actionLabel, { color: colors.down }]}>Sign out of account</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.muted2} />
          </Pressable>
        </GlassCard>

        {/* Bottom Platform Mode Badge */}
        <View style={styles.brandingBlock}>
          <Text style={styles.brandingText}>EXORA Spot • India INR-Only Mode</Text>
        </View>

        {/* Edit Profile Info Restricted Modal */}
        <Modal
          visible={showEditModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowEditModal(false)}
        >
          <View style={styles.modalOverlay}>
            <GlassCard padded style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Ionicons name="alert-circle" size={24} color={colors.brand} />
                <Text style={styles.modalTitle}>Modification Restricted</Text>
              </View>
              <Text style={styles.modalContent}>
                Profile modifications are restricted for security and compliance (AML/PMLA). Please raise a support ticket or contact compliance at support@exorain.com to update your details.
              </Text>
              <Pressable style={styles.modalButton} onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalButtonText}>I Understand</Text>
              </Pressable>
            </GlassCard>
          </View>
        </Modal>

        {/* Support Tickets Placeholder Modal */}
        <Modal
          visible={showSupportModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSupportModal(false)}
        >
          <View style={styles.modalOverlay}>
            <GlassCard padded style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Ionicons name="chatbox-ellipses" size={24} color={colors.brand} />
                <Text style={styles.modalTitle}>Helpdesk Staged Mode</Text>
              </View>
              <Text style={styles.modalContent}>
                EXORA support tickets can be created, updated, and verified through our admin console on the Web dashboard. User support ticket integration on mobile is coming soon.
              </Text>
              <Pressable style={styles.modalButton} onPress={() => setShowSupportModal(false)}>
                <Text style={styles.modalButtonText}>Close</Text>
              </Pressable>
            </GlassCard>
          </View>
        </Modal>

      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  brandingHeaderTitle: {
    color: '#fff',
    fontSize: font.md,
    fontWeight: '900',
    letterSpacing: 2,
  },
  avatarSection: { 
    alignItems: 'center', 
    marginVertical: spacing.md, 
    gap: spacing.xs 
  },
  goldGlowRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: 'rgba(245,194,66,0.15)',
    backgroundColor: 'rgba(245,194,66,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0F0F16',
    borderWidth: 1,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { 
    color: colors.brand, 
    fontSize: font.lg, 
    fontWeight: '800' 
  },
  userName: { 
    color: '#fff', 
    fontSize: font.md + 2, 
    fontWeight: '900', 
    textTransform: 'capitalize' 
  },
  userEmail: { 
    color: colors.muted, 
    fontSize: font.xs 
  },
  uidContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginTop: 6,
    position: 'relative',
  },
  uidText: {
    color: colors.muted2,
    fontSize: 9,
    fontFamily: 'monospace',
    maxWidth: 160,
  },
  copiedFeedback: {
    position: 'absolute',
    right: -45,
    color: colors.up,
    fontSize: 9,
    fontWeight: 'bold',
  },

  // Progress Card
  progressCard: {
    gap: spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTitle: {
    color: '#fff',
    fontSize: font.xs,
    fontWeight: '700',
  },
  progressPercent: {
    color: colors.brand,
    fontSize: font.xs,
    fontWeight: '800',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.line,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
  },
  progressHint: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },

  // Wallet
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletTitle: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: '700',
  },
  walletTotal: {
    color: '#fff',
    fontSize: font.lg,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  walletDetailsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
    paddingTop: spacing.sm,
    gap: spacing.xl,
  },
  walletDetailCol: {
    flex: 1,
    gap: 2,
  },
  walletDetailLabel: {
    color: colors.muted2,
    fontSize: 9,
    fontWeight: '600',
  },
  walletDetailVal: {
    color: '#fff',
    fontSize: font.sm,
    fontWeight: '700',
    fontFamily: 'monospace',
  },

  // Section Headers
  sectionHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    marginTop: spacing.lg, 
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs
  },
  sectionTitle: { 
    color: colors.ink, 
    fontSize: font.xs, 
    fontWeight: '800', 
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },

  // Info Row
  infoRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.02)',
  },
  infoLabel: { 
    color: colors.muted, 
    fontSize: font.sm, 
    fontWeight: '500' 
  },
  infoValueWrap: { 
    alignItems: 'flex-end',
  },
  infoValueText: { 
    color: '#fff', 
    fontSize: font.sm, 
    fontWeight: '700' 
  },

  // Action Menu
  actionMenu: {
    gap: 0,
    paddingVertical: 2,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  actionLabel: {
    color: colors.ink,
    fontSize: font.sm,
    fontWeight: '700',
    flex: 1,
    marginLeft: spacing.md,
  },
  separator: { 
    height: 1, 
    backgroundColor: 'rgba(255,255,255,0.03)' 
  },

  brandingBlock: { 
    alignItems: 'center', 
    marginTop: spacing.xl, 
    marginBottom: spacing.md 
  },
  brandingText: { 
    color: colors.muted2, 
    fontSize: 9, 
    fontWeight: '700', 
    textTransform: 'uppercase' 
  },

  // Modal styling
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.glassBorderGold,
    shadowColor: colors.brand,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    color: '#fff',
    fontSize: font.md,
    fontWeight: '800',
  },
  modalContent: {
    color: colors.muted,
    fontSize: font.sm,
    lineHeight: 20,
  },
  modalButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  modalButtonText: {
    color: colors.bg,
    fontSize: font.sm,
    fontWeight: '800',
  },
});
