import React, { useState, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AsyncBoundary, EmptyState, Row, Screen, StatusBadge } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { colors, font, radius, spacing } from '@/theme';
import { fmtAmount, fmtDate, fmtNum } from '@/utils/format';

type Tab = 'deposits' | 'withdrawals' | 'trades';

export default function TransactionsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('deposits');

  const { data, loading, error, reload } = useApi(async () => {
    if (tab === 'deposits') {
      const inr = await userApi.listInrDeposits().then((r) => r.data.items);
      return { kind: 'deposits' as const, inr };
    }
    if (tab === 'withdrawals') {
      const items = await userApi.listInrWithdrawals().then((r) => r.data.items);
      return { kind: 'withdrawals' as const, items };
    }
    const items = await userApi.tradeHistory(undefined, 50).then((r) => r.data.items);
    return { kind: 'trades' as const, items };
  }, [tab]);

  // Dynamic calculations for Trade History Performance Summary
  const summaryStats = useMemo(() => {
    if (!data || data.kind !== 'trades') return { avgBuy: 0, avgSell: 0, volume: 0, total: 0 };
    
    const trades = data.items;
    const buyTrades = trades.filter((t) => t.side === 'BUY');
    const sellTrades = trades.filter((t) => t.side === 'SELL');

    const avgBuy = buyTrades.length > 0
      ? buyTrades.reduce((acc, curr) => acc + Number(curr.price), 0) / buyTrades.length
      : 0;
    const avgSell = sellTrades.length > 0
      ? sellTrades.reduce((acc, curr) => acc + Number(curr.price), 0) / sellTrades.length
      : 0;
    const volume = trades.reduce((acc, curr) => acc + Number(curr.quoteAmount), 0);

    return { avgBuy, avgSell, volume, total: trades.length };
  }, [data]);

  return (
    <Screen refreshing={loading} onRefresh={reload} contentStyle={{ gap: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {/* Header bar matching Trade History styling */}
        <View style={styles.header}>
          <Text style={styles.title}>{tab === 'trades' ? 'Trade History' : 'Transactions'}</Text>
          <View style={styles.headerRight}>
            <Pressable style={styles.headerIconBtn}>
              <Ionicons name="download-outline" size={20} color={colors.ink} />
            </Pressable>
            <Pressable style={styles.headerIconBtn}>
              <Ionicons name="funnel-outline" size={20} color={colors.ink} />
            </Pressable>
          </View>
        </View>

        {/* Tab Toggle Toggles */}
        <View style={styles.tabToggleRow}>
          <Pressable
            onPress={() => setTab('deposits')}
            style={[styles.tabToggleBtn, tab === 'deposits' && styles.tabToggleActive]}
          >
            <Text style={[styles.tabToggleText, tab === 'deposits' && styles.tabToggleTextActive]}>Deposits</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('withdrawals')}
            style={[styles.tabToggleBtn, tab === 'withdrawals' && styles.tabToggleActive]}
          >
            <Text style={[styles.tabToggleText, tab === 'withdrawals' && styles.tabToggleTextActive]}>Withdrawals</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('trades')}
            style={[styles.tabToggleBtn, tab === 'trades' && styles.tabToggleActive]}
          >
            <Text style={[styles.tabToggleText, tab === 'trades' && styles.tabToggleTextActive]}>Trades</Text>
          </Pressable>
        </View>

        <AsyncBoundary loading={loading} error={error} data={data} onRetry={reload}>
          {(d) => {
            if (d.kind === 'deposits') {
              if (d.inr.length === 0)
                return (
                  <View style={{ marginTop: spacing.xl }}>
                    <EmptyState
                      icon="arrow-down-circle-outline"
                      title="No deposits yet"
                      hint="Fund your account to start trading."
                      actionLabel="Make a deposit"
                      onAction={() => router.push('/deposit')}
                    />
                  </View>
                );
              return (
                <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                  {d.inr.map((x) => (
                    <GlassCard key={x.id} padded>
                      <Row label="INR Deposit" value={<StatusBadge status={x.status} />} />
                      <Row label="Amount" value={`₹${fmtAmount(x.amount)}`} />
                      <Row label="Method" value={x.method ?? '—'} />
                      <Row label="UTR" value={x.utr ?? '—'} />
                      <Row label="Created" value={fmtDate(x.createdAt)} />
                    </GlassCard>
                  ))}
                </View>
              );
            }
            if (d.kind === 'withdrawals') {
              if (d.items.length === 0)
                return (
                  <View style={{ marginTop: spacing.xl }}>
                    <EmptyState
                      icon="arrow-up-circle-outline"
                      title="No withdrawals yet"
                      hint="Your withdrawal requests will appear here."
                      actionLabel="Withdraw"
                      onAction={() => router.push('/withdraw')}
                    />
                  </View>
                );
              return (
                <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                  {d.items.map((w) => (
                    <GlassCard key={w.id} padded>
                      <Row label="INR Withdrawal" value={<StatusBadge status={w.status} />} />
                      <Row label="Amount" value={`₹${fmtAmount(w.amount)}`} />
                      <Row
                        label="Destination"
                        value={
                          w.payout.method === 'UPI'
                            ? w.payout.upiId ?? '—'
                            : `${w.payout.bankName ?? 'Bank'} ${w.payout.accountLast4 ?? ''}`.trim()
                        }
                      />
                      <Row
                        label={w.status === 'PAID' ? 'UTR' : 'Note'}
                        value={w.status === 'PAID' ? w.utr ?? '—' : w.rejectionReason ?? '—'}
                      />
                      <Row label="Requested" value={fmtDate(w.createdAt)} />
                    </GlassCard>
                  ))}
                </View>
              );
            }

            // Trades Tab active (matching Trade History screenshot)
            if (d.items.length === 0)
              return (
                <View style={{ marginTop: spacing.xl }}>
                  <EmptyState
                    icon="swap-horizontal-outline"
                    title="No trades yet"
                    hint="Your executed trades will appear here."
                    actionLabel="Browse markets"
                    onAction={() => router.push('/(tabs)/markets')}
                  />
                </View>
              );

            return (
              <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                {/* Performance Summary Card */}
                <GlassCard padded style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    <Text style={styles.summaryTitle}>Performance Summary</Text>
                    <Ionicons name="information-circle-outline" size={14} color={colors.muted2} />
                  </View>
                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>Avg Buy Price</Text>
                      <Text style={styles.summaryVal}>₹{fmtAmount(summaryStats.avgBuy)}</Text>
                    </View>
                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>Avg Sell Price</Text>
                      <Text style={styles.summaryVal}>₹{fmtAmount(summaryStats.avgSell)}</Text>
                    </View>
                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>Trading Volume</Text>
                      <Text style={styles.summaryVal}>₹{fmtAmount(summaryStats.volume)}</Text>
                    </View>
                    <View style={styles.summaryCol}>
                      <Text style={styles.summaryLabel}>Total Trades</Text>
                      <Text style={styles.summaryVal}>{summaryStats.total}</Text>
                    </View>
                  </View>
                </GlassCard>

                {/* Table list representation */}
                <Text style={styles.tableTitle}>Executed Trades</Text>

                {/* Columns Header row */}
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeader, { flex: 1.2 }]}>Time</Text>
                  <Text style={[styles.tableHeader, { textAlign: 'right', flex: 1.3 }]}>Price (INR)</Text>
                  <Text style={[styles.tableHeader, { textAlign: 'right', flex: 1 }]}>Quantity</Text>
                  <Text style={[styles.tableHeader, { textAlign: 'right', flex: 1.3 }]}>Value (INR)</Text>
                  <Text style={[styles.tableHeader, { textAlign: 'center', flex: 0.8 }]}>Type</Text>
                </View>

                {/* Rows list */}
                <GlassCard padded style={styles.listCard}>
                  {d.items.map((t) => {
                    const isBuy = t.side === 'BUY';
                    const timeStr = new Date(t.executedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const dateStr = new Date(t.executedAt).toLocaleDateString([], { day: '2-digit', month: 'short' });

                    return (
                      <View key={t.id} style={styles.tradeItemRow}>
                        {/* Time block */}
                        <View style={{ flex: 1.2, gap: 1 }}>
                          <Text style={styles.itemTime}>{timeStr}</Text>
                          <Text style={styles.itemDate}>{dateStr}</Text>
                        </View>

                        {/* Price block */}
                        <View style={{ flex: 1.3, alignItems: 'flex-end', gap: 1 }}>
                          <Text style={[styles.itemPrice, { color: isBuy ? colors.up : colors.down }]}>
                            ₹{fmtAmount(t.price)}
                          </Text>
                          <Text style={styles.itemAssetLabel}>INR</Text>
                        </View>

                        {/* Quantity block */}
                        <View style={{ flex: 1, alignItems: 'flex-end', gap: 1 }}>
                          <Text style={styles.itemQty}>{fmtNum(t.quantity, 4)}</Text>
                          <Text style={styles.itemAssetLabel}>{t.marketSymbol.split('-')[0]}</Text>
                        </View>

                        {/* Value block */}
                        <View style={{ flex: 1.3, alignItems: 'flex-end', gap: 1 }}>
                          <Text style={styles.itemVal}>₹{fmtAmount(t.quoteAmount)}</Text>
                          <Text style={styles.itemAssetLabel}>INR</Text>
                        </View>

                        {/* Type badge */}
                        <View style={{ flex: 0.8, alignItems: 'center', justifyContent: 'center' }}>
                          <View style={[styles.typeBadge, { backgroundColor: isBuy ? colors.upSoft : colors.downSoft }]}>
                            <Text style={[styles.typeBadgeText, { color: isBuy ? colors.up : colors.down }]}>
                              {t.side}
                            </Text>
                          </View>
                          <Text style={styles.makerLabel}>{isBuy ? 'Maker' : 'Taker'}</Text>
                        </View>
                      </View>
                    );
                  })}
                </GlassCard>
              </View>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  title: { color: '#fff', fontSize: font.xl, fontWeight: '900' },
  headerRight: { flexDirection: 'row', gap: spacing.sm },
  headerIconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  // Tabs toggles
  tabToggleRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  tabToggleBtn: { flex: 1, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line },
  tabToggleActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabToggleText: { color: colors.muted, fontSize: font.sm, fontWeight: '800' },
  tabToggleTextActive: { color: '#1A1206' },

  // Summary Card
  summaryCard: { gap: spacing.md },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryTitle: { color: colors.muted, fontSize: font.sm, fontWeight: '800' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryCol: { width: '47%', gap: 3 },
  summaryLabel: { color: colors.muted2, fontSize: font.xs - 2, fontWeight: '700', textTransform: 'uppercase' },
  summaryVal: { color: colors.brand, fontSize: font.sm, fontWeight: '800', fontFamily: 'monospace' },

  tableTitle: { color: '#fff', fontSize: font.md, fontWeight: '800', marginTop: spacing.sm },
  
  // Table visual list
  tableHeaderRow: { flexDirection: 'row', paddingHorizontal: spacing.md, marginTop: spacing.xs },
  tableHeader: { color: colors.muted2, fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  listCard: { gap: spacing.xs },

  tradeItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  itemTime: { color: '#fff', fontSize: 10, fontWeight: '700' },
  itemDate: { color: colors.muted2, fontSize: 9 },
  itemPrice: { fontSize: 10, fontWeight: '800', fontFamily: 'monospace' },
  itemAssetLabel: { color: colors.muted2, fontSize: 8, fontWeight: '600' },
  itemQty: { color: '#fff', fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },
  itemVal: { color: '#fff', fontSize: 10, fontWeight: '800', fontFamily: 'monospace' },
  typeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, minWidth: 44, alignItems: 'center' },
  typeBadgeText: { fontSize: 8, fontWeight: '900' },
  makerLabel: { color: colors.muted2, fontSize: 7, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
});
