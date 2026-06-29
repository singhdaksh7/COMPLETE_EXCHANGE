import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import type {
  CreateInrWithdrawalInput,
  InrPayoutMethod,
  InrWithdrawal,
  TwoFaStatusData,
} from '@/types/api';

// Mirror the backend zod validators (inr-withdrawal.validators.ts) so we never
// send a payload the server will reject with "Request validation failed".
const AMOUNT_RE = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{6,20}$/;

// INR-only mode: this is a MANUAL INR payout request (UPI or bank). Crypto
// withdrawal is intentionally NOT offered while crypto is globally disabled.
export default function WithdrawScreen() {
  const { features } = useAuth();

  const inrWallet = useApi(
    () => userApi.wallet('INR').then((r) => r.data).catch(() => null),
    [],
  );
  const history = useApi<InrWithdrawal[]>(
    () => userApi.listInrWithdrawals().then((r) => r.data.items),
    [],
  );
  // Whether TOTP 2FA is on — decides which factor the step-up prompt requests.
  const twoFa = useApi<TwoFaStatusData>(() => userApi.get2faStatus().then((r) => r.data), []);
  const twoFaEnabled = twoFa.data?.enabled ?? false;

  const [method, setMethod] = useState<InrPayoutMethod>('UPI');
  const [amount, setAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [holderName, setHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<InrWithdrawal | null>(null);

  // Step-up re-auth: a fresh factor is required immediately before a payout is
  // accepted (backend enforces X-Step-Up-Token).
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpCode, setStepUpCode] = useState('');

  // Gate on the real feature map (block only when explicitly disabled).
  if (features && !features.inrWithdrawal) {
    return (
      <Screen>
        <H2>Withdraw</H2>
        <EmptyState
          icon="lock-closed-outline"
          title="INR withdrawal unavailable"
          hint="INR withdrawals are not enabled for your account right now. Please contact support."
        />
      </Screen>
    );
  }

  const available = inrWallet.data?.available ?? null;

  const amountOk = AMOUNT_RE.test(amount.trim()) && !/^0(?:\.0{1,2})?$/.test(amount.trim());
  const valid =
    amountOk &&
    (method === 'UPI'
      ? UPI_RE.test(upiId.trim())
      : ACCOUNT_RE.test(accountNumber.trim()) &&
        IFSC_RE.test(ifsc.trim().toUpperCase()) &&
        holderName.trim().length >= 2);

  // Verify the fresh factor → obtain a short-lived step-up token → submit.
  const confirmStepUp = async () => {
    setErr(null);
    setBusy(true);
    try {
      const grant = await userApi.stepUp(
        twoFaEnabled ? { code: stepUpCode.trim() } : { password: stepUpPassword },
      );
      const body: CreateInrWithdrawalInput =
        method === 'UPI'
          ? { amount, method, upiId: upiId.trim() }
          : {
              amount,
              method,
              accountNumber: accountNumber.trim(),
              ifsc: ifsc.trim().toUpperCase(),
              holderName: holderName.trim(),
              ...(bankName.trim() ? { bankName: bankName.trim() } : {}),
            };
      const res = await userApi.createInrWithdrawal(body, grant.data.stepUpToken);
      setDone(res.data);
      setAmount('');
      setUpiId('');
      setAccountNumber('');
      setIfsc('');
      setHolderName('');
      setBankName('');
      setStepUpOpen(false);
      setStepUpPassword('');
      setStepUpCode('');
      history.reload();
      inrWallet.reload();
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const closeStepUp = () => {
    setStepUpOpen(false);
    setStepUpPassword('');
    setStepUpCode('');
    setErr(null);
  };

  const stepUpReady = twoFaEnabled ? stepUpCode.trim().length >= 6 : stepUpPassword.length > 0;

  const Chip = ({ value, active, onPress }: { value: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: colors.bg }]}>{value}</Text>
    </Pressable>
  );

  return (
    <Screen refreshing={history.loading} onRefresh={history.reload}>
      <H2>INR withdrawal</H2>
      <Card>
        <Row
          label="Available INR"
          value={available === null ? '—' : `₹ ${fmtAmount(available)}`}
        />
        <View style={styles.chipRow}>
          {(['UPI', 'BANK'] as InrPayoutMethod[]).map((m) => (
            <Chip key={m} value={m === 'UPI' ? 'UPI' : 'Bank account'} active={method === m} onPress={() => setMethod(m)} />
          ))}
        </View>

        <Input label="Amount (INR)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="500" />

        {method === 'UPI' ? (
          <Input label="UPI ID" value={upiId} onChangeText={setUpiId} placeholder="name@bank" />
        ) : (
          <>
            <Input label="Account holder name" value={holderName} onChangeText={setHolderName} placeholder="As per bank records" />
            <Input label="Account number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" placeholder="Bank account number" />
            <Input label="IFSC" value={ifsc} onChangeText={(t) => setIfsc(t.toUpperCase())} placeholder="HDFC0000240" autoCapitalize="characters" />
            <Input label="Bank name (optional)" value={bankName} onChangeText={setBankName} placeholder="e.g. HDFC Bank" />
          </>
        )}

        {err ? <Text style={{ color: colors.down }}>{err}</Text> : null}

        {!stepUpOpen ? (
          <Button
            title="Request withdrawal"
            disabled={!valid}
            onPress={() => {
              setErr(null);
              setDone(null);
              setStepUpOpen(true);
            }}
          />
        ) : (
          <View style={styles.stepUpBox}>
            <Text style={styles.stepUpTitle}>Confirm it&rsquo;s you</Text>
            <Text style={styles.stepUpSub}>
              {twoFaEnabled
                ? 'Enter a code from your authenticator app (or a backup code) to authorise this withdrawal.'
                : 'Re-enter your account password to authorise this withdrawal.'}
            </Text>
            {twoFaEnabled ? (
              <Input
                label="Authenticator or backup code"
                value={stepUpCode}
                onChangeText={setStepUpCode}
                autoCapitalize="characters"
                placeholder="Code"
              />
            ) : (
              <Input
                label="Account password"
                value={stepUpPassword}
                onChangeText={setStepUpPassword}
                secureTextEntry
                placeholder="••••••••"
              />
            )}
            <Button
              title="Confirm & submit"
              loading={busy}
              disabled={!stepUpReady}
              onPress={confirmStepUp}
            />
            <Pressable style={styles.cancelStepUp} onPress={closeStepUp} disabled={busy}>
              <Text style={styles.cancelStepUpText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        <Muted>
          The amount is reserved from your available balance until the payout is
          completed or rejected by an admin.
        </Muted>
        {done ? (
          <View style={{ marginTop: spacing.sm }}>
            <Row label="Status" value={<StatusBadge status={done.status} />} />
            <Muted>₹ {fmtAmount(done.amount)} requested — pending admin review.</Muted>
          </View>
        ) : null}
      </Card>

      <H2>Withdrawal history</H2>
      <AsyncBoundary
        loading={history.loading}
        error={history.error}
        data={history.data}
        onRetry={history.reload}
        empty={{ title: 'No withdrawals yet', hint: 'Your INR withdrawal requests will appear here.', icon: 'receipt-outline' }}
      >
        {(items) =>
          items.length === 0 ? (
            <EmptyState icon="receipt-outline" title="No withdrawals yet" hint="Your INR withdrawal requests will appear here." />
          ) : (
            <>
              {items.map((w) => (
                <Card key={w.id}>
                  <View style={styles.histTop}>
                    <Text style={styles.amt}>₹ {fmtAmount(w.amount)}</Text>
                    <StatusBadge status={w.status} />
                  </View>
                  <Row
                    label="Destination"
                    value={
                      w.payout.method === 'UPI'
                        ? w.payout.upiId ?? '—'
                        : `${w.payout.bankName ?? 'Bank'} ${w.payout.accountLast4 ?? ''}`.trim()
                    }
                  />
                  <Row
                    label={w.status === 'PAID' ? 'UTR' : 'Note'}
                    value={w.status === 'PAID' ? w.utr ?? '—' : w.rejectionReason ?? '—'}
                  />
                  <Muted>{fmtDate(w.createdAt)}</Muted>
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
  stepUpBox: {
    borderWidth: 1,
    borderColor: 'rgba(245,194,66,0.25)',
    backgroundColor: 'rgba(245,194,66,0.04)',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  stepUpTitle: { color: colors.brand, fontSize: font.sm, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  stepUpSub: { color: colors.muted, fontSize: font.xs, lineHeight: 16 },
  cancelStepUp: { alignItems: 'center', paddingVertical: spacing.xs },
  cancelStepUpText: { color: colors.muted, fontSize: font.sm, fontWeight: '700' },
});
