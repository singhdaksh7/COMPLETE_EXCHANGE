import type {
  ComplianceAlert,
  ComplianceCase,
  ComplianceCaseEvent,
  ComplianceCaseNote,
} from '@prisma/client';
import type { ComplianceCaseWithRelations } from './monitoring.repository';

/** Redacted alert view — details are evidence locators/amounts, never secrets. */
export function toAlertDto(a: ComplianceAlert) {
  return {
    id: a.id,
    userId: a.userId,
    type: a.type,
    status: a.status,
    priority: a.priority,
    score: a.score,
    title: a.title,
    description: a.description,
    details: a.details,
    caseId: a.caseId,
    resolvedByAdminId: a.resolvedByAdminId,
    resolvedAt: a.resolvedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export function toCaseNoteDto(n: ComplianceCaseNote) {
  return { id: n.id, adminId: n.adminId, body: n.body, createdAt: n.createdAt };
}

export function toCaseEventDto(e: ComplianceCaseEvent) {
  return {
    id: e.id,
    action: e.action,
    actorAdminId: e.actorAdminId,
    metadata: e.metadata,
    createdAt: e.createdAt,
  };
}

/** Case row for the admin queue list. */
export function toCaseListDto(
  c: ComplianceCase & { user: { email: string }; _count: { alerts: number } },
) {
  return {
    id: c.id,
    userId: c.userId,
    email: c.user.email,
    type: c.type,
    status: c.status,
    priority: c.priority,
    title: c.title,
    alertCount: c._count.alerts,
    assignedToAdminId: c.assignedToAdminId,
    openedByAdminId: c.openedByAdminId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** Full case detail with alerts, notes and the audit timeline. */
export function toCaseDetailDto(c: ComplianceCaseWithRelations) {
  return {
    id: c.id,
    userId: c.userId,
    email: c.user.email,
    type: c.type,
    status: c.status,
    priority: c.priority,
    title: c.title,
    summary: c.summary,
    dedupeKey: c.dedupeKey,
    assignedToAdminId: c.assignedToAdminId,
    openedByAdminId: c.openedByAdminId,
    closedByAdminId: c.closedByAdminId,
    closedAt: c.closedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    alerts: c.alerts.map(toAlertDto),
    notes: c.notes.map(toCaseNoteDto),
    events: c.events.map(toCaseEventDto),
  };
}

/**
 * STR draft export shape (Stage 5.2). JSON only, clearly marked
 * STR_DRAFT_ONLY. Contains masked identifiers, redacted evidence, linked
 * transactions, notes, admin actions, risk + screening summary. It is NOT a
 * regulatory filing and is never submitted to any FIU.
 */
export interface StrDraftExport {
  exportType: 'STR_DRAFT_ONLY';
  disclaimer: string;
  generatedAt: string;
  case: ReturnType<typeof toCaseDetailDto>;
  user: {
    userId: string;
    email: string;
    profile: unknown | null; // masked compliance profile DTO or null
  };
  alerts: ReturnType<typeof toAlertDto>[];
  linkedTransactions: {
    withdrawals: unknown[];
    deposits: unknown[];
    trades: unknown[];
  };
  notes: ReturnType<typeof toCaseNoteDto>[];
  adminActions: ReturnType<typeof toCaseEventDto>[];
  riskSummary: {
    level: string | null;
    score: number | null;
    recentAssessments: unknown[];
  };
  screeningSummary: unknown;
}
