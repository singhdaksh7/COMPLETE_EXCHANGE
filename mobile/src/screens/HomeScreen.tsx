import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Muted, Screen, Skeleton, StatusBadge } from '@/components/ui';
import { BrandMark, GlassCard, MarketRow, SectionHeading } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/store/auth';
import { userApi } from '@/api/userApi';
import { colors, font, radius, spacing, cardShadow } from '@/theme';
import { fmtAmount, fmtNum } from '@/utils/format';
import type { Market, Ticker, Wallet } from '@/types/api';

interface DashData {
  balances: Wallet[];
  snapshot: { market: Market; ticker: Ticker | null }[];
  transactions: {
    id: string;
    type: 'deposit' | 'withdrawal';
    method: string;
    amount: string;
    asset: string;
    time: string;
    rawTime: number;
  }[];
}

async function loadDashboard(): Promise<DashData> {
  const [overview, marketsRes, depositsRes, withdrawalsRes] = await Promise.all([
    userApi.walletOverview(),
    userApi.listMarkets(),
    userApi.listInrDeposits().catch(() => ({ data: { items: [] } })),
    userApi.listInrWithdrawals().catch(() => ({ data: { items: [] } })),
  ]);

  const markets = marketsRes.data.items.slice(0, 4);
  const tickers = await Promise.all(
    markets.map((m) => userApi.ticker(m.symbol).then((r) => r.data).catch(() => null)),
  );

  // Merge recent INR activity into transactions list
  const txList: DashData['transactions'] = [];
  
  (depositsRes.data?.items ?? []).slice(0, 2).forEach((d) => {
    txList.push({
      id: d.id,
      type: 'deposit',
      method: d.method || 'INR Transfer',
      amount: `+₹${fmtAmount(d.amount)}`,
      asset: 'INR',
      time: new Date(d.createdAt).toLocaleDateString() || 'Today',
      rawTime: new Date(d.createdAt).getTime(),
    });
  });

  (withdrawalsRes.data?.items ?? []).slice(0, 2).forEach((w) => {
    txList.push({
      id: w.id,
      type: 'withdrawal',
      method: w.payout?.method || 'Bank Transfer',
      amount: `-₹${fmtAmount(w.amount)}`,
      asset: 'INR',
      time: new Date(w.createdAt).toLocaleDateString() || 'Today',
      rawTime: new Date(w.createdAt).getTime(),
    });
  });

  // Sort transactions by date desc
  txList.sort((a, b) => b.rawTime - a.rawTime);

  return {
    balances: overview.data.balances,
    snapshot: markets.map((market, i) => ({ market, ticker: tickers[i] })),
    transactions: txList.slice(0, 3),
  };
}

function QuickAction({ label, icon, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void }) {
  return (
    <Pressable style={styles.qa} onPress={onPress}>
      <View style={styles.qaIconWrap}>
        <Ionicons name={icon} size={20} color={colors.brand} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </Pressable>
  );
}

function MiniBalanceCard({ asset, label, value, sub }: { asset: string; label: string; value: string; sub?: string }) {
  const iconName = asset === 'INR' ? 'cash-outline' : asset === 'USDT' ? 'logo-usd' : 'logo-bitcoin';
  const iconColor = asset === 'INR' ? colors.brand : asset === 'USDT' ? colors.up : colors.brandLight;
  return (
    <View style={styles.miniCard}>
      <View style={styles.miniCardHeader}>
        <View style={[styles.miniIconBox, { backgroundColor: iconColor + '1F' }]}>
          <Ionicons name={iconName} size={15} color={iconColor} />
        </View>
        <Ionicons name="chevron-forward" size={12} color={colors.muted2} />
      </View>
      <Text style={styles.miniCardLabel}>{label}</Text>
      <Text style={styles.miniCardValue} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={styles.miniCardSub}>{sub}</Text> : null}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, features } = useAuth();
  const { data, loading, reload } = useApi(loadDashboard, []);
  const [showBalance, setShowBalance] = useState(true);

  const kycStatus = user?.kycStatus ?? 'NOT_STARTED';
  const balances = (data?.balances ?? []).filter((b) => {
    if (b.asset.toUpperCase() === 'INR') return true;
    return features?.cryptoWallet === true;
  });
  const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');
  
  // Calculate total portfolio value safely based on real wallet balances
  const totalPortfolioVal = balances.reduce((acc, curr) => {
    // If INR, add directly, if crypto, we don't assume prices unless we have tickers.
    // For now we present the real INR balance as the primary portfolio value.
    if (curr.asset.toUpperCase() === 'INR') {
      return acc + Number(curr.total);
    }
    return acc;
  }, 0);

  const firstLoad = loading && data === null;

  return (
    <Screen refreshing={loading} onRefresh={reload} contentStyle={{ gap: spacing.md }}>
      {/* Header Area */}
      <View style={styles.header}>
        <BrandMark size="sm" subtitle="India" />
        <View style={styles.headerRight}>
          {/* Notification bell with indicator badge */}
          <Pressable style={styles.bellBtn} onPress={() => router.push('/notifications')} hitSlop={10}>
            <Ionicons name="notifications" size={22} color={colors.ink} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>8</Text>
            </View>
          </Pressable>
          
          <Pressable onPress={() => router.push('/(tabs)/profile')} hitSlop={10}>
            <View style={styles.avatar}>
              <Ionicons name="person-sharp" size={16} color={colors.brand} />
            </View>
          </Pressable>
        </View>
      </View>

      {/* KYC / Status Badges Row */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <Pressable onPress={() => router.push('/kyc')}>
          <StatusBadge status={kycStatus} />
        </Pressable>
      </View>

      {/* Main Portfolio Value Card */}
      {firstLoad ? (
        <GlassCard gold style={styles.heroSkeleton}>
          <Skeleton height={14} width="50%" />
          <Skeleton height={32} width="65%" style={{ marginTop: spacing.sm }} />
        </GlassCard>
      ) : (
        <View style={[styles.heroCard, cardShadow]}>
          <LinearGradient
            colors={['rgba(245,194,66,0.06)', 'rgba(6,6,10,0.95)']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroHeader}>
            <Pressable onPress={() => setShowBalance(!showBalance)} style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>Total Portfolio Value</Text>
              <Ionicons name={showBalance ? 'eye-outline' : 'eye-off-outline'} size={14} color={colors.muted} />
            </Pressable>
            
            <View style={styles.durationSelector}>
              <Text style={styles.durationText}>This Week</Text>
              <Ionicons name="chevron-down" size={10} color={colors.brand} />
            </View>
          </View>

          <Text style={styles.heroBalance}>
            {showBalance ? `₹${fmtAmount(totalPortfolioVal)}` : '••••••'}
          </Text>

          {/* Today's PnL is kept "Unavailable" honestly unless backend PnL exists */}
          <View style={styles.pnlPill}>
            <Text style={styles.pnlPillText}>Today PnL: </Text>
            <Text style={[styles.pnlPillText, { color: colors.muted, fontWeight: '700' }]}>Unavailable</Text>
          </View>

          {/* Simulated Gold Wave Graphic */}
          <View style={styles.waveChart}>
            <View style={styles.waveLine} />
            <LinearGradient
              colors={['rgba(245,194,66,0.15)', 'rgba(245,194,66,0.01)']}
              style={styles.waveFill}
            />
          </View>

          {/* X Axis Labels */}
          <View style={styles.xAxisRow}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <Text key={day} style={styles.xAxisLabel}>{day}</Text>
            ))}
          </View>
        </View>
      )}

      {/* Horizontal Scroll of Assets Balances */}
      {!firstLoad && balances.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroll}
        >
          {/* INR Balance Card */}
          <MiniBalanceCard
            asset="INR"
            label="INR Balance"
            value={`₹${fmtAmount(inr?.total ?? '0')}`}
            sub={Number(inr?.locked ?? 0) > 0 ? `Locked ₹${fmtAmount(inr?.locked ?? '0')}` : 'Spendable INR'}
          />

          {/* USDT Balance Card */}
          {balances.filter((b) => b.asset.toUpperCase() === 'USDT').map((b) => (
            <MiniBalanceCard
              key={b.asset}
              asset="USDT"
              label="USDT Balance"
              value={`${fmtNum(b.total, 2)} USDT`}
              sub={`≈ ₹${fmtAmount(Number(b.total) * 83.5)}`}
            />
          ))}

          {/* BTC Holdings Card */}
          {balances.filter((b) => b.asset.toUpperCase() === 'BTC').map((b) => (
            <MiniBalanceCard
              key={b.asset}
              asset="BTC"
              label="BTC Holdings"
              value={`${fmtNum(b.total, 4)} BTC`}
              sub="Secure Storage"
            />
          ))}

          {/* ETH Holdings Card */}
          {balances.filter((b) => b.asset.toUpperCase() === 'ETH').map((b) => (
            <MiniBalanceCard
              key={b.asset}
              asset="ETH"
              label="ETH Holdings"
              value={`${fmtNum(b.total, 4)} ETH`}
              sub="Secure Storage"
            />
          ))}
        </ScrollView>
      )}

      {/* Quick Actions (Visually redesigned to match dashboard) */}
      <View style={styles.actions}>
        {features?.inrDeposit !== false && (
          <QuickAction label="Deposit" icon="arrow-down-sharp" onPress={() => router.push('/deposit')} />
        )}
        {features?.inrWithdrawal !== false && (
          <QuickAction label="Withdraw" icon="arrow-up-sharp" onPress={() => router.push('/withdraw')} />
        )}
        <QuickAction label="Markets" icon="stats-chart" onPress={() => router.push('/(tabs)/markets')} />
        <QuickAction label="Profile" icon="person-sharp" onPress={() => router.push('/(tabs)/profile')} />
      </View>

      {/* Recent Transactions list */}
      <SectionHeading title="Recent Transactions" actionLabel="View All" onAction={() => router.push('/transactions')} />
      <GlassCard padded>
        {firstLoad ? (
          <Skeleton height={18} width="100%" />
        ) : (data?.transactions ?? []).length === 0 ? (
          <Muted style={{ textAlign: 'center', paddingVertical: spacing.md }}>No transactions yet.</Muted>
        ) : (
          (data?.transactions ?? []).map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <View style={[styles.txIconBox, { backgroundColor: tx.type === 'deposit' ? colors.upSoft : colors.downSoft }]}>
                <Ionicons
                  name={tx.type === 'deposit' ? 'arrow-down-outline' : 'arrow-up-outline'}
                  size={16}
                  color={tx.type === 'deposit' ? colors.up : colors.down}
                />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.txTitle}>{tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</Text>
                <Text style={styles.txSub}>{tx.method}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.txAmount, { color: tx.type === 'deposit' ? colors.up : colors.down }]}>
                  {tx.amount}
                </Text>
                <Text style={styles.txDate}>{tx.time}</Text>
              </View>
            </View>
          ))
        )}
      </GlassCard>

      {/* Markets Snapshot */}
      <SectionHeading title="Markets Today" actionLabel="See All" onAction={() => router.push('/(tabs)/markets')} />
      <GlassCard padded>
        {firstLoad ? (
          <>
            <Skeleton height={18} width="100%" />
            <Skeleton height={18} width="100%" style={{ marginTop: spacing.sm }} />
          </>
        ) : (data?.snapshot ?? []).length === 0 ? (
          <Muted>No markets available.</Muted>
        ) : (
          (data?.snapshot ?? []).map(({ market, ticker }) => (
            <MarketRow
              key={market.symbol}
              symbol={market.symbol}
              sub={`${market.baseAsset}/${market.quoteAsset}`}
              price={ticker?.lastPrice ? fmtNum(ticker.lastPrice, 4) : 'Price unavailable'}
              changePct={ticker ? Number(ticker.priceChangePct) : null}
              onPress={() => router.push(`/market/${encodeURIComponent(market.symbol)}`)}
            />
          ))
        )}
      </GlassCard>

      {/* Extra layout components: Fear & Greed Index */}
      <View style={styles.bottomRow}>
        <View style={styles.sentimentCard}>
          <Text style={styles.sentimentCardTitle}>Market Sentiment</Text>
          <View style={styles.gaugeContainer}>
            {/* Custom styled gauge semicircle */}
            <View style={styles.gaugeSemicircle}>
              <View style={styles.gaugeNeedle} />
            </View>
            <View style={styles.gaugeInnerContent}>
              <Text style={styles.gaugeScore}>72</Text>
              <Text style={[styles.gaugeStatus, { color: colors.up }]}>Greed</Text>
            </View>
          </View>
          <Text style={styles.gaugeDetail}>Today&rsquo;s Sentiment is Positive based on index</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  headerRight: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorderGold },
  
  bellBtn: { position: 'relative', width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#1A1206', fontSize: 8, fontWeight: '800' },

  heroSkeleton: { height: 160 },
  
  // Total Portfolio Value Main Hero Card styling
  heroCard: {
    height: 170,
    backgroundColor: '#0F0F16',
    borderWidth: 1,
    borderColor: colors.glassBorderGold,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroTitle: { color: colors.muted, fontSize: font.xs, fontWeight: '700', letterSpacing: 0.5 },
  
  durationSelector: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { color: colors.brand, fontSize: 9, fontWeight: '700' },

  heroBalance: { color: '#fff', fontSize: font.xxl, fontWeight: '900', fontFamily: 'monospace' },
  
  pnlPill: { alignSelf: 'flex-start', flexDirection: 'row', backgroundColor: 'rgba(22,199,132,0.1)', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pnlPillText: { color: colors.up, fontSize: font.xs, fontWeight: '600' },

  // Simulated Wave Chart in balance card
  waveChart: { position: 'absolute', bottom: 32, left: 0, right: 0, height: 50 },
  waveLine: { height: 2, backgroundColor: colors.brand, shadowColor: colors.brand, shadowOpacity: 0.6, shadowRadius: 3, top: 20 },
  waveFill: { ...StyleSheet.absoluteFillObject },

  xAxisRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)', paddingTop: 4 },
  xAxisLabel: { color: colors.muted2, fontSize: 8, fontWeight: '700' },

  // Horizontal scroll of assets cards
  horizontalScroll: { gap: spacing.sm, paddingRight: spacing.xl },
  miniCard: {
    width: 120,
    backgroundColor: '#0F0F16',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 3,
  },
  miniCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  miniIconBox: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  miniCardLabel: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  miniCardValue: { color: '#fff', fontSize: font.sm, fontWeight: '800', fontFamily: 'monospace' },
  miniCardSub: { color: colors.muted2, fontSize: 8 },

  // Quick Action Buttons dashboard style
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  qa: { flex: 1, backgroundColor: '#0F0F16', borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', gap: 6 },
  qaIconWrap: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorderGold },
  qaLabel: { color: colors.ink, fontSize: font.xs, fontWeight: '700' },

  // Recent Transaction row styles
  txRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  txIconBox: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  txTitle: { color: '#fff', fontSize: font.sm, fontWeight: '700' },
  txSub: { color: colors.muted2, fontSize: 10, marginTop: 1 },
  txAmount: { fontSize: font.sm, fontWeight: '800', textAlign: 'right' },
  txDate: { color: colors.muted2, fontSize: 9, textAlign: 'right', marginTop: 1 },

  // Fear & Greed / Sentiment
  bottomRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.xs },
  sentimentCard: { flex: 1, backgroundColor: '#0F0F16', borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', gap: spacing.sm },
  sentimentCardTitle: { color: colors.ink, fontSize: font.sm, fontWeight: '800', alignSelf: 'flex-start' },
  gaugeContainer: { width: 140, height: 74, position: 'relative', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  gaugeSemicircle: { width: 120, height: 60, borderTopLeftRadius: 60, borderTopRightRadius: 60, borderWidth: 8, borderColor: colors.line, borderTopColor: colors.brand, borderLeftColor: colors.brand, position: 'relative' },
  gaugeNeedle: { position: 'absolute', bottom: 0, left: 52, width: 6, height: 32, backgroundColor: colors.brand, transform: [{ rotate: '45deg' }] },
  gaugeInnerContent: { position: 'absolute', bottom: 0, alignItems: 'center' },
  gaugeScore: { color: '#fff', fontSize: font.xl, fontWeight: '900' },
  gaugeStatus: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  gaugeDetail: { color: colors.muted, fontSize: 9, fontWeight: '600', textAlign: 'center' },
});
