import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AsyncBoundary, Card, EmptyState, Muted, Row, Screen, StatusBadge } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { colors, font, radius, spacing } from '@/theme';
import { fmtAmount, fmtDate, fmtNum, shortHash } from '@/utils/format';

type Tab = 'deposits' | 'withdrawals' | 'trades';

export default function TransactionsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('deposits');

  const { data, loading, error, reload } = useApi(async () => {
    if (tab === 'deposits') {
      const [crypto, inr] = await Promise.all([
        userApi.listCryptoDeposits().then((r) => r.data.items).catch(() => []),
        userApi.listInrDeposits().then((r) => r.data.items).catch(() => []),
      ]);
      return { kind: 'deposits' as const, crypto, inr };
    }
    if (tab === 'withdrawals') {
      const items = await userApi.listWithdrawals().then((r) => r.data.items);
      return { kind: 'withdrawals' as const, items };
    }
    const items = await userApi.tradeHistory(undefined, 50).then((r) => r.data.items);
    return { kind: 'trades' as const, items };
  }, [tab]);

  const Toggle = ({ t, label }: { t: Tab; label: string }) => (
    <Pressable onPress={() => setTab(t)} style={[styles.toggle, tab === t && styles.toggleActive]}>
      <Text style={[styles.toggleText, tab === t && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={styles.toggleRow}>
        <Toggle t="deposits" label="Deposits" />
        <Toggle t="withdrawals" label="Withdrawals" />
        <Toggle t="trades" label="Trades" />
      </View>

      <AsyncBoundary loading={loading} error={error} data={data} onRetry={reload}>
        {(d) => {
          if (d.kind === 'deposits') {
            const empty = d.crypto.length === 0 && d.inr.length === 0;
            if (empty)
              return (
                <EmptyState
                  icon="arrow-down-circle-outline"
                  title="No deposits yet"
                  hint="Fund your account to start trading."
                  actionLabel="Make a deposit"
                  onAction={() => router.push('/deposit')}
                />
              );
            return (
              <>
                {d.crypto.map((x) => (
                  <Card key={x.id}>
                    <Row label={`${x.asset} deposit`} value={<StatusBadge status={x.status} />} />
                    <Row label="Amount" value={fmtNum(x.amount, 8)} />
                    <Row label="Confirmations" value={`${x.confirmations}/${x.requiredConfirmations}`} />
                    <Row label="Tx" value={shortHash(x.txHash)} />
                    <Row label="Detected" value={fmtDate(x.detectedAt)} />
                  </Card>
                ))}
                {d.inr.map((x) => (
                  <Card key={x.id}>
                    <Row label="INR deposit" value={<StatusBadge status={x.status} />} />
                    <Row label="Amount" value={`₹ ${fmtAmount(x.amount)}`} />
                    <Row label="Method" value={x.method ?? '—'} />
                    <Row label="UTR" value={x.utr ?? '—'} />
                    <Row label="Created" value={fmtDate(x.createdAt)} />
                  </Card>
                ))}
              </>
            );
          }
          if (d.kind === 'withdrawals') {
            if (d.items.length === 0)
              return (
                <EmptyState
                  icon="arrow-up-circle-outline"
                  title="No withdrawals yet"
                  hint="Your withdrawal requests will appear here."
                  actionLabel="Withdraw"
                  onAction={() => router.push('/withdraw')}
                />
              );
            return (
              <>
                {d.items.map((w) => (
                  <Card key={w.id}>
                    <Row label={`${w.asset} withdrawal`} value={<StatusBadge status={w.status} />} />
                    <Row label="Amount" value={fmtNum(w.amount, 8)} />
                    <Row label="Net" value={fmtNum(w.netAmount, 8)} />
                    <Row label="To" value={shortHash(w.toAddress)} />
                    <Row label="Requested" value={fmtDate(w.requestedAt)} />
                    {w.failureReason ? <Muted>Reason: {w.failureReason}</Muted> : null}
                  </Card>
                ))}
              </>
            );
          }
          if (d.items.length === 0)
            return (
              <EmptyState
                icon="swap-horizontal-outline"
                title="No trades yet"
                hint="Your executed trades will appear here."
                actionLabel="Browse markets"
                onAction={() => router.push('/(tabs)/markets')}
              />
            );
          return (
            <>
              {d.items.map((t) => (
                <Card key={t.id}>
                  <Row label={t.marketSymbol} value={<Text style={{ color: t.side === 'BUY' ? colors.up : colors.down, fontWeight: '700' }}>{t.side}</Text>} />
                  <Row label="Price" value={fmtNum(t.price, 6)} />
                  <Row label="Quantity" value={fmtNum(t.quantity, 6)} />
                  <Row label="Quote" value={fmtNum(t.quoteAmount, 6)} />
                  <Row label="Executed" value={fmtDate(t.executedAt)} />
                </Card>
              ))}
            </>
          );
        }}
      </AsyncBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', gap: spacing.sm },
  toggle: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.panel },
  toggleActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  toggleText: { color: colors.ink, fontWeight: '700', fontSize: font.sm },
});
