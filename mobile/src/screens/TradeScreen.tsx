import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, H1, Input, Muted, Row, Screen, StatusBadge } from '@/components/ui';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import { fmtNum } from '@/utils/format';
import type { Order, OrderSide, OrderType, Ticker } from '@/types/api';

/** Simple limit/market order ticket. Money movement is unchanged on the backend. */
export default function TradeScreen() {
  const params = useLocalSearchParams<{ symbol?: string; side?: string }>();
  const router = useRouter();
  const symbol = String(params.symbol ?? 'USDT-INR');
  const [side, setSide] = useState<OrderSide>((params.side as OrderSide) ?? 'BUY');
  const [type, setType] = useState<OrderType>('LIMIT');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quoteBudget, setQuoteBudget] = useState('');
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Order | null>(null);

  useEffect(() => {
    userApi
      .ticker(symbol)
      .then((r) => {
        setTicker(r.data);
        if (!price && r.data.lastPrice) setPrice(r.data.lastPrice);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const submit = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const body: Parameters<typeof userApi.placeOrder>[0] = { symbol, side, type };
      if (type === 'LIMIT') {
        body.price = price;
        body.quantity = quantity;
      } else if (side === 'BUY') {
        body.quoteBudget = quoteBudget;
      } else {
        body.quantity = quantity;
      }
      const res = await userApi.placeOrder(body);
      setResult(res.data);
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const Toggle = ({ value, active, onPress }: { value: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[styles.toggle, active && styles.toggleActive]}>
      <Text style={[styles.toggleText, active && { color: colors.bg }]}>{value}</Text>
    </Pressable>
  );

  return (
    <Screen>
      <H1>{symbol}</H1>
      <Muted>Last price: {fmtNum(ticker?.lastPrice ?? null, 6)}</Muted>

      <View style={styles.toggleRow}>
        <Toggle value="BUY" active={side === 'BUY'} onPress={() => setSide('BUY')} />
        <Toggle value="SELL" active={side === 'SELL'} onPress={() => setSide('SELL')} />
      </View>
      <View style={styles.toggleRow}>
        <Toggle value="LIMIT" active={type === 'LIMIT'} onPress={() => setType('LIMIT')} />
        <Toggle value="MARKET" active={type === 'MARKET'} onPress={() => setType('MARKET')} />
      </View>

      <Card>
        {type === 'LIMIT' ? (
          <>
            <Input label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" />
            <Input label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="0.00" />
          </>
        ) : side === 'BUY' ? (
          <Input label="Quote budget" value={quoteBudget} onChangeText={setQuoteBudget} keyboardType="decimal-pad" placeholder="Amount to spend" />
        ) : (
          <Input label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="Amount to sell" />
        )}

        {error ? <Text style={{ color: colors.down }}>{error}</Text> : null}
        <View style={{ marginTop: spacing.sm }}>
          <Button
            title={`${side} ${symbol}`}
            variant={side === 'BUY' ? 'primary' : 'danger'}
            onPress={submit}
            loading={busy}
          />
        </View>
      </Card>

      {result ? (
        <Card>
          <Row label="Order" value={<StatusBadge status={result.status} />} />
          <Row label="Side / Type" value={`${result.side} / ${result.type}`} />
          <Row label="Filled" value={`${fmtNum(result.filledQuantity, 6)}`} />
          <View style={{ marginTop: spacing.sm }}>
            <Button title="View open orders" variant="secondary" onPress={() => router.push('/orders')} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', gap: spacing.sm },
  toggle: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.panel },
  toggleActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  toggleText: { color: colors.ink, fontWeight: '700', fontSize: font.sm },
});
