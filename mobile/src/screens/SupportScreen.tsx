import React, { useState } from 'react';
import { Clipboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AsyncBoundary, EmptyState, Input, Screen, StatusBadge } from '@/components/ui';
import { GlassCard, GoldButton } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import { fmtDate } from '@/utils/format';
import type { SupportMessage, SupportTicketSummary, SupportTicketThread } from '@/types/api';

/**
 * Real user-facing support (Stage 9A parity). Replaces the previous staged
 * "coming soon" helpdesk modal on Profile. Users see and act on their OWN
 * tickets only — the backend never returns internal admin notes here.
 */

const CATEGORIES = ['ACCOUNT', 'KYC', 'DEPOSIT', 'WITHDRAWAL', 'TRADING', 'SECURITY', 'OTHER'];

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

function TicketRow({ t, onPress }: { t: SupportTicketSummary; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <GlassCard padded style={{ gap: 6 }}>
        <View style={styles.rowBetween}>
          <Text style={styles.ticketSubject} numberOfLines={1}>{t.subject}</Text>
          <StatusBadge status={t.status} />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.ticketMeta}>
            {t.ticketNumber ? `${t.ticketNumber} · ` : ''}{t.category}
          </Text>
          <Text style={styles.ticketMeta}>{fmtDate(t.lastMessageAt ?? t.updatedAt)}</Text>
        </View>
      </GlassCard>
    </Pressable>
  );
}

function NewTicketForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const [category, setCategory] = useState('ACCOUNT');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const invalid = subject.trim().length < 3 || message.trim().length < 1;

  const submit = async () => {
    if (invalid) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await userApi.supportCreateTicket({
        category,
        subject: subject.trim(),
        message: message.trim(),
        referenceId: referenceId.trim() || undefined,
      });
      onCreated(res.data.id);
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard padded style={{ gap: spacing.sm }}>
      <Text style={styles.formTitle}>Raise a support ticket</Text>
      <Text style={styles.fieldLabel}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c}
            onPress={() => setCategory(c)}
            style={[styles.catChip, category === c && styles.catChipOn]}
          >
            <Text style={[styles.catChipText, category === c && styles.catChipTextOn]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Input label="Subject" placeholder="Brief summary (min 3 chars)" value={subject} onChangeText={setSubject} maxLength={200} />
      <Input
        label="Message"
        placeholder="Describe your issue"
        value={message}
        onChangeText={setMessage}
        maxLength={5000}
        multiline
        style={{ height: 100, textAlignVertical: 'top', paddingTop: spacing.sm }}
      />
      <Input
        label="Reference / UTR (optional)"
        placeholder="e.g. a UTR / transaction id"
        value={referenceId}
        onChangeText={setReferenceId}
        maxLength={120}
      />
      {err ? <Text style={styles.err}>{err}</Text> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
        <View style={{ flex: 1 }}>
          <GoldButton title="Submit ticket" onPress={submit} loading={busy} disabled={invalid} />
        </View>
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

function TicketThreadView({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<SupportTicketThread>(
    () => userApi.supportTicket(id).then((r) => r.data),
    [id],
  );
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await userApi.supportReply(id, reply.trim());
      setReply('');
      reload();
      onChanged();
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    setErr(null);
    try {
      await userApi.supportCloseTicket(id);
      reload();
      onChanged();
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AsyncBoundary loading={loading} error={error} data={data} onRetry={reload}>
      {(t) => {
        const closed = t.status.toUpperCase() === 'CLOSED';
        return (
          <View style={{ gap: spacing.md }}>
            <GlassCard padded style={{ gap: spacing.sm }}>
              <View style={styles.rowBetween}>
                <Text style={styles.ticketSubject}>{t.subject}</Text>
                {!closed ? (
                  <Pressable onPress={close} disabled={busy}>
                    <Text style={styles.closeLink}>{busy ? '…' : 'Close ticket'}</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.rowBetween}>
                <StatusBadge status={t.status} />
                <Text style={styles.ticketMeta}>{t.category}</Text>
              </View>
              {t.ticketNumber ? (
                <View style={styles.rowBetween}>
                  <Text style={styles.ticketMeta}>{t.ticketNumber}</Text>
                  <CopyChip value={t.ticketNumber} label="no." />
                </View>
              ) : null}
              {t.referenceId ? (
                <View style={styles.rowBetween}>
                  <Text style={styles.ticketMeta}>Ref: {t.referenceId}</Text>
                  <CopyChip value={t.referenceId} label="ref" />
                </View>
              ) : null}
            </GlassCard>

            {t.messages.map((m: SupportMessage) => {
              const mine = m.senderType === 'USER';
              const system = m.senderType === 'SYSTEM';
              return (
                <View
                  key={m.id}
                  style={[
                    styles.msgBubble,
                    system ? styles.msgSystem : mine ? styles.msgMine : styles.msgTheirs,
                  ]}
                >
                  {!system && (
                    <Text style={styles.msgSender}>{mine ? 'You' : 'Support'}</Text>
                  )}
                  <Text style={styles.msgBody}>{m.body}</Text>
                  <Text style={styles.msgTime}>{fmtDate(m.createdAt)}</Text>
                </View>
              );
            })}

            {err ? <Text style={styles.err}>{err}</Text> : null}

            {closed ? (
              <Text style={styles.closedNotice}>
                This ticket is closed. Please open a new ticket if you need more help.
              </Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                <Input
                  placeholder="Type your reply…"
                  value={reply}
                  onChangeText={setReply}
                  maxLength={5000}
                  multiline
                  style={{ height: 80, textAlignVertical: 'top', paddingTop: spacing.sm }}
                />
                <GoldButton title="Send reply" onPress={send} loading={busy} disabled={!reply.trim()} />
              </View>
            )}
          </View>
        );
      }}
    </AsyncBoundary>
  );
}

export default function SupportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ticket?: string }>();
  const activeId = params.ticket ?? null;
  const [creating, setCreating] = useState(false);

  const list = useApi(() => userApi.supportTickets().then((r) => r.data), []);

  const open = (id: string) => router.push({ pathname: '/support', params: { ticket: id } });
  const back = () => router.push('/support');

  return (
    <Screen refreshing={list.loading} onRefresh={list.reload} contentStyle={{ gap: spacing.md }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Support</Text>
          <Text style={styles.subtitle}>Raise a ticket and track our replies.</Text>
        </View>
        {!activeId && !creating ? (
          <Pressable style={styles.newBtn} onPress={() => setCreating(true)}>
            <Ionicons name="add" size={16} color="#1A1206" />
            <Text style={styles.newBtnText}>New</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.backBtn}
            onPress={() => {
              setCreating(false);
              if (activeId) back();
            }}
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>
        )}
      </View>

      {creating ? (
        <NewTicketForm
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            list.reload();
            open(id);
          }}
        />
      ) : activeId ? (
        <TicketThreadView id={activeId} onChanged={list.reload} />
      ) : (
        <AsyncBoundary
          loading={list.loading}
          error={list.error}
          data={list.data}
          onRetry={list.reload}
          empty={{
            title: 'No support tickets yet',
            hint: 'Raise a ticket and our team will help you out.',
            icon: 'chatbox-ellipses-outline',
          }}
        >
          {(page) =>
            page.items.length === 0 ? (
              <EmptyState
                icon="chatbox-ellipses-outline"
                title="No support tickets yet"
                hint="Raise a ticket and our team will help you out."
              />
            ) : (
              <View style={{ gap: spacing.sm }}>
                {page.items.map((t) => (
                  <TicketRow key={t.id} t={t} onPress={() => open(t.id)} />
                ))}
              </View>
            )
          }
        </AsyncBoundary>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: colors.ink, fontSize: font.xl, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: font.xs, marginTop: 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  newBtnText: { color: '#1A1206', fontSize: font.xs, fontWeight: '800' },
  backBtn: { paddingVertical: 8, paddingHorizontal: spacing.sm },
  backBtnText: { color: colors.muted, fontSize: font.xs, fontWeight: '700' },
  err: { color: colors.down, fontSize: font.sm },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketSubject: { color: colors.ink, fontSize: font.md, fontWeight: '800', flex: 1, marginRight: spacing.sm },
  ticketMeta: { color: colors.muted2, fontSize: 10 },
  closeLink: { color: colors.down, fontSize: font.xs, fontWeight: '700' },
  closedNotice: { color: colors.muted, fontSize: font.xs, textAlign: 'center', paddingVertical: spacing.sm },

  copyChip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  copyChipText: { color: colors.muted, fontSize: 9, fontWeight: '800' },

  formTitle: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  fieldLabel: { color: colors.muted, fontSize: font.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  catChip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  catChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  catChipText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  catChipTextOn: { color: '#1A1206' },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill },
  cancelBtnText: { color: colors.muted, fontSize: font.sm, fontWeight: '700' },

  msgBubble: { maxWidth: '85%', borderRadius: radius.lg, padding: spacing.md, gap: 2 },
  msgMine: { alignSelf: 'flex-end', backgroundColor: 'rgba(245,194,66,0.12)', borderWidth: 1, borderColor: colors.glassBorderGold },
  msgTheirs: { alignSelf: 'flex-start', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  msgSystem: { alignSelf: 'center', backgroundColor: 'transparent' },
  msgSender: { color: colors.muted2, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  msgBody: { color: colors.ink, fontSize: font.sm, lineHeight: 18 },
  msgTime: { color: colors.muted2, fontSize: 9, marginTop: 2 },
});
