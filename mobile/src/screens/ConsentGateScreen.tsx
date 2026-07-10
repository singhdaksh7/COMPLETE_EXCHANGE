import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AsyncBoundary, Button, Screen } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/store/auth';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import type { LegalAcceptanceItem, LegalDocument } from '@/types/api';

/**
 * Proactive legal-consent gate (Stage 10A). Rendered by the root navigator
 * IN PLACE of the normal app whenever the authenticated user's
 * /legal/consent-status shows required policies missing — instead of only
 * surfacing this via a dismissible Home banner and waiting for a financial
 * action to bounce with CONSENT_REQUIRED. Acceptance is never marked locally:
 * every Accept goes through the real backend endpoint, and the gate only
 * clears once a re-fetched consent-status confirms `upToDate: true`. Logout
 * is always available so the user is never trapped.
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

export default function ConsentGateScreen() {
  const { consentStatus, refreshConsentStatus, logout } = useAuth();
  const { data, loading, error, reload } = useApi<LegalData>(loadLegal, []);
  const [open, setOpen] = useState<string | null>(null);
  const [acceptingType, setAcceptingType] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);

  const missing = useMemo(() => new Set(consentStatus?.missing ?? []), [consentStatus]);

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

  const handleContinue = async () => {
    setErr(null);
    setContinuing(true);
    try {
      // Re-check with the backend — this is what actually unlocks the app
      // (the gate is removed reactively by the root navigator once
      // consentStatus.upToDate becomes true). Nothing is unlocked locally.
      await refreshConsentStatus();
    } catch (e) {
      setErr(actionErrorMessage(e));
    } finally {
      setContinuing(false);
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={reload} contentStyle={{ gap: spacing.md }}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark-outline" size={40} color={colors.brand} />
        <Text style={styles.title}>Updated Policies</Text>
        <Text style={styles.subtitle}>
          EXORA is INR-only in this environment. Please review and accept the current Terms of
          Service, Privacy Policy and Risk Disclosure to continue.
        </Text>
      </View>

      {err ? <Text style={styles.err}>{err}</Text> : null}

      <AsyncBoundary loading={loading} error={error} data={data} onRetry={reload}>
        {({ docs, acceptedTypes }) => {
          const relevant = docs.filter((d) => missing.has(d.type) || !acceptedTypes.has(d.type));
          const allAccepted = relevant.every((d) => acceptedTypes.has(d.type));
          return (
            <View style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.sm }}>
                {relevant.map((d) => {
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

              <Button
                title="Continue"
                onPress={handleContinue}
                loading={continuing}
                disabled={!allAccepted}
              />
            </View>
          );
        }}
      </AsyncBoundary>

      <Pressable style={styles.logoutLink} onPress={() => logout()}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  title: { color: colors.ink, fontSize: font.xl, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: font.sm, textAlign: 'center', lineHeight: 18 },
  err: { color: colors.down, fontSize: font.sm, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  docTitle: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  docMeta: { color: colors.muted2, fontSize: 10, marginTop: 2 },
  acceptedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: colors.upSoft, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  acceptedPillText: { color: colors.up, fontSize: font.xs, fontWeight: '800' },
  acceptBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  acceptBtnText: { color: '#1A1206', fontSize: font.xs, fontWeight: '800' },
  readLink: { color: colors.brand, fontSize: font.xs, fontWeight: '700' },
  docContent: { color: colors.muted, fontSize: font.xs, lineHeight: 18 },
  logoutLink: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  logoutText: { color: colors.muted, fontSize: font.sm, fontWeight: '700', textDecorationLine: 'underline' },
});
