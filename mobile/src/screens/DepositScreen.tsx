import React, { useState } from 'react';
import { Clipboard, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AsyncBoundary,
  Button,
  Card,
  EmptyState,
  H2,
  Input,
  Muted,
  Row,
  Screen,
  StatusBadge,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/store/auth';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import { fmtAmount, fmtDate } from '@/utils/format';
import type { InrDeposit, InrDepositInstructions, ManualDepositMethod } from '@/types/api';

// INR-only mode: crypto deposit is intentionally NOT offered here. Funding is
// limited to manual INR deposit (bank/UPI reference, admin-approved on the web).
const METHODS: ManualDepositMethod[] = ['UPI', 'IMPS', 'NEFT', 'BANK'];

function CopyChip({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Pressable
      style={styles.copyChip}
      onPress={() => {
        Clipboard.setString(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <Text style={styles.copyChipText}>{done ? 'Copied' : `Copy ${label}`}</Text>
    </Pressable>
  );
}

export default function DepositScreen() {
  const { features } = useAuth();

  const history = useApi<InrDeposit[]>(
    () => userApi.listInrDeposits().then((r) => r.data.items),
    [],
  );

  // Backend source of truth for the manual-transfer destination (Stage 10A).
  // Never hardcode bank/UPI details client-side.
  const instructions = useApi<InrDepositInstructions>(
    () => userApi.inrDepositInstructions().then((r) => r.data),
    [],
  );

  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [method, setMethod] = useState<ManualDepositMethod>('UPI');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<InrDeposit | null>(null);

  // Gate on the real feature map. `features` is null until /auth/me resolves; we
  // only block when the backend has explicitly disabled INR deposit.
  if (features && !features.inrDeposit) {
    return (
      <Screen>
        <H2>Deposit</H2>
        <EmptyState
          icon="lock-closed-outline"
          title="INR deposit unavailable"
          hint="INR deposits are not enabled for your account right now. Please contact support."
        />
      </Screen>
    );
  }

  const submit = async () => {
    setErr(null);
    setDone(null);
    setBusy(true);
    try {
      const res = await userApi.createManualInrDeposit({ amount, utr: utr.trim(), method });
      setDone(res.data);
      setAmount('');
      setUtr('');
      history.reload();
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const Chip = ({ value, active, onPress }: { value: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: colors.bg }]}>{value}</Text>
    </Pressable>
  );

  return (
    <Screen refreshing={history.loading} onRefresh={history.reload}>
      <H2>INR deposit</H2>

      <Card>
        <Text style={styles.instructionsTitle}>Transfer instructions</Text>
        {instructions.loading && !instructions.data ? (
          <Muted>Loading transfer instructions…</Muted>
        ) : instructions.error && !instructions.data ? (
          <Muted>{instructions.error}</Muted>
        ) : instructions.data && !instructions.data.enabled ? (
          <Muted>INR deposit instructions are temporarily unavailable. Please contact support.</Muted>
        ) : instructions.data?.enabled ? (
          <View style={{ gap: spacing.xs }}>
            <Row label="Bank" value={instructions.data.bankName} />
            <Row label="Account Name" value={instructions.data.beneficiaryName} />
            <View style={styles.copyRow}>
              <Row label="Account Number" value={instructions.data.accountNumber} />
              <CopyChip value={instructions.data.accountNumber} label="A/C" />
            </View>
            <View style={styles.copyRow}>
              <Row label="IFSC" value={instructions.data.ifsc} />
              <CopyChip value={instructions.data.ifsc} label="IFSC" />
            </View>
            <Row label="Account Type" value={instructions.data.accountType} />
            <View style={styles.copyRow}>
              <Row label="UPI ID" value={instructions.data.upiId} />
              <CopyChip value={instructions.data.upiId} label="UPI" />
            </View>
            <Muted>{instructions.data.instructions}</Muted>
          </View>
        ) : null}
      </Card>

      <Card>
        <Muted>
          After transferring, submit the amount and your bank/UPI reference (UTR)
          below. An admin verifies and credits it — this request does not move
          money automatically.
        </Muted>
        <Input label="Amount (INR)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="1000" />
        <Input label="UTR / reference" value={utr} onChangeText={setUtr} placeholder="Bank/UPI reference" />
        <View style={styles.chipRow}>
          {METHODS.map((m) => (
            <Chip key={m} value={m} active={method === m} onPress={() => setMethod(m)} />
          ))}
        </View>
        {err ? <Text style={{ color: colors.down }}>{err}</Text> : null}
        <Button title="Submit INR deposit" loading={busy} disabled={!amount || !utr} onPress={submit} />
        {done ? (
          <View style={{ marginTop: spacing.sm }}>
            <Row label="Submitted" value={<StatusBadge status={done.status} />} />
            <Muted>₹ {fmtAmount(done.amount)} submitted — pending admin review.</Muted>
          </View>
        ) : null}
      </Card>

      <H2>Deposit history</H2>
      <AsyncBoundary
        loading={history.loading}
        error={history.error}
        data={history.data}
        onRetry={history.reload}
        empty={{ title: 'No deposits yet', hint: 'Your INR deposit requests will appear here.', icon: 'receipt-outline' }}
      >
        {(items) =>
          items.length === 0 ? (
            <EmptyState icon="receipt-outline" title="No deposits yet" hint="Your INR deposit requests will appear here." />
          ) : (
            <>
              {items.map((d) => (
                <Card key={d.id}>
                  <View style={styles.histTop}>
                    <Text style={styles.amt}>₹ {fmtAmount(d.amount)}</Text>
                    <StatusBadge status={d.status} />
                  </View>
                  <Row label="Method" value={d.method ?? 'Gateway'} />
                  <Row label="Reference" value={d.utr ?? '—'} />
                  <Muted>{fmtDate(d.createdAt)}</Muted>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.panel },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.ink, fontSize: font.sm, fontWeight: '700' },
  histTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amt: { color: colors.ink, fontSize: font.lg, fontWeight: '800' },
  instructionsTitle: { color: colors.ink, fontSize: font.sm, fontWeight: '800', marginBottom: spacing.xs },
  copyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  copyChip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: colors.panel },
  copyChipText: { color: colors.brand, fontSize: font.xs, fontWeight: '700' },
});
