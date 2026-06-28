import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { BrandMark, GoldButton } from '@/components/premium';
import { useAuth } from '@/store/auth';
import { actionErrorMessage } from '@/api/client';
import { colors, font, spacing, radius } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const canSubmit = emailValid && password.length >= 1;

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleOAuth = (provider: string) => {
    // Stub OAuth login
  };

  return (
    <Screen contentStyle={styles.screenContent}>
      {/* Brand Header */}
      <View style={styles.header}>
        <BrandMark size="md" />
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to access your secure trading account.</Text>
      </View>

      {/* Form Fields */}
      <View style={styles.form}>
        {/* Stacked Email Input */}
        <View style={styles.stackedInputBox}>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={styles.stackedLabel}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="Enter your email"
              placeholderTextColor={colors.muted2}
              style={styles.stackedInput}
            />
          </View>
          <Ionicons name="mail" size={20} color={colors.brand} />
        </View>

        {/* Stacked Password Input */}
        <View style={styles.stackedInputBox}>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={styles.stackedLabel}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!show}
              autoCapitalize="none"
              placeholder="Enter your password"
              placeholderTextColor={colors.muted2}
              style={styles.stackedInput}
            />
          </View>
          <Pressable onPress={() => setShow(!show)} hitSlop={15}>
            <Ionicons name={show ? 'eye' : 'eye-off'} size={20} color={colors.brand} />
          </Pressable>
        </View>

        {/* Controls Row */}
        <View style={styles.rowBetween}>
          <Pressable style={styles.rememberRow} onPress={() => setRemember(!remember)}>
            <View style={[styles.checkbox, remember && styles.checkboxOn]}>
              {remember && <Ionicons name="checkmark" size={10} color="#1A1206" />}
            </View>
            <Text style={styles.rememberText}>Remember Me</Text>
          </Pressable>

          <Link href="/(auth)/forgot-password" style={styles.linkGold}>
            Forgot Password?
          </Link>
        </View>

        {error ? <Text style={styles.err}>{error}</Text> : null}

        {/* Login CTA */}
        <GoldButton title="Login" onPress={onSubmit} loading={busy} disabled={!canSubmit} />

        {/* Social Login Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.hairline} />
          <Text style={styles.dividerText}>Or continue with</Text>
          <View style={styles.hairline} />
        </View>

        {/* Social CTAs */}
        <View style={styles.oauthRow}>
          <Pressable style={styles.oauthBtn} onPress={() => handleOAuth('google')}>
            <Ionicons name="logo-google" size={18} color="#EA4335" />
            <Text style={styles.oauthBtnText}>Google</Text>
          </Pressable>
          <Pressable style={styles.oauthBtn} onPress={() => handleOAuth('apple')}>
            <Ionicons name="logo-apple" size={18} color="#FFF" />
            <Text style={styles.oauthBtnText}>Apple</Text>
          </Pressable>
        </View>
      </View>

      {/* Footer Nav */}
      <View style={styles.footerRow}>
        <Text style={styles.muted}>Don&rsquo;t have an account?</Text>
        <Link href="/(auth)/register" style={styles.linkGold}>
          Create Account
        </Link>
      </View>

      {/* Trust Badges Container */}
      <View style={styles.trustBanner}>
        <View style={styles.trustCol}>
          <Ionicons name="lock-closed" size={20} color={colors.brand} />
          <Text style={styles.trustLabel}>256-bit</Text>
          <Text style={styles.trustSub}>Encryption</Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustCol}>
          <Ionicons name="shield-checkmark" size={20} color={colors.brand} />
          <Text style={styles.trustLabel}>FIU</Text>
          <Text style={styles.trustSub}>Ready</Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustCol}>
          <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
          <Text style={styles.trustLabel}>KYC</Text>
          <Text style={styles.trustSub}>Compliant</Text>
        </View>
      </View>

      {/* Security Footer Statement */}
      <View style={styles.fineRow}>
        <Ionicons name="lock-closed" size={12} color={colors.muted2} style={{ marginTop: 2 }} />
        <Text style={styles.fineText}>
          Your security is our top priority.{'\n'}
          <Text style={{ color: colors.brand }}>Bank-grade security. Always.</Text>
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  title: { color: colors.ink, fontSize: font.xxl - 2, fontWeight: '900', marginTop: spacing.sm },
  subtitle: { color: colors.muted, fontSize: font.sm, textAlign: 'center' },
  form: { gap: spacing.md },
  
  // Custom stacked inputs matching screenshot style
  stackedInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F16',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 60,
  },
  stackedLabel: {
    color: colors.muted2,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stackedInput: {
    color: colors.ink,
    fontSize: font.md,
    marginTop: 2,
    padding: 0,
    height: 24,
  },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  rememberText: { color: colors.muted, fontSize: font.sm, fontWeight: '600' },
  linkGold: { color: colors.brand, fontWeight: '700', fontSize: font.sm },
  
  err: { color: colors.down, fontSize: font.sm, textAlign: 'center' },

  // Social divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.sm },
  hairline: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  dividerText: { color: colors.muted2, fontSize: 11, fontWeight: '700' },

  // OAuth buttons row
  oauthRow: { flexDirection: 'row', gap: spacing.md },
  oauthBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    height: 48,
  },
  oauthBtnText: { color: colors.ink, fontSize: font.sm, fontWeight: '700' },

  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'center', marginTop: spacing.xs },
  muted: { color: colors.muted, fontSize: font.sm },

  // Trust Banner Columns style
  trustBanner: {
    flexDirection: 'row',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: spacing.sm,
  },
  trustCol: { alignItems: 'center', gap: 2, flex: 1 },
  trustDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.06)' },
  trustLabel: { color: colors.ink, fontSize: font.sm - 2, fontWeight: '800', marginTop: 4 },
  trustSub: { color: colors.muted, fontSize: 10, fontWeight: '600' },

  fineRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.xs },
  fineText: { color: colors.muted2, fontSize: 11, fontWeight: '600', lineHeight: 16 },
});
