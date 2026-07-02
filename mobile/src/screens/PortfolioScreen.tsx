import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AsyncBoundary, EmptyState, Screen, Skeleton } from '@/components/ui';
import { BrandMark, GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { colors, font, radius, spacing, cardShadow } from '@/theme';
import { fmtNum, fmtAmount } from '@/utils/format';
import type { WalletOverview } from '@/types/api';
import { useAuth } from '@/store/auth';

function AssetLogo({ asset }: { asset: string }) {
  const cleanAsset = asset.toUpperCase();
  let bg = '#1F1E24';
  let char = cleanAsset.slice(0, 2);
  let color = '#FFF';

  if (cleanAsset === 'INR') {
    bg = '#F5C24222';
    char = '₹';
    color = '#F5C242';
  } else if (cleanAsset === 'BTC') {
    bg = '#FF990022';
    char = '₿';
    color = '#FF9900';
  } else if (cleanAsset === 'ETH') {
    bg = '#627EEA22';
    char = 'Ξ';
    color = '#627EEA';
  } else if (cleanAsset === 'USDT') {
    bg = '#26A17B22';
    char = '$';
    color = '#26A17B';
  }

  return (
    <View style={[styles.assetLogo, { backgroundColor: bg }]}>
      <Text style={[styles.assetLogoText, { color }]}>{char}</Text>
    </View>
  );
}

export default function PortfolioScreen() {
  const router = useRouter();
  const [showBalance, setShowBalance] = useState(true);
  const { features } = useAuth();
  
  const { data, loading, error, reload } = useApi<WalletOverview>(
    () => userApi.walletOverview().then((r) => r.data),
    [],
  );

  const balances = (data?.balances ?? []).filter((b) => {
    if (b.asset.toUpperCase() === 'INR') return true;
    return features?.cryptoWallet === true;
  });
  const inr = balances.find((b) => b.asset.toUpperCase() === 'INR');

  // Calculate total portfolio value safely based on real wallet balances
  const totalPortfolioVal = balances.reduce((acc, curr) => {
    if (curr.asset.toUpperCase() === 'INR') {
      return acc + Number(curr.total);
    }
    return acc;
  }, 0);

  return (
    <Screen refreshing={loading} onRefresh={reload} contentStyle={{ gap: spacing.md }}>
      {/* Header bar matching dashboard */}
      <View style={styles.header}>
        <BrandMark size="sm" subtitle="India" />
        <View style={styles.headerRight}>
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

      {/* Main Portfolio balance card */}
      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        skeleton={<Skeleton height={140} width="100%" />}
      >
        {() => (
          <>
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

              <View style={styles.pnlRow}>
                <Text style={styles.pnlText}>Available: </Text>
                <Text style={styles.pnlValue}>₹{fmtAmount(inr?.available ?? '0')}</Text>
                {Number(inr?.locked ?? 0) > 0 && (
                  <Text style={styles.pnlLocked}> (Locked: ₹{fmtAmount(inr?.locked ?? '0')})</Text>
                )}
              </View>
            </View>

            {/* Quick Actions deposit/withdraw */}
            <View style={styles.actions}>
              <Pressable style={styles.actionBtn} onPress={() => router.push('/deposit')}>
                <Ionicons name="arrow-down-circle-outline" size={20} color={colors.brand} />
                <Text style={styles.actionBtnText}>Deposit Funds</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => router.push('/withdraw')}>
                <Ionicons name="arrow-up-circle-outline" size={20} color={colors.brand} />
                <Text style={styles.actionBtnText}>Withdraw Payout</Text>
              </Pressable>
            </View>

            {/* List of Holdings */}
            <Text style={styles.sectionHeading}>Asset Holdings</Text>
            {balances.length === 0 ? (
              <EmptyState
                icon="wallet-outline"
                title="No balances yet"
                hint="Deposit INR to fund your account, then start trading."
                actionLabel="Make a deposit"
                onAction={() => router.push('/deposit')}
              />
            ) : (
              <GlassCard padded style={styles.listCard}>
                {balances.map((b) => {
                  const balanceNum = Number(b.total);
                  // Calculate estimated value in INR
                  let estVal = `₹${fmtAmount(b.total)}`;
                  if (b.asset.toUpperCase() === 'USDT') {
                    estVal = `≈ ₹${fmtAmount(balanceNum * 83.5)}`;
                  } else if (b.asset.toUpperCase() !== 'INR') {
                    // Crypto holdings show unit values
                    estVal = `Secured Storage`;
                  }

                  return (
                    <View key={b.asset} style={styles.holdingsItem}>
                      <AssetLogo asset={b.asset} />
                      
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={styles.assetTitle}>{b.asset === 'INR' ? 'Indian Rupee' : b.asset}</Text>
                        <Text style={styles.assetSub}>
                          Available: {b.asset === 'INR' ? `₹${fmtAmount(b.available)}` : fmtNum(b.available, 6)}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 1 }}>
                        <Text style={styles.assetTotal}>
                          {b.asset === 'INR' ? `₹${fmtAmount(b.total)}` : `${fmtNum(b.total, 6)} ${b.asset}`}
                        </Text>
                        <Text style={styles.assetValSub}>{estVal}</Text>
                      </View>
                    </View>
                  );
                })}
              </GlassCard>
            )}
          </>
        )}
      </AsyncBoundary>
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

  // Total Portfolio Value Main Hero Card styling
  heroCard: {
    height: 140,
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
  pnlRow: { flexDirection: 'row', alignItems: 'center' },
  pnlText: { color: colors.muted2, fontSize: font.xs, fontWeight: '600' },
  pnlValue: { color: colors.brand, fontSize: font.xs, fontWeight: '700' },
  pnlLocked: { color: colors.muted2, fontSize: 10 },

  actions: { flexDirection: 'row', gap: spacing.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#0F0F16',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    height: 48,
  },
  actionBtnText: { color: colors.ink, fontSize: font.sm, fontWeight: '700' },

  sectionHeading: { color: '#fff', fontSize: font.md, fontWeight: '800', marginTop: spacing.sm },
  listCard: { gap: spacing.xs },

  holdingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  assetLogo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  assetLogoText: { fontSize: font.md + 1, fontWeight: '800' },
  assetTitle: { color: '#fff', fontSize: font.sm, fontWeight: '800' },
  assetSub: { color: colors.muted2, fontSize: 10, marginTop: 1 },
  assetTotal: { color: '#fff', fontSize: font.sm, fontWeight: '800', fontFamily: 'monospace' },
  assetValSub: { color: colors.muted2, fontSize: 9, textAlign: 'right' },
});
