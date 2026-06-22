import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Button, Card, H1, Input, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { actionErrorMessage } from '@/api/client';
import { colors, spacing } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<boolean>(false);
  const emailValid = EMAIL_RE.test(email.trim());

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await register(email.trim(), password, phone.trim() || undefined);
      if (res.emailVerificationRequired) {
        setDone(true);
      } else {
        router.replace('/(auth)/login');
      }
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen contentStyle={{ justifyContent: 'center', flexGrow: 1 }}>
        <Card>
          <H1>Check your email</H1>
          <Muted>
            We sent a verification link to {email}. Verify your email, then sign in. In staging, verification may be
            mocked — try signing in directly.
          </Muted>
          <View style={{ marginTop: spacing.md }}>
            <Button title="Go to sign in" onPress={() => router.replace('/(auth)/login')} />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={{ justifyContent: 'center', flexGrow: 1 }}>
      <H1>Create account</H1>
      <Muted>Trade crypto on EXORA staging.</Muted>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
        error={email.length > 0 && !emailValid ? 'Enter a valid email' : null}
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="At least 8 characters"
        error={password.length > 0 && password.length < 8 ? 'Minimum 8 characters' : null}
      />
      <Input label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91…" />

      {error ? <Text style={{ color: colors.down }}>{error}</Text> : null}

      <View style={{ marginTop: spacing.sm }}>
        <Button title="Create account" onPress={onSubmit} loading={busy} disabled={!emailValid || password.length < 8} icon="person-add-outline" />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.lg }}>
        <Muted>Already have an account?</Muted>
        <Link href="/(auth)/login" style={{ color: colors.brand, fontWeight: '700' }}>
          Sign in
        </Link>
      </View>
    </Screen>
  );
}
