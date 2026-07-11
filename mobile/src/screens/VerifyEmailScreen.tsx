import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, Pressable, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { GoldButton } from '@/components/premium';
import { userApi } from '@/api/userApi';
import { errorMessage } from '@/api/client';
import { colors, font, spacing, radius } from '@/theme';

/**
 * Mandatory email verification — mobile's primary path is a 6-digit OTP code
 * (not the web token-link flow: a clickable email link can't drive this
 * native app without deep-linking infrastructure this project doesn't have).
 * Both paths mark the same `User.emailVerifiedAt`, so either completes
 * verification. Confirming does NOT log the user in — it only proves inbox
 * control; the caller returns to sign-in with the same credentials, which now
 * pass the verification gate and complete the normal login state machine
 * (status → location → 2FA → session), unchanged.
 */

function VerifyShieldGraphic() {
  return (
    <View style={styles.shieldWrapper}>
      <View style={styles.shieldBase}>
        <Ionicons name="shield-outline" size={96} color={colors.brand} style={{ opacity: 0.9 }} />
        <View style={styles.shieldInnerIcon}>
          <Ionicons name="lock-closed" size={38} color={colors.brand} />
        </View>
        <View style={styles.checkBadge}>
          <Ionicons name="checkmark-circle-sharp" size={26} color={colors.brand} />
        </View>
      </View>
    </View>
  );
}

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const email = (emailParam ?? '').trim();

  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [requested, setRequested] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown]);

  // Auto-request a code once we know which email to verify.
  useEffect(() => {
    if (email && !requested) void requestCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  async function requestCode() {
    if (!email) {
      setErr('Missing email address — go back and try again.');
      return;
    }
    setMsg(null);
    setErr(null);
    setBusy(true);
    try {
      const res = await userApi.requestEmailVerification(email);
      setRequested(true);
      setCooldown(res.data.resendCooldownSeconds);
      if (res.data.alreadyVerified) {
        setVerified(true);
        setMsg('Email already verified. You can sign in now.');
      }
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!/^\d{6}$/.test(otp.trim())) return;
    setMsg(null);
    setErr(null);
    setBusy(true);
    try {
      const res = await userApi.confirmEmailVerification(email, otp.trim());
      setVerified(true);
      setMsg(res.data.alreadyVerified ? 'Email already verified.' : 'Email verified! You can sign in now.');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen contentStyle={styles.screenContent}>
      <VerifyShieldGraphic />

      <View style={styles.header}>
        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          {email
            ? `Enter the 6-digit code we sent to ${email}.`
            : 'Enter the 6-digit code sent to your email.'}
        </Text>
      </View>

      <View style={styles.inputArea}>
        {!verified ? (
          <>
            <OTPInput value={otp} onChange={setOtp} />

            <View style={styles.resendRow}>
              <Text style={styles.muted}>Didn&rsquo;t get the code?</Text>
              <Pressable
                onPress={requestCode}
                style={styles.resendBtn}
                disabled={busy || cooldown > 0}
              >
                <Text style={[styles.resendLinkText, cooldown > 0 && { opacity: 0.5 }]}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </Text>
                <Ionicons name="refresh-sharp" size={12} color={colors.brand} />
              </Pressable>
            </View>

            {msg ? <Text style={styles.ok}>{msg}</Text> : null}
            {err ? <Text style={styles.err}>{err}</Text> : null}

            <GoldButton title="Verify" onPress={confirm} loading={busy} disabled={!/^\d{6}$/.test(otp.trim())} />
          </>
        ) : (
          <>
            {msg ? <Text style={styles.ok}>{msg}</Text> : null}
            <GoldButton title="Go to sign in" onPress={() => router.replace('/(auth)/login')} />
          </>
        )}
      </View>

      <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
        <Link href="/(auth)/login" style={styles.linkGold}>
          Back to sign in
        </Link>
      </View>
    </Screen>
  );
}

/** 6-digit OTP input boxes — hidden real input drives the visual boxes. */
function OTPInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const inputRef = React.useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable style={styles.otpGrid} onPress={() => inputRef.current?.focus()}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        maxLength={6}
        style={styles.hiddenInput}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {Array.from({ length: 6 }).map((_, idx) => {
        const char = value[idx] || '';
        const isCurrent = idx === value.length;
        const boxFocused = focused && isCurrent;

        return (
          <View key={idx} style={[styles.otpBox, boxFocused && styles.otpBoxActive]}>
            <Text style={[styles.otpText, boxFocused && { color: colors.brand }]}>
              {char ? char : (boxFocused ? '|' : '')}
            </Text>
          </View>
        );
      })}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  title: { color: colors.ink, fontSize: font.xl, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: font.sm, textAlign: 'center', paddingHorizontal: spacing.lg },
  inputArea: { gap: spacing.md },

  otpGrid: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.sm, marginVertical: spacing.sm },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  otpBox: {
    width: 44,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: '#0F0F16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: {
    borderColor: colors.brand,
  },
  otpText: {
    color: colors.ink,
    fontSize: font.lg,
    fontWeight: '800',
    textAlign: 'center',
  },

  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginVertical: spacing.xs },
  resendBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resendLinkText: { color: colors.brand, fontWeight: '700', fontSize: font.sm },

  ok: { color: colors.up, fontSize: font.sm, textAlign: 'center' },
  err: { color: colors.down, fontSize: font.sm, textAlign: 'center' },
  linkGold: { color: colors.brand, fontWeight: '700', fontSize: font.sm },
  muted: { color: colors.muted, fontSize: font.sm },

  shieldWrapper: { alignItems: 'center', justifyContent: 'center', marginVertical: spacing.lg },
  shieldBase: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  shieldInnerIcon: { position: 'absolute', top: 32 },
  checkBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#06060A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
});
