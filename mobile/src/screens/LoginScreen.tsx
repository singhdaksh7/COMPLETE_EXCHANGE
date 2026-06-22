import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Button, H1, Input, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { actionErrorMessage } from '@/api/client';
import { colors, spacing } from '@/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Screen contentStyle={{ justifyContent: 'center', flexGrow: 1 }}>
      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <Text style={{ color: colors.brand, fontSize: 34, fontWeight: '900', letterSpacing: 3 }}>EXORA</Text>
        <Muted>Sign in to your account</Muted>
      </View>

      <H1>Welcome back</H1>
      <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />

      {error ? <Text style={{ color: colors.down }}>{error}</Text> : null}

      <View style={{ marginTop: spacing.sm }}>
        <Button title="Sign in" onPress={onSubmit} loading={busy} disabled={!email || !password} />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.lg }}>
        <Muted>New to EXORA?</Muted>
        <Link href="/(auth)/register" style={{ color: colors.brand, fontWeight: '700' }}>
          Create account
        </Link>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.xs }}>
        <Link href="/(auth)/verify-email" style={{ color: colors.muted }}>
          Need to verify your email?
        </Link>
      </View>
    </Screen>
  );
}
