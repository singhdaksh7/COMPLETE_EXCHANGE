import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, H2, Muted, Screen, StatusBadge } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/store/auth';
import { userApi } from '@/api/userApi';
import { colors, font, radius, spacing } from '@/theme';
import { fmtAmount, fmtNum, fmtPct } from '@/utils/format';
import type { Market, Ticker, Wallet } from '@/types/api';

interface DashData {
  balances: Wallet[];
  snapshot: { market: Market; ticker: Ticker | null }[];
}

async function loadDashboard(): Promise<DashData> {
  const [overview, marketsRes] = await Promise.all([
    userApi.walletOverview(),
    userApi.listMarkets(),
  ]);
  const markets = marketsRes.data.items.slice(0, 4);
  const tickers = await Promise.all(
    markets.map((m) =>
      userApi
        .ticker(m.symbol)
        .then((r) => r.data)
        .catch(() => null),
    ),
  );
  return {
    balances: overview.data.balances,
    snapshot: markets.map((market, i) => ({ market, ticker: tickers[i] })),
  };
}

function QuickAction({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable style={styles.qa} onPress={onPress}>
      <Text style={styles.qaIcon}>{icon}</Text>
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

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={styles.header}>
        <View>
          <Muted>Welcome back</Muted>
          <Text style={styles.email}>{user?.email ?? '—'}</Text>
        </View>
        <StatusBadge status={kycStatus} />
      </View>

      {/* Estimated balance */}
      <Card>
        <Muted>Estimated balance (INR available)</Muted>
        <Text style={styles.balance}>₹ {fmtAmount(inr?.available ?? '0')}</Text>
        {error ? <Muted>{error}</Muted> : null}
        <View style={styles.chips}>
          {(data?.balances ?? []).slice(0, 6).map((b) => (
            <View key={b.asset} style={styles.chip}>
              <Text style={styles.chipAsset}>{b.asset}</Text>
              <Text style={styles.chipAmt}>{fmtNum(b.total, 6)}</Text>
            </View>
          ))}
          {data && data.balances.length === 0 ? <Muted>No balances yet.</Muted> : null}
        </View>
      </Card>

      {/* Quick actions */}
      <View style={styles.actions}>
        <QuickAction label="Deposit" icon="↓" onPress={() => router.push('/deposit')} />
        <QuickAction label="Withdraw" icon="↑" onPress={() => router.push('/withdraw')} />
        <QuickAction label="Trade" icon="⇄" onPress={() => router.push('/(tabs)/markets')} />
        <QuickAction label="KYC" icon="🪪" onPress={() => router.push('/kyc')} />
      </View>

      {/* Market snapshot */}
      <View style={styles.sectionHead}>
        <H2>Markets</H2>
        <Pressable onPress={() => router.push('/(tabs)/markets')}>
          <Text style={styles.link}>See all →</Text>
        </Pressable>
      </View>
      <Card>
        {(data?.snapshot ?? []).map(({ market, ticker }) => {
          const pct = ticker ? Number(ticker.priceChangePct) : 0;
          return (
            <Pressable
              key={market.symbol}
              style={styles.marketRow}
              onPress={() => router.push(`/market/${encodeURIComponent(market.symbol)}`)}
            >
              <Text style={styles.marketSym}>{market.symbol}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.marketPrice}>{fmtNum(ticker?.lastPrice ?? null, 4)}</Text>
                <Text style={{ color: pct >= 0 ? colors.up : colors.down, fontSize: font.xs }}>
                  {ticker ? fmtPct(ticker.priceChangePct) : '—'}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {data && data.snapshot.length === 0 ? <Muted>No markets available.</Muted> : null}
      </Card>

      <Pressable onPress={() => router.push('/transactions')}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <H2>Recent transactions</H2>
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
  email: { color: colors.ink, fontSize: font.md, fontWeight: '700' },
  balance: { color: colors.ink, fontSize: font.xxl, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: { backgroundColor: colors.panel2, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  chipAsset: { color: colors.muted, fontSize: font.xs },
  chipAmt: { color: colors.ink, fontSize: font.sm, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  qa: { flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', gap: 4 },
  qaIcon: { color: colors.brand, fontSize: 20 },
  qaLabel: { color: colors.ink, fontSize: font.xs, fontWeight: '600' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  link: { color: colors.brand, fontSize: font.sm, fontWeight: '700' },
  marketRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  marketSym: { color: colors.ink, fontSize: font.md, fontWeight: '700' },
  marketPrice: { color: colors.ink, fontSize: font.md, fontWeight: '700' },
});
