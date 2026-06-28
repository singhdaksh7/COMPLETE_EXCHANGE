import React, { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AsyncBoundary, EmptyState, Screen, Skeleton } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import { fmtDate, fmtNum, fmtAmount } from '@/utils/format';
import type { Order } from '@/types/api';

type Tab = 'open' | 'history';

export default function OrdersScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('open');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Filters state
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'LIMIT' | 'MARKET'>('ALL');

  const { data, loading, error, reload } = useApi<Order[]>(
    () =>
      (tab === 'open' ? userApi.openOrders() : userApi.orderHistory({ limit: 50 })).then(
        (r) => r.data.items,
      ),
    [tab],
  );

  const cancel = async (id: string) => {
    setErr(null);
    setCancelling(id);
    try {
      await userApi.cancelOrder(id);
      reload();
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setCancelling(null);
    }
  };

  const cancelAll = async () => {
    if (!data) return;
    setErr(null);
    const openOrdersList = data.filter(
      (o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED' || o.status === 'PENDING',
    );
    if (openOrdersList.length === 0) return;

    setBusy(true);
    try {
      await Promise.all(openOrdersList.map((o) => userApi.cancelOrder(o.id)));
      reload();
    } catch {
      setErr('Failed to cancel some orders.');
    } finally {
      setBusy(false);
    }
  };

  const [busy, setBusy] = useState(false);

  // Compute filtered orders
  const filteredOrders = useMemo(() => {
    if (!data) return [];
    return data.filter((o) => {
      const matchSide = sideFilter === 'ALL' || o.side === sideFilter;
      const matchType = typeFilter === 'ALL' || o.type === typeFilter;
      return matchSide && matchType;
    });
  }, [data, sideFilter, typeFilter]);

  // Compute dashboard sums
  const dashboardStats = useMemo(() => {
    if (!data || tab !== 'open') return { reserved: 0, pending: 0, totalVal: 0 };
    let reserved = 0;
    let totalVal = 0;

    data.forEach((o) => {
      const priceVal = Number(o.price ?? 0);
      const remainingQty = Number(o.quantity) - Number(o.filledQuantity);
      const totalQty = Number(o.quantity);
      
      reserved += priceVal * remainingQty;
      totalVal += priceVal * totalQty;
    });

    return { reserved, pending: data.length, totalVal };
  }, [data, tab]);

  const uniquePairs = useMemo(() => {
    if (!data) return 0;
    return new Set(data.map((o) => o.marketSymbol)).size;
  }, [data]);

  return (
    <Screen refreshing={loading} onRefresh={reload} contentStyle={{ gap: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        
        {/* Title Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Open Orders</Text>
          <Text style={styles.subtitle}>Manage your active orders</Text>
        </View>

        {/* Tab Toggle Row */}
        <View style={styles.tabToggleRow}>
          <Pressable
            onPress={() => setTab('open')}
            style={[styles.tabToggleBtn, tab === 'open' && styles.tabToggleActive]}
          >
            <Text style={[styles.tabToggleText, tab === 'open' && styles.tabToggleTextActive]}>Active</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('history')}
            style={[styles.tabToggleBtn, tab === 'history' && styles.tabToggleActive]}
          >
            <Text style={[styles.tabToggleText, tab === 'history' && styles.tabToggleTextActive]}>History</Text>
          </Pressable>
        </View>

        {tab === 'open' && !loading && (
          <GlassCard padded style={styles.activeOrdersBanner}>
            <View style={styles.bannerIconBox}>
              <Ionicons name="document-text" size={20} color={colors.brand} />
            </View>
            <View>
              <Text style={styles.bannerTitle}>Active Orders</Text>
              <Text style={styles.bannerSub}>
                {filteredOrders.length} Across {uniquePairs} Pairs
              </Text>
            </View>
          </GlassCard>
        )}

        {/* Category Chips row */}
        <View style={styles.chipsRow}>
          <Pressable
            onPress={() => { setSideFilter('ALL'); setTypeFilter('ALL'); }}
            style={[styles.chip, sideFilter === 'ALL' && typeFilter === 'ALL' && styles.chipActive]}
          >
            <Text style={[styles.chipText, sideFilter === 'ALL' && typeFilter === 'ALL' && styles.chipTextActive]}>All</Text>
          </Pressable>
          <Pressable
            onPress={() => setSideFilter('BUY')}
            style={[styles.chip, sideFilter === 'BUY' && styles.chipActive]}
          >
            <Text style={[styles.chipText, sideFilter === 'BUY' && styles.chipTextActive]}>Buy</Text>
          </Pressable>
          <Pressable
            onPress={() => setSideFilter('SELL')}
            style={[styles.chip, sideFilter === 'SELL' && styles.chipActive]}
          >
            <Text style={[styles.chipText, sideFilter === 'SELL' && styles.chipTextActive]}>Sell</Text>
          </Pressable>
          <Pressable
            onPress={() => setTypeFilter('LIMIT')}
            style={[styles.chip, typeFilter === 'LIMIT' && styles.chipActive]}
          >
            <Text style={[styles.chipText, typeFilter === 'LIMIT' && styles.chipTextActive]}>Limit</Text>
          </Pressable>
          <Pressable
            onPress={() => setTypeFilter('MARKET')}
            style={[styles.chip, typeFilter === 'MARKET' && styles.chipActive]}
          >
            <Text style={[styles.chipText, typeFilter === 'MARKET' && styles.chipTextActive]}>Market</Text>
          </Pressable>
        </View>

        {err ? <Text style={styles.errorText}>{err}</Text> : null}

        {/* Orders list container */}
        <AsyncBoundary
          loading={loading}
          error={error}
          data={data}
          onRetry={reload}
          skeleton={<Skeleton height={80} width="100%" />}
        >
          {() =>
            filteredOrders.length === 0 ? (
              <EmptyState
                icon="list-outline"
                title={tab === 'open' ? 'No open orders' : 'No order history'}
                hint={tab === 'open' ? 'Your active orders will appear here.' : 'Your past orders will appear here.'}
                actionLabel="Browse markets"
                onAction={() => router.push('/(tabs)/markets')}
              />
            ) : (
              <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
                {filteredOrders.map((o) => {
                  const fillPercentage = Math.round(
                    (Number(o.filledQuantity) / Number(o.quantity)) * 100,
                  ) || 0;
                  const totalValue = Number(o.price ?? 0) * Number(o.quantity);
                  const remaining = Number(o.quantity) - Number(o.filledQuantity);
                  const isBuy = o.side === 'BUY';

                  return (
                    <GlassCard key={o.id} padded style={styles.orderCard}>
                      {/* Card Header row */}
                      <View style={styles.cardHeader}>
                        <View style={styles.badgeRow}>
                          <View style={[styles.sideBadge, { backgroundColor: isBuy ? colors.upSoft : colors.downSoft }]}>
                            <Text style={[styles.sideBadgeText, { color: isBuy ? colors.up : colors.down }]}>
                              {o.side}
                            </Text>
                          </View>
                          <Text style={styles.orderIdText}>#{o.id.slice(0, 8)}</Text>
                          <Ionicons name="copy-outline" size={10} color={colors.muted2} />
                        </View>
                        <View style={styles.headerRightRow}>
                          <Text style={styles.dateText}>{fmtDate(o.createdAt)}</Text>
                          <View style={styles.statusDotRow}>
                            <View style={[styles.statusDot, { backgroundColor: o.status === 'OPEN' ? colors.brand : colors.muted }]} />
                            <Text style={styles.statusText}>{o.status}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Card Body */}
                      <View style={styles.cardBody}>
                        <View style={styles.pairRow}>
                          <Text style={styles.pairTitle}>{o.marketSymbol.replace('-', '/')}</Text>
                          <View style={styles.typeBadge}>
                            <Text style={styles.typeBadgeText}>{o.type}</Text>
                          </View>
                        </View>

                        <View style={styles.detailsGrid}>
                          {/* Left col */}
                          <View style={styles.detailCol}>
                            <Text style={styles.detailLabel}>Price (INR)</Text>
                            <Text style={styles.detailVal}>
                              {o.price ? `₹${fmtAmount(o.price)}` : 'Market Price'}
                            </Text>
                            <Text style={styles.detailLabelSub}>Total Value</Text>
                            <Text style={styles.detailValSub}>₹{fmtAmount(totalValue)}</Text>
                          </View>

                          {/* Center col: Filled progress */}
                          <View style={[styles.detailCol, { alignItems: 'center', justifyContent: 'center' }]}>
                            <Text style={styles.detailLabel}>Filled</Text>
                            <Text style={[styles.fillPctText, { color: isBuy ? colors.up : colors.down }]}>
                              {fillPercentage}%
                            </Text>
                            {/* Custom progress bar */}
                            <View style={styles.progressBg}>
                              <View
                                style={[
                                  styles.progressFill,
                                  {
                                    width: `${fillPercentage}%`,
                                    backgroundColor: isBuy ? colors.up : colors.down,
                                  },
                                ]}
                              />
                            </View>
                          </View>

                          {/* Right col */}
                          <View style={[styles.detailCol, { alignItems: 'flex-end' }]}>
                            <Text style={styles.detailLabel}>Quantity ({o.marketSymbol.split('-')[0]})</Text>
                            <Text style={styles.detailVal}>{fmtNum(o.quantity, 4)}</Text>
                            <Text style={styles.detailLabelSub}>Remaining</Text>
                            <Text style={styles.detailValSub}>{fmtNum(remaining, 4)}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Action buttons row */}
                      {tab === 'open' && (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED' || o.status === 'PENDING') && (
                        <View style={styles.cardActionsRow}>
                          <Pressable style={styles.itemActionBtn}>
                            <Text style={styles.itemActionBtnText}>Edit</Text>
                          </Pressable>
                          <Pressable
                            disabled={cancelling === o.id}
                            onPress={() => cancel(o.id)}
                            style={[styles.itemActionBtn, styles.cancelItemBtn]}
                          >
                            <Text style={styles.cancelItemBtnText}>
                              {cancelling === o.id ? 'Cancelling...' : 'Cancel Order'}
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </GlassCard>
                  );
                })}

                {/* Cancel All row */}
                {tab === 'open' && (
                  <Pressable disabled={busy} onPress={cancelAll} style={styles.cancelAllBtn}>
                    <Ionicons name="trash-outline" size={16} color={colors.down} />
                    <Text style={styles.cancelAllText}>Cancel All Orders</Text>
                  </Pressable>
                )}
              </View>
            )
          }
        </AsyncBoundary>

        {/* Bottom dashboard statistics banner */}
        {tab === 'open' && !loading && (
          <View style={styles.bottomStatsBanner}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Reserved Balance</Text>
              <Text style={styles.statVal}>₹{fmtAmount(dashboardStats.reserved)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Pending Orders</Text>
              <Text style={styles.statVal}>{dashboardStats.pending}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Total Value</Text>
              <Text style={styles.statVal}>₹{fmtAmount(dashboardStats.totalVal)}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginTop: spacing.sm },
  title: { color: '#fff', fontSize: font.xl, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: font.sm },

  // Tabs toggles
  tabToggleRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  tabToggleBtn: { flex: 1, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line },
  tabToggleActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabToggleText: { color: colors.muted, fontSize: font.sm, fontWeight: '800' },
  tabToggleTextActive: { color: '#1A1206' },

  // Active banner
  activeOrdersBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  bannerIconBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorderGold },
  bannerTitle: { color: colors.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  bannerSub: { color: '#fff', fontSize: font.md, fontWeight: '800' },

  // Category Chips
  chipsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  chip: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.panel, borderColor: colors.brand },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  chipTextActive: { color: colors.brand },

  errorText: { color: colors.down, fontSize: font.sm, textAlign: 'center', marginTop: spacing.sm },

  // Individual Order Card
  orderCard: { gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)', paddingBottom: 6 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sideBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  sideBadgeText: { fontSize: 8, fontWeight: '900' },
  orderIdText: { color: colors.muted2, fontSize: 10, fontWeight: '700' },
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateText: { color: colors.muted2, fontSize: 9 },
  statusDotRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { color: colors.muted, fontSize: 9, fontWeight: '700' },

  // Card Body
  cardBody: { gap: spacing.sm, marginTop: 4 },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pairTitle: { color: '#fff', fontSize: font.sm + 1, fontWeight: '800' },
  typeBadge: { borderWidth: 1, borderColor: colors.brand, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  typeBadgeText: { color: colors.brand, fontSize: 8, fontWeight: '800' },

  detailsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  detailCol: { flex: 1, gap: 2 },
  detailLabel: { color: colors.muted2, fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  detailVal: { color: '#fff', fontSize: 10, fontWeight: '800', fontFamily: 'monospace' },
  detailLabelSub: { color: colors.muted2, fontSize: 8, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
  detailValSub: { color: colors.muted, fontSize: 9, fontWeight: '700', fontFamily: 'monospace' },

  fillPctText: { fontSize: font.sm, fontWeight: '900', fontFamily: 'monospace' },
  progressBg: { width: 70, height: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: '100%', borderRadius: 2 },

  // Card Action Buttons
  cardActionsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  itemActionBtn: { flex: 1, height: 34, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel2 },
  itemActionBtnText: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  cancelItemBtn: { borderColor: 'rgba(234,57,67,0.2)' },
  cancelItemBtnText: { color: colors.down, fontSize: 11, fontWeight: '800' },

  // Cancel All Orders button
  cancelAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: 'rgba(234,57,67,0.2)', borderRadius: radius.md, height: 44, backgroundColor: 'rgba(234,57,67,0.02)', marginTop: spacing.sm },
  cancelAllText: { color: colors.down, fontSize: font.sm, fontWeight: '800' },

  // Bottom Summary metrics bar
  bottomStatsBanner: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#0F0F16',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  statCol: { alignItems: 'center', gap: 2, flex: 1 },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.05)' },
  statLabel: { color: colors.muted2, fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  statVal: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'monospace' },
});
