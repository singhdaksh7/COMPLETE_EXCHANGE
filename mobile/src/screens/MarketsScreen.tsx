import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AsyncBoundary, Card, H1, Input, Muted, Screen, SkeletonCard } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { colors, font, spacing } from '@/theme';
import { fmtNum, fmtPct } from '@/utils/format';
import type { Market, Ticker } from '@/types/api';

async function loadMarkets(): Promise<{ market: Market; ticker: Ticker | null }[]> {
  const res = await userApi.listMarkets();
  const markets = res.data.items;
  const tickers = await Promise.all(
    markets.map((m) => userApi.ticker(m.symbol).then((r) => r.data).catch(() => null)),
  );
  return markets.map((market, i) => ({ market, ticker: tickers[i] }));
}

export default function MarketsScreen() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useApi(loadMarkets, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toUpperCase();
    return term ? data.filter((r) => r.market.symbol.toUpperCase().includes(term)) : data;
  }, [data, q]);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <H1>Markets</H1>
      <Input placeholder="Search pairs (e.g. USDT)" value={q} onChangeText={setQ} />
      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        skeleton={
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        }
        empty={{ title: 'No markets', hint: 'No trading pairs are available yet.', icon: 'stats-chart-outline' }}
      >
        {() =>
          rows.length === 0 ? (
            <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
              <Muted>No pairs match “{q}”.</Muted>
            </Card>
          ) : (
            <Card>
              <View style={[styles.row, styles.headRow]}>
                <Text style={styles.headText}>Pair</Text>
                <Text style={styles.headText}>Last / 24h</Text>
              </View>
              {rows.map(({ market, ticker }) => {
                const pct = ticker ? Number(ticker.priceChangePct) : 0;
                return (
                  <Pressable
                    key={market.symbol}
                    style={styles.row}
                    onPress={() => router.push(`/market/${encodeURIComponent(market.symbol)}`)}
                  >
                    <View>
                      <Text style={styles.sym}>{market.symbol}</Text>
                      <Text style={styles.sub}>
                        {market.baseAsset}/{market.quoteAsset}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.price}>{fmtNum(ticker?.lastPrice ?? null, 4)}</Text>
                      <Text style={{ color: pct >= 0 ? colors.up : colors.down, fontSize: font.xs, fontWeight: '700' }}>
                        {ticker ? fmtPct(ticker.priceChangePct) : '—'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          )
        }
      </AsyncBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  headRow: { paddingVertical: spacing.sm },
  headText: { color: colors.muted, fontSize: font.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  sym: { color: colors.ink, fontSize: font.md, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: font.xs },
  price: { color: colors.ink, fontSize: font.md, fontWeight: '700' },
});
