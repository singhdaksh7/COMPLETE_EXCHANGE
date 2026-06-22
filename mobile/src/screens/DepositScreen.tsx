import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, H2, Input, Muted, Row, Screen, StatusBadge } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import { fmtAmount } from '@/utils/format';
import type { DepositAddress, InrDeposit, ManualDepositMethod } from '@/types/api';

const CHAINS = ['ETH', 'TRON', 'BSC'];
const METHODS: ManualDepositMethod[] = ['UPI', 'IMPS', 'NEFT', 'BANK'];

export default function DepositScreen() {
  // crypto deposit addresses
  const addrs = useApi<DepositAddress[]>(
    () => userApi.listDepositAddresses().then((r) => r.data.items),
    [],
  );
  const [chain, setChain] = useState('ETH');
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  const generate = async () => {
    setGenErr(null);
    setGenBusy(true);
    try {
      await userApi.createDepositAddress(chain);
      addrs.reload();
    } catch (e) {
      setGenErr(actionErrorMessage(e));
    } finally {
      setGenBusy(false);
    }
  };

  // INR manual deposit
  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [method, setMethod] = useState<ManualDepositMethod>('UPI');
  const [inrBusy, setInrBusy] = useState(false);
  const [inrErr, setInrErr] = useState<string | null>(null);
  const [inrDone, setInrDone] = useState<InrDeposit | null>(null);

  const submitInr = async () => {
    setInrErr(null);
    setInrDone(null);
    setInrBusy(true);
    try {
      const res = await userApi.createManualInrDeposit({ amount, utr: utr.trim(), method });
      setInrDone(res.data);
      setAmount('');
      setUtr('');
    } catch (e) {
      setInrErr(actionErrorMessage(e));
    } finally {
      setInrBusy(false);
    }
  };

  const Chip = ({ value, active, onPress }: { value: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: colors.bg }]}>{value}</Text>
    </Pressable>
  );

  return (
    <Screen refreshing={addrs.loading} onRefresh={addrs.reload}>
      <H2>Crypto deposit</H2>
      <Card>
        <Muted>Generate a deposit address, then send funds from your external wallet.</Muted>
        <View style={styles.chipRow}>
          {CHAINS.map((c) => (
            <Chip key={c} value={c} active={chain === c} onPress={() => setChain(c)} />
          ))}
        </View>
        {genErr ? <Text style={{ color: colors.down }}>{genErr}</Text> : null}
        <Button title={`Generate ${chain} address`} variant="secondary" loading={genBusy} onPress={generate} />
      </Card>

      {(addrs.data ?? []).map((a) => (
        <Card key={a.id}>
          <Row label={a.chain} value={<StatusBadge status={a.isActive ? 'ACTIVE' : 'INACTIVE'} />} />
          <Text selectable style={styles.addr}>
            {a.address}
          </Text>
          <Muted>Tap and hold to copy. Only send the matching asset on {a.chain}.</Muted>
        </Card>
      ))}

      <H2>INR deposit (manual)</H2>
      <Card>
        <Muted>Submit your bank/UPI transfer reference. An admin approves it on the web dashboard.</Muted>
        <Input label="Amount (INR)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="1000" />
        <Input label="UTR / reference" value={utr} onChangeText={setUtr} placeholder="Bank/UPI reference" />
        <View style={styles.chipRow}>
          {METHODS.map((m) => (
            <Chip key={m} value={m} active={method === m} onPress={() => setMethod(m)} />
          ))}
        </View>
        {inrErr ? <Text style={{ color: colors.down }}>{inrErr}</Text> : null}
        {inrDone ? (
          <Row label="Submitted" value={<StatusBadge status={inrDone.status} />} />
        ) : null}
        <Button title="Submit INR deposit" loading={inrBusy} disabled={!amount || !utr} onPress={submitInr} />
        {inrDone ? <Muted>₹ {fmtAmount(inrDone.amount)} submitted — pending admin review.</Muted> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.panel },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.ink, fontSize: font.sm, fontWeight: '700' },
  addr: { color: colors.brand, fontSize: font.sm, fontFamily: 'monospace' },
});
