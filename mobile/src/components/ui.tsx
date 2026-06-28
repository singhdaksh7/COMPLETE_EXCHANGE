import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { cardShadow, colors, font, glassGradient, goldGradient, radius, spacing } from '@/theme';
import { AppBackground } from '@/components/premium';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.scrollContent, contentStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={!!refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.brand}
                  colors={[colors.brand]}
                  progressBackgroundColor={colors.panel}
                />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.scrollContent, contentStyle]}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

export function Card({
  children,
  style,
  elevated,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
}) {
  return (
    <View style={[styles.card, elevated && cardShadow, style]}>
      <LinearGradient
        colors={glassGradient}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      {children}
    </View>
  );
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

export function Divider() {
  return <View style={styles.divider} />;
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.h2}>{title}</Text>
      {action}
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

/** A small accent chip — used for the environment label and tags. */
export function Pill({ label, tone = 'brand' }: { label: string; tone?: 'brand' | 'up' | 'down' | 'muted' }) {
  const c = tone === 'up' ? colors.up : tone === 'down' ? colors.down : tone === 'muted' ? colors.muted : colors.brand;
  return (
    <View style={[styles.pill, { borderColor: c + '55', backgroundColor: c + '1A' }]}>
      <Text style={[styles.pillText, { color: c }]}>{label}</Text>
    </View>
  );
}

export function EnvironmentBadge() {
  return null;
}

/* ---------------- controls ---------------- */

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  icon?: IoniconName;
}) {
  const bg =
    variant === 'primary'
      ? colors.brand
      : variant === 'danger'
        ? colors.down
        : variant === 'success'
          ? colors.up
          : variant === 'ghost'
            ? 'transparent'
            : colors.panel2;
  const fg = variant === 'primary' ? '#1A1206' : variant === 'success' ? '#06231A' : variant === 'danger' ? '#fff' : colors.ink;
  const isOff = disabled || loading;
  const inner = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={styles.buttonInner}>
      {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={fg} /> : null}
      <Text style={[styles.buttonText, size === 'sm' && { fontSize: font.sm }, { color: fg }]}>{title}</Text>
    </View>
  );

  // Primary uses the gold gradient pill to match the premium brand language.
  if (variant === 'primary') {
    return (
      <Pressable onPress={onPress} disabled={isOff} style={({ pressed }) => [{ opacity: isOff ? 0.5 : pressed ? 0.9 : 1 }]}>
        <LinearGradient
          colors={goldGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.button, styles.buttonGold, size === 'sm' && styles.buttonSm]}
        >
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: bg, opacity: isOff ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && styles.buttonGhost,
      ]}
    >
      {inner}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string; error?: string | null }) {
  const { label, error, style, ...rest } = props;
  return (
    <View style={styles.inputWrap}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted2}
        style={[styles.input, !!error && styles.inputError, style]}
        autoCapitalize="none"
        {...rest}
      />
      {error ? <Text style={styles.inputErrorText}>{error}</Text> : null}
    </View>
  );
}

/* ---------------- status / states ---------------- */

const STATUS_COLOR: Record<string, string> = {
  APPROVED: colors.up, FILLED: colors.up, COMPLETED: colors.up, CREDITED: colors.up,
  SUCCESS: colors.up, CLEAR: colors.up, ACTIVE: colors.up, VERIFIED: colors.up, OPEN: colors.up, CURRENT: colors.up,
  PENDING: colors.warn, SUBMITTED: colors.warn, UNDER_REVIEW: colors.warn, CONFIRMING: colors.warn,
  PARTIALLY_FILLED: colors.warn, REVIEW_REQUIRED: colors.warn, NEEDS_MORE_INFO: colors.warn,
  PENDING_APPROVAL: colors.warn, REQUESTED: colors.warn, DETECTED: colors.warn,
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
    <Card style={styles.stateCard}>
      <Ionicons name="warning-outline" size={28} color={colors.down} />
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.centerText}>{message}</Text>
      {onRetry ? (
        <View style={{ marginTop: spacing.md, width: 160 }}>
          <Button title="Retry" variant="secondary" size="sm" onPress={onRetry} icon="refresh" />
        </View>
      ) : null}
    </Card>
  );
}

export function EmptyState({
  title,
  hint,
  icon = 'file-tray-outline',
  actionLabel,
  onAction,
}: {
  title: string;
  hint?: string;
  icon?: IoniconName;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card style={styles.stateCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.centerText}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.md, width: 200 }}>
          <Button title={actionLabel} variant="primary" size="sm" onPress={onAction} />
        </View>
      ) : null}
    </Card>
  );
}

/* ---------------- skeletons ---------------- */

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%` | 'auto'; style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ height, width, borderRadius: radius.sm, backgroundColor: colors.panel2, opacity }, style]} />;
}

export function SkeletonCard() {
  return (
    <Card>
      <Skeleton height={14} width="55%" />
      <Skeleton height={24} width="40%" style={{ marginTop: spacing.sm }} />
      <Skeleton height={12} width="80%" style={{ marginTop: spacing.sm }} />
    </Card>
  );
}

/** loading → error → empty → content flow with skeleton support. */
export function AsyncBoundary<T>({
  loading,
  error,
  data,
  onRetry,
  empty,
  skeleton,
  children,
}: {
  loading: boolean;
  error: string | null;
  data: T | null;
  onRetry?: () => void;
  empty?: { title: string; hint?: string; icon?: IoniconName; actionLabel?: string; onAction?: () => void };
  skeleton?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (loading && data === null) return <>{skeleton ?? <Loading />}</>;
  if (error && data === null) return <ErrorState message={error} onRetry={onRetry} />;
  if (data === null)
    return (
      <EmptyState
        title={empty?.title ?? 'Nothing here yet'}
        hint={empty?.hint}
        icon={empty?.icon}
        actionLabel={empty?.actionLabel}
        onAction={empty?.onAction}
      />
    );
  return <>{children(data)}</>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.glass,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  rowLabel: { color: colors.muted, fontSize: font.sm },
  rowValue: { color: colors.ink, fontSize: font.sm, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: spacing.xs },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { color: colors.ink, fontSize: font.xxl, fontWeight: '800' },
  h2: { color: colors.ink, fontSize: font.lg, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: font.sm },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: { fontSize: font.xs, fontWeight: '700' },
  environment: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.warn + '55', backgroundColor: colors.warn + '1A', paddingHorizontal: spacing.sm, paddingVertical: 3 },
  environmentText: { color: colors.warn, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  button: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonGold: { shadowColor: colors.brand, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  buttonSm: { height: 40, paddingHorizontal: spacing.md },
  buttonGhost: { borderWidth: 1, borderColor: colors.glassBorderGold, backgroundColor: 'rgba(245,194,66,0.04)' },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttonText: { fontSize: font.md, fontWeight: '700' },
  inputWrap: { gap: spacing.xs },
  inputLabel: { color: colors.muted, fontSize: font.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 54, color: colors.ink, fontSize: font.md },
  inputError: { borderColor: colors.down },
  inputErrorText: { color: colors.down, fontSize: font.xs },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: font.xs, fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.xs, minHeight: 160 },
  centerText: { color: colors.muted, fontSize: font.sm, textAlign: 'center' },
  stateCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  errorTitle: { color: colors.down, fontSize: font.md, fontWeight: '700' },
  emptyTitle: { color: colors.ink, fontSize: font.md, fontWeight: '700' },
});
