import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Row, Screen, StatusBadge } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useAuth } from '@/store/auth';
import { colors, font, spacing } from '@/theme';
import { fmtDate } from '@/utils/format';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function SettingLinkRow({ label, icon, onPress }: { label: string; icon: IoniconName; onPress: () => void }) {
  return (
    <Pressable style={styles.linkRow} onPress={onPress}>
      <View style={styles.linkIconBox}>
        <Ionicons name={icon} size={16} color={colors.brand} />
      </View>
      <Text style={styles.linkLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.muted2} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const userInitials = useMemo(() => {
    if (!user?.email) return 'EX';
    return user.email.slice(0, 2).toUpperCase();
  }, [user?.email]);

  const userName = useMemo(() => {
    if (!user?.email) return 'Exora Member';
    return user.email.split('@')[0];
  }, [user?.email]);

  return (
    <Screen contentStyle={{ gap: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        
        {/* User Profile Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.goldGlowRing}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{userInitials}</Text>
            </View>
          </View>
          <Text style={styles.userName}>{userName}</Text>
          <Text style={styles.userEmail}>{user?.email ?? '—'}</Text>
        </View>

        {/* Account Details Block */}
        <Text style={styles.sectionHeading}>Account Information</Text>
        <GlassCard padded style={{ gap: spacing.xs }}>
          <Row label="Email Address" value={user?.email ?? '—'} />
          <Row label="Mobile Phone" value={user?.phone ?? 'Not Linked'} />
          <Row label="Account Status" value={<StatusBadge status={user?.status ?? 'INACTIVE'} />} />
          <Row label="KYC Status" value={<StatusBadge status={user?.kycStatus ?? 'NOT_STARTED'} />} />
          <Row label="KYC Tier level" value={`Tier ${user?.kycTier ?? 0}`} />
          <Row label="Email Verified At" value={user?.emailVerifiedAt ? fmtDate(user.emailVerifiedAt) : 'Unverified'} />
          <Row label="Member Since" value={fmtDate(user?.createdAt)} />
        </GlassCard>

        {/* Menu list links */}
        <Text style={styles.sectionHeading}>Settings & Actions</Text>
        <GlassCard padded style={{ gap: 0, paddingVertical: 4 }}>
          <SettingLinkRow label="KYC verification" icon="card-outline" onPress={() => router.push('/kyc')} />
          <View style={styles.separator} />
          <SettingLinkRow label="Recent Notifications" icon="notifications-outline" onPress={() => router.push('/notifications')} />
          <View style={styles.separator} />
          <SettingLinkRow label="Transactions history" icon="receipt-outline" onPress={() => router.push('/transactions')} />
          <View style={styles.separator} />
          <SettingLinkRow label="Active open orders" icon="trending-up-outline" onPress={() => router.push('/orders')} />
          <View style={styles.separator} />
          <SettingLinkRow label="Security & credentials" icon="shield-checkmark-outline" onPress={() => router.push('/security')} />
        </GlassCard>

        {/* Bottom mode badge */}
        <View style={styles.brandingBlock}>
          <Text style={styles.brandingText}>EXORA Spot • INR-only Mode</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}



const styles = StyleSheet.create({
  avatarSection: { alignItems: 'center', marginVertical: spacing.md, gap: spacing.xs },
  goldGlowRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(245,194,66,0.15)',
    backgroundColor: 'rgba(245,194,66,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0F0F16',
    borderWidth: 1,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.brand, fontSize: font.xl, fontWeight: '800' },
  userName: { color: '#fff', fontSize: font.md + 2, fontWeight: '900', textTransform: 'capitalize' },
  userEmail: { color: colors.muted, fontSize: font.xs },

  sectionHeading: { color: colors.ink, fontSize: font.sm, fontWeight: '800', marginTop: spacing.lg, marginBottom: spacing.sm },

  // Link item row
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.xs },
  linkIconBox: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, marginRight: spacing.md },
  linkLabel: { color: colors.ink, fontSize: font.sm, flex: 1, fontWeight: '700' },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.03)' },

  brandingBlock: { alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.md },
  brandingText: { color: colors.muted2, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
});
