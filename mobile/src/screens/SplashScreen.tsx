import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppBackground, BrandMark } from '@/components/premium';
import { colors, font, spacing } from '@/theme';

/** Cold-start splash shown while tokens hydrate and the session is validated. */
export default function SplashScreen() {
  return (
    <View style={styles.root}>
      <AppBackground />
      <View style={styles.center}>
        <BrandMark size="lg" />
        <Text style={styles.tag}>India’s Secure INR-First Exchange Experience</Text>
        <ActivityIndicator color={colors.brand} size="small" style={{ marginTop: spacing.xxl }} />
      </View>
      <View style={styles.footer}>
        <Ionicons name="shield-checkmark-sharp" size={24} color={colors.brand} style={{ marginBottom: 4 }} />
        <Text style={styles.securedByText}>Secured by</Text>
        <Text style={styles.footerText}>Enterprise Grade Infrastructure</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  tag: { color: colors.muted, fontSize: font.sm, marginTop: spacing.sm, letterSpacing: 0.5, textAlign: 'center', fontWeight: '600' },
  footer: { position: 'absolute', bottom: spacing.xxl * 1.5, alignItems: 'center', gap: 2 },
  securedByText: { color: colors.muted2, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' },
  footerText: { color: colors.muted, fontSize: font.xs, fontWeight: '600', letterSpacing: 0.5 },
});
