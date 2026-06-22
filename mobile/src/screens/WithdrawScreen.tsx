import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, H2, Input, Muted, Row, Screen, StatusBadge } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import { shortHash } from '@/utils/format';
import type { CryptoWithdrawal, WithdrawalAddress } from '@/types/api';

const CHAINS = ['ETH', 'TRON', 'BSC'];

/**
 * Withdrawal request screen. This only calls the EXISTING user withdrawal API —
 * signing/processing is unchanged on the backend, and real on-chain withdrawals
 * remain governed by the current (staging) backend behaviour.
 */
export default function WithdrawScreen() {
  const addrs = useApi<WithdrawalAddress[]>(
    () => userApi.listWithdrawalAddresses().then((r) => r.data.items),
    [],
  );

  const [chain, setChain] = useState('ETH');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  const addAddress = async () => {
    setAddErr(null);
    setAddBusy(true);
    try {
      await userApi.addWithdrawalAddress({ chain, address: address.trim(), label: label.trim() || undefined });
      setAddress('');
      setLabel('');
      addrs.reload();
    } catch (e) {
      setAddErr(actionErrorMessage(e));
    } finally {
      setAddBusy(false);
    }
  };

  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [wBusy, setWBusy] = useState(false);
  const [wErr, setWErr] = useState<string | null>(null);
  const [result, setResult] = useState<CryptoWithdrawal | null>(null);

  const submit = async () => {
    setWErr(null);
    setResult(null);
    setWBusy(true);
    try {
      const res = await userApi.createWithdrawal(toAddress.trim(), amount);
      setResult(res.data);
      setAmount('');
    } catch (e) {
      setWErr(actionErrorMessage(e));
    } finally {
      setWBusy(false);
    }
  };

  const Chip = ({ value, active, onPress }: { value: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: colors.bg }]}>{value}</Text>
    </Pressable>
  );

  return (
    <Screen refreshing={addrs.loading} onRefresh={addrs.reload}>
      <H2>Withdraw crypto</H2>
      <Card>
        <Input label="Destination address" value={toAddress} onChangeText={setToAddress} placeholder="0x… / T…" />
        <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
        {wErr ? <Text style={{ color: colors.down }}>{wErr}</Text> : null}
        <Button title="Request withdrawal" loading={wBusy} disabled={!toAddress || !amount} onPress={submit} />
        {result ? (
          <View style={{ marginTop: spacing.sm }}>
            <Row label="Status" value={<StatusBadge status={result.status} />} />
            <Row label="Net amount" value={result.netAmount} />
            <Muted>Withdrawals may require admin approval before processing.</Muted>
          </View>
        ) : null}
      </Card>

      <H2>Saved addresses</H2>
      <Card>
        <View style={styles.chipRow}>
          {CHAINS.map((c) => (
            <Chip key={c} value={c} active={chain === c} onPress={() => setChain(c)} />
          ))}
        </View>
        <Input label="Address" value={address} onChangeText={setAddress} placeholder="0x… / T…" />
        <Input label="Label (optional)" value={label} onChangeText={setLabel} placeholder="My Ledger" />
        {addErr ? <Text style={{ color: colors.down }}>{addErr}</Text> : null}
        <Button title="Add address" variant="secondary" loading={addBusy} disabled={!address} onPress={addAddress} />
      </Card>

      {(addrs.data ?? []).map((a) => (
        <Card key={a.id}>
          <Row label={a.label || a.chain} value={a.chain} />
          <Text selectable style={styles.addr}>
            {shortHash(a.address, 12, 10)}
          </Text>
          <Pressable onPress={() => setToAddress(a.address)}>
            <Text style={{ color: colors.brand, fontWeight: '700', fontSize: font.sm }}>Use this address →</Text>
          </Pressable>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.panel },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.ink, fontSize: font.sm, fontWeight: '700' },
  addr: { color: colors.ink, fontSize: font.sm, fontFamily: 'monospace' },
});
