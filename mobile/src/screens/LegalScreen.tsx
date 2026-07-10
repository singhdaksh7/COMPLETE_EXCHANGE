import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AsyncBoundary, Screen } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/store/auth';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import type { LegalAcceptanceItem, LegalDocument } from '@/types/api';

/**
 * Legal & Policies (Stage 9A parity). Backend is the source of truth for
 * acceptance — nothing here is recorded locally. Also doubles as the "read a
 * policy" surface linked from Register (pre-auth, via the public documents
 * endpoint) and from the post-login consent banner.
 */

interface LegalData {
  docs: LegalDocument[];
  acceptedTypes: Set<string>;
}

async function loadLegal(): Promise<LegalData> {
  const [docsRes, accRes] = await Promise.all([
    userApi.legalCurrent(),
    userApi.legalMyAcceptances().catch(() => ({ data: { items: [] as LegalAcceptanceItem[] } })),
  ]);
  const acceptedTypes = new Set(
    accRes.data.items.filter((a) => a.status === 'ACCEPTED').map((a) => a.documentType),
  );
  return { docs: docsRes.data.items, acceptedTypes };
}

export default function LegalScreen() {
  const { refreshConsentStatus } = useAuth();
  const { data, loading, error, reload } = useApi<LegalData>(loadLegal, []);
  const [open, setOpen] = useState<string | null>(null);
  const [acceptingType, setAcceptingType] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const accept = async (doc: LegalDocument) => {
    setErr(null);
    setAcceptingType(doc.type);
    try {
      await userApi.legalAccept(doc.type);
      reload();
      await refreshConsentStatus();
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setAcceptingType(null);
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={reload} contentStyle={{ gap: spacing.md }}>
      <Text style={styles.title}>Legal &amp; Policies</Text>
      <Text style={styles.subtitle}>
        EXORA is INR-only in this environment. Review each policy and accept the current version to
        keep deposits, withdrawals, trading and KYC available.
      </Text>
      {err ? <Text style={styles.err}>{err}</Text> : null}

      <AsyncBoundary loading={loading} error={error} data={data} onRetry={reload}>
        {({ docs, acceptedTypes }) => (
          <View style={{ gap: spacing.sm }}>
            {docs.map((d) => {
              const accepted = acceptedTypes.has(d.type);
              const expanded = open === d.id;
              return (
                <GlassCard key={d.id} padded style={{ gap: spacing.sm }}>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docTitle}>{d.title}</Text>
                      <Text style={styles.docMeta}>v{d.version}</Text>
                    </View>
                    {accepted ? (
                      <View style={styles.acceptedPill}>
                        <Ionicons name="checkmark-circle" size={13} color={colors.up} />
                        <Text style={styles.acceptedPillText}>Accepted</Text>
                      </View>
                    ) : (
                      <Pressable
                        style={[styles.acceptBtn, acceptingType === d.type && { opacity: 0.6 }]}
                        onPress={() => accept(d)}
                        disabled={acceptingType === d.type}
                      >
                        <Text style={styles.acceptBtnText}>
                          {acceptingType === d.type ? 'Accepting…' : 'Accept'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <Pressable onPress={() => setOpen(expanded ? null : d.id)}>
                    <Text style={styles.readLink}>{expanded ? 'Hide document' : 'Read document'}</Text>
                  </Pressable>
                  {expanded ? <Text style={styles.docContent}>{d.content}</Text> : null}
                </GlassCard>
              );
            })}
          </View>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: font.xl, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: font.sm, lineHeight: 18 },
  err: { color: colors.down, fontSize: font.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  docTitle: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  docMeta: { color: colors.muted2, fontSize: 10, marginTop: 2 },
  acceptedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: colors.upSoft, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  acceptedPillText: { color: colors.up, fontSize: font.xs, fontWeight: '800' },
  acceptBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  acceptBtnText: { color: '#1A1206', fontSize: font.xs, fontWeight: '800' },
  readLink: { color: colors.brand, fontSize: font.xs, fontWeight: '700' },
  docContent: { color: colors.muted, fontSize: font.xs, lineHeight: 18 },
});
