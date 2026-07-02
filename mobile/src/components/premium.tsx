import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  font,
  glassGradient,
  glowGradient,
  goldGradient,
  radius,
  spacing,
} from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/* ============================================================
 * AppBackground — deep-black canvas with a soft gold glow at the
 * top (and a faint one at the bottom). Drop it behind any screen.
 * ============================================================ */
export function AppBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
      <LinearGradient
        colors={glowGradient}
        style={styles.glowTop}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <View style={styles.glowOrb} />
      <LinearGradient
        colors={['transparent', 'rgba(245,194,66,0.05)'] as const}
        style={styles.glowBottom}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
    </View>
  );
}

/* ============================================================
 * BrandMark — the EXORA emblem + wordmark.
 * ============================================================ */
export function ExoraEmblem({ size = 60 }: { size?: number }) {
  return (
    <Image 
      source={require('../../assets/exora-logo.png')} 
      style={{ width: size, height: size }} 
      resizeMode="contain" 
    />
  );
}

/* ============================================================
 * BrandMark — the EXORA emblem + wordmark.
 * ============================================================ */
export function BrandMark({
  size = 'md',
  showWordmark = true,
  subtitle = 'India Pvt. Ltd.',
}: {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  subtitle?: string | null;
}) {
  const dim = size === 'lg' ? 84 : size === 'sm' ? 40 : 60;
  const word = size === 'lg' ? 34 : size === 'sm' ? 18 : 26;
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm }}>
      <ExoraEmblem size={dim} />
      {showWordmark ? (
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.wordmark, { fontSize: word }]}>Exora</Text>
          {subtitle ? <Text style={styles.wordmarkSub}>{subtitle}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/* ============================================================
 * GlassCard — translucent rounded panel with a subtle sheen.
 * ============================================================ */
export function GlassCard({
  children,
  style,
  gold,
  padded = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  gold?: boolean;
  padded?: boolean;
}) {
  return (
    <View
      style={[
        styles.glassCard,
        gold && { borderColor: colors.glassBorderGold },
        padded && { padding: spacing.lg },
        style,
      ]}
    >
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

/* ============================================================
 * GoldButton — gradient pill CTA with glow.
 * ============================================================ */
export function GoldButton({
  title,
  onPress,
  loading,
  disabled,
  icon,
  variant = 'gold',
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IoniconName;
  variant?: 'gold' | 'outline' | 'dark';
  style?: ViewStyle;
}) {
  const off = disabled || loading;
  if (variant !== 'gold') {
    return (
      <Pressable
        onPress={onPress}
        disabled={off}
        style={({ pressed }) => [
          styles.btnBase,
          variant === 'outline' ? styles.btnOutline : styles.btnDark,
          { opacity: off ? 0.5 : pressed ? 0.85 : 1 },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <View style={styles.btnInner}>
            {icon ? <Ionicons name={icon} size={18} color={colors.ink} /> : null}
            <Text style={[styles.btnText, { color: colors.ink }]}>{title}</Text>
          </View>
        )}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={off} style={({ pressed }) => [{ opacity: off ? 0.55 : pressed ? 0.9 : 1 }, style]}>
      <LinearGradient
        colors={goldGradient}
        style={[styles.btnBase, styles.btnGold]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        {loading ? (
          <ActivityIndicator color="#1A1206" />
        ) : (
          <View style={styles.btnInner}>
            {icon ? <Ionicons name={icon} size={18} color="#1A1206" /> : null}
            <Text style={[styles.btnText, { color: '#1A1206' }]}>{title}</Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

/* ============================================================
 * PremiumInput — dark rounded input with optional icons.
 * ============================================================ */
export function PremiumInput(
  props: TextInputProps & {
    label?: string;
    error?: string | null;
    leftIcon?: IoniconName;
    rightSlot?: React.ReactNode;
  },
) {
  const { label, error, leftIcon, rightSlot, style, ...rest } = props;
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <View style={[styles.inputBox, !!error && { borderColor: colors.down }]}>
        {leftIcon ? <Ionicons name={leftIcon} size={18} color={colors.muted} /> : null}
        <TextInput
          placeholderTextColor={colors.muted2}
          style={[styles.input, style]}
          autoCapitalize="none"
          {...rest}
        />
        {rightSlot}
      </View>
      {error ? <Text style={styles.inputError}>{error}</Text> : null}
    </View>
  );
}

/* ============================================================
 * MetricCard — compact stat tile (icon, label, value, change).
 * ============================================================ */
export function MetricCard({
  icon,
  label,
  value,
  sub,
  changePct,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  value: string;
  sub?: string;
  changePct?: number | null;
  onPress?: () => void;
}) {
  const Wrap: React.ComponentType<{ children: React.ReactNode }> = onPress
    ? ({ children }) => (
        <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, flex: 1 }]}>
          {children}
        </Pressable>
      )
    : ({ children }) => <View style={{ flex: 1 }}>{children}</View>;
  return (
    <Wrap>
      <GlassCard style={styles.metric}>
        <View style={styles.metricIcon}>
          <Ionicons name={icon} size={16} color={colors.brand} />
        </View>
        <Text style={styles.metricLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.metricValue} numberOfLines={1}>
          {value}
        </Text>
        {sub ? (
          <Text style={styles.metricSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
        {changePct !== undefined && changePct !== null ? (
          <Text style={[styles.metricChange, { color: changePct >= 0 ? colors.up : colors.down }]}>
            {changePct >= 0 ? '+' : ''}
            {changePct.toFixed(2)}%
          </Text>
        ) : null}
      </GlassCard>
    </Wrap>
  );
}

/* ============================================================
 * BalanceCard — featured total-balance hero card.
 * ============================================================ */
export function BalanceCard({
  label,
  value,
  sub,
  right,
  footer,
}: {
  label: string;
  value: string;
  sub?: string;
  right?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <GlassCard gold style={{ overflow: 'hidden' }}>
      <View style={styles.glowCorner} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.balLabel}>{label}</Text>
          <Text style={styles.balValue}>{value}</Text>
          {sub ? <Text style={styles.balSub}>{sub}</Text> : null}
        </View>
        {right}
      </View>
      {footer ? <View style={{ marginTop: spacing.md }}>{footer}</View> : null}
    </GlassCard>
  );
}

/* ============================================================
 * MarketRow — asset list row with price + change.
 * ============================================================ */
export function MarketRow({
  symbol,
  sub,
  price,
  changePct,
  onPress,
}: {
  symbol: string;
  sub?: string;
  price: string;
  changePct?: number | null;
  onPress?: () => void;
}) {
  const up = (changePct ?? 0) >= 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.marketRow, { opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.assetBadge}>
        <Text style={styles.assetBadgeText}>{symbol.slice(0, 2)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.marketSym}>{symbol}</Text>
        {sub ? <Text style={styles.marketSub}>{sub}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.marketPrice}>{price}</Text>
        {changePct !== undefined && changePct !== null ? (
          <View style={[styles.changePill, { backgroundColor: up ? colors.upSoft : colors.downSoft }]}>
            <Text style={{ color: up ? colors.up : colors.down, fontSize: font.xs, fontWeight: '800' }}>
              {up ? '+' : ''}
              {changePct.toFixed(2)}%
            </Text>
          </View>
        ) : (
          <Text style={styles.marketSub}>—</Text>
        )}
      </View>
    </Pressable>
  );
}

/* ============================================================
 * TransactionRow — generic activity row.
 * ============================================================ */
export function TransactionRow({
  icon,
  title,
  sub,
  amount,
  amountColor,
  right,
}: {
  icon: IoniconName;
  title: string;
  sub?: string;
  amount?: string;
  amountColor?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.txRow}>
      <View style={styles.txIcon}>
        <Ionicons name={icon} size={16} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txTitle}>{title}</Text>
        {sub ? <Text style={styles.txSub}>{sub}</Text> : null}
      </View>
      {amount ? <Text style={[styles.txAmount, amountColor ? { color: amountColor } : null]}>{amount}</Text> : null}
      {right}
    </View>
  );
}

/* ============================================================
 * SectionHeader — title + optional "See all" action.
 * ============================================================ */
export function SectionHeading({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction}>
          <Text style={styles.sectionAction}>{actionLabel} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ============================================================
 * FeatureLockedState — premium "this feature is disabled" panel.
 * ============================================================ */
export function FeatureLockedState({ title, hint }: { title: string; hint?: string }) {
  return (
    <GlassCard style={{ alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm }}>
      <View style={styles.lockOrb}>
        <Ionicons name="lock-closed" size={26} color={colors.brand} />
      </View>
      <Text style={styles.lockTitle}>{title}</Text>
      {hint ? <Text style={styles.lockHint}>{hint}</Text> : null}
    </GlassCard>
  );
}

/* ============================================================
 * TrustChips — small reassurance badges (UI copy only).
 * ============================================================ */
export function TrustChips({ items }: { items: { icon: IoniconName; label: string }[] }) {
  return (
    <View style={styles.trustRow}>
      {items.map((it) => (
        <View key={it.label} style={styles.trustChip}>
          <Ionicons name={it.icon} size={14} color={colors.brand} />
          <Text style={styles.trustText}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  glowTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  glowOrb: {
    position: 'absolute',
    top: -120,
    alignSelf: 'center',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(245,194,66,0.10)',
  },
  glowBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 180 },

  emblem: { alignItems: 'center', justifyContent: 'center', shadowColor: colors.brand, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  wordmark: { color: colors.brand, fontWeight: '900', letterSpacing: 1 },
  wordmarkSub: { color: colors.brandDeep, fontSize: font.xs, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase', marginTop: 1 },

  glassCard: {
    backgroundColor: colors.glass,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
  },

  btnBase: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  btnGold: { shadowColor: colors.brand, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  btnOutline: { borderWidth: 1, borderColor: colors.glassBorderGold, backgroundColor: 'rgba(245,194,66,0.05)' },
  btnDark: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btnText: { fontSize: font.md, fontWeight: '800' },

  inputLabel: { color: colors.muted, fontSize: font.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 54 },
  input: { flex: 1, color: colors.ink, fontSize: font.md, height: '100%' },
  inputError: { color: colors.down, fontSize: font.xs },

  metric: { padding: spacing.md, gap: 3, minHeight: 96 },
  metricIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  metricLabel: { color: colors.muted, fontSize: font.xs },
  metricValue: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  metricSub: { color: colors.muted2, fontSize: 10 },
  metricChange: { fontSize: font.xs, fontWeight: '800' },

  glowCorner: { position: 'absolute', top: -50, right: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(245,194,66,0.12)' },
  balLabel: { color: colors.muted, fontSize: font.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  balValue: { color: colors.ink, fontSize: 32, fontWeight: '900', marginTop: 4 },
  balSub: { color: colors.muted, fontSize: font.sm, marginTop: 4 },

  marketRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  assetBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorderGold },
  assetBadgeText: { color: colors.brand, fontSize: font.xs, fontWeight: '900' },
  marketSym: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  marketSub: { color: colors.muted, fontSize: font.xs, marginTop: 1 },
  marketPrice: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  changePill: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3 },

  txRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  txIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  txTitle: { color: colors.ink, fontSize: font.sm, fontWeight: '700' },
  txSub: { color: colors.muted, fontSize: font.xs, marginTop: 1 },
  txAmount: { color: colors.ink, fontSize: font.sm, fontWeight: '800' },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  sectionTitle: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  sectionAction: { color: colors.brand, fontSize: font.sm, fontWeight: '700' },

  lockOrb: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorderGold },
  lockTitle: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  lockHint: { color: colors.muted, fontSize: font.sm, textAlign: 'center', paddingHorizontal: spacing.lg },

  trustRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.sm },
  trustChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  trustText: { color: colors.muted, fontSize: font.xs, fontWeight: '700' },
});
