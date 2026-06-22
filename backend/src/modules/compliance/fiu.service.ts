import type { FiuDraftStatus, FiuReportScopeType, FiuReportType, Prisma } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { fiuRepository } from './fiu.repository';
import { evidenceRepository } from './evidence.repository';
import { complianceRepository } from './compliance.repository';
import { checksumOf, stripSecrets } from './evidence.util';
import { countSeverities, validateDraft } from './fiu.validation';
import { toAdminComplianceDto, toRiskAssessmentDto } from './compliance.types';
import { toAlertDto, toCaseDetailDto } from './case.types';
import type { ComplianceContext } from './compliance.types';

/**
 * FIU draft-reporting service (Stage 5.6). DRAFT-ONLY: it assembles masked
 * STR/CTR/NTR drafts from existing compliance data, validates them, and exports
 * JSON drafts. Every draft is labelled FIU_DRAFT_REPORT_STAGING_ONLY with a
 * NOT_SUBMITTED_TO_FIU state. It NEVER calls an FIU API/portal, transmits a
 * report, mutates money-movement state, or deletes records.
 */

export const FIU_LABEL = 'FIU_DRAFT_REPORT_STAGING_ONLY';
export const NOT_SUBMITTED = 'NOT_SUBMITTED_TO_FIU';
const DISCLAIMER =
  'FIU DRAFT REPORT — STAGING ONLY. Internal draft assembled from masked compliance data. ' +
  'NOT_SUBMITTED_TO_FIU: this is not transmitted to FIU-IND or any regulator/portal, is not a completed legal filing, ' +
  'and contains no secrets or raw PAN/Aadhaar.';

interface ItemDraft {
  itemType: string;
  refId: string | null;
  title: string;
  data: unknown;
}

function walletCheckDto(c: Record<string, unknown>) {
  return { id: c.id, chain: c.chain, address: c.address, level: c.level, status: c.status, score: c.score, summary: c.summary, createdAt: c.createdAt };
}

export interface FiuGenerateInput {
  reportType: FiuReportType;
  scopeType: FiuReportScopeType;
  userId?: string;
  caseId?: string;
  evidencePackId?: string;
  narrative?: string;
  periodStart?: string;
  periodEnd?: string;
}

export const fiuService = {
  async generate(input: FiuGenerateInput, ctx: ComplianceContext = {}) {
    let scopeUserId = input.userId ?? null;
    let scopeCaseId: string | null = null;

    if (input.caseId) {
      const theCase = await evidenceRepository.caseById(input.caseId);
      if (!theCase) throw new NotFoundError('Compliance case not found');
      scopeCaseId = theCase.id;
      scopeUserId = scopeUserId ?? theCase.userId;
    }

    const report = await fiuRepository.createReport({
      reportType: input.reportType,
      status: 'DRAFT',
      scopeType: input.scopeType,
      format: 'JSON_DRAFT',
      label: FIU_LABEL,
      submissionState: NOT_SUBMITTED,
      title: `${input.reportType} draft`,
      narrative: input.narrative ?? null,
      scopeUserId,
      scopeCaseId,
      evidencePackId: input.evidencePackId ?? null,
      periodStart: input.periodStart ? new Date(input.periodStart) : null,
      periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
      generatedByAdminId: ctx.actorId ?? null,
    });

    try {
      const items: ItemDraft[] = [];
      let hasProfileItem = false;
      let hasCaseItem = false;
      const sourceRefs: Record<string, unknown> = { userId: scopeUserId, caseId: scopeCaseId, evidencePackId: input.evidencePackId ?? null };

      if (scopeUserId) {
        const profile = await complianceRepository.findProfileWithUser(scopeUserId);
        if (profile) {
          items.push({ itemType: 'SUBJECT', refId: scopeUserId, title: 'Subject (masked)', data: stripSecrets(toAdminComplianceDto(profile)) });
          hasProfileItem = true;
        } else {
          const u = await evidenceRepository.findUserBasic(scopeUserId);
          if (u) items.push({ itemType: 'SUBJECT', refId: scopeUserId, title: 'Subject (basic)', data: { userId: u.id, email: u.email, kycStatus: u.kycStatus } });
        }
        const risk = await complianceRepository.listRiskAssessments(scopeUserId);
        for (const r of risk) items.push({ itemType: 'RISK_ASSESSMENT', refId: r.id, title: `Risk (${r.source})`, data: stripSecrets(toRiskAssessmentDto(r)) });
        const wallet = await evidenceRepository.walletRiskChecksForUser(scopeUserId);
        for (const w of wallet) items.push({ itemType: 'WALLET_RISK_CHECK', refId: w.id, title: `Wallet risk: ${w.level}`, data: stripSecrets(walletCheckDto(w as never)) });
      }

      if (scopeCaseId) {
        const theCase = await evidenceRepository.caseById(scopeCaseId);
        if (theCase) {
          items.push({ itemType: 'CASE', refId: theCase.id, title: theCase.title, data: stripSecrets(toCaseDetailDto(theCase as never)) });
          hasCaseItem = true;
          for (const a of theCase.alerts) items.push({ itemType: 'ALERT', refId: a.id, title: a.title, data: stripSecrets(toAlertDto(a)) });
          sourceRefs.alertIds = theCase.alerts.map((a) => a.id);
        }
      }

      if (input.evidencePackId) {
        const pack = await evidenceRepository.findPack(input.evidencePackId);
        if (pack) {
          // Reference + minimized summary only — never the full pack payload.
          items.push({
            itemType: 'EVIDENCE_PACK_REF',
            refId: pack.id,
            title: `Evidence pack ${pack.packType}`,
            data: { packId: pack.id, packType: pack.packType, status: pack.status, checksum: pack.checksum, itemCount: pack.itemCount, label: pack.label },
          });
        }
      }

      const hasTransactionRefs = items.some((i) => i.itemType === 'WALLET_RISK_CHECK' || i.itemType === 'ALERT' || i.itemType === 'TRAVEL_RULE');

      let payload: Record<string, unknown> = {
        label: FIU_LABEL,
        submissionState: NOT_SUBMITTED,
        disclaimer: DISCLAIMER,
        reportId: report.id,
        reportType: input.reportType,
        scopeType: input.scopeType,
        scope: { userId: scopeUserId, caseId: scopeCaseId, evidencePackId: input.evidencePackId ?? null },
        narrative: input.narrative ?? null,
        generatedAt: new Date().toISOString(),
        generatedBy: ctx.actorId ?? null,
        sourceRefs,
        itemCount: items.length,
        items,
      };
      payload = stripSecrets(payload) as Record<string, unknown>;
      const checksum = checksumOf(payload);
      payload.checksum = checksum;

      await fiuRepository.updateReport(report.id, {
        payload: payload as Prisma.InputJsonValue,
        checksum,
        sourceRefs: sourceRefs as Prisma.InputJsonValue,
      });
      await fiuRepository.createItems(
        items.map((it) => ({ reportId: report.id, itemType: it.itemType, refId: it.refId, title: it.title, data: (it.data ?? null) as Prisma.InputJsonValue })),
      );

      // Stash flags for validation via a no-op (recomputed there from items).
      void hasProfileItem;
      void hasCaseItem;
      void hasTransactionRefs;

      await recordAudit({
        actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
        actorId: ctx.actorId ?? null,
        action: 'compliance.fiu_report.generate',
        entityType: 'fiu_draft_report',
        entityId: report.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        metadata: { reportType: input.reportType, itemCount: items.length, checksum } as Prisma.InputJsonValue,
      });

      return this.get(report.id);
    } catch (err) {
      await fiuRepository.updateReport(report.id, { status: 'FAILED' });
      throw err;
    }
  },

  /** Run validation, persist issues (append-only), and update status. */
  async validate(reportId: string, ctx: ComplianceContext = {}) {
    const report = await fiuRepository.findReport(reportId);
    if (!report) throw new NotFoundError('FIU draft report not found');

    const issues = validateDraft({
      reportType: report.reportType,
      scopeType: report.scopeType,
      scopeUserId: report.scopeUserId,
      scopeCaseId: report.scopeCaseId,
      evidencePackId: report.evidencePackId,
      narrative: report.narrative,
      generatedByAdminId: report.generatedByAdminId,
      hasProfileItem: report.items.some((i) => i.itemType === 'SUBJECT'),
      hasCaseItem: report.items.some((i) => i.itemType === 'CASE'),
      hasTransactionRefs: report.items.some((i) => ['WALLET_RISK_CHECK', 'ALERT', 'TRAVEL_RULE'].includes(i.itemType)),
      payloadString: JSON.stringify(report.payload ?? {}),
    });
    const { errorCount, warningCount } = countSeverities(issues);

    await fiuRepository.createIssues(
      issues.map((i) => ({ reportId, severity: i.severity, code: i.code, field: i.field ?? null, message: i.message })),
    );
    const status: FiuDraftStatus = errorCount === 0 ? 'READY_FOR_INTERNAL_REVIEW' : 'DRAFT';
    await fiuRepository.updateReport(reportId, { status, errorCount, warningCount });

    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.fiu_report.validate',
      entityType: 'fiu_draft_report',
      entityId: reportId,
      metadata: { errorCount, warningCount, status } as Prisma.InputJsonValue,
    });
    return this.get(reportId);
  },

  async export(reportId: string, ctx: ComplianceContext = {}) {
    const report = await fiuRepository.findReport(reportId);
    if (!report) throw new NotFoundError('FIU draft report not found');
    if (report.errorCount > 0 || (report.status !== 'READY_FOR_INTERNAL_REVIEW' && report.status !== 'EXPORTED_DRAFT')) {
      throw new BadRequestError('Report must be validated with no ERROR issues before export', { code: 'FIU_NOT_READY' });
    }

    await fiuRepository.createExportEvent({
      reportId: report.id,
      reportType: report.reportType,
      format: report.format,
      checksum: report.checksum,
      label: FIU_LABEL,
      submissionState: NOT_SUBMITTED,
      adminId: ctx.actorId ?? null,
    });
    // Mirror into the unified compliance export history (Stage 5.4) as a case export.
    await evidenceRepository.createExportEvent({
      exportType: 'CASE_EXPORT',
      packId: report.evidencePackId,
      scopeUserId: report.scopeUserId,
      scopeRef: report.id,
      format: report.format,
      checksum: report.checksum,
      label: FIU_LABEL,
      adminId: ctx.actorId ?? null,
    });
    if (report.status !== 'EXPORTED_DRAFT') await fiuRepository.updateReport(reportId, { status: 'EXPORTED_DRAFT' });

    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.fiu_report.export',
      entityType: 'fiu_draft_report',
      entityId: reportId,
      metadata: { checksum: report.checksum, submissionState: NOT_SUBMITTED } as Prisma.InputJsonValue,
    });
    return report.payload;
  },

  async setStatus(reportId: string, status: FiuDraftStatus, ctx: ComplianceContext = {}) {
    const report = await fiuRepository.findReport(reportId);
    if (!report) throw new NotFoundError('FIU draft report not found');
    if (status === 'READY_FOR_INTERNAL_REVIEW' && report.errorCount > 0) {
      throw new BadRequestError('Cannot mark ready while ERROR issues exist', { code: 'FIU_HAS_ERRORS' });
    }
    const updated = await fiuRepository.updateReport(reportId, { status });
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.fiu_report.status',
      entityType: 'fiu_draft_report',
      entityId: reportId,
      metadata: { from: report.status, to: status } as Prisma.InputJsonValue,
    });
    return updated;
  },

  async list(input: { reportType?: FiuReportType; status?: FiuDraftStatus; scopeUserId?: string; cursor?: string; limit: number }) {
    const rows = await fiuRepository.listReports(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items: page.map((r) => ({
        id: r.id, reportType: r.reportType, status: r.status, scopeType: r.scopeType, format: r.format,
        label: r.label, submissionState: r.submissionState, title: r.title, scopeUserId: r.scopeUserId,
        scopeCaseId: r.scopeCaseId, evidencePackId: r.evidencePackId, checksum: r.checksum,
        errorCount: r.errorCount, warningCount: r.warningCount, createdAt: r.createdAt,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  },

  async get(reportId: string) {
    const r = await fiuRepository.findReport(reportId);
    if (!r) throw new NotFoundError('FIU draft report not found');
    return {
      id: r.id, reportType: r.reportType, status: r.status, scopeType: r.scopeType, format: r.format,
      label: r.label, submissionState: r.submissionState, title: r.title, narrative: r.narrative,
      scope: { userId: r.scopeUserId, caseId: r.scopeCaseId, evidencePackId: r.evidencePackId },
      sourceRefs: r.sourceRefs, checksum: r.checksum, errorCount: r.errorCount, warningCount: r.warningCount,
      generatedByAdminId: r.generatedByAdminId, createdAt: r.createdAt, updatedAt: r.updatedAt,
      payload: r.payload,
      items: r.items.map((it) => ({ id: it.id, itemType: it.itemType, refId: it.refId, title: it.title, data: it.data, createdAt: it.createdAt })),
      issues: r.issues.map((i) => ({ id: i.id, severity: i.severity, code: i.code, field: i.field, message: i.message, createdAt: i.createdAt })),
    };
  },

  listIssues(reportId: string) {
    return fiuRepository.listIssues(reportId);
  },

  async listExportEvents(input: { limit: number; cursor?: string }) {
    const rows = await fiuRepository.listExportEvents(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  },
};

export type FiuService = typeof fiuService;
