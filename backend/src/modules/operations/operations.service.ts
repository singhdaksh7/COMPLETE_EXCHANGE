import { config } from '../../config';
import { depositRepository } from '../deposit/deposit.repository';
import { withdrawalRepository } from '../withdrawal/withdrawal.repository';
import {
  operationsRepository,
  type AdminLogWithActor,
  type AuditFilter,
} from './operations.repository';

export interface OperationsSummary {
  inrDeposits: { pending: number; approved: number; rejected: number; total: number };
  withdrawals: {
    pendingTotal: string;
    completedTotal: string;
    failedRejectedCount: number;
    pendingByAsset: Array<{ asset: string; amount: string }>;
  };
  kyc: { pending: number };
  admins: { active: number; suspended: number };
  recentAdminActions: AuditLogDto[];
  dualApprovalThreshold: string;
}

export interface AuditLogDto {
  id: string;
  actorAdminId: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  beforeState: unknown;
  afterState: unknown;
  ip: string | null;
  occurredAt: Date;
}

function toAuditDto(row: AdminLogWithActor): AuditLogDto {
  return {
    id: row.id.toString(),
    actorAdminId: row.adminId,
    actorEmail: row.admin?.email ?? null,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    beforeState: row.beforeState,
    afterState: row.afterState,
    ip: row.ip,
    occurredAt: row.occurredAt,
  };
}

export const operationsService = {
  async summary(): Promise<OperationsSummary> {
    const [
      byStatus,
      withdrawalStats,
      kycPending,
      activeAdmins,
      suspendedAdmins,
      recent,
    ] =
      await Promise.all([
        depositRepository.countManualDepositsByStatus(),
        withdrawalRepository.withdrawalStats(),
        operationsRepository.countUsersByKycPending(),
        operationsRepository.countAdminsByStatus('ACTIVE'),
        operationsRepository.countAdminsByStatus('SUSPENDED'),
        operationsRepository.recentAdminActions(10),
      ]);

    const pending = byStatus.PENDING ?? 0;
    const approved = byStatus.SUCCESS ?? 0;
    const rejected = byStatus.FAILED ?? 0;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    return {
      inrDeposits: { pending, approved, rejected, total },
      withdrawals: {
        pendingTotal: withdrawalStats.pendingTotal.toFixed(),
        completedTotal: withdrawalStats.completedTotal.toFixed(),
        failedRejectedCount: withdrawalStats.failedRejectedCount,
        pendingByAsset: withdrawalStats.pendingByAsset.map((row) => ({
          asset: row.asset,
          amount: row.amount.toFixed(),
        })),
      },
      kyc: { pending: kycPending },
      admins: { active: activeAdmins, suspended: suspendedAdmins },
      recentAdminActions: recent.map(toAuditDto),
      dualApprovalThreshold: config.inrOps.dualApprovalThreshold,
    };
  },

  async listAudit(
    input: AuditFilter & { cursor?: string; limit: number },
  ): Promise<{ items: AuditLogDto[]; nextCursor: string | null }> {
    const rows = await operationsRepository.listAuditLogs(input);
    const hasMore = rows.length > input.limit;
    const slice = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items: slice.map(toAuditDto),
      nextCursor: hasMore ? slice[slice.length - 1].id.toString() : null,
    };
  },

  async exportAuditCsv(input: AuditFilter): Promise<string> {
    const rows = await operationsRepository.exportAuditLogs(input);
    const header = [
      'id',
      'occurred_at',
      'actor_email',
      'actor_admin_id',
      'action',
      'target_type',
      'target_id',
      'ip',
      'before_state',
      'after_state',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.id.toString(),
          r.occurredAt.toISOString(),
          r.admin?.email ?? '',
          r.adminId,
          r.action,
          r.targetType ?? '',
          r.targetId ?? '',
          r.ip ?? '',
          r.beforeState ? JSON.stringify(r.beforeState) : '',
          r.afterState ? JSON.stringify(r.afterState) : '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
    return lines.join('\n');
  },
};

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export type OperationsService = typeof operationsService;
