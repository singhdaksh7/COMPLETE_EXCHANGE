import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, radius, spacing } from '@/theme';

/* ---------------- layout ---------------- */

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scrollContent, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={styles.rowValue}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

/* ---------------- typography ---------------- */

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

/* ---------------- controls ---------------- */

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
}) {
  const bg =
    variant === 'primary'
      ? colors.brand
      : variant === 'danger'
        ? colors.down
        : variant === 'ghost'
          ? 'transparent'
          : colors.panel2;
  const fg = variant === 'primary' ? '#0B0E11' : variant === 'danger' ? '#fff' : colors.ink;
  const isOff = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: isOff ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && styles.buttonGhost,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={styles.inputWrap}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted2}
        style={[styles.input, style]}
        autoCapitalize="none"
        {...rest}
      />
    </View>
  );
}

/* ---------------- status / states ---------------- */

const STATUS_COLOR: Record<string, string> = {
  // positive
  APPROVED: colors.up, FILLED: colors.up, COMPLETED: colors.up, CREDITED: colors.up,
  SUCCESS: colors.up, CLEAR: colors.up, ACTIVE: colors.up, VERIFIED: colors.up, OPEN: colors.up,
  // warning / in-progress
  PENDING: colors.warn, SUBMITTED: colors.warn, UNDER_REVIEW: colors.warn, CONFIRMING: colors.warn,
  PARTIALLY_FILLED: colors.warn, REVIEW_REQUIRED: colors.warn, NEEDS_MORE_INFO: colors.warn,
  PENDING_APPROVAL: colors.warn, REQUESTED: colors.warn, DETECTED: colors.warn,
  // negative
  REJECTED: colors.down, FAILED: colors.down, CANCELLED: colors.down, BLOCKED: colors.down,
  EXPIRED: colors.down, PROHIBITED: colors.down,
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const key = (status ?? '').toUpperCase();
  const c = STATUS_COLOR[key] ?? colors.muted;
  return (
    <View style={[styles.badge, { borderColor: c + '66', backgroundColor: c + '1A' }]}>
      <Text style={[styles.badgeText, { color: c }]}>{status ?? '—'}</Text>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.brand} size="large" />
      {label ? <Text style={styles.centerText}>{label}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.centerText}>{message}</Text>
      {onRetry ? (
        <View style={{ marginTop: spacing.md, width: 160 }}>
          <Button title="Retry" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.centerText}>{hint}</Text> : null}
    </View>
  );
}

/** Wraps a list/section in the standard loading → error → empty → content flow. */
export function AsyncBoundary<T>({
  loading,
  error,
  data,
  onRetry,
  empty,
  children,
}: {
  loading: boolean;
  error: string | null;
  data: T | null;
  onRetry?: () => void;
  empty?: { title: string; hint?: string };
  children: (data: T) => React.ReactNode;
}) {
  if (loading && data === null) return <Loading />;
  if (error && data === null) return <ErrorState message={error} onRetry={onRetry} />;
  if (data === null) return <EmptyState title={empty?.title ?? 'Nothing here yet'} hint={empty?.hint} />;
  return <>{children(data)}</>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  rowLabel: { color: colors.muted, fontSize: font.sm },
  rowValue: { color: colors.ink, fontSize: font.sm, fontWeight: '600' },
  h1: { color: colors.ink, fontSize: font.xxl, fontWeight: '800' },
  h2: { color: colors.ink, fontSize: font.lg, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: font.sm },
  button: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonGhost: { borderWidth: 1, borderColor: colors.line },
  buttonText: { fontSize: font.md, fontWeight: '700' },
  inputWrap: { gap: spacing.xs },
  inputLabel: { color: colors.muted, fontSize: font.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    color: colors.ink,
    fontSize: font.md,
  },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: font.xs, fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.xs, minHeight: 160 },
  centerText: { color: colors.muted, fontSize: font.sm, textAlign: 'center' },
  errorTitle: { color: colors.down, fontSize: font.md, fontWeight: '700' },
  emptyTitle: { color: colors.ink, fontSize: font.md, fontWeight: '700' },
});
