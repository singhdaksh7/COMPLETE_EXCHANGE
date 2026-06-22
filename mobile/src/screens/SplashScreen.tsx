import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { colors, font, spacing } from '@/theme';
import { config } from '@/config';

/** Cold-start splash shown while tokens hydrate and the session is validated. */
export default function SplashScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.brand}>EXORA</Text>
      <Text style={styles.tag}>Crypto exchange</Text>
      <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
      {config.isStaging ? <Text style={styles.staging}>STAGING / DEMO</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  brand: { color: colors.brand, fontSize: 40, fontWeight: '900', letterSpacing: 4 },
  tag: { color: colors.muted, fontSize: font.sm, marginTop: spacing.xs, letterSpacing: 2 },
  staging: {
    position: 'absolute',
    bottom: spacing.xxl,
    color: colors.warn,
    fontSize: font.xs,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
