import {
  Prisma,
  type FiuDraftReport,
  type FiuDraftReportItem,
  type FiuDraftStatus,
  type FiuReportExportEvent,
  type FiuReportType,
  type FiuReportValidationIssue,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the Stage 5.6 FIU draft-report tables. Owns fiu_draft_reports /
 * fiu_draft_report_items / fiu_report_validation_issues / fiu_report_export_events.
 * Read-only over the compliance source tables (via evidence/compliance repos);
 * never touches money-movement state and never deletes a record.
 */

export type FiuReportWithRelations = FiuDraftReport & {
  items: FiuDraftReportItem[];
  issues: FiuReportValidationIssue[];
};

export const fiuRepository = {
  createReport(data: Prisma.FiuDraftReportUncheckedCreateInput): Promise<FiuDraftReport> {
    return prisma.fiuDraftReport.create({ data });
  },
  updateReport(id: string, data: Prisma.FiuDraftReportUncheckedUpdateInput): Promise<FiuDraftReport> {
    return prisma.fiuDraftReport.update({ where: { id }, data });
  },
  findReport(id: string): Promise<FiuReportWithRelations | null> {
    return prisma.fiuDraftReport.findUnique({
      where: { id },
      include: { items: { orderBy: { createdAt: 'asc' } }, issues: { orderBy: { createdAt: 'desc' } } },
    }) as Promise<FiuReportWithRelations | null>;
  },
  listReports(input: { reportType?: FiuReportType; status?: FiuDraftStatus; scopeUserId?: string; cursor?: string; limit: number }): Promise<FiuDraftReport[]> {
    return prisma.fiuDraftReport.findMany({
      where: {
        ...(input.reportType ? { reportType: input.reportType } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.scopeUserId ? { scopeUserId: input.scopeUserId } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  createItems(rows: Prisma.FiuDraftReportItemUncheckedCreateInput[]): Promise<Prisma.BatchPayload> {
    if (rows.length === 0) return Promise.resolve({ count: 0 });
    return prisma.fiuDraftReportItem.createMany({ data: rows });
  },

  createIssues(rows: Prisma.FiuReportValidationIssueUncheckedCreateInput[]): Promise<Prisma.BatchPayload> {
    if (rows.length === 0) return Promise.resolve({ count: 0 });
    return prisma.fiuReportValidationIssue.createMany({ data: rows });
  },
  listIssues(reportId: string): Promise<FiuReportValidationIssue[]> {
    return prisma.fiuReportValidationIssue.findMany({ where: { reportId }, orderBy: { createdAt: 'desc' }, take: 200 });
  },

  createExportEvent(data: Prisma.FiuReportExportEventUncheckedCreateInput): Promise<FiuReportExportEvent> {
    return prisma.fiuReportExportEvent.create({ data });
  },
  listExportEvents(input: { limit: number; cursor?: string }): Promise<FiuReportExportEvent[]> {
    return prisma.fiuReportExportEvent.findMany({
      where: { ...(input.cursor ? { id: { lt: input.cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },
};

export type FiuRepository = typeof fiuRepository;
