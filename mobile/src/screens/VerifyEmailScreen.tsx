import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Button, Card, H1, Input, Muted, Screen } from '@/components/ui';
import { userApi } from '@/api/userApi';
import { errorMessage } from '@/api/client';
import { colors, spacing } from '@/theme';

/**
 * Email-verification help screen. A user can re-request the verification email,
 * or paste a verification token (e.g. from a staging email) to verify in-app.
 */
export default function VerifyEmailScreen() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    setMsg(null);
    setErr(null);
    setBusy(true);
    try {
      await userApi.resendVerification({ email: email.trim() });
      setMsg('If that email exists and is unverified, a new link is on its way.');
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
    <Screen>
      <H1>Verify your email</H1>
      <Muted>Verification keeps your account secure. Re-send the link or enter a token below.</Muted>

      <Card>
        <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
        <Button title="Resend verification email" variant="secondary" onPress={resend} loading={busy} disabled={!email} />
      </Card>

      <Card>
        <Input label="Verification token" value={token} onChangeText={setToken} placeholder="Paste token from email" />
        <Button title="Verify with token" onPress={verify} loading={busy} disabled={!token} />
      </Card>

      {msg ? <Text style={{ color: colors.up }}>{msg}</Text> : null}
      {err ? <Text style={{ color: colors.down }}>{err}</Text> : null}

      <View style={{ alignItems: 'center', marginTop: spacing.md }}>
        <Link href="/(auth)/login" style={{ color: colors.brand, fontWeight: '700' }}>
          Back to sign in
        </Link>
      </View>
    </Screen>
  );
}
