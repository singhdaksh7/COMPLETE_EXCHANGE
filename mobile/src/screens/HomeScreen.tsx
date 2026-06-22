import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Muted, Screen, SectionHeader, Skeleton, StagingBadge, StatusBadge } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/store/auth';
import { userApi } from '@/api/userApi';
import { cardShadow, colors, font, radius, spacing } from '@/theme';
import { fmtAmount, fmtNum, fmtPct } from '@/utils/format';
import type { Market, Ticker, Wallet } from '@/types/api';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface DashData {
  balances: Wallet[];
  snapshot: { market: Market; ticker: Ticker | null }[];
}

async function loadDashboard(): Promise<DashData> {
  const [overview, marketsRes] = await Promise.all([userApi.walletOverview(), userApi.listMarkets()]);
  const markets = marketsRes.data.items.slice(0, 5);
  const tickers = await Promise.all(
    markets.map((m) => userApi.ticker(m.symbol).then((r) => r.data).catch(() => null)),
  );
  return { balances: overview.data.balances, snapshot: markets.map((market, i) => ({ market, ticker: tickers[i] })) };
}

function QuickAction({ label, icon, onPress }: { label: string; icon: IoniconName; onPress: () => void }) {
  return (
    <Pressable style={styles.qa} onPress={onPress}>
      <View style={styles.qaIconWrap}>
        <Ionicons name={icon} size={20} color={colors.brand} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(loadDashboard, []);

  const kycStatus = user?.kycStatus ?? 'NOT_STARTED';
  const inr = data?.balances.find((b) => b.asset.toUpperCase() === 'INR');
  const firstLoad = loading && data === null;

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={styles.header}>
        <View style={{ gap: 2 }}>
          <Muted>Welcome back</Muted>
          <Text style={styles.email} numberOfLines={1}>
            {user?.email ?? '—'}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/notifications')} hitSlop={10}>
          <Ionicons name="notifications-outline" size={24} color={colors.ink} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StagingBadge />
        <Pressable onPress={() => router.push('/kyc')}>
          <StatusBadge status={kycStatus} />
        </Pressable>
      </View>

      {/* Estimated balance */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceGlow} />
        <Text style={styles.balanceLabel}>Estimated balance · INR available</Text>
        {firstLoad ? (
          <Skeleton height={34} width="60%" style={{ marginTop: spacing.xs }} />
        ) : (
          <Text style={styles.balance}>₹ {fmtAmount(inr?.available ?? '0')}</Text>
        )}
        {error ? <Muted>{error}</Muted> : null}
        <View style={styles.chips}>
          {firstLoad ? (
            <>
              <Skeleton height={42} width={92} />
              <Skeleton height={42} width={92} />
              <Skeleton height={42} width={92} />
            </>
          ) : (data?.balances ?? []).length === 0 ? (
            <Muted>No balances yet — deposit to get started.</Muted>
          ) : (
            (data?.balances ?? []).slice(0, 6).map((b) => (
              <View key={b.asset} style={styles.chip}>
                <Text style={styles.chipAsset}>{b.asset}</Text>
                <Text style={styles.chipAmt}>{fmtNum(b.total, 6)}</Text>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Quick actions */}
      <View style={styles.actions}>
        <QuickAction label="Deposit" icon="arrow-down-circle-outline" onPress={() => router.push('/deposit')} />
        <QuickAction label="Withdraw" icon="arrow-up-circle-outline" onPress={() => router.push('/withdraw')} />
        <QuickAction label="Trade" icon="swap-horizontal-outline" onPress={() => router.push('/(tabs)/markets')} />
        <QuickAction label="KYC" icon="shield-checkmark-outline" onPress={() => router.push('/kyc')} />
      </View>

      {/* Market snapshot */}
      <SectionHeader
        title="Markets"
        action={
          <Pressable onPress={() => router.push('/(tabs)/markets')}>
            <Text style={styles.link}>See all →</Text>
          </Pressable>
        }
      />
      <Card>
        {firstLoad ? (
          <>
            <Skeleton height={18} width="100%" />
            <Skeleton height={18} width="100%" style={{ marginTop: spacing.md }} />
            <Skeleton height={18} width="100%" style={{ marginTop: spacing.md }} />
          </>
        ) : (data?.snapshot ?? []).length === 0 ? (
          <Muted>No markets available.</Muted>
        ) : (
          (data?.snapshot ?? []).map(({ market, ticker }) => {
            const pct = ticker ? Number(ticker.priceChangePct) : 0;
            return (
              <Pressable
                key={market.symbol}
                style={styles.marketRow}
                onPress={() => router.push(`/market/${encodeURIComponent(market.symbol)}`)}
              >
                <View>
                  <Text style={styles.marketSym}>{market.symbol}</Text>
                  <Text style={styles.marketSub}>
                    {market.baseAsset}/{market.quoteAsset}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.marketPrice}>{fmtNum(ticker?.lastPrice ?? null, 4)}</Text>
                  <Text style={{ color: pct >= 0 ? colors.up : colors.down, fontSize: font.xs, fontWeight: '700' }}>
                    {ticker ? fmtPct(ticker.priceChangePct) : '—'}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </Card>

      <Pressable onPress={() => router.push('/transactions')}>
        <Card>
          <View style={styles.recentRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="receipt-outline" size={20} color={colors.brand} />
              <Text style={styles.recentTitle}>Recent transactions</Text>
            </View>
            <Text style={styles.link}>View →</Text>
          </View>
          <Muted>Deposits, withdrawals and trades across your account.</Muted>
        </Card>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  email: { color: colors.ink, fontSize: font.md, fontWeight: '700', maxWidth: 240 },
  balanceCard: { backgroundColor: colors.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, overflow: 'hidden', ...cardShadow },
  balanceGlow: { position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: colors.brandSoft },
  balanceLabel: { color: colors.muted, fontSize: font.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  balance: { color: colors.ink, fontSize: 34, fontWeight: '900', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { backgroundColor: colors.panel2, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 84 },
  chipAsset: { color: colors.muted, fontSize: font.xs },
  chipAmt: { color: colors.ink, fontSize: font.sm, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  qa: { flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', gap: 6 },
  qaIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { color: colors.ink, fontSize: font.xs, fontWeight: '600' },
  link: { color: colors.brand, fontSize: font.sm, fontWeight: '700' },
  marketRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  marketSym: { color: colors.ink, fontSize: font.md, fontWeight: '700' },
  marketSub: { color: colors.muted, fontSize: font.xs },
  marketPrice: { color: colors.ink, fontSize: font.md, fontWeight: '700' },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentTitle: { color: colors.ink, fontSize: font.md, fontWeight: '700' },
});
