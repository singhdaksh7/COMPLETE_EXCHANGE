import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { colors, font, radius, spacing } from '@/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = () => {
    // Honest "unavailable/coming soon" state because no backend endpoint exists
    setInfoMessage('Password reset via mobile app is currently unavailable. Please use the EXORA Web App to recover your account.');
  };

  return (
    <Screen contentStyle={styles.screenContent}>
      {/* Visual Golden Lock Icon Container */}
      <View style={styles.iconContainer}>
        <View style={styles.goldGlowRing}>
          <Ionicons name="lock-closed" size={72} color={colors.brand} />
        </View>
      </View>

      {/* Texts */}
      <View style={styles.textContainer}>
        <Text style={styles.title}>Forgot Password</Text>
        <Text style={styles.subtitle}>
          Enter your registered email to receive a reset link.
        </Text>
      </View>

      {/* Input */}
      <View style={styles.inputContainer}>
        <View style={styles.stackedInputBox}>
          <Text style={styles.stackedLabel}>Email Address</Text>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={16} color={colors.brand} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="name@example.com"
              placeholderTextColor={colors.muted2}
              style={styles.stackedInput}
            />
          </View>
        </View>
      </View>

      {infoMessage ? (
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={16} color={colors.brand} />
          <Text style={styles.infoText}>{infoMessage}</Text>
        </View>
      ) : null}

      {/* CTAs */}
      <View style={styles.btnContainer}>
        <Pressable onPress={handleSubmit} style={styles.sendBtn}>
          <Text style={styles.sendBtnText}>Send Reset Link</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={16} color={colors.brand} />
          <Text style={styles.backBtnText}>Back to Login</Text>
        </Pressable>
      </View>

      {/* Bottom Tip Box */}
      <GlassCard padded style={styles.securityTipCard}>
        <View style={styles.securityTipIcon}>
          <Ionicons name="shield-checkmark" size={18} color={colors.brand} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.securityTipTitle}>Security First</Text>
          <Text style={styles.securityTipSub}>
            Password reset links expire in <Text style={{ color: colors.brand }}>15 minutes</Text> for your security.
          </Text>
        </View>
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: spacing.lg, justifyContent: 'center', paddingBottom: spacing.xxl },
  
  // Icon
  iconContainer: { alignItems: 'center', marginVertical: spacing.md },
  goldGlowRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(245,194,66,0.15)',
    backgroundColor: 'rgba(245,194,66,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
  },

  // Titles
  textContainer: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  title: { color: '#fff', fontSize: font.xxl, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: font.sm, textAlign: 'center', lineHeight: 18 },

  // Form input
  inputContainer: { paddingHorizontal: spacing.md },
  stackedInputBox: {
    backgroundColor: '#07070B',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    height: 60,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    gap: 2,
  },
  stackedLabel: { color: colors.muted2, fontSize: font.xs - 3, fontWeight: '700', textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stackedInput: { color: '#fff', fontSize: font.sm, height: 24, padding: 0, flex: 1 },

  // Info Card
  infoCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(245,194,66,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(245,194,66,0.15)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
  },
  infoText: { color: colors.brand, fontSize: font.xs, fontWeight: '600', flex: 1, lineHeight: 16 },

  // Buttons
  btnContainer: { paddingHorizontal: spacing.md, gap: spacing.md },
  sendBtn: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#1A1206', fontSize: font.sm, fontWeight: '800' },
  backBtn: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'transparent',
  },
  backBtnText: { color: colors.brand, fontSize: font.sm, fontWeight: '800' },

  // Bottom Tip Card
  securityTipCard: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  securityTipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245,194,66,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityTipTitle: { color: '#fff', fontSize: font.xs, fontWeight: '700' },
  securityTipSub: { color: colors.muted, fontSize: 10, lineHeight: 14 },
});
