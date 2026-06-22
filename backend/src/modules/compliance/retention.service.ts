import type { Prisma, RetentionReviewStatus } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { retentionRepository } from './retention.repository';
import type { ComplianceContext } from './compliance.types';

/**
 * Record-retention foundation service (Stage 5.4). Review-only: it manages
 * retention policies and produces non-destructive review snapshots (counts of
 * records eligible / nearing the retention boundary). It NEVER deletes a record.
 */

/** Baseline retention policies (years) seeded on first read. */
const DEFAULT_POLICIES: Array<{ recordType: string; retentionYears: number; description: string }> = [
  { recordType: 'KYC', retentionYears: 5, description: 'KYC / enhanced-KYC compliance profiles (PMLA baseline).' },
  { recordType: 'COMPLIANCE_EVIDENCE', retentionYears: 5, description: 'Onboarding compliance evidence metadata.' },
  { recordType: 'STR_CASE', retentionYears: 8, description: 'Suspicious-transaction cases and alerts.' },
  { recordType: 'WALLET_RISK', retentionYears: 5, description: 'Wallet-risk screening checks.' },
  { recordType: 'TRAVEL_RULE', retentionYears: 5, description: 'Travel Rule transfer records.' },
  { recordType: 'AUDIT_LOG', retentionYears: 8, description: 'Audit / admin action logs.' },
];

/** Pure transition guard for a retention review. */
export function canTransitionReview(from: RetentionReviewStatus, to: RetentionReviewStatus): boolean {
  if (to !== 'REVIEWED' && to !== 'ESCALATED') return false;
  if (from === 'REVIEWED') return false; // terminal
  return true; // PENDING or ESCALATED may move to REVIEWED/ESCALATED
}

export const retentionService = {
  /** List policies, seeding the baseline set on first access (idempotent). */
  async listPolicies(ctx: ComplianceContext = {}) {
    let policies = await retentionRepository.listPolicies();
    if (policies.length === 0) {
      for (const p of DEFAULT_POLICIES) {
        await retentionRepository.upsertPolicy(
          p.recordType,
          { recordType: p.recordType, retentionYears: p.retentionYears, status: 'ACTIVE', description: p.description, createdByAdminId: ctx.actorId ?? null },
          {},
        );
      }
      policies = await retentionRepository.listPolicies();
    }
    return policies;
  },

  async upsertPolicy(
    input: { recordType: string; retentionYears: number; status?: 'ACTIVE' | 'DISABLED'; description?: string },
    ctx: ComplianceContext = {},
  ) {
    const policy = await retentionRepository.upsertPolicy(
      input.recordType,
      {
        recordType: input.recordType,
        retentionYears: input.retentionYears,
        status: input.status ?? 'ACTIVE',
        description: input.description ?? null,
        createdByAdminId: ctx.actorId ?? null,
      },
      {
        retentionYears: input.retentionYears,
        ...(input.status ? { status: input.status } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    );

    // Produce a fresh PENDING review snapshot for this policy (counts only).
    const counts = await retentionRepository.countsFor(policy.recordType, policy.retentionYears);
    await retentionRepository.createReview({
      policyId: policy.id,
      recordType: policy.recordType,
      status: 'PENDING',
      periodEnd: new Date(),
      eligibleCount: counts.eligibleCount,
      retainedCount: counts.retainedCount,
      nearingBoundaryCount: counts.nearingBoundaryCount,
    });

    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.retention.policy.upsert',
      entityType: 'record_retention_policy',
      entityId: policy.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { recordType: policy.recordType, retentionYears: policy.retentionYears } as Prisma.InputJsonValue,
    });
    return policy;
  },

  listReviews(input: { recordType?: string; status?: RetentionReviewStatus; limit: number; cursor?: string }) {
    return retentionRepository.listReviews(input).then((rows) => {
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
    });
  },

  async setReviewStatus(
    reviewId: string,
    status: RetentionReviewStatus,
    notes: string | undefined,
    ctx: ComplianceContext = {},
  ) {
    const review = await retentionRepository.findReview(reviewId);
    if (!review) throw new NotFoundError('Retention review not found');
    if (!canTransitionReview(review.status, status)) {
      throw new BadRequestError(`Cannot move review from ${review.status} to ${status}`, { code: 'RETENTION_INVALID_TRANSITION' });
    }
    const updated = await retentionRepository.updateReview(reviewId, {
      status,
      notes: notes ?? review.notes,
      reviewedByAdminId: ctx.actorId ?? null,
      reviewedAt: new Date(),
    });
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'compliance.retention.review.status',
      entityType: 'record_retention_review',
      entityId: reviewId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { from: review.status, to: status } as Prisma.InputJsonValue,
    });
    return updated;
  },
};

export type RetentionService = typeof retentionService;
