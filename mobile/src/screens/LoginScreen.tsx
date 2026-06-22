import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Button, Input, Muted, Screen, StagingBadge } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  return (
    <Screen contentStyle={{ justifyContent: 'center', flexGrow: 1, gap: spacing.lg }}>
      <View style={styles.brandWrap}>
        <View style={styles.logo}>
          <Text style={styles.logoLetter}>E</Text>
        </View>
        <Text style={styles.brand}>EXORA</Text>
        <Muted>Sign in to your account</Muted>
        <StagingBadge />
      </View>

      <View style={{ gap: spacing.md }}>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
          error={email.length > 0 && !emailValid ? 'Enter a valid email' : null}
        />
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />

        {error ? <Text style={styles.err}>{error}</Text> : null}

        <Button title="Sign in" onPress={onSubmit} loading={busy} disabled={!canSubmit} icon="log-in-outline" />
      </View>

      <View style={styles.footerRow}>
        <Muted>New to EXORA?</Muted>
        <Link href="/(auth)/register" style={styles.linkBold}>
          Create account
        </Link>
      </View>
      <View style={[styles.footerRow, { marginTop: -spacing.sm }]}>
        <Link href="/(auth)/verify-email" style={styles.linkMuted}>
          Need to verify your email?
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandWrap: { alignItems: 'center', gap: spacing.sm },
  logo: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  logoLetter: { color: colors.bg, fontSize: 42, fontWeight: '900' },
  brand: { color: colors.ink, fontSize: 30, fontWeight: '900', letterSpacing: 3 },
  err: { color: colors.down, fontSize: font.sm },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  linkBold: { color: colors.brand, fontWeight: '700' },
  linkMuted: { color: colors.muted },
});
