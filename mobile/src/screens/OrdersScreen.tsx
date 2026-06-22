import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AsyncBoundary, Button, Card, Muted, Screen, StatusBadge } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import { fmtDate, fmtNum } from '@/utils/format';
import type { Order } from '@/types/api';

type Tab = 'open' | 'history';

export default function OrdersScreen() {
  const [tab, setTab] = useState<Tab>('open');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  const Toggle = ({ t, label }: { t: Tab; label: string }) => (
    <Pressable onPress={() => setTab(t)} style={[styles.toggle, tab === t && styles.toggleActive]}>
      <Text style={[styles.toggleText, tab === t && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={styles.toggleRow}>
        <Toggle t="open" label="Open" />
        <Toggle t="history" label="History" />
      </View>
      {err ? <Text style={{ color: colors.down }}>{err}</Text> : null}

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        empty={{ title: 'No orders', hint: 'Your orders will appear here.' }}
      >
        {(orders) =>
          orders.length === 0 ? (
            <Muted>No {tab === 'open' ? 'open orders' : 'order history'}.</Muted>
          ) : (
            <>
              {orders.map((o) => (
                <Card key={o.id}>
                  <View style={styles.top}>
                    <Text style={styles.sym}>{o.marketSymbol}</Text>
                    <StatusBadge status={o.status} />
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={[styles.side, { color: o.side === 'BUY' ? colors.up : colors.down }]}>
                      {o.side} · {o.type}
                    </Text>
                    <Muted>{fmtDate(o.createdAt)}</Muted>
                  </View>
                  <View style={styles.kv}>
                    <Text style={styles.kvText}>Price {fmtNum(o.price, 6)}</Text>
                    <Text style={styles.kvText}>Qty {fmtNum(o.quantity, 6)}</Text>
                    <Text style={styles.kvText}>Filled {fmtNum(o.filledQuantity, 6)}</Text>
                  </View>
                  {tab === 'open' && (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED' || o.status === 'PENDING') ? (
                    <View style={{ marginTop: spacing.sm }}>
                      <Button title="Cancel order" variant="secondary" loading={cancelling === o.id} onPress={() => cancel(o.id)} />
                    </View>
                  ) : null}
                </Card>
              ))}
            </>
          )
        }
      </AsyncBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', gap: spacing.sm },
  toggle: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.panel },
  toggleActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  toggleText: { color: colors.ink, fontWeight: '700', fontSize: font.sm },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sym: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  side: { fontSize: font.sm, fontWeight: '700' },
  kv: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  kvText: { color: colors.muted, fontSize: font.sm },
});
