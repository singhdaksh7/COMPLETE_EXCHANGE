import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { BrandMark, GoldButton, PremiumInput } from '@/components/premium';
import { useAuth } from '@/store/auth';
import { actionErrorMessage } from '@/api/client';
import { colors, font, spacing, radius } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ShieldBadge({ icon }: { icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View style={styles.shieldWrapper}>
      <Ionicons name="shield-outline" size={40} color={colors.brand} style={{ opacity: 0.9 }} />
      <View style={styles.shieldIconInside}>
        <Ionicons name={icon} size={16} color={colors.brand} />
      </View>
    </View>
  );
}

function ConsentRow({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable style={styles.agreeRow} onPress={onToggle}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color="#1A1206" /> : null}
      </View>
      <Text style={styles.agreeText}>{children}</Text>
    </Pressable>
  );
}

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  // Stage 9A: each required legal policy is acknowledged separately. Backend
  // rejects registration unless all three are true — no single "accept all".
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeRisk, setAgreeRisk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const emailValid = EMAIL_RE.test(email.trim());
  const passOk = password.length >= 8;
  const confirmOk = confirm === password && confirm.length > 0;
  const policiesAccepted = agreeTerms && agreePrivacy && agreeRisk;
  const canSubmit = emailValid && passOk && confirmOk && policiesAccepted;

  const onSubmit = async () => {
    // Guard: only submit real, individually-ticked consent. Never synthesize
    // acceptedPolicies flags the user did not actually check.
    if (!policiesAccepted) return;
    setError(null);
    setBusy(true);
    try {
      const res = await register(
        email.trim(),
        password,
        { termsOfService: true, privacyPolicy: true, riskDisclosure: true },
        phone.trim() || undefined,
      );
      if (res.emailVerificationRequired) setDone(true);
      else router.replace('/(auth)/login');
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen contentStyle={{ justifyContent: 'center', flexGrow: 1, gap: spacing.lg }}>
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <View style={styles.checkOrb}>
            <Ionicons name="mail-open-outline" size={30} color={colors.brand} />
          </View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a verification link to {email}. Verify your email, then sign in.
          </Text>
        </View>
        <GoldButton title="Go to sign in" onPress={() => router.replace('/(auth)/login')} />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screenContent}>
      {/* Brand Header */}
      <View style={styles.header}>
        <BrandMark size="md" />
        <Text style={styles.title}>Create Your Account</Text>
        <Text style={styles.subtitle}>Join Exora and start your trading journey today.</Text>
      </View>

      {/* Form Fields */}
      <View style={styles.form}>
        {/* Email Address */}
        <PremiumInput
          placeholder="Email Address"
          leftIcon="mail-outline"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          error={email.length > 0 && !emailValid ? 'Enter a valid email' : null}
        />

        {/* Mobile Number Prefix Dropdown + Input */}
        <View style={styles.mobileInputContainer}>
          <View style={styles.mobilePrefix}>
            <Ionicons name="call-outline" size={18} color={colors.brand} />
            <Text style={styles.prefixText}>+91</Text>
            <Ionicons name="chevron-down" size={12} color={colors.muted2} />
          </View>
          <View style={styles.verticalDivider} />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Mobile Number"
            placeholderTextColor={colors.muted2}
            style={styles.mobileTextInput}
          />
        </View>

        {/* Password */}
        <PremiumInput
          placeholder="Password"
          leftIcon="lock-closed-outline"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPass}
          error={password.length > 0 && !passOk ? 'Minimum 8 characters' : null}
          rightSlot={
            <Pressable onPress={() => setShowPass(!showPass)} hitSlop={15}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
            </Pressable>
          }
        />

        {/* Confirm Password */}
        <PremiumInput
          placeholder="Confirm Password"
          leftIcon="lock-closed-outline"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry={!showConfirm}
          error={confirm.length > 0 && !confirmOk ? 'Passwords do not match' : null}
          rightSlot={
            <Pressable onPress={() => setShowConfirm(!showConfirm)} hitSlop={15}>
              <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
            </Pressable>
          }
        />

        {/* Signup captures only what the backend stores today (email, phone,
            password). Name and other profile details are completed later. */}
        <Text style={styles.profileNote}>You can complete your profile after signup.</Text>

        {/* Required legal consents (Stage 9A) — each acknowledged separately. */}
        <View style={styles.consentGroup}>
          <ConsentRow checked={agreeTerms} onToggle={() => setAgreeTerms((v) => !v)}>
            I have read and accept the{' '}
            <Text style={styles.consentLink}>Terms of Service</Text>
          </ConsentRow>
          <ConsentRow checked={agreePrivacy} onToggle={() => setAgreePrivacy((v) => !v)}>
            I have read and accept the{' '}
            <Text style={styles.consentLink}>Privacy Policy</Text>
          </ConsentRow>
          <ConsentRow checked={agreeRisk} onToggle={() => setAgreeRisk((v) => !v)}>
            I acknowledge the{' '}
            <Text style={styles.consentLink}>Risk Disclosure</Text>
          </ConsentRow>
        </View>

        {error ? <Text style={styles.err}>{error}</Text> : null}

        {/* Create Account CTA */}
        <GoldButton title="Create Account" onPress={onSubmit} loading={busy} disabled={!canSubmit} />

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.hairline} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.hairline} />
        </View>
      </View>

      {/* Footer login row */}
      <View style={styles.footerRow}>
        <Text style={styles.muted}>Already have an account?</Text>
        <Link href="/(auth)/login" style={styles.linkGold}>
          Login
        </Link>
      </View>

      {/* Trust Badge Cards Columns */}
      <View style={styles.trustBanner}>
        <View style={styles.trustCol}>
          <ShieldBadge icon="person-outline" />
          <Text style={styles.trustLabel}>KYC Required</Text>
          <Text style={styles.trustDesc}>Complete KYC to{'\n'}unlock all features</Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustCol}>
          <ShieldBadge icon="lock-closed-outline" />
          <Text style={styles.trustLabel}>Secure Registration</Text>
          <Text style={styles.trustDesc}>Your data is encrypted{'\n'}and protected</Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustCol}>
          <ShieldBadge icon="business-outline" />
          <Text style={styles.trustLabel}>Bank Grade Security</Text>
          <Text style={styles.trustDesc}>Protected with 256-bit{'\n'}encryption</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  title: { color: colors.ink, fontSize: font.xxl - 2, fontWeight: '900', marginTop: spacing.sm, textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: font.sm, textAlign: 'center' },
  checkOrb: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorderGold },
  form: { gap: spacing.md },

  // Custom mobile picker input box
  mobileInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    height: 54,
    paddingHorizontal: spacing.md,
  },
  mobilePrefix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  prefixText: {
    color: colors.ink,
    fontSize: font.md,
    fontWeight: '700',
  },
  verticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: spacing.md,
  },
  mobileTextInput: {
    flex: 1,
    color: colors.ink,
    fontSize: font.md,
    height: '100%',
  },

  profileNote: { color: colors.muted2, fontSize: font.xs, fontWeight: '500', marginTop: -spacing.xs },
  consentGroup: { gap: spacing.sm, marginTop: spacing.xs },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  agreeText: { color: colors.muted, fontSize: font.sm, flex: 1, fontWeight: '600' },
  consentLink: { color: colors.brand, fontWeight: '700' },
  
  err: { color: colors.down, fontSize: font.sm, textAlign: 'center' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.xs },
  hairline: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  dividerText: { color: colors.muted2, fontSize: 11, fontWeight: '700' },

  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'center' },
  muted: { color: colors.muted, fontSize: font.sm },
  linkGold: { color: colors.brand, fontWeight: '700', fontSize: font.sm },

  // Shield Badges Grid Footer
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  trustCol: { alignItems: 'center', flex: 1, gap: 4 },
  trustDivider: { width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.04)', marginTop: 12 },
  shieldWrapper: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: spacing.xs,
  },
  shieldIconInside: {
    position: 'absolute',
    top: 13,
  },
  trustLabel: { color: colors.ink, fontSize: font.xs, fontWeight: '700', textAlign: 'center' },
  trustDesc: { color: colors.muted2, fontSize: 9, fontWeight: '500', textAlign: 'center', lineHeight: 12, marginTop: 2 },
});
