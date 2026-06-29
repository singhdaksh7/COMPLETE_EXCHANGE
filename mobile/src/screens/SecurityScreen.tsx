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
import type { TwoFaSetupData, TwoFaStatusData, UserSession } from '@/types/api';

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

/** One-time reveal of backup codes — never retrievable again. */
function BackupCodesPanel({ codes }: { codes: string[] }) {
  return (
    <View style={styles.backupPanel}>
      <Text style={styles.backupHeading}>SAVE YOUR BACKUP CODES</Text>
      <Text style={styles.backupSub}>
        Each code works once if you lose your authenticator. They will not be shown
        again — store them somewhere safe now.
      </Text>
      <View style={styles.backupGrid}>
        {codes.map((c) => (
          <Text key={c} style={styles.backupCode}>
            {c}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Real authenticator (TOTP) 2FA management. Enrollment shows the secret +
 * otpauth URI for manual entry, confirms with a code, and reveals one-time
 * backup codes. When enabled, supports regenerating backup codes and disabling
 * (password + current code). No fake "enabled" state — reflects backend status.
 */
function TwoFactorSection() {
  const status = useApi<TwoFaStatusData>(() => userApi.get2faStatus().then((r) => r.data), []);

  const [setupData, setSetupData] = useState<TwoFaSetupData | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [revealedCodes, setRevealedCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<'idle' | 'disable' | 'regen'>('idle');
  const [disablePw, setDisablePw] = useState('');
  const [factorCode, setFactorCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const enabled = status.data?.enabled ?? false;
  const remaining = status.data?.backupCodesRemaining ?? 0;

  function resetForms() {
    setSetupData(null);
    setConfirmCode('');
    setMode('idle');
    setDisablePw('');
    setFactorCode('');
    setErr(null);
  }

  const beginSetup = async () => {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await userApi.setup2fa();
      setSetupData(res.data);
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await userApi.confirm2fa(confirmCode.trim());
      setSetupData(null);
      setConfirmCode('');
      setRevealedCodes(res.data.backupCodes);
      setMsg('Two-factor authentication is now enabled.');
      status.reload();
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await userApi.regenerateBackupCodes(factorCode.trim());
      resetForms();
      setRevealedCodes(res.data.backupCodes);
      setMsg('New backup codes generated. Previous codes are now void.');
      status.reload();
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setErr(null);
    setBusy(true);
    try {
      await userApi.disable2fa(disablePw, factorCode.trim());
      resetForms();
      setRevealedCodes(null);
      setMsg('Two-factor authentication has been disabled.');
      status.reload();
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard padded style={{ gap: spacing.md }}>
      <View style={styles.twoFaHeaderRow}>
        <View style={styles.secIcon}>
          <Ionicons name="key-outline" size={18} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.secTitle}>Authenticator App</Text>
          <Text style={styles.secSub}>Code required at sign-in and for withdrawals.</Text>
        </View>
        <View style={[styles.statusPill, enabled ? styles.statusPillOn : styles.statusPillOff]}>
          <Text style={[styles.statusPillText, { color: enabled ? colors.up : colors.muted2 }]}>
            {status.loading ? '…' : enabled ? 'ENABLED' : 'OFF'}
          </Text>
        </View>
      </View>

      {msg ? <Text style={styles.successText}>{msg}</Text> : null}
      {err ? <Text style={styles.errorText}>{err}</Text> : null}

      {revealedCodes && (
        <>
          <BackupCodesPanel codes={revealedCodes} />
          <Pressable style={styles.ghostBtn} onPress={() => setRevealedCodes(null)}>
            <Text style={styles.ghostBtnText}>I&rsquo;ve saved my backup codes</Text>
          </Pressable>
        </>
      )}

      {/* NOT ENABLED — enrollment */}
      {!enabled && !revealedCodes && (
        <>
          {!setupData ? (
            <Pressable
              disabled={busy}
              onPress={beginSetup}
              style={[styles.submitBtn, busy && styles.submitBtnDisabled]}
            >
              <Text style={styles.submitBtnText}>{busy ? 'Starting…' : 'Set up 2FA'}</Text>
            </Pressable>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.secSub}>
                Add this account to your authenticator app (Google Authenticator, Authy,
                1Password), then enter the 6-digit code it shows.
              </Text>
              <Text style={styles.fieldLabel}>Manual entry key</Text>
              <Text selectable style={styles.codeBlock}>
                {setupData.secret}
              </Text>
              <Text style={styles.fieldLabel}>otpauth URI</Text>
              <Text selectable style={styles.codeBlockSmall}>
                {setupData.otpauthUri}
              </Text>
              <View style={styles.stackedInputBox}>
                <Text style={styles.stackedLabel}>6-digit code</Text>
                <TextInput
                  value={confirmCode}
                  onChangeText={setConfirmCode}
                  keyboardType="number-pad"
                  placeholder="123456"
                  placeholderTextColor={colors.muted2}
                  style={styles.stackedInput}
                />
              </View>
              <Pressable
                disabled={busy || confirmCode.trim().length < 6}
                onPress={confirmSetup}
                style={[
                  styles.submitBtn,
                  (busy || confirmCode.trim().length < 6) && styles.submitBtnDisabled,
                ]}
              >
                <Text style={styles.submitBtnText}>{busy ? 'Verifying…' : 'Confirm & enable'}</Text>
              </Pressable>
              <Pressable style={styles.ghostBtn} onPress={resetForms}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* ENABLED — manage */}
      {enabled && (
        <View style={{ gap: spacing.sm }}>
          <View style={styles.metaRowBetween}>
            <Text style={styles.secSub}>Backup codes remaining</Text>
            <Text style={styles.metaVal}>{remaining}</Text>
          </View>

          {mode === 'idle' && (
            <View style={{ gap: spacing.sm }}>
              <Pressable
                style={styles.ghostBtn}
                onPress={() => {
                  setMode('regen');
                  setErr(null);
                }}
              >
                <Text style={styles.ghostBtnText}>Regenerate backup codes</Text>
              </Pressable>
              <Pressable
                style={styles.dangerBtn}
                onPress={() => {
                  setMode('disable');
                  setErr(null);
                }}
              >
                <Text style={styles.dangerBtnText}>Disable two-factor authentication</Text>
              </Pressable>
            </View>
          )}

          {mode === 'regen' && (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.secSub}>
                Confirm with a current authenticator or backup code. This voids your
                existing backup codes.
              </Text>
              <View style={styles.stackedInputBox}>
                <Text style={styles.stackedLabel}>Authenticator or backup code</Text>
                <TextInput
                  value={factorCode}
                  onChangeText={setFactorCode}
                  autoCapitalize="characters"
                  placeholder="Code"
                  placeholderTextColor={colors.muted2}
                  style={styles.stackedInput}
                />
              </View>
              <Pressable
                disabled={busy || factorCode.trim().length < 6}
                onPress={regenerate}
                style={[
                  styles.submitBtn,
                  (busy || factorCode.trim().length < 6) && styles.submitBtnDisabled,
                ]}
              >
                <Text style={styles.submitBtnText}>{busy ? 'Generating…' : 'Generate new codes'}</Text>
              </Pressable>
              <Pressable style={styles.ghostBtn} onPress={resetForms}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
            </View>
          )}

          {mode === 'disable' && (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.secSub}>
                Enter your password and a current authenticator/backup code to turn off
                2FA. Your backup codes will be deleted.
              </Text>
              <View style={styles.stackedInputBox}>
                <Text style={styles.stackedLabel}>Password</Text>
                <TextInput
                  value={disablePw}
                  onChangeText={setDisablePw}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted2}
                  style={styles.stackedInput}
                />
              </View>
              <View style={styles.stackedInputBox}>
                <Text style={styles.stackedLabel}>Authenticator or backup code</Text>
                <TextInput
                  value={factorCode}
                  onChangeText={setFactorCode}
                  autoCapitalize="characters"
                  placeholder="Code"
                  placeholderTextColor={colors.muted2}
                  style={styles.stackedInput}
                />
              </View>
              <Pressable
                disabled={busy || !disablePw || factorCode.trim().length < 6}
                onPress={disable}
                style={[
                  styles.dangerSolidBtn,
                  (busy || !disablePw || factorCode.trim().length < 6) && styles.submitBtnDisabled,
                ]}
              >
                <Text style={styles.dangerSolidBtnText}>{busy ? 'Disabling…' : 'Disable 2FA'}</Text>
              </Pressable>
              <Pressable style={styles.ghostBtn} onPress={resetForms}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </GlassCard>
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

        {/* Two-factor authentication (REAL — Stage 3) */}
        <Text style={styles.sectionHeading}>Two-Factor Authentication</Text>
        <TwoFactorSection />

        {/* Other protection (not yet available — honestly labelled) */}
        <Text style={styles.sectionHeading}>Advanced Protection</Text>
        <GlassCard padded style={{ gap: spacing.sm }}>
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

  // Two-factor section
  twoFaHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusPill: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  statusPillOn: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
  statusPillOff: { backgroundColor: colors.panel2, borderColor: colors.line },
  statusPillText: { fontSize: font.xs - 2, fontWeight: '800', letterSpacing: 0.5 },
  fieldLabel: { color: colors.muted2, fontSize: font.xs - 2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  codeBlock: { color: colors.brand, fontSize: font.sm, fontFamily: 'monospace', backgroundColor: '#07070B', borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: spacing.sm },
  codeBlockSmall: { color: colors.muted, fontSize: font.xs - 1, fontFamily: 'monospace', backgroundColor: '#07070B', borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: spacing.sm },
  metaRowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ghostBtn: { height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glass },
  ghostBtnText: { color: colors.muted, fontSize: font.sm, fontWeight: '700' },
  dangerBtn: { height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(234,57,67,0.2)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(234,57,67,0.02)' },
  dangerBtnText: { color: colors.down, fontSize: font.sm, fontWeight: '700' },
  dangerSolidBtn: { height: 44, borderRadius: radius.md, backgroundColor: 'rgba(234,57,67,0.85)', alignItems: 'center', justifyContent: 'center' },
  dangerSolidBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '800' },

  // Backup codes reveal
  backupPanel: { borderWidth: 1, borderColor: 'rgba(245,194,66,0.25)', backgroundColor: 'rgba(245,194,66,0.04)', borderRadius: radius.md, padding: spacing.md, gap: 6 },
  backupHeading: { color: colors.brand, fontSize: font.xs - 1, fontWeight: '800', letterSpacing: 0.5 },
  backupSub: { color: colors.muted, fontSize: font.xs },
  backupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  backupCode: { color: '#fff', fontSize: font.sm, fontFamily: 'monospace', backgroundColor: '#07070B', borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10, minWidth: '47%', textAlign: 'center' },
});
