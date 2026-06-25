import {
  auditReviewRepository,
  type AdminLogWithActor,
  type AuditReviewFilter,
} from './audit-review.repository';
import { classifyRisk, type AuditRiskLevel } from './audit-review.risk';

/**
 * Stage 9D — Admin Audit Review service.
 *
 * Shapes the append-only AdminLog into a risk-aware, paginated review feed for
 * the security dashboard. Read-only; no secrets (admin email + action + target
 * ids only — the same safe fields the existing /operations/audit viewer
 * already exposes under audit.view).
 */
export interface AuditReviewItem {
  id: string;
  occurredAt: string;
  actorAdminId: string;
  actorEmail: string | null;
  action: string;
  riskLevel: AuditRiskLevel;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  ip: string | null;
}

export interface AuditReviewResult {
  items: AuditReviewItem[];
  nextCursor: string | null;
  summary: {
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

function toItem(row: AdminLogWithActor): AuditReviewItem {
  return {
    id: row.id.toString(),
    occurredAt: row.occurredAt.toISOString(),
    actorAdminId: row.adminId,
    actorEmail: row.admin?.email ?? null,
    action: row.action,
    riskLevel: classifyRisk(row.action),
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    ip: row.ip,
  };
}

export const auditReviewService = {
  async review(
    input: AuditReviewFilter & { cursor?: string; limit: number },
  ): Promise<AuditReviewResult> {
    // Run the page query and the risk-bucket summary over the SAME filter set
    // (the summary intentionally ignores cursor + riskLevel so the header always
    // shows the full breakdown for the current filters).
    const summaryFilter: AuditReviewFilter = {
      adminId: input.adminId,
      targetId: input.targetId,
      action: input.action,
      ip: input.ip,
      fromDate: input.fromDate,
      toDate: input.toDate,
    };

    const [rows, high, medium, total] = await Promise.all([
      auditReviewRepository.list(input),
      auditReviewRepository.count({ ...summaryFilter, riskLevel: 'HIGH' }),
      auditReviewRepository.count({ ...summaryFilter, riskLevel: 'MEDIUM' }),
      auditReviewRepository.count(summaryFilter),
    ]);

    const hasMore = rows.length > input.limit;
    const slice = hasMore ? rows.slice(0, input.limit) : rows;

    return {
      items: slice.map(toItem),
      nextCursor: hasMore ? slice[slice.length - 1].id.toString() : null,
      summary: {
        high,
        medium,
        low: Math.max(total - high - medium, 0),
        total,
      },
    };
  },
};

export type AuditReviewService = typeof auditReviewService;
