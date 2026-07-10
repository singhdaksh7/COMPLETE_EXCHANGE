import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { Button } from '@/components/ui';
import { PremiumInput } from '@/components/premium';
import { useAuth } from '@/store/auth';
import { userApi } from '@/api/userApi';
import { actionErrorMessage, ApiError } from '@/api/client';
import { colors, font, spacing, radius } from '@/theme';
import { isTwoFactorChallenge, type FederatedLoginOutcome } from '@/types/api';
import {
  isAppleAuthAvailable,
  isGoogleAuthAvailable,
  signInWithApple,
  signInWithGoogleNative,
} from '@/lib/firebase';

type Loc = { latitude: number; longitude: number; accuracy: number } | null;

/**
 * Best-effort location capture, mirroring LoginScreen's pattern: try silently
 * first (no prompt), and on a LOCATION_REQUIRED rejection from the backend,
 * prompt for permission and retry once. Never blocks/fakes a location.
 */
async function getBestEffortLocation(): Promise<Loc> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? 0 };
  } catch {
    return null;
  }
}

async function requestAndGetLocation(): Promise<Loc> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is required for account security.');
  }
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? 0 };
}

/**
 * "Continue with Google" / "Sign in with Apple" — Stage 12 federated identity
 * (Firebase verification layer → POST /auth/federated/firebase → EXORA's own
 * session/2FA rules). Used identically from LoginScreen and RegisterScreen: a
 * new identity resolves to FEDERATED_REGISTRATION_REQUIRED regardless of
 * which screen the user started from. Renders nothing when a given provider
 * isn't configured/enabled/available — never a dead button.
 */
export function FederatedAuthButtons({
  onAuthenticated,
  onTwoFactorChallenge,
}: {
  onAuthenticated: () => void;
  onTwoFactorChallenge: (challengeToken: string) => void;
}) {
  const { loginWithFederatedResult } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [step, setStep] = useState<'idle' | 'link' | 'register'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Link-account state
  const [challengeToken, setChallengeToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Registration state
  const [pendingEmail, setPendingEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeRisk, setAgreeRisk] = useState(false);

  useEffect(() => {
    let active = true;
    isAppleAuthAvailable().then((v) => {
      if (active) setAppleAvailable(v);
    });
    return () => {
      active = false;
    };
  }, []);

  const googleAvailable = isGoogleAuthAvailable();
  if (!googleAvailable && !appleAvailable) return null;

  async function resolveOutcome(outcome: FederatedLoginOutcome) {
    if (outcome.status === 'AUTHENTICATED') {
      if (isTwoFactorChallenge(outcome.result)) {
        onTwoFactorChallenge(outcome.result.challengeToken);
        return;
      }
      await loginWithFederatedResult(outcome.result);
      onAuthenticated();
      return;
    }
    if (outcome.status === 'ACCOUNT_LINK_REQUIRED') {
      setChallengeToken(outcome.challengeToken);
      setMaskedEmail(outcome.maskedEmail);
      setStep('link');
      return;
    }
    setChallengeToken(outcome.challengeToken);
    setPendingEmail(outcome.email);
    setStep('register');
  }

  async function runFederatedLogin(getIdToken: () => Promise<string>, provider: 'GOOGLE' | 'APPLE') {
    setError(null);
    setBusy(true);
    try {
      const idToken = await getIdToken();
      const location = await getBestEffortLocation();
      try {
        const res = await userApi.federatedLogin({ idToken, provider, location });
        await resolveOutcome(res.data);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'LOCATION_REQUIRED') {
          const fetchedLoc = await requestAndGetLocation();
          const res = await userApi.federatedLogin({ idToken, provider, location: fetchedLoc });
          await resolveOutcome(res.data);
        } else {
          throw err;
        }
      }
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendLinkOtp() {
    setError(null);
    setBusy(true);
    try {
      await userApi.federatedRequestLinkOtp(challengeToken);
      setOtpSent(true);
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmLink() {
    setError(null);
    setBusy(true);
    try {
      const location = await getBestEffortLocation();
      const res = await userApi.federatedConfirmLink(challengeToken, otp.trim(), location);
      await resolveOutcome(res.data);
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function completeRegistration() {
    setError(null);
    if (!agreeTerms || !agreePrivacy || !agreeRisk) {
      setError('Please accept the Terms, Privacy Policy and Risk Disclosure to continue.');
      return;
    }
    setBusy(true);
    try {
      const location = await getBestEffortLocation();
      const res = await userApi.federatedCompleteRegistration({
        challengeToken,
        phone: phone.trim(),
        acceptedPolicies: { termsOfService: true, privacyPolicy: true, riskDisclosure: true },
        location,
      });
      await resolveOutcome(res.data);
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('idle');
    setError(null);
    setOtp('');
    setOtpSent(false);
    setPhone('');
    setAgreeTerms(false);
    setAgreePrivacy(false);
    setAgreeRisk(false);
  }

  if (step === 'link') {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Connect your sign-in</Text>
        <Text style={styles.panelBody}>
          An EXORA account already exists for {maskedEmail}. Verify it&rsquo;s you to connect this
          sign-in method.
        </Text>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {!otpSent ? (
          <Button title="Send verification code" onPress={sendLinkOtp} loading={busy} />
        ) : (
          <>
            <TextInput
              value={otp}
              onChangeText={setOtp}
              placeholder="6-digit code"
              keyboardType="number-pad"
              placeholderTextColor={colors.muted2}
              style={styles.otpInput}
            />
            <Button title="Confirm & sign in" onPress={confirmLink} loading={busy} disabled={otp.trim().length !== 6} />
          </>
        )}
        <Pressable onPress={reset} hitSlop={10}>
          <Text style={styles.back}>&larr; Back</Text>
        </Pressable>
      </View>
    );
  }

  if (step === 'register') {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Finish creating your account</Text>
        <Text style={styles.panelBody}>
          Signing up as {pendingEmail}. EXORA currently supports INR only.
        </Text>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        <PremiumInput
          placeholder="Phone number (e.g. +919999999999)"
          leftIcon="call-outline"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <ConsentCheckbox checked={agreeTerms} onToggle={() => setAgreeTerms((v) => !v)} label="I accept the Terms of Service" />
        <ConsentCheckbox checked={agreePrivacy} onToggle={() => setAgreePrivacy((v) => !v)} label="I accept the Privacy Policy" />
        <ConsentCheckbox checked={agreeRisk} onToggle={() => setAgreeRisk((v) => !v)} label="I accept the Risk Disclosure" />
        <Button title="Create account" onPress={completeRegistration} loading={busy} />
        <Pressable onPress={reset} hitSlop={10}>
          <Text style={styles.back}>&larr; Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {googleAvailable ? (
        <Button
          title={busy ? 'Connecting…' : 'Continue with Google'}
          variant="secondary"
          icon="logo-google"
          loading={busy}
          onPress={() => void runFederatedLogin(signInWithGoogleNative, 'GOOGLE')}
        />
      ) : null}
      {appleAvailable ? (
        <Button
          title={busy ? 'Connecting…' : 'Sign in with Apple'}
          variant="secondary"
          icon="logo-apple"
          loading={busy}
          onPress={() => void runFederatedLogin(signInWithApple, 'APPLE')}
        />
      ) : null}
    </View>
  );
}

function ConsentCheckbox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <Pressable style={styles.consentRow} onPress={onToggle}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]} />
      <Text style={styles.consentText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.glassBorderGold,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.glass,
  },
  panelTitle: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  panelBody: { color: colors.muted, fontSize: font.sm, lineHeight: 18 },
  otpInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    height: 50,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: font.md,
  },
  back: { color: colors.brand, fontSize: font.sm, fontWeight: '700', textAlign: 'center', marginTop: spacing.xs },
  err: { color: colors.down, fontSize: font.sm, textAlign: 'center' },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  consentText: { color: colors.muted, fontSize: font.sm, fontWeight: '600', flex: 1 },
});
