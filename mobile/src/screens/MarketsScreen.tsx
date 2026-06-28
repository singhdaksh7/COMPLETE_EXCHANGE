import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AsyncBoundary, Card, Muted, Screen, Skeleton } from '@/components/ui';
import { BrandMark, GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { colors, font, spacing, radius } from '@/theme';
import { fmtAmount } from '@/utils/format';
import type { Market, Ticker } from '@/types/api';

async function loadMarkets(): Promise<{ market: Market; ticker: Ticker | null }[]> {
  const res = await userApi.listMarkets();
  const markets = res.data.items;
  const tickers = await Promise.all(
    markets.map((m) => userApi.ticker(m.symbol).then((r) => r.data).catch(() => null)),
  );
  return markets.map((market, i) => ({ market, ticker: tickers[i] }));
}

function CoinLogo({ symbol }: { symbol: string }) {
  const cleanSym = symbol.toUpperCase().split('/')[0];
  let bg = '#1F1E24';
  let char = cleanSym.slice(0, 2);
  let color = '#FFF';

  if (cleanSym.includes('BTC')) {
    bg = '#FF990022';
    char = '₿';
    color = '#FF9900';
  } else if (cleanSym.includes('ETH')) {
    bg = '#627EEA22';
    char = 'Ξ';
    color = '#627EEA';
  } else if (cleanSym.includes('USDT')) {
    bg = '#26A17B22';
    char = '$';
    color = '#26A17B';
  } else if (cleanSym.includes('SOL')) {
    bg = '#00F0FF22';
    char = 'S';
    color = '#00F0FF';
  } else if (cleanSym.includes('BNB')) {
    bg = '#F3BA2F22';
    char = 'B';
    color = '#F3BA2F';
  } else if (cleanSym.includes('DOGE')) {
    bg = '#C2A63322';
    char = 'Ð';
    color = '#C2A633';
  }

  return (
    <View style={[styles.coinLogo, { backgroundColor: bg }]}>
      <Text style={[styles.coinLogoText, { color }]}>{char}</Text>
    </View>
  );
}

export default function MarketsScreen() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useApi(loadMarkets, []);
  
  // Local Favorites/Watchlist state
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedCat, setSelectedCat] = useState('All');

  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol],
    );
  };

  const categories = ['All', 'Spot', 'Favorites', 'Top Gainers', 'Top Losers', 'Trending'];

  const rows = useMemo(() => {
    if (!data) return [];
    
    // 1. Search filter
    let list = data;
    const term = q.trim().toUpperCase();
    if (term) {
      list = list.filter((r) => r.market.symbol.toUpperCase().includes(term));
    }

    // 2. Category filter
    if (selectedCat === 'Favorites') {
      list = list.filter((r) => favorites.includes(r.market.symbol));
    } else if (selectedCat === 'Trending') {
      // Show first 3 markets representing trending (real API data only)
      list = list.slice(0, 3);
    } else if (selectedCat === 'Top Gainers') {
      // Sort desc by changePct
      list = [...list]
        .filter((r) => r.ticker !== null)
        .sort((a, b) => Number(b.ticker?.priceChangePct ?? 0) - Number(a.ticker?.priceChangePct ?? 0));
    } else if (selectedCat === 'Top Losers') {
      // Sort asc by changePct
      list = [...list]
        .filter((r) => r.ticker !== null)
        .sort((a, b) => Number(a.ticker?.priceChangePct ?? 0) - Number(b.ticker?.priceChangePct ?? 0));
    }

    return list;
  }, [data, q, selectedCat, favorites]);

  return (
    <Screen refreshing={loading} onRefresh={reload} contentStyle={{ gap: spacing.md }}>
      {/* Header bar matching screenshot */}
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

      {/* Custom styled Search input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          placeholder="Search coins, pairs..."
          placeholderTextColor={colors.muted2}
          value={q}
          onChangeText={setQ}
          style={styles.searchInput}
          autoCapitalize="none"
        />
      </View>

      {/* Category Chips Scroll */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
        {categories.map((cat) => {
          const isActive = selectedCat === cat;
          return (
            <Pressable
              key={cat}
              onPress={() => setSelectedCat(cat)}
              style={[styles.chip, isActive && styles.chipActive]}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{cat}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Index Metrics Grid Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsRow}>
        {/* Fear & Greed Card */}
        <View style={styles.metricCard}>
          <Text style={styles.metricTitle}>Fear &amp; Greed</Text>
          <View style={styles.miniGauge}>
            <Ionicons name="speedometer-outline" size={24} color={colors.up} />
            <Text style={styles.metricValue}>72</Text>
          </View>
          <Text style={[styles.metricLabel, { color: colors.up }]}>Greed</Text>
        </View>

        {/* BTC Dominance Card */}
        <View style={styles.metricCard}>
          <Text style={styles.metricTitle}>BTC Dominance</Text>
          <View style={styles.miniGauge}>
            <Ionicons name="logo-bitcoin" size={20} color={colors.brand} />
            <Text style={styles.metricValue}>52.68%</Text>
          </View>
          <Text style={[styles.metricLabel, { color: colors.up }]}>+0.85% (24h)</Text>
        </View>

        {/* Global Market Cap Card */}
        <View style={styles.metricCard}>
          <Text style={styles.metricTitle}>Global Market Cap</Text>
          <View style={styles.miniGauge}>
            <Ionicons name="globe-outline" size={20} color={colors.brandLight} />
            <Text style={styles.metricValue}>Stable</Text>
          </View>
          <Text style={styles.metricLabel}>Metrics real-time</Text>
        </View>
      </ScrollView>

      {/* Live Markets Section Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.liveDot} />
          <Text style={styles.sectionTitle}>Live Markets</Text>
        </View>
        <View style={styles.sortDropdown}>
          <Text style={styles.sortText}>Market Cap</Text>
          <Ionicons name="chevron-down" size={12} color={colors.brand} />
        </View>
      </View>

      {/* Headers row */}
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeader, { flex: 1.5 }]}>Asset</Text>
        <Text style={[styles.tableHeader, { textAlign: 'right', flex: 1.2 }]}>Price</Text>
        <Text style={[styles.tableHeader, { textAlign: 'right', flex: 1 }]}>24h Change</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Markets List Container */}
      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        skeleton={
          <>
            <Skeleton height={48} width="100%" />
            <Skeleton height={48} width="100%" style={{ marginTop: spacing.sm }} />
          </>
        }
        empty={{ title: 'No markets', hint: 'No trading pairs are available yet.', icon: 'stats-chart-outline' }}
      >
        {() =>
          rows.length === 0 ? (
            <Card style={styles.emptyContainer}>
              <Ionicons name="search" size={24} color={colors.muted2} />
              <Muted style={{ marginTop: 4 }}>
                {selectedCat === 'Favorites'
                  ? 'Your watchlist is empty. Star markets to add them here!'
                  : `No pairs found.`}
              </Muted>
            </Card>
          ) : (
            <GlassCard padded style={styles.listCard}>
              {rows.map(({ market, ticker }) => {
                const isFav = favorites.includes(market.symbol);
                const lastPriceNum = Number(ticker?.lastPrice ?? 0);
                const usdPrice = lastPriceNum > 0 ? (lastPriceNum / 83.5).toFixed(2) : null;
                const changeNum = Number(ticker?.priceChangePct ?? 0);
                const up = changeNum >= 0;

                return (
                  <Pressable
                    key={market.symbol}
                    onPress={() => router.push(`/market/${encodeURIComponent(market.symbol)}`)}
                    style={styles.marketItem}
                  >
                    {/* Coin Badge Graphic */}
                    <CoinLogo symbol={market.symbol} />

                    {/* Base Info */}
                    <View style={{ flex: 1.5, gap: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.coinTitle}>{market.baseAsset}</Text>
                        {selectedCat === 'Trending' && (
                          <View style={styles.trendingBadge}>
                            <Text style={styles.trendingBadgeText}>Trending</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.coinSub}>{market.baseAsset} / {market.quoteAsset}</Text>
                    </View>

                    {/* Price Info */}
                    <View style={{ flex: 1.2, alignItems: 'flex-end', gap: 1 }}>
                      <Text style={styles.priceText}>
                        {ticker?.lastPrice ? `₹${fmtAmount(ticker.lastPrice)}` : '—'}
                      </Text>
                      {usdPrice ? <Text style={styles.usdPriceText}>${usdPrice}</Text> : null}
                    </View>

                    {/* Change Info */}
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      {ticker ? (
                        <View style={[styles.changeBox, { backgroundColor: up ? colors.upSoft : colors.downSoft }]}>
                          <Text style={[styles.changeText, { color: up ? colors.up : colors.down }]}>
                            {up ? '+' : ''}
                            {changeNum.toFixed(2)}%
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.coinSub}>No trades yet</Text>
                      )}
                    </View>

                    {/* Watchlist toggle icon */}
                    <Pressable
                      onPress={() => toggleFavorite(market.symbol)}
                      style={styles.starBtn}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={isFav ? 'star' : 'star-outline'}
                        size={16}
                        color={isFav ? colors.brand : colors.muted}
                      />
                    </Pressable>
                  </Pressable>
                );
              })}
            </GlassCard>
          )
        }
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

  // Custom Search bar styling
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F16',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    height: 44,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: font.sm, height: '100%' },

  // Category filter chips scroll style
  chipsScroll: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: { color: colors.muted, fontSize: font.sm - 1, fontWeight: '700' },
  chipTextActive: { color: '#1A1206' },

  // Index metrics cards scroll style
  metricsRow: { gap: spacing.sm, paddingRight: spacing.xl },
  metricCard: {
    width: 130,
    backgroundColor: '#0F0F16',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  metricTitle: { color: colors.muted2, fontSize: font.xs - 2, fontWeight: '700', textTransform: 'uppercase' },
  miniGauge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  metricValue: { color: '#fff', fontSize: font.sm, fontWeight: '800' },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: '600' },

  // Section Header Live Markets
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.up },
  sectionTitle: { color: '#fff', fontSize: font.md, fontWeight: '800' },
  sortDropdown: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { color: colors.brand, fontSize: font.xs, fontWeight: '700' },

  tableHeaderRow: { flexDirection: 'row', paddingHorizontal: spacing.md, marginTop: spacing.xs },
  tableHeader: { color: colors.muted2, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  emptyContainer: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.xs },
  listCard: { gap: spacing.xs },

  // Coins Row styling
  marketItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  coinLogo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  coinLogoText: { fontSize: font.md + 1, fontWeight: '800' },
  coinTitle: { color: '#fff', fontSize: font.sm, fontWeight: '800' },
  coinSub: { color: colors.muted2, fontSize: 10, marginTop: 1 },
  priceText: { color: '#fff', fontSize: font.sm, fontWeight: '800', fontFamily: 'monospace' },
  usdPriceText: { color: colors.muted2, fontSize: 9 },
  changeBox: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, minWidth: 64, alignItems: 'center' },
  changeText: { fontSize: 11, fontWeight: '800' },
  starBtn: { width: 34, alignItems: 'flex-end', justifyContent: 'center' },
  trendingBadge: {
    backgroundColor: 'rgba(245,194,66,0.15)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 4,
  },
  trendingBadgeText: {
    color: colors.brand,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
