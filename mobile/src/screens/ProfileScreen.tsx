import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, H1, Muted, Row, Screen, StatusBadge } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { config } from '@/config';
import { colors, font, spacing } from '@/theme';
import { fmtDate } from '@/utils/format';

function LinkRow({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable style={styles.linkRow} onPress={onPress}>
      <Text style={styles.linkIcon}>{icon}</Text>
      <Text style={styles.linkLabel}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <Screen>
      <H1>Profile</H1>
      <Card>
        <Row label="Email" value={user?.email ?? '—'} />
        <Row label="Phone" value={user?.phone ?? '—'} />
        <Row label="Account" value={<StatusBadge status={user?.status ?? '—'} />} />
        <Row label="KYC" value={<StatusBadge status={user?.kycStatus ?? 'NOT_STARTED'} />} />
        <Row label="Tier" value={String(user?.kycTier ?? 0)} />
        <Row label="Email verified" value={user?.emailVerifiedAt ? fmtDate(user.emailVerifiedAt) : 'No'} />
        <Row label="Member since" value={fmtDate(user?.createdAt)} />
      </Card>

      <Card style={{ gap: 0 }}>
        <LinkRow label="KYC status" icon="🪪" onPress={() => router.push('/kyc')} />
        <LinkRow label="Notifications" icon="🔔" onPress={() => router.push('/notifications')} />
        <LinkRow label="Transactions" icon="🧾" onPress={() => router.push('/transactions')} />
        <LinkRow label="Open orders" icon="📈" onPress={() => router.push('/orders')} />
        <LinkRow label="Security & logout" icon="🔐" onPress={() => router.push('/security')} />
      </Card>

      <View style={{ alignItems: 'center', marginTop: spacing.md }}>
        <Muted>{config.appName} · {config.isStaging ? 'Staging build' : 'Production'}</Muted>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  linkIcon: { fontSize: 18, width: 30 },
  linkLabel: { color: colors.ink, fontSize: font.md, flex: 1, fontWeight: '600' },
  chevron: { color: colors.muted, fontSize: 22 },
});
