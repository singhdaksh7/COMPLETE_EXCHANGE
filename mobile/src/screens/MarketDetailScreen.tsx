import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { AsyncBoundary, Button, Card, Muted, Row, Screen } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { colors, font, spacing } from '@/theme';
import { fmtNum, fmtPct } from '@/utils/format';
import type { OrderBook, Ticker } from '@/types/api';

interface DetailData {
  ticker: Ticker;
  book: OrderBook;
}

export default function MarketDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const sym = String(symbol ?? '');

  const { data, loading, error, reload } = useApi<DetailData>(async () => {
    const [t, b] = await Promise.all([userApi.ticker(sym), userApi.orderBook(sym, 12)]);
    return { ticker: t.data, book: b.data };
  }, [sym]);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: sym }} />
      <AsyncBoundary loading={loading} error={error} data={data} onRetry={reload}>
        {({ ticker, book }) => {
          const pct = Number(ticker.priceChangePct);
          return (
            <>
              <Card>
                <Text style={styles.price}>{fmtNum(ticker.lastPrice, 6)}</Text>
                <Text style={{ color: pct >= 0 ? colors.up : colors.down, fontSize: font.md, fontWeight: '700' }}>
                  {fmtPct(ticker.priceChangePct)} (24h)
                </Text>
                <View style={{ height: spacing.sm }} />
                <Row label="24h High" value={fmtNum(ticker.high24h, 6)} />
                <Row label="24h Low" value={fmtNum(ticker.low24h, 6)} />
                <Row label="24h Volume (base)" value={fmtNum(ticker.baseVolume24h, 4)} />
                <Row label="24h Trades" value={String(ticker.tradeCount24h)} />
              </Card>

              <Card>
                <Muted>Order book</Muted>
                <View style={styles.bookHead}>
                  <Text style={styles.bookHeadText}>Price</Text>
                  <Text style={styles.bookHeadText}>Size</Text>
                </View>
                {book.asks.slice(0, 6).reverse().map((l, i) => (
                  <View key={`a${i}`} style={styles.bookRow}>
                    <Text style={[styles.bookPrice, { color: colors.down }]}>{fmtNum(l.price, 4)}</Text>
                    <Text style={styles.bookSize}>{fmtNum(l.quantity, 4)}</Text>
                  </View>
                ))}
                <View style={styles.spread} />
                {book.bids.slice(0, 6).map((l, i) => (
                  <View key={`b${i}`} style={styles.bookRow}>
                    <Text style={[styles.bookPrice, { color: colors.up }]}>{fmtNum(l.price, 4)}</Text>
                    <Text style={styles.bookSize}>{fmtNum(l.quantity, 4)}</Text>
                  </View>
                ))}
                {book.asks.length === 0 && book.bids.length === 0 ? <Muted>Empty book.</Muted> : null}
              </Card>

              <View style={styles.tradeRow}>
                <View style={{ flex: 1 }}>
                  <Button title="Buy" onPress={() => router.push(`/trade?symbol=${encodeURIComponent(sym)}&side=BUY`)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Sell"
                    variant="danger"
                    onPress={() => router.push(`/trade?symbol=${encodeURIComponent(sym)}&side=SELL`)}
                  />
                </View>
              </View>
            </>
          );
        }}
      </AsyncBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  price: { color: colors.ink, fontSize: font.xxl, fontWeight: '900' },
  bookHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  bookHeadText: { color: colors.muted, fontSize: font.xs },
  bookRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  bookPrice: { fontSize: font.sm, fontWeight: '700' },
  bookSize: { color: colors.ink, fontSize: font.sm },
  spread: { height: 1, backgroundColor: colors.line, marginVertical: spacing.sm },
  tradeRow: { flexDirection: 'row', gap: spacing.md },
});
