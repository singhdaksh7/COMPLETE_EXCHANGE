import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { AsyncBoundary, Button, Input, Row, Screen, StatusBadge } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, font, radius, spacing } from '@/theme';
import type {
  KycAllowedMimeType,
  KycDocType,
  KycDocumentDto,
  KycProfile,
  KycSessionDto,
  UserCompliance,
} from '@/types/api';

interface KycData {
  kyc: KycProfile | null;
  compliance: UserCompliance | null;
}

const ALLOWED_MIME_TYPES: readonly KycAllowedMimeType[] = ['image/jpeg', 'image/png', 'application/pdf'];

const DOC_TYPES: { value: KycDocType; label: string }[] = [
  { value: 'PAN', label: 'PAN Card' },
  { value: 'AADHAAR', label: 'Aadhaar Card' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'SELFIE', label: 'Selfie' },
  { value: 'ADDRESS_PROOF', label: 'Address Proof' },
];

/** Real backend KYC status transitions (kyc.status.ts). Never invent a value not in this map. */
function getKycStatusText(status: string | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'KYC approved';
    case 'PENDING':
      return 'Submitted — pending review';
    case 'IN_REVIEW':
      return 'Under review';
    case 'MANUAL_REVIEW':
      return 'Under manual review';
    case 'NEEDS_MORE_INFO':
      return 'Additional information required';
    case 'REJECTED':
      return 'Rejected';
    default:
      return 'KYC not submitted';
  }
}

/** Statuses from which the user may (re)submit the identity profile — mirrors KYC_TRANSITIONS. */
function canSubmitProfile(status: string | undefined): boolean {
  const s = (status ?? 'NOT_STARTED').toUpperCase();
  return s === 'NOT_STARTED' || s === 'REJECTED' || s === 'NEEDS_MORE_INFO';
}

function normalizeContentType(mimeType: string | undefined, fallbackExt: string): KycAllowedMimeType | null {
  const m = (mimeType ?? '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'image/jpeg';
  if (m === 'image/png') return 'image/png';
  if (m === 'application/pdf') return 'application/pdf';
  // Some pickers omit mimeType — fall back to the file extension.
  const ext = fallbackExt.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  return null;
}

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface DocUploadState {
  busy: boolean;
  error: string | null;
  message: string | null;
}

export default function KycScreen() {
  const { data, loading, error, reload } = useApi<KycData>(async () => {
    const [kyc, compliance] = await Promise.all([
      userApi.getKyc().then((r) => r.data).catch(() => null),
      userApi.complianceStatus().then((r) => r.data).catch(() => null),
    ]);
    return { kyc, compliance };
  }, []);

  const documents = useApi<KycDocumentDto[]>(
    () => userApi.listKycDocuments().then((r) => r.data.items),
    [],
  );

  // ---- Identity profile submission ----
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [pan, setPan] = useState('');
  const [aadhaarRef, setAadhaarRef] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [stateField, setStateField] = useState('');
  const [pincode, setPincode] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [session, setSession] = useState<KycSessionDto | null>(null);

  const dobValid = /^\d{4}-\d{2}-\d{2}$/.test(dob) && !Number.isNaN(Date.parse(dob));
  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.trim().toUpperCase());
  const canSubmit = fullName.trim().length >= 2 && dobValid && panValid && !profileBusy;

  async function submitProfile() {
    setProfileError(null);
    setProfileBusy(true);
    try {
      const address: Record<string, string> = {};
      if (line1.trim()) address.line1 = line1.trim();
      if (city.trim()) address.city = city.trim();
      if (stateField.trim()) address.state = stateField.trim();
      if (pincode.trim()) address.pincode = pincode.trim();

      const res = await userApi.submitKyc({
        fullName: fullName.trim(),
        dob,
        pan: pan.trim().toUpperCase(),
        ...(aadhaarRef.trim() ? { aadhaarRef: aadhaarRef.trim() } : {}),
        ...(Object.keys(address).length ? { address } : {}),
      });
      const s = (res.meta?.session as KycSessionDto | undefined) ?? null;
      setSession(s);
      reload();
    } catch (e) {
      setProfileError(actionErrorMessage(e));
    } finally {
      setProfileBusy(false);
    }
  }

  async function refreshStatus() {
    setProfileError(null);
    try {
      await userApi.refreshKyc();
      reload();
    } catch (e) {
      setProfileError(actionErrorMessage(e));
    }
  }

  // ---- Document upload ----
  const [docStates, setDocStates] = useState<Record<string, DocUploadState>>({});

  function setDocState(docType: KycDocType, patch: Partial<DocUploadState>) {
    setDocStates((prev) => {
      const current: DocUploadState = prev[docType] ?? { busy: false, error: null, message: null };
      return { ...prev, [docType]: { ...current, ...patch } };
    });
  }

  async function uploadPickedAsset(
    docType: KycDocType,
    uri: string,
    mimeType: string | undefined,
    declaredSize: number | undefined,
  ) {
    const ext = uri.split('.').pop() ?? '';
    const contentType = normalizeContentType(mimeType, ext);
    if (!contentType) {
      setDocState(docType, { busy: false, error: 'Unsupported file type. Please use JPG, PNG or PDF.' });
      return;
    }
    setDocState(docType, { busy: true, error: null, message: null });
    try {
      const file = new File(uri);
      const bytes = await file.bytes();
      const fileSize = file.size ?? declaredSize;
      const digestBuf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
      const sha256 = bufferToHex(digestBuf);

      const reg = await userApi.submitKycDocument({
        docType,
        sha256,
        contentType,
        ...(fileSize ? { fileSize } : {}),
      });

      // Best-effort transfer to the presigned storage URL, using exactly the
      // method/headers the backend signed the URL with — required for the
      // signature to validate against a real S3-backed provider. In staging
      // this host is intentionally a non-routable stub (no live object-storage
      // vendor is wired yet), so this call is expected to fail here — the
      // document METADATA registration above is the real, persisted action
      // either way.
      let transferred = false;
      try {
        const put = await fetch(reg.data.uploadUrl, {
          method: reg.data.requiredMethod,
          headers: reg.data.requiredHeaders,
          body: file,
        });
        transferred = put.ok;
      } catch {
        transferred = false;
      }

      // Report the observed outcome so the backend can distinguish
      // "registered" from "bytes actually reached storage" — never trusted
      // alone as proof, only as a UX signal for whether re-upload is needed.
      try {
        await userApi.confirmKycDocumentUpload(reg.data.documentId, transferred ? 'UPLOADED' : 'FAILED');
      } catch {
        // Non-fatal — the document stays REGISTERED server-side and the user
        // can retry; nothing here should block showing the message below.
      }

      setDocState(docType, {
        busy: false,
        error: null,
        message: transferred
          ? 'Document uploaded and submitted for review.'
          : 'KYC document upload is temporarily unavailable in this test build. Your document details were registered — please try again once storage is enabled.',
      });
      documents.reload();
    } catch (e) {
      setDocState(docType, { busy: false, error: actionErrorMessage(e) });
    }
  }

  async function takePhoto(docType: KycDocType) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setDocState(docType, { error: 'Camera access is required to capture this document. Please allow camera access in Settings.' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.85,
      cameraType: docType === 'SELFIE' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await uploadPickedAsset(docType, asset.uri, asset.mimeType, asset.fileSize);
  }

  async function chooseFile(docType: KycDocType) {
    const result = await DocumentPicker.getDocumentAsync({
      type: [...ALLOWED_MIME_TYPES],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await uploadPickedAsset(docType, asset.uri, asset.mimeType, asset.size);
  }

  return (
    <Screen refreshing={loading} onRefresh={() => { reload(); documents.reload(); }} contentStyle={{ gap: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>

        {/* Verification Header */}
        <View style={styles.header}>
          <View style={styles.goldGlowRing}>
            <Ionicons name="finger-print-outline" size={48} color={colors.brand} />
          </View>
          <Text style={styles.title}>Identity Verification</Text>
          <Text style={styles.subtitle}>
            Compliance-ready workflows matching regional INR digital asset standards.
          </Text>
        </View>

        <AsyncBoundary loading={loading} error={error} data={data} onRetry={reload}>
          {({ kyc, compliance }) => {
            const status = kyc?.status;
            const statusLabel = getKycStatusText(status);
            const isApproved = status?.toUpperCase() === 'APPROVED';
            const eligibleToSubmit = canSubmitProfile(status);
            const underReview = ['PENDING', 'IN_REVIEW', 'MANUAL_REVIEW'].includes((status ?? '').toUpperCase());

            return (
              <View style={{ gap: spacing.lg }}>
                {/* KYC Details Card */}
                <Text style={styles.sectionHeading}>Verification Profile</Text>
                <GlassCard padded style={{ gap: spacing.xs }}>
                  <Row label="Verification Status" value={
                    <View style={styles.statusRow}>
                      <View style={[styles.statusDot, { backgroundColor: isApproved ? colors.up : colors.brand }]} />
                      <Text style={[styles.statusText, { color: isApproved ? colors.up : colors.brand }]}>
                        {statusLabel}
                      </Text>
                    </View>
                  } />
                  <Row label="Verification Level" value={`Tier ${kyc?.tier ?? 0}`} />
                  {kyc?.fullName ? <Row label="Legal Full Name" value={kyc.fullName} /> : null}
                  {kyc?.panMasked ? <Row label="PAN Number" value={kyc.panMasked} /> : null}
                  {kyc?.livenessStatus ? (
                    <Row label="Liveness Check" value={<StatusBadge status={kyc.livenessStatus} />} />
                  ) : null}
                  {kyc?.rejectedReason ? (
                    <View style={styles.rejectionCard}>
                      <Ionicons name="alert-circle-outline" size={14} color={colors.down} />
                      <Text style={styles.rejectionText}>Reason: {kyc.rejectedReason}</Text>
                    </View>
                  ) : null}
                </GlassCard>

                {/* Compliance Screening Card */}
                {compliance ? (
                  <View style={{ gap: spacing.sm }}>
                    <Text style={styles.sectionHeading}>Security Checkpoints</Text>
                    <GlassCard padded style={{ gap: spacing.xs }}>
                      <Row label="Profile Status" value={<StatusBadge status={compliance.status} />} />
                      <Row label="Risk Profile" value={<StatusBadge status={compliance.riskLevel} />} />
                      <Row label="Screening Status" value={<StatusBadge status={compliance.screeningStatus} />} />
                      <Row label="Sanctions Check" value={<StatusBadge status={compliance.sanctionsStatus} />} />
                      <Row label="PEP Check" value={<StatusBadge status={compliance.pepStatus} />} />
                      <Row label="Adverse Media" value={<StatusBadge status={compliance.adverseMediaStatus} />} />
                    </GlassCard>
                  </View>
                ) : null}

                {/* Under-review state */}
                {underReview && (
                  <GlassCard padded style={{ gap: spacing.sm }}>
                    <Text style={styles.cardTitle}>Your verification is under review</Text>
                    <Text style={styles.cardBody}>
                      You can still add supporting documents below. Check back for updates, or refresh your status now.
                    </Text>
                    <Button title="Check Verification Status" variant="secondary" size="sm" onPress={refreshStatus} icon="refresh" />
                    {profileError ? <Text style={styles.errText}>{profileError}</Text> : null}
                  </GlassCard>
                )}

                {/* Approved state */}
                {isApproved && (
                  <GlassCard padded style={{ gap: spacing.xs }}>
                    <Text style={styles.cardTitle}>You&rsquo;re verified ✓</Text>
                    <Text style={styles.cardBody}>Your identity has been approved. No further action is needed.</Text>
                  </GlassCard>
                )}

                {/* Submission / resubmission form */}
                {eligibleToSubmit && (
                  <View style={{ gap: spacing.sm }}>
                    <Text style={styles.sectionHeading}>
                      {status === 'REJECTED' || status === 'NEEDS_MORE_INFO' ? 'Resubmit Your Details' : 'Start Verification'}
                    </Text>
                    <GlassCard padded style={{ gap: spacing.md }}>
                      <Input label="Full Legal Name" value={fullName} onChangeText={setFullName} placeholder="As per your ID documents" />
                      <Input
                        label="Date of Birth (YYYY-MM-DD)"
                        value={dob}
                        onChangeText={setDob}
                        placeholder="1990-01-31"
                        error={dob.length > 0 && !dobValid ? 'Invalid date (YYYY-MM-DD)' : null}
                      />
                      <Input
                        label="PAN Number"
                        value={pan}
                        onChangeText={(v) => setPan(v.toUpperCase())}
                        placeholder="ABCDE1234F"
                        autoCapitalize="characters"
                        error={pan.length > 0 && !panValid ? 'Invalid PAN format' : null}
                      />
                      <Input
                        label="Aadhaar Reference (optional)"
                        value={aadhaarRef}
                        onChangeText={setAadhaarRef}
                        placeholder="Tokenized reference — not your Aadhaar number"
                      />
                      <Text style={styles.formSubHeading}>Address (optional)</Text>
                      <Input label="Address Line 1" value={line1} onChangeText={setLine1} placeholder="Street address" />
                      <View style={styles.row3}>
                        <View style={{ flex: 1 }}>
                          <Input label="City" value={city} onChangeText={setCity} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Input label="State" value={stateField} onChangeText={setStateField} />
                        </View>
                      </View>
                      <Input label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="number-pad" placeholder="400001" />

                      {profileError ? <Text style={styles.errText}>{profileError}</Text> : null}

                      <Button
                        title={status === 'REJECTED' || status === 'NEEDS_MORE_INFO' ? 'Resubmit for Review' : 'Submit for Review'}
                        onPress={submitProfile}
                        loading={profileBusy}
                        disabled={!canSubmit}
                      />

                      {session ? (
                        <View style={styles.sessionBox}>
                          <Text style={styles.sessionText}>Verification session opened with provider: {session.provider}</Text>
                        </View>
                      ) : null}
                    </GlassCard>
                  </View>
                )}

                {/* Document upload */}
                {status && status.toUpperCase() !== 'NOT_STARTED' && (
                  <View style={{ gap: spacing.sm }}>
                    <Text style={styles.sectionHeading}>Identity Documents</Text>
                    {DOC_TYPES.map((dt) => {
                      const st = docStates[dt.value] ?? { busy: false, error: null, message: null };
                      const existing = documents.data?.filter((d) => d.docType === dt.value) ?? [];
                      return (
                        <GlassCard key={dt.value} padded style={{ gap: spacing.xs }}>
                          <View style={styles.docHeader}>
                            <Text style={styles.docLabel}>{dt.label}</Text>
                            {existing.length > 0 ? (
                              <StatusBadge status={existing[existing.length - 1].status} />
                            ) : null}
                          </View>
                          <View style={styles.docActions}>
                            <Button
                              title={dt.value === 'SELFIE' ? 'Take Selfie' : 'Take Photo'}
                              variant="secondary"
                              size="sm"
                              icon="camera-outline"
                              loading={st.busy}
                              disabled={isApproved}
                              onPress={() => takePhoto(dt.value)}
                            />
                            {dt.value !== 'SELFIE' ? (
                              <Button
                                title="Choose File"
                                variant="ghost"
                                size="sm"
                                icon="document-attach-outline"
                                loading={st.busy}
                                disabled={isApproved}
                                onPress={() => chooseFile(dt.value)}
                              />
                            ) : null}
                          </View>
                          {st.error ? <Text style={styles.errText}>{st.error}</Text> : null}
                          {st.message ? <Text style={styles.docMessage}>{st.message}</Text> : null}
                        </GlassCard>
                      );
                    })}
                  </View>
                )}

                {/* Info block */}
                <GlassCard padded style={styles.infoCard}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.brand} />
                  <Text style={styles.infoText}>
                    Your documents are reviewed by EXORA compliance. PAN and Aadhaar reference values are encrypted at
                    rest and never stored as plain text.
                  </Text>
                </GlassCard>
              </View>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md, paddingHorizontal: spacing.md },
  goldGlowRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: 'rgba(245,194,66,0.15)',
    backgroundColor: 'rgba(245,194,66,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: font.xl, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: font.xs, textAlign: 'center', lineHeight: 16 },

  sectionHeading: { color: colors.ink, fontSize: font.sm, fontWeight: '800', marginBottom: spacing.xs },
  formSubHeading: { color: colors.muted, fontSize: font.xs, fontWeight: '800', textTransform: 'uppercase', marginTop: spacing.xs },
  row3: { flexDirection: 'row', gap: spacing.sm },

  cardTitle: { color: colors.ink, fontSize: font.md, fontWeight: '800' },
  cardBody: { color: colors.muted, fontSize: font.sm, lineHeight: 18 },

  // Status mapping styles
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: font.sm, fontWeight: '800' },

  rejectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(234,57,67,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(234,57,67,0.1)',
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  rejectionText: { color: colors.down, fontSize: font.xs, fontWeight: '600' },
  errText: { color: colors.down, fontSize: font.xs, fontWeight: '600' },

  sessionBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(245,194,66,0.15)',
    backgroundColor: 'rgba(245,194,66,0.04)',
    padding: spacing.sm,
  },
  sessionText: { color: colors.brand, fontSize: font.xs, fontWeight: '700' },

  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  docLabel: { color: colors.ink, fontSize: font.sm, fontWeight: '800' },
  docActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  docMessage: { color: colors.muted, fontSize: font.xs, lineHeight: 16 },

  // Bottom info card
  infoCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(245,194,66,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(245,194,66,0.1)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  infoText: { color: colors.muted, fontSize: font.xs, lineHeight: 16, flex: 1 },
});
