import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AsyncBoundary, Button, Screen } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/store/auth';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import { fmtDate } from '@/utils/format';
import type { UserSession } from '@/types/api';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function SecurityOptionRow({ icon, title, sub }: { icon: IoniconName; title: string; sub: string }) {
  return (
    <View style={styles.secRow}>
      <View style={styles.secIcon}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.secTitle}>{title}</Text>
        <Text style={styles.secSub}>{sub}</Text>
      </View>
      <View style={styles.comingSoonBadge}>
        <Text style={styles.comingSoonText}>Coming soon</Text>
      </View>
    </View>
  );
}

export default function SecurityScreen() {
  const router = useRouter();
  const { logout } = useAuth();

  const sessions = useApi<UserSession[]>(() => userApi.listSessions().then((r) => r.data.items), []);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const changePassword = async () => {
    setPwMsg(null);
    setPwErr(null);
    setPwBusy(true);
    try {
      await userApi.changePassword({ currentPassword: current, newPassword: next });
      setPwMsg('Password changed successfully.');
      setCurrent('');
      setNext('');
    } catch (e) {
      setPwErr(actionErrorMessage(e));
    } finally {
      setPwBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await userApi.revokeSession(id);
      sessions.reload();
    } catch {
      /* non-fatal */
    }
  };

  const doLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <Screen refreshing={sessions.loading} onRefresh={sessions.reload} contentStyle={{ gap: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        
        {/* Shield Glow Header */}
        <View style={styles.shieldHeader}>
          <View style={styles.goldGlowRing}>
            <Ionicons name="shield-checkmark" size={48} color={colors.brand} />
          </View>
          <Text style={styles.heroTitle}>Account Security</Text>
          <Text style={styles.heroSub}>
            Protect your account with strong credentials and device controls.
          </Text>
        </View>

        {/* Protection list */}
        <Text style={styles.sectionHeading}>Advanced Protection</Text>
        <GlassCard padded style={{ gap: spacing.sm }}>
          <SecurityOptionRow
            icon="key-outline"
            title="Two-Factor Authentication"
            sub="Authenticator-based 2FA on sign-in."
          />
          <View style={styles.separator} />
          <SecurityOptionRow
            icon="finger-print-outline"
            title="Biometric Login"
            sub="Face/fingerprint unlock on this device."
          />
        </GlassCard>

        {/* Change password ticket */}
        <Text style={styles.sectionHeading}>Change Password</Text>
        <GlassCard padded style={{ gap: spacing.md }}>
          <View style={styles.stackedInputBox}>
            <Text style={styles.stackedLabel}>Current Password</Text>
            <TextInput
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.muted2}
              style={styles.stackedInput}
            />
          </View>

          <View style={styles.stackedInputBox}>
            <Text style={styles.stackedLabel}>New Password</Text>
            <TextInput
              value={next}
              onChangeText={setNext}
              secureTextEntry
              placeholder="At least 8 characters"
              placeholderTextColor={colors.muted2}
              style={styles.stackedInput}
            />
          </View>

          {pwErr ? <Text style={styles.errorText}>{pwErr}</Text> : null}
          {pwMsg ? <Text style={styles.successText}>{pwMsg}</Text> : null}

          <Pressable
            disabled={pwBusy || !current || next.length < 8}
            onPress={changePassword}
            style={[
              styles.submitBtn,
              (!current || next.length < 8) && styles.submitBtnDisabled,
            ]}
          >
            <Text style={styles.submitBtnText}>
              {pwBusy ? 'Updating...' : 'Update Password'}
            </Text>
          </Pressable>
        </GlassCard>

        {/* Active sessions list */}
        <Text style={styles.sectionHeading}>Active Sessions</Text>
        <AsyncBoundary
          loading={sessions.loading}
          error={sessions.error}
          data={sessions.data}
          onRetry={sessions.reload}
        >
          {(items) =>
            items.length === 0 ? (
              <GlassCard padded style={styles.emptySessionsCard}>
                <Text style={styles.emptyText}>No active sessions found.</Text>
              </GlassCard>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {items.map((s) => (
                  <GlassCard key={s.id} padded style={styles.sessionCard}>
                    <View style={styles.sessionHeaderRow}>
                      <View style={styles.statusDotRow}>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: s.current ? colors.brand : colors.muted },
                          ]}
                        />
                        <Text style={styles.sessionStatusText}>
                          {s.current ? 'Current Session' : 'Active Session'}
                        </Text>
                      </View>
                      <Text style={styles.ipText}>{s.ip ?? 'Unknown IP'}</Text>
                    </View>

                    <View style={styles.sessionMetaRow}>
                      <View style={styles.metaCol}>
                        <Text style={styles.metaLabel}>Started</Text>
                        <Text style={styles.metaVal}>{fmtDate(s.createdAt)}</Text>
                      </View>
                      <View style={styles.metaCol}>
                        <Text style={styles.metaLabel}>Expires</Text>
                        <Text style={styles.metaVal}>{fmtDate(s.expiresAt)}</Text>
                      </View>
                    </View>

                    {!s.current && (
                      <View style={{ marginTop: spacing.sm }}>
                        <Button title="Revoke Session" variant="secondary" onPress={() => revoke(s.id)} />
                      </View>
                    )}
                  </GlassCard>
                ))}
              </View>
            )
          }
        </AsyncBoundary>

        {/* Log out CTA */}
        <Pressable onPress={doLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={16} color={colors.down} />
          <Text style={styles.logoutBtnText}>Log Out of Account</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  shieldHeader: { alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md, paddingHorizontal: spacing.md },
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
  heroTitle: { color: '#fff', fontSize: font.xl, fontWeight: '900', textAlign: 'center' },
  heroSub: { color: colors.muted, fontSize: font.xs, textAlign: 'center', lineHeight: 16 },

  sectionHeading: { color: colors.ink, fontSize: font.sm, fontWeight: '800', marginTop: spacing.lg, marginBottom: spacing.sm },

  // Protection row styles
  secRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  secIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  secTitle: { color: colors.ink, fontSize: font.sm, fontWeight: '700' },
  secSub: { color: colors.muted, fontSize: font.xs },
  comingSoonBadge: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  comingSoonText: { color: colors.muted2, fontSize: font.xs - 3, fontWeight: '700', textTransform: 'uppercase' },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.03)', marginVertical: spacing.xs },

  // Form styles
  stackedInputBox: {
    backgroundColor: '#07070B',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    height: 56,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    gap: 2,
  },
  stackedLabel: { color: colors.muted2, fontSize: font.xs - 3, fontWeight: '700', textTransform: 'uppercase' },
  stackedInput: { color: '#fff', fontSize: font.sm, height: 24, padding: 0 },

  errorText: { color: colors.down, fontSize: font.xs, fontWeight: '600', textAlign: 'center' },
  successText: { color: colors.up, fontSize: font.xs, fontWeight: '600', textAlign: 'center' },
  submitBtn: { height: 44, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#1A1206', fontSize: font.sm, fontWeight: '800' },

  // Active Sessions
  emptySessionsCard: { alignItems: 'center', paddingVertical: spacing.md },
  emptyText: { color: colors.muted, fontSize: font.xs },
  sessionCard: { gap: spacing.md },
  sessionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)', paddingBottom: 6 },
  statusDotRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  sessionStatusText: { color: '#fff', fontSize: font.xs, fontWeight: '700' },
  ipText: { color: colors.muted2, fontSize: font.xs, fontFamily: 'monospace' },

  sessionMetaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaCol: { gap: 2 },
  metaLabel: { color: colors.muted2, fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  metaVal: { color: colors.muted, fontSize: 10, fontWeight: '600' },

  // Logout
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: 'rgba(234,57,67,0.2)', borderRadius: radius.md, height: 44, backgroundColor: 'rgba(234,57,67,0.02)', marginTop: spacing.xl },
  logoutBtnText: { color: colors.down, fontSize: font.sm, fontWeight: '800' },
});
