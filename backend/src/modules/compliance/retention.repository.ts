import {
  Prisma,
  type RecordRetentionPolicy,
  type RecordRetentionReview,
  type RetentionReviewStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the Stage 5.4 record-retention tables. Owns
 * record_retention_policies / record_retention_reviews and performs READ-ONLY
 * COUNTS over the compliance source tables to populate a review snapshot. It is
 * review-only: it NEVER deletes a record and never touches money-movement state.
 */

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const retentionRepository = {
  /* ---------------- policies ---------------- */
  listPolicies(): Promise<RecordRetentionPolicy[]> {
    return prisma.recordRetentionPolicy.findMany({ orderBy: { recordType: 'asc' } });
  },

  findPolicy(recordType: string): Promise<RecordRetentionPolicy | null> {
    return prisma.recordRetentionPolicy.findUnique({ where: { recordType } });
  },

  upsertPolicy(
    recordType: string,
    create: Prisma.RecordRetentionPolicyUncheckedCreateInput,
    update: Prisma.RecordRetentionPolicyUncheckedUpdateInput,
  ): Promise<RecordRetentionPolicy> {
    return prisma.recordRetentionPolicy.upsert({ where: { recordType }, create: { ...create, recordType }, update });
  },

  /* ---------------- reviews ---------------- */
  createReview(data: Prisma.RecordRetentionReviewUncheckedCreateInput): Promise<RecordRetentionReview> {
    return prisma.recordRetentionReview.create({ data });
  },

  findReview(id: string): Promise<RecordRetentionReview | null> {
    return prisma.recordRetentionReview.findUnique({ where: { id } });
  },

  updateReview(id: string, data: Prisma.RecordRetentionReviewUncheckedUpdateInput): Promise<RecordRetentionReview> {
    return prisma.recordRetentionReview.update({ where: { id }, data });
  },

  listReviews(input: { recordType?: string; status?: RetentionReviewStatus; limit: number; cursor?: string }): Promise<RecordRetentionReview[]> {
    return prisma.recordRetentionReview.findMany({
      where: {
        ...(input.recordType ? { recordType: input.recordType } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  /**
   * READ-ONLY retention counts for a record type. `eligible` = past the
   * retention boundary, `nearing` = within ~6 months of it, `retained` = total.
   * Nothing is deleted — this only reports posture.
   */
  async countsFor(
    recordType: string,
    retentionYears: number,
  ): Promise<{ eligibleCount: number; retainedCount: number; nearingBoundaryCount: number }> {
    const now = Date.now();
    const boundary = new Date(now - retentionYears * YEAR_MS); // older than this = eligible
    const nearStart = new Date(now - (retentionYears - 0.5) * YEAR_MS); // within 6 months of boundary

    const count = async (
      total: () => Promise<number>,
      eligible: () => Promise<number>,
      nearing: () => Promise<number>,
    ) => ({
      retainedCount: await total(),
      eligibleCount: await eligible(),
      nearingBoundaryCount: await nearing(),
    });

    switch (recordType) {
      case 'KYC':
        return count(
          () => prisma.complianceProfile.count(),
          () => prisma.complianceProfile.count({ where: { createdAt: { lte: boundary } } }),
          () => prisma.complianceProfile.count({ where: { createdAt: { gt: boundary, lte: nearStart } } }),
        );
      case 'COMPLIANCE_EVIDENCE':
        return count(
          () => prisma.complianceEvidence.count(),
          () => prisma.complianceEvidence.count({ where: { createdAt: { lte: boundary } } }),
          () => prisma.complianceEvidence.count({ where: { createdAt: { gt: boundary, lte: nearStart } } }),
        );
      case 'STR_CASE':
        return count(
          () => prisma.complianceCase.count(),
          () => prisma.complianceCase.count({ where: { createdAt: { lte: boundary } } }),
          () => prisma.complianceCase.count({ where: { createdAt: { gt: boundary, lte: nearStart } } }),
        );
      case 'WALLET_RISK':
        return count(
          () => prisma.walletRiskCheck.count(),
          () => prisma.walletRiskCheck.count({ where: { createdAt: { lte: boundary } } }),
          () => prisma.walletRiskCheck.count({ where: { createdAt: { gt: boundary, lte: nearStart } } }),
        );
      case 'TRAVEL_RULE':
        return count(
          () => prisma.travelRuleTransfer.count(),
          () => prisma.travelRuleTransfer.count({ where: { createdAt: { lte: boundary } } }),
          () => prisma.travelRuleTransfer.count({ where: { createdAt: { gt: boundary, lte: nearStart } } }),
        );
      case 'AUDIT_LOG':
        return count(
          () => prisma.auditLog.count(),
          () => prisma.auditLog.count({ where: { occurredAt: { lte: boundary } } }),
          () => prisma.auditLog.count({ where: { occurredAt: { gt: boundary, lte: nearStart } } }),
        );
      default:
        return { eligibleCount: 0, retainedCount: 0, nearingBoundaryCount: 0 };
    }
  },
};

export type RetentionRepository = typeof retentionRepository;
