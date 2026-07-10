import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AsyncBoundary, Button, Screen } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/store/auth';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, spacing } from '@/theme';
import type { LegalDocument } from '@/types/api';

/**
 * Consent "safe mode" (Stage 10B). Rendered by the root navigator in place of
 * the normal app when the authenticated user's /legal/consent-status fetch
 * itself failed (network/timeout/5xx) — distinct from the accept-policies
 * gate (that only shows on a CONFIRMED backend response saying policies are
 * missing). A failed check must never be treated as "consent accepted", so
 * this screen blocks the whole app rather than silently unlocking it. Offers
 * Retry, a read-only view of the current legal documents, and Logout — never
 * traps the user, never creates a local consent truth.
 */
export default function ConsentUnavailableScreen() {
  const { refreshConsentStatus, logout } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const [retryErr, setRetryErr] = useState<string | null>(null);
  const [showLegal, setShowLegal] = useState(false);

  const retry = async () => {
    setRetryErr(null);
    setRetrying(true);
    try {
      await refreshConsentStatus();
      // If it succeeds, consentCheckFailed flips to false and the root
      // navigator swaps this screen out on its own — nothing more to do here.
    } catch (e) {
      setRetryErr(actionErrorMessage(e));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Screen contentStyle={{ gap: spacing.md }}>
      <View style={styles.header}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
        <Text style={styles.title}>Policy Status Unavailable</Text>
        <Text style={styles.subtitle}>
          We couldn&apos;t verify your current policy acceptance status. Please retry before
          continuing.
        </Text>
      </View>

      {retryErr ? <Text style={styles.err}>{retryErr}</Text> : null}

      <Button title="Retry" onPress={retry} loading={retrying} />

      <Pressable style={styles.link} onPress={() => setShowLegal((v) => !v)}>
        <Text style={styles.linkText}>{showLegal ? 'Hide legal documents' : 'View Legal Documents'}</Text>
      </Pressable>

      {showLegal ? <LegalReadOnly /> : null}

      <Text style={styles.supportNote}>
        If this continues, you can still reach EXORA Support once your connection is restored.
      </Text>

      <Pressable style={styles.logoutLink} onPress={() => logout()}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </Screen>
  );
}

/** Minimal read-only legal document list — no accept actions (this screen
 *  doesn't know what's required; that only comes from a resolved consent
 *  status, which is exactly what failed to load). */
function LegalReadOnly() {
  const { data, loading, error, reload } = useApi<LegalDocument[]>(
    async () => (await userApi.legalCurrent()).data.items,
    [],
  );
  const [open, setOpen] = useState<string | null>(null);

  return (
    <AsyncBoundary loading={loading} error={error} data={data} onRetry={reload}>
      {(docs) => (
        <View style={{ gap: spacing.sm }}>
          {docs.map((d) => {
            const expanded = open === d.id;
            return (
              <GlassCard key={d.id} padded style={{ gap: spacing.xs }}>
                <Text style={styles.docTitle}>{d.title}</Text>
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
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  title: { color: colors.ink, fontSize: font.xl, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: font.sm, textAlign: 'center', lineHeight: 18 },
  err: { color: colors.down, fontSize: font.sm, textAlign: 'center' },
  link: { alignSelf: 'center', padding: spacing.sm },
  linkText: { color: colors.brand, fontSize: font.sm, fontWeight: '700' },
  docTitle: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  readLink: { color: colors.brand, fontSize: font.xs, fontWeight: '700' },
  docContent: { color: colors.muted, fontSize: font.xs, lineHeight: 18 },
  supportNote: { color: colors.muted2, fontSize: font.xs, textAlign: 'center', paddingHorizontal: spacing.md },
  logoutLink: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  logoutText: { color: colors.muted, fontSize: font.sm, fontWeight: '700', textDecorationLine: 'underline' },
});
