import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, TextInput, Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { GoldButton, PremiumInput } from '@/components/premium';
import { userApi } from '@/api/userApi';
import { errorMessage } from '@/api/client';
import { colors, font, spacing, radius } from '@/theme';

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
  const [email] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  
  // Toggle between 6-digit OTP layout and pasting a long token
  const [useLongToken, setUseLongToken] = useState(false);
  
  // Real Countdown Timer (165 seconds = 2 mins 45 secs)
  const [timer, setTimer] = useState(165);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resend = async () => {
    setMsg(null);
    setErr(null);
    setBusy(true);
    try {
      await userApi.resendVerification({ email: email.trim() || 'unverified@exora.in' });
      setMsg('Verification link or code resent successfully.');
      setTimer(165); // reset timer
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setMsg(null);
    setErr(null);
    setBusy(true);
    try {
      await userApi.verifyEmail({ token: token.trim() });
      setMsg('Email verified! You can sign in now.');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.screenContent}>
      {/* Shield Graphic */}
      <VerifyShieldGraphic />

      {/* Texts */}
      <View style={styles.header}>
        <Text style={styles.title}>Verify Your Identity</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit verification code sent to your email or phone.
        </Text>
      </View>

      {/* Input container */}
      <View style={styles.inputArea}>
        {useLongToken ? (
          <View style={{ gap: spacing.md }}>
            <PremiumInput
              placeholder="Paste token from email"
              leftIcon="key-outline"
              value={token}
              onChangeText={setToken}
            />
            <Pressable onPress={() => setUseLongToken(false)} style={styles.toggleLink}>
              <Text style={styles.toggleLinkText}>Use 6-digit OTP instead</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            {/* OTP Input Grid */}
            <OTPInput value={token} onChange={setToken} />
            <Pressable onPress={() => setUseLongToken(true)} style={styles.toggleLink}>
              <Text style={styles.toggleLinkText}>Paste long verification token</Text>
            </Pressable>
          </View>
        )}

        {/* Timer Box */}
        <View style={styles.timerPill}>
          <Ionicons name="time-outline" size={14} color={colors.brand} />
          <Text style={styles.timerText}>
            Code expires in <Text style={{ color: colors.brand, fontWeight: '700' }}>{formatTime(timer)}</Text>
          </Text>
        </View>

        {/* Resend Link row */}
        <View style={styles.resendRow}>
          <Text style={styles.muted}>Didn&rsquo;t get the code?</Text>
          <Pressable onPress={resend} style={styles.resendBtn} disabled={busy}>
            <Text style={styles.resendLinkText}>Resend OTP</Text>
            <Ionicons name="refresh-sharp" size={12} color={colors.brand} />
          </Pressable>
        </View>

        {/* Action feedback */}
        {msg ? <Text style={styles.ok}>{msg}</Text> : null}
        {err ? <Text style={styles.err}>{err}</Text> : null}

        {/* Verify CTA */}
        <GoldButton title="Verify" onPress={verify} loading={busy} disabled={!token} />
      </View>

      {/* Support Card */}
      <Pressable style={styles.supportCard}>
        <View style={styles.supportIcon}>
          <Ionicons name="headset-outline" size={18} color={colors.brand} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.supportTitle}>Didn&rsquo;t receive the code?</Text>
          <Text style={styles.supportSubtitle}>Contact our support team for assistance.</Text>
        </View>
        <Ionicons name="chevron-forward-sharp" size={14} color={colors.muted2} />
      </Pressable>

      <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
        <Link href="/(auth)/login" style={styles.linkGold}>
          Back to sign in
        </Link>
      </View>
    </Screen>
  );
}

// 6-digit OTP input boxes component
function OTPInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const inputRef = React.useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable style={styles.otpGrid} onPress={() => inputRef.current?.focus()}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.slice(0, 6))}
        keyboardType="default"
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
  
  // Custom 6-digit OTP layout
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

  toggleLink: { alignSelf: 'center', paddingVertical: spacing.xs },
  toggleLinkText: { color: colors.muted, fontSize: font.xs, fontWeight: '600', textDecorationLine: 'underline' },

  // Timer pill container
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    alignSelf: 'center',
  },
  timerText: { color: colors.muted, fontSize: font.sm, fontWeight: '500' },

  // Resend row
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginVertical: spacing.xs },
  resendBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resendLinkText: { color: colors.brand, fontWeight: '700', fontSize: font.sm },

  ok: { color: colors.up, fontSize: font.sm, textAlign: 'center' },
  err: { color: colors.down, fontSize: font.sm, textAlign: 'center' },
  linkGold: { color: colors.brand, fontWeight: '700', fontSize: font.sm },
  muted: { color: colors.muted, fontSize: font.sm },

  // 3D-perspective gold shield top graphic
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

  // Support Card bottom layout
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  supportIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorderGold,
  },
  supportTitle: { color: colors.ink, fontSize: font.sm, fontWeight: '700' },
  supportSubtitle: { color: colors.muted2, fontSize: 10, fontWeight: '600' },
});
