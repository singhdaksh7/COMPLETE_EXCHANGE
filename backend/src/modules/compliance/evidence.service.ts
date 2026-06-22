import type { EvidencePackType, Prisma } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { complianceRepository } from './compliance.repository';
import { screeningRepository } from './screening.repository';
import { evidenceRepository } from './evidence.repository';
import { checksumOf, stripSecrets } from './evidence.util';
import {
  toAdminComplianceDto,
  toConsentDto,
  toEvidenceDto,
  toRiskAssessmentDto,
} from './compliance.types';
import type { ComplianceContext } from './compliance.types';
import { toScreeningCheckDto } from './screening.service';
import { toAlertDto, toCaseDetailDto } from './case.types';

/**
 * Compliance evidence-pack service (Stage 5.4).
 *
 * Assembles audit-ready, JSON-first evidence packs by AGGREGATING existing
 * masked compliance data from Stages 5.0–5.3. It is read-only over the source
 * tables, applies a defense-in-depth secrets strip, and writes a SHA-256
 * checksum. It NEVER files an FIU report, deletes records, or mutates ledger /
 * scanner / matching / withdrawal state.
 */

export const PACK_LABEL = 'INTERNAL_COMPLIANCE_EVIDENCE_PACK_STAGING_ONLY';
const SOURCE = { system: 'EXORA-compliance', stage: '5.4', schema: 'evidence-pack-v1' } as const;
const DISCLAIMER =
  'INTERNAL COMPLIANCE EVIDENCE PACK — STAGING ONLY. Aggregated, masked compliance evidence for internal review. ' +
  'It is NOT a Suspicious Transaction Report or any filing transmitted to an FIU/regulator, contains no secrets or ' +
  'raw PAN/Aadhaar, and is not a legal compliance certification.';

interface PackItemDraft {
  itemType: string;
  refId: string | null;
  title: string;
  data: unknown;
}

function push(items: PackItemDraft[], itemType: string, refId: string | null, title: string, data: unknown): void {
  items.push({ itemType, refId, title, data: stripSecrets(data) });
}

/* ---------------- safe inline mappers for 5.3 records ---------------- */
function walletCheckDto(c: Record<string, unknown>) {
  return {
    id: c.id, chain: c.chain, address: c.address, direction: c.direction,
    level: c.level, status: c.status, score: c.score, summary: c.summary,
    categories: c.categories, provider: c.provider, providerMode: c.providerMode,
    reviewDecision: c.reviewDecision, reviewedAt: c.reviewedAt, createdAt: c.createdAt,
  };
}
function travelRuleDto(t: Record<string, unknown>) {
  return {
    id: t.id, direction: t.direction, status: t.status, chain: t.chain, asset: t.asset,
    amount: t.amount, counterpartyAddress: t.counterpartyAddress, counterparty: t.counterparty,
    infoCollectedAt: t.infoCollectedAt, sentMockAt: t.sentMockAt, exemptedReason: t.exemptedReason,
    createdAt: t.createdAt,
  };
}

/* ---------------- assembly per pack type ---------------- */

async function subjectFor(userId: string): Promise<{ userId: string; email: string | null; profile: unknown | null }> {
  const profile = await complianceRepository.findProfileWithUser(userId);
  if (profile) return { userId, email: profile.user.email, profile: toAdminComplianceDto(profile) };
  const u = await evidenceRepository.findUserBasic(userId);
  return {
    userId,
    email: u?.email ?? null,
    profile: u
      ? { userId: u.id, email: u.email, accountStatus: u.status, kycStatus: u.kycStatus, kycTier: u.kycTier, createdAt: u.createdAt }
      : null,
  };
}

async function kycSection(items: PackItemDraft[], userId: string): Promise<void> {
  const [evidence, consents, risk, screening] = await Promise.all([
    complianceRepository.listEvidence(userId),
    complianceRepository.listConsents(userId),
    complianceRepository.listRiskAssessments(userId),
    screeningRepository.listChecks(userId),
  ]);
  for (const e of evidence) push(items, 'KYC_EVIDENCE', e.id, `Evidence: ${e.type}`, toEvidenceDto(e));
  for (const c of consents) push(items, 'CONSENT', c.id, `Consent: ${c.consentType}`, toConsentDto(c));
  for (const r of risk) push(items, 'RISK_ASSESSMENT', r.id, `Risk assessment (${r.source})`, toRiskAssessmentDto(r));
  for (const s of screening) push(items, 'SCREENING_CHECK', s.id, `Screening: ${s.category}`, toScreeningCheckDto(s));
}

async function monitoringSection(items: PackItemDraft[], userId: string): Promise<void> {
  const [alerts, cases] = await Promise.all([
    evidenceRepository.alertsForUser(userId),
    evidenceRepository.casesForUser(userId),
  ]);
  for (const a of alerts) push(items, 'ALERT', a.id, a.title, toAlertDto(a));
  for (const c of cases) push(items, 'CASE', c.id, c.title, toCaseDetailDto(c as never));
}

async function walletSection(items: PackItemDraft[], userId: string): Promise<void> {
  const checks = await evidenceRepository.walletRiskChecksForUser(userId);
  for (const c of checks) push(items, 'WALLET_RISK_CHECK', c.id, `Wallet risk: ${c.level}`, walletCheckDto(c as never));
}

async function travelSection(items: PackItemDraft[], userId: string): Promise<void> {
  const transfers = await evidenceRepository.travelRuleForUser(userId);
  for (const t of transfers) push(items, 'TRAVEL_RULE', t.id, `Travel Rule: ${t.direction}`, travelRuleDto(t as never));
}

async function auditSection(items: PackItemDraft[], userId: string): Promise<void> {
  const timeline = await evidenceRepository.auditForUser(userId);
  push(items, 'AUDIT_TIMELINE', userId, 'Admin / system action timeline', timeline);
}

export interface GenerateInput {
  packType: EvidencePackType;
  userId?: string;
  caseId?: string;
  ref?: string;
  format?: 'JSON' | 'PDF_PLACEHOLDER';
}

export const evidenceService = {
  async generate(input: GenerateInput, ctx: ComplianceContext = {}) {
    // Resolve + validate scope, and figure out the subject user.
    let scopeUserId = input.userId ?? null;
    let scopeCaseId: string | null = null;
    let scopeRef: string | null = input.ref ?? null;

    if (input.packType === 'STR_CASE') {
      if (!input.caseId) throw new BadRequestError('caseId is required for STR_CASE pack', { code: 'SCOPE_REQUIRED' });
      const theCase = await evidenceRepository.caseById(input.caseId);
      if (!theCase) throw new NotFoundError('Compliance case not found');
      scopeCaseId = theCase.id;
      scopeUserId = theCase.userId;
    } else if (input.packType === 'USER_KYC' || input.packType === 'FULL_USER_COMPLIANCE') {
      if (!input.userId) throw new BadRequestError('userId is required for this pack type', { code: 'SCOPE_REQUIRED' });
    } else if (input.packType === 'WALLET_RISK' || input.packType === 'TRAVEL_RULE') {
      if (!input.userId && !input.ref) {
        throw new BadRequestError('userId or ref is required for this pack type', { code: 'SCOPE_REQUIRED' });
      }
    }

    const subjectUser = scopeUserId;
    const title = `${input.packType} evidence pack`;

    const pack = await evidenceRepository.createPack({
      packType: input.packType,
      status: 'BUILDING',
      format: input.format ?? 'JSON',
      label: PACK_LABEL,
      title,
      scopeUserId,
      scopeCaseId,
      scopeRef,
      generatedByAdminId: ctx.actorId ?? null,
    });

    try {
      const items: PackItemDraft[] = [];
      let subject: unknown = null;

      if (subjectUser) {
        subject = await subjectFor(subjectUser);
        push(items, 'SUBJECT', subjectUser, 'Subject summary (masked)', subject);
      }

      switch (input.packType) {
        case 'USER_KYC':
          await kycSection(items, subjectUser!);
          break;
        case 'FULL_USER_COMPLIANCE':
          await kycSection(items, subjectUser!);
          await monitoringSection(items, subjectUser!);
          await walletSection(items, subjectUser!);
          await travelSection(items, subjectUser!);
          await auditSection(items, subjectUser!);
          break;
        case 'STR_CASE': {
          const theCase = await evidenceRepository.caseById(scopeCaseId!);
          if (theCase) push(items, 'CASE', theCase.id, theCase.title, toCaseDetailDto(theCase as never));
          if (subjectUser) {
            const risk = await complianceRepository.listRiskAssessments(subjectUser);
            for (const r of risk) push(items, 'RISK_ASSESSMENT', r.id, `Risk assessment (${r.source})`, toRiskAssessmentDto(r));
            const screening = await screeningRepository.listChecks(subjectUser);
            for (const s of screening) push(items, 'SCREENING_CHECK', s.id, `Screening: ${s.category}`, toScreeningCheckDto(s));
          }
          break;
        }
        case 'WALLET_RISK':
          if (scopeRef) {
            const profile = await evidenceRepository.walletRiskProfileById(scopeRef);
            if (!profile) throw new NotFoundError('Wallet-risk profile not found');
            push(items, 'WALLET_RISK_PROFILE', profile.id, `Wallet risk profile: ${profile.address}`, profile);
          }
          if (subjectUser) await walletSection(items, subjectUser);
          break;
        case 'TRAVEL_RULE':
          if (scopeRef) {
            const t = await evidenceRepository.travelRuleById(scopeRef);
            if (!t) throw new NotFoundError('Travel Rule record not found');
            push(items, 'TRAVEL_RULE', t.id, `Travel Rule: ${t.direction}`, travelRuleDto(t as never));
          }
          if (subjectUser) await travelSection(items, subjectUser);
          break;
      }

      const generatedAt = new Date().toISOString();
      let payload: Record<string, unknown> = {
        label: PACK_LABEL,
        disclaimer: DISCLAIMER,
        packId: pack.id,
        packType: input.packType,
        format: pack.format,
        scope: { userId: scopeUserId, caseId: scopeCaseId, ref: scopeRef },
        generatedAt,
        generatedBy: ctx.actorId ?? 'system',
        source: SOURCE,
        subject: subject ?? null,
        itemCount: items.length,
        items,
      };
      // Whole-payload secrets guard (belt and braces over the per-item strip).
      payload = stripSecrets(payload) as Record<string, unknown>;
      const checksum = checksumOf(payload);
      payload.checksum = checksum;

      const updated = await evidenceRepository.updatePack(pack.id, {
        status: 'READY',
        payload: payload as Prisma.InputJsonValue,
        checksum,
        itemCount: items.length,
        summary: `${items.length} item(s) across ${input.packType}`,
      });
      await evidenceRepository.createItems(
        items.map((it) => ({
          packId: pack.id,
          itemType: it.itemType,
          refId: it.refId,
          title: it.title,
          data: (it.data ?? null) as Prisma.InputJsonValue,
        })),
      );

      await recordAudit({
        actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
        actorId: ctx.actorId ?? null,
        action: 'compliance.evidence_pack.generate',
        entityType: 'compliance_evidence_pack',
        entityId: pack.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        metadata: { packType: input.packType, itemCount: items.length, checksum } as Prisma.InputJsonValue,
      });

      void updated;
      return this.get(pack.id);
    } catch (err) {
      await evidenceRepository.updatePack(pack.id, {
        status: 'FAILED',
        error: (err instanceof Error ? err.message : 'generation failed').slice(0, 500),
      });
      throw err;
    }
  },

  async list(input: { packType?: EvidencePackType; status?: never; scopeUserId?: string; cursor?: string; limit: number }, ctx: ComplianceContext = {}) {
    const rows = await evidenceRepository.listPacks(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    void ctx;
    return {
      items: page.map((p) => ({
        id: p.id,
        packType: p.packType,
        status: p.status,
        format: p.format,
        title: p.title,
        summary: p.summary,
        label: p.label,
        scopeUserId: p.scopeUserId,
        scopeCaseId: p.scopeCaseId,
        scopeRef: p.scopeRef,
        itemCount: p.itemCount,
        checksum: p.checksum,
        createdAt: p.createdAt,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  },

  async get(packId: string) {
    const pack = await evidenceRepository.findPack(packId);
    if (!pack) throw new NotFoundError('Evidence pack not found');
    return {
      id: pack.id,
      packType: pack.packType,
      status: pack.status,
      format: pack.format,
      label: pack.label,
      title: pack.title,
      summary: pack.summary,
      scope: { userId: pack.scopeUserId, caseId: pack.scopeCaseId, ref: pack.scopeRef },
      itemCount: pack.itemCount,
      checksum: pack.checksum,
      error: pack.error,
      generatedByAdminId: pack.generatedByAdminId,
      createdAt: pack.createdAt,
      updatedAt: pack.updatedAt,
      payload: pack.payload,
      items: pack.items.map((it) => ({
        id: it.id,
        itemType: it.itemType,
        refId: it.refId,
        title: it.title,
        data: it.data,
        createdAt: it.createdAt,
      })),
    };
  },

  /** Export a READY pack's masked payload + record an export event. */
  async export(packId: string, ctx: ComplianceContext = {}) {
    const pack = await evidenceRepository.findPack(packId);
    if (!pack) throw new NotFoundError('Evidence pack not found');
    if (pack.status !== 'READY') {
      throw new BadRequestError(`Pack is not ready (status ${pack.status})`, { code: 'PACK_NOT_READY' });
    }
    await evidenceRepository.createExportEvent({
      exportType: 'EVIDENCE_PACK',
      packId: pack.id,
      scopeUserId: pack.scopeUserId,
      scopeRef: pack.scopeRef,
      format: pack.format,
      checksum: pack.checksum,
      label: PACK_LABEL,
      adminId: ctx.actorId ?? null,
    });
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.evidence_pack.export',
      entityType: 'compliance_evidence_pack',
      entityId: pack.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { checksum: pack.checksum } as Prisma.InputJsonValue,
    });
    return pack.payload;
  },

  async listExportEvents(input: { limit: number; cursor?: string }) {
    const rows = await evidenceRepository.listExportEvents(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  },
};

export type EvidenceService = typeof evidenceService;
