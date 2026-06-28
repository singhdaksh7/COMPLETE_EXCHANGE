import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, EmptyState, H1, Row, Screen, StatusBadge } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { userApi } from '@/api/userApi';
import { useAuth } from '@/store/auth';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import { fmtNum, fmtAmount } from '@/utils/format';
import type { Order, OrderSide, OrderType, Ticker, OrderBook } from '@/types/api';

export default function TradeScreen() {
  const params = useLocalSearchParams<{ symbol?: string; side?: string }>();
  const router = useRouter();
  const { features } = useAuth();
  const symbol = String(params.symbol ?? 'BTC-INR').replace('/', '-');
  
  const [side, setSide] = useState<OrderSide>((params.side as OrderSide) ?? 'BUY');
  const [type, setType] = useState<OrderType>('LIMIT');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quoteBudget, setQuoteBudget] = useState('');
  
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [book, setBook] = useState<OrderBook | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Order | null>(null);

  useEffect(() => {
    // Load ticker and order book data for the symbol
    Promise.all([
      userApi.ticker(symbol),
      userApi.orderBook(symbol, 8).catch(() => ({ data: { symbol, asks: [], bids: [] } })),
    ])
      .then(([tRes, bRes]) => {
        setTicker(tRes.data);
        setBook(bRes.data);
        if (!price && tRes.data.lastPrice) setPrice(tRes.data.lastPrice);
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
      // Clean inputs
      setQuantity('');
      setQuoteBudget('');
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (features && !features.trading) {
    return (
      <Screen>
        <H1>{symbol.replace('-', '/')}</H1>
        <EmptyState
          icon="lock-closed-outline"
          title="Trading unavailable"
          hint="Spot trading is not enabled for your account right now. Please contact support."
        />
      </Screen>
    );
  }

  const cleanSym = symbol.replace('-', '/');
  const usdPrice = ticker?.lastPrice ? (Number(ticker.lastPrice) / 83.5).toFixed(2) : null;

  return (
    <Screen contentStyle={{ gap: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {/* Header Block */}
        <View style={styles.header}>
          <Text style={styles.title}>{cleanSym}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.priceText}>
              {ticker?.lastPrice ? `₹${fmtAmount(ticker.lastPrice)}` : '—'}
            </Text>
            {usdPrice ? <Text style={styles.usdText}>${usdPrice}</Text> : null}
          </View>
        </View>

        {/* Side toggles Buy/Sell */}
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setSide('BUY')}
            style={[styles.toggleBtn, side === 'BUY' && styles.toggleBuyActive]}
          >
            <Text style={[styles.toggleBtnText, side === 'BUY' && styles.activeBtnText]}>BUY</Text>
          </Pressable>
          <Pressable
            onPress={() => setSide('SELL')}
            style={[styles.toggleBtn, side === 'SELL' && styles.toggleSellActive]}
          >
            <Text style={[styles.toggleBtnText, side === 'SELL' && styles.activeBtnText]}>SELL</Text>
          </Pressable>
        </View>

        {/* Type toggles Limit/Market */}
        <View style={styles.typeRow}>
          <Pressable
            onPress={() => setType('LIMIT')}
            style={[styles.typeBtn, type === 'LIMIT' && styles.typeBtnActive]}
          >
            <Text style={[styles.typeText, type === 'LIMIT' && styles.typeTextActive]}>Limit Order</Text>
          </Pressable>
          <Pressable
            onPress={() => setType('MARKET')}
            style={[styles.typeBtn, type === 'MARKET' && styles.typeBtnActive]}
          >
            <Text style={[styles.typeText, type === 'MARKET' && styles.typeTextActive]}>Market Order</Text>
          </Pressable>
        </View>

        {/* Trading Ticket Form Box */}
        <GlassCard padded style={styles.ticketCard}>
          {type === 'LIMIT' ? (
            <View style={{ gap: spacing.md }}>
              {/* Stacked price input */}
              <View style={styles.stackedInputBox}>
                <Text style={styles.stackedLabel}>Limit Price (INR)</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.muted2}
                  style={styles.stackedInput}
                />
              </View>

              {/* Stacked quantity input */}
              <View style={styles.stackedInputBox}>
                <Text style={styles.stackedLabel}>Quantity ({cleanSym.split('/')[0]})</Text>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.muted2}
                  style={styles.stackedInput}
                />
              </View>
            </View>
          ) : side === 'BUY' ? (
            <View style={styles.stackedInputBox}>
              <Text style={styles.stackedLabel}>Quote Budget (INR)</Text>
              <TextInput
                value={quoteBudget}
                onChangeText={setQuoteBudget}
                keyboardType="decimal-pad"
                placeholder="Amount to spend"
                placeholderTextColor={colors.muted2}
                style={styles.stackedInput}
              />
            </View>
          ) : (
            <View style={styles.stackedInputBox}>
              <Text style={styles.stackedLabel}>Quantity ({cleanSym.split('/')[0]})</Text>
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                placeholder="Amount to sell"
                placeholderTextColor={colors.muted2}
                style={styles.stackedInput}
              />
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Action Submit Button */}
          <Pressable
            disabled={busy}
            onPress={submit}
            style={[styles.submitBtn, { backgroundColor: side === 'BUY' ? colors.up : colors.down }]}
          >
            <Text style={styles.submitBtnText}>
              {busy ? 'Processing...' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${cleanSym.split('/')[0]}`}
            </Text>
          </Pressable>
        </GlassCard>

        {/* Order execution results card */}
        {result ? (
          <GlassCard padded style={styles.resultCard}>
            <Text style={styles.resultTitle}>Order Placed Successfully</Text>
            <Row label="Order Status" value={<StatusBadge status={result.status} />} />
            <Row label="Side / Type" value={`${result.side} / ${result.type}`} />
            <Row label="Filled Quantity" value={`${fmtNum(result.filledQuantity, 4)}`} />
            <View style={{ marginTop: spacing.md }}>
              <Button
                title="View Open Orders"
                variant="secondary"
                onPress={() => router.push('/orders')}
              />
            </View>
          </GlassCard>
        ) : null}

        {/* Dual Column: Mini Order Book + Latest Trades */}
        <View style={styles.dualColumnRow}>
          <View style={styles.dualCol}>
            <Text style={styles.colTitle}>Bids (Buy)</Text>
            {(book?.bids ?? []).slice(0, 4).map((l, i) => (
              <View key={`b-${i}`} style={styles.miniBookRow}>
                <Text style={[styles.miniPrice, { color: colors.up }]}>₹{fmtAmount(l.price)}</Text>
                <Text style={styles.miniQty}>{fmtNum(l.quantity, 4)}</Text>
              </View>
            ))}
            {(book?.bids ?? []).length === 0 && (
              <Text style={styles.emptyColText}>No bids yet</Text>
            )}
          </View>

          <View style={styles.dualCol}>
            <Text style={styles.colTitle}>Asks (Sell)</Text>
            {(book?.asks ?? []).slice(0, 4).map((l, i) => (
              <View key={`a-${i}`} style={styles.miniBookRow}>
                <Text style={[styles.miniPrice, { color: colors.down }]}>₹{fmtAmount(l.price)}</Text>
                <Text style={styles.miniQty}>{fmtNum(l.quantity, 4)}</Text>
              </View>
            ))}
            {(book?.asks ?? []).length === 0 && (
              <Text style={styles.emptyColText}>No asks yet</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  title: { color: '#fff', fontSize: font.xl, fontWeight: '900' },
  priceText: { color: colors.brand, fontSize: font.md, fontWeight: '800', fontFamily: 'monospace' },
  usdText: { color: colors.muted2, fontSize: 10 },

  // Buy/Sell toggle row
  toggleRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  toggleBtn: { flex: 1, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line },
  toggleBuyActive: { backgroundColor: colors.up, borderColor: colors.up },
  toggleSellActive: { backgroundColor: colors.down, borderColor: colors.down },
  toggleBtnText: { color: colors.muted, fontSize: font.sm, fontWeight: '800' },
  activeBtnText: { color: '#fff' },

  // Limit/Market selector
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)', paddingBottom: 6 },
  typeBtn: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm },
  typeBtnActive: { backgroundColor: colors.panel },
  typeText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  typeTextActive: { color: colors.brand },

  // Ticket Form Card
  ticketCard: { gap: spacing.md, marginTop: spacing.sm },
  stackedInputBox: {
    backgroundColor: '#07070B',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    height: 58,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  stackedLabel: { color: colors.muted2, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  stackedInput: { color: '#fff', fontSize: font.md, marginTop: 2, height: 24, padding: 0 },

  errorText: { color: colors.down, fontSize: font.sm, textAlign: 'center' },
  submitBtn: { height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  submitBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '800' },

  resultCard: { gap: spacing.sm, marginTop: spacing.md },
  resultTitle: { color: colors.up, fontSize: font.sm, fontWeight: '800', textAlign: 'center' },

  // Mini Order Book columns
  dualColumnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  dualCol: { flex: 1, backgroundColor: '#0F0F16', borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  colTitle: { color: colors.ink, fontSize: font.xs, fontWeight: '800', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)', paddingBottom: 4 },
  miniBookRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  miniPrice: { fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },
  miniQty: { color: colors.muted, fontSize: 9, fontFamily: 'monospace' },
  emptyColText: { color: colors.muted2, fontSize: 9, textAlign: 'center', marginVertical: spacing.sm },
});
