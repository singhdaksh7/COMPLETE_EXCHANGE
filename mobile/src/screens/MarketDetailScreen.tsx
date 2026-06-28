import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AsyncBoundary, Muted, Screen } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { colors, font, spacing, radius } from '@/theme';
import { fmtNum, fmtAmount } from '@/utils/format';
import type { OrderBook, Ticker } from '@/types/api';

interface DetailData {
  ticker: Ticker;
  book: OrderBook;
}

export default function MarketDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const sym = String(symbol ?? 'BTC-INR').replace('/', '-');

  const { data, loading, error, reload } = useApi<DetailData>(async () => {
    const [t, b] = await Promise.all([
      userApi.ticker(sym),
      userApi.orderBook(sym, 12).catch(() => ({ data: { symbol: sym, asks: [], bids: [] } })),
    ]);
    return { ticker: t.data, book: b.data };
  }, [sym]);

  const [activeInterval, setActiveInterval] = useState('1H');
  const intervals = ['1m', '5m', '15m', '1H', '4H', '1D', '1W'];
  const [activeTab, setActiveTab] = useState<'book' | 'depth'>('book');

  // Local favorite state for the star toggle
  const [isFav, setIsFav] = useState(false);

  return (
    <Screen refreshing={loading} onRefresh={reload} contentStyle={{ gap: spacing.md }}>
      <Stack.Screen options={{ headerShown: false }} />

      <AsyncBoundary loading={loading} error={error} data={data} onRetry={reload}>
        {({ ticker, book }) => {
          const cleanSym = sym.replace('-', '/');
          const pct = Number(ticker.priceChangePct);
          const up = pct >= 0;
          const usdPrice = Number(ticker.lastPrice) > 0 ? (Number(ticker.lastPrice) / 83.5).toFixed(2) : null;

          return (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
              {/* Top Custom Navigation Header */}
              <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={22} color={colors.ink} />
                </Pressable>
                <View style={styles.headerTitleContainer}>
                  <Text style={styles.headerTitle}>{cleanSym}</Text>
                  <Text style={styles.headerSubtitle}>Bitcoin / Indian Rupee</Text>
                </View>
                <View style={styles.headerRight}>
                  <Pressable onPress={() => setIsFav(!isFav)} style={styles.headerIconBtn}>
                    <Ionicons name={isFav ? 'star' : 'star-outline'} size={20} color={isFav ? colors.brand : colors.ink} />
                  </Pressable>
                  <Pressable style={styles.headerIconBtn}>
                    <Ionicons name="share-social-outline" size={20} color={colors.ink} />
                  </Pressable>
                </View>
              </View>

              {/* Price Details Block */}
              <View style={styles.priceContainer}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceText}>₹{fmtAmount(ticker.lastPrice)}</Text>
                  <View style={[styles.changeBadge, { backgroundColor: up ? colors.upSoft : colors.downSoft }]}>
                    <Text style={[styles.changeText, { color: up ? colors.up : colors.down }]}>
                      {up ? '+' : ''}{pct.toFixed(2)}%
                    </Text>
                  </View>
                </View>
                {usdPrice ? <Text style={styles.usdPriceText}>≈ ${usdPrice}</Text> : null}
              </View>

              {/* Live Tickers Grid */}
              <View style={styles.tickersGrid}>
                <View style={styles.tickerCol}>
                  <Text style={styles.tickerLabel}>24h High</Text>
                  <Text style={styles.tickerVal}>₹{fmtAmount(ticker.high24h)}</Text>
                </View>
                <View style={styles.tickerCol}>
                  <Text style={styles.tickerLabel}>24h Low</Text>
                  <Text style={styles.tickerVal}>₹{fmtAmount(ticker.low24h)}</Text>
                </View>
                <View style={styles.tickerCol}>
                  <Text style={styles.tickerLabel}>24h Volume ({cleanSym.split('/')[0]})</Text>
                  <Text style={styles.tickerVal}>{fmtNum(ticker.baseVolume24h, 2)}</Text>
                </View>
                <View style={styles.tickerCol}>
                  <Text style={styles.tickerLabel}>24h Volume (INR)</Text>
                  <Text style={styles.tickerVal}>₹{fmtAmount(Number(ticker.quoteVolume24h))}</Text>
                </View>
              </View>

              {/* Chart Intervals selector */}
              <View style={styles.intervalBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  {intervals.map((item) => {
                    const active = activeInterval === item;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => setActiveInterval(item)}
                        style={[styles.intervalBtn, active && styles.intervalBtnActive]}
                      >
                        <Text style={[styles.intervalText, active && styles.intervalTextActive]}>{item}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable style={styles.intervalBtn}>
                    <Ionicons name="analytics" size={14} color={colors.muted} />
                    <Text style={styles.intervalText}>Indicators</Text>
                  </Pressable>
                </ScrollView>
              </View>

              {/* Chart Visual Canvas */}
              <View style={styles.chartCanvas}>
                {/* Simulated vertical gridlines */}
                <View style={styles.gridLinesContainer}>
                  <View style={styles.gridLine} />
                  <View style={styles.gridLine} />
                  <View style={styles.gridLine} />
                  <View style={styles.gridLine} />
                </View>
                <Text style={styles.chartPlaceholderText}>No chart data yet</Text>
                <Text style={styles.chartPlaceholderSub}>Charts are coming soon in spot mode.</Text>
              </View>

              {/* Order Book / Depth selector tabs */}
              <View style={styles.tabContainer}>
                <Pressable
                  onPress={() => setActiveTab('book')}
                  style={[styles.tabBtn, activeTab === 'book' && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabText, activeTab === 'book' && styles.tabTextActive]}>Order Book</Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab('depth')}
                  style={[styles.tabBtn, activeTab === 'depth' && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabText, activeTab === 'depth' && styles.tabTextActive]}>Market Depth</Text>
                </Pressable>
              </View>

              {activeTab === 'book' ? (
                <GlassCard padded style={styles.bookCard}>
                  {/* Table headers */}
                  <View style={styles.bookTableHead}>
                    <Text style={styles.bookHeadText}>Total (INR)</Text>
                    <Text style={[styles.bookHeadText, { textAlign: 'center' }]}>Price (INR)</Text>
                    <Text style={[styles.bookHeadText, { textAlign: 'right' }]}>Amount ({cleanSym.split('/')[0]})</Text>
                  </View>

                  {/* Asks (Sells) in red */}
                  {book.asks.slice(0, 5).reverse().map((l, i) => {
                    const priceNum = Number(l.price);
                    const qtyNum = Number(l.quantity);
                    return (
                      <View key={`ask-${i}`} style={styles.bookRow}>
                        <Text style={styles.bookTotalVal}>₹{fmtAmount(priceNum * qtyNum)}</Text>
                        <Text style={[styles.bookPriceText, { color: colors.down }]}>₹{fmtAmount(l.price)}</Text>
                        <Text style={styles.bookQtyText}>{fmtNum(l.quantity, 4)}</Text>
                      </View>
                    );
                  })}

                  {/* Spread block */}
                  <View style={styles.spreadContainer}>
                    <Text style={[styles.spreadPrice, { color: up ? colors.up : colors.down }]}>
                      ₹{fmtAmount(ticker.lastPrice)} {up ? '▲' : '▼'}
                    </Text>
                    <Text style={styles.spreadSubText}>
                      Spread: ₹{fmtNum(Math.max(0, Number(book.asks[0]?.price ?? 0) - Number(book.bids[0]?.price ?? 0)), 2)}
                    </Text>
                  </View>

                  {/* Bids (Buys) in green */}
                  {book.bids.slice(0, 5).map((l, i) => {
                    const priceNum = Number(l.price);
                    const qtyNum = Number(l.quantity);
                    return (
                      <View key={`bid-${i}`} style={styles.bookRow}>
                        <Text style={styles.bookTotalVal}>₹{fmtAmount(priceNum * qtyNum)}</Text>
                        <Text style={[styles.bookPriceText, { color: colors.up }]}>₹{fmtAmount(l.price)}</Text>
                        <Text style={styles.bookQtyText}>{fmtNum(l.quantity, 4)}</Text>
                      </View>
                    );
                  })}

                  {book.asks.length === 0 && book.bids.length === 0 ? (
                    <Muted style={{ textAlign: 'center', paddingVertical: spacing.md }}>No order book yet.</Muted>
                  ) : null}
                </GlassCard>
              ) : (
                <GlassCard padded style={styles.depthPlaceholderCard}>
                  <Ionicons name="cellular-outline" size={32} color={colors.brand} />
                  <Text style={styles.depthPlaceholderTitle}>Market Depth chart coming soon</Text>
                </GlassCard>
              )}

              {/* Positions Coming soon card */}
              <View style={styles.comingSoonCard}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.brand} />
                <Text style={styles.comingSoonText}>
                  Positions are not available in INR-only spot mode.
                </Text>
              </View>

              {/* Bottom Quick Buy/Sell Buttons row */}
              <View style={styles.bottomCtaRow}>
                <Pressable
                  onPress={() => router.push(`/trade?symbol=${encodeURIComponent(sym)}&side=BUY`)}
                  style={[styles.ctaBtn, { backgroundColor: colors.up }]}
                >
                  <Text style={styles.ctaBtnText}>Quick Buy</Text>
                  <Text style={styles.ctaBtnSub}>Market Buy</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push(`/trade?symbol=${encodeURIComponent(sym)}&side=SELL`)}
                  style={[styles.ctaBtn, { backgroundColor: colors.down }]}
                >
                  <Text style={styles.ctaBtnText}>Quick Sell</Text>
                  <Text style={styles.ctaBtnSub}>Market Sell</Text>
                </Pressable>
              </View>
            </ScrollView>
          );
        }}
      </AsyncBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitleContainer: { flex: 1, marginLeft: spacing.sm },
  headerTitle: { color: '#fff', fontSize: font.md + 1, fontWeight: '900' },
  headerSubtitle: { color: colors.muted2, fontSize: 9, marginTop: 1 },
  headerRight: { flexDirection: 'row', gap: spacing.sm },
  headerIconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  // Price area
  priceContainer: { marginTop: spacing.md, paddingHorizontal: spacing.xs },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  priceText: { color: '#fff', fontSize: font.xxl + 2, fontWeight: '900', fontFamily: 'monospace' },
  changeBadge: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  changeText: { fontSize: font.sm - 2, fontWeight: '800' },
  usdPriceText: { color: colors.muted2, fontSize: font.xs, marginTop: 2 },

  // Tickers grid
  tickersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    backgroundColor: '#0F0F16',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  tickerCol: { width: '47%', gap: 3 },
  tickerLabel: { color: colors.muted2, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  tickerVal: { color: '#fff', fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },

  // Interval bar selector
  intervalBar: { flexDirection: 'row', marginTop: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)', paddingBottom: 6 },
  intervalBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  intervalBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  intervalText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  intervalTextActive: { color: '#1A1206' },

  // Chart Visual canvas
  chartCanvas: {
    height: 180,
    backgroundColor: '#07070B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.02)',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    position: 'relative',
  },
  gridLinesContainer: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xxl, opacity: 0.1 },
  gridLine: { width: 1, height: '100%', backgroundColor: colors.muted },
  chartPlaceholderText: { color: colors.muted, fontSize: font.md, fontWeight: '800' },
  chartPlaceholderSub: { color: colors.muted2, fontSize: 10, marginTop: 4 },

  // Tab selector
  tabContainer: { flexDirection: 'row', marginTop: spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  tabBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: colors.brand },
  tabText: { color: colors.muted, fontSize: font.sm, fontWeight: '700' },
  tabTextActive: { color: colors.brand },

  // Order Book list
  bookCard: { gap: spacing.xs, marginTop: spacing.sm },
  bookTableHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xs, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', paddingBottom: 4 },
  bookHeadText: { color: colors.muted2, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', flex: 1 },
  bookRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: spacing.xs },
  bookTotalVal: { color: colors.muted2, fontSize: 10, flex: 1, fontFamily: 'monospace' },
  bookPriceText: { fontSize: 11, fontWeight: '800', textAlign: 'center', flex: 1, fontFamily: 'monospace' },
  bookQtyText: { color: '#fff', fontSize: 10, textAlign: 'right', flex: 1, fontFamily: 'monospace' },

  // Spread container in middle of order book
  spreadContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    marginVertical: 4,
    paddingHorizontal: spacing.xs,
  },
  spreadPrice: { fontSize: font.md, fontWeight: '800', fontFamily: 'monospace' },
  spreadSubText: { color: colors.muted2, fontSize: 10 },

  depthPlaceholderCard: { height: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm },
  depthPlaceholderTitle: { color: colors.muted, fontSize: font.sm, fontWeight: '700' },

  // Positions coming soon notice
  comingSoonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(245,194,66,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(245,194,66,0.1)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  comingSoonText: { color: colors.brand, fontSize: font.xs, fontWeight: '600', flex: 1 },

  // Bottom quick Buy/Sell CTAs row
  bottomCtaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  ctaBtn: { flex: 1, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 1 },
  ctaBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '800' },
  ctaBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 8, fontWeight: '600' },
});
