import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AsyncBoundary, Card, EmptyState, H1, Muted, Screen } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { colors, font, radius, spacing } from '@/theme';
import { fmtNum } from '@/utils/format';
import type { WalletOverview } from '@/types/api';

export default function PortfolioScreen() {
  const router = useRouter();
  const { data, loading, error, reload } = useApi<WalletOverview>(
    () => userApi.walletOverview().then((r) => r.data),
    [],
  );

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <H1>Portfolio</H1>
      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        empty={{ title: 'No balances', hint: 'Deposit funds to start trading.' }}
      >
        {(ov) => (
          <>
            <Card>
              <Muted>Assets held</Muted>
              <Text style={styles.count}>{ov.balances.length}</Text>
            </Card>
            {ov.balances.length === 0 ? (
              <EmptyState
                icon="wallet-outline"
                title="No balances yet"
                hint="Deposit crypto or INR to fund your account, then start trading."
                actionLabel="Make a deposit"
                onAction={() => router.push('/deposit')}
              />
            ) : (
              ov.balances.map((b) => (
                <Card key={b.asset}>
                  <View style={styles.rowTop}>
                    <Text style={styles.asset}>{b.asset}</Text>
                    <Text style={styles.total}>{fmtNum(b.total, 8)}</Text>
                  </View>
                  <View style={styles.breakdown}>
                    <View style={styles.pill}>
                      <Text style={styles.pillLabel}>Available</Text>
                      <Text style={styles.pillVal}>{fmtNum(b.available, 8)}</Text>
                    </View>
                    <View style={styles.pill}>
                      <Text style={styles.pillLabel}>Locked</Text>
                      <Text style={styles.pillVal}>{fmtNum(b.locked, 8)}</Text>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { color: colors.ink, fontSize: font.xxl, fontWeight: '900' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  asset: { color: colors.ink, fontSize: font.lg, fontWeight: '800' },
  total: { color: colors.ink, fontSize: font.lg, fontWeight: '700' },
  breakdown: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  pill: { flex: 1, backgroundColor: colors.panel2, borderRadius: radius.sm, padding: spacing.sm },
  pillLabel: { color: colors.muted, fontSize: font.xs },
  pillVal: { color: colors.ink, fontSize: font.sm, fontWeight: '700' },
});
