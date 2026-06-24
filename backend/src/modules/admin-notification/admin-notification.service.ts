import { type AdminNotification } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import {
  adminNotificationRepository,
  type NotificationCandidate,
} from './admin-notification.repository';

export interface AdminNotificationContext {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface AdminNotificationDto {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  targetType: string | null;
  targetId: string | null;
  isRead: boolean;
  readAt: string | null;
  readByAdminId: string | null;
  createdAt: string;
}

function toDto(n: AdminNotification): AdminNotificationDto {
  return {
    id: n.id,
    type: n.type,
    severity: n.severity,
    title: n.title,
    message: n.message,
    targetType: n.targetType,
    targetId: n.targetId,
    isRead: n.isRead,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    readByAdminId: n.readByAdminId,
    createdAt: n.createdAt.toISOString(),
  };
}

export const adminNotificationService = {
  /**
   * Derive notifications from current operational state and insert any that do
   * not already exist (idempotent on dedupeKey). Returns how many were created.
   * Read-only against source tables; only the admin_notifications table is
   * written. Never throws to the caller path that lists notifications.
   */
  async refresh(): Promise<number> {
    const [kyc, inrDeposits, inrWithdrawals, cryptoWd, cases, highRisk, walletRisk, screening] =
      await Promise.all([
        adminNotificationRepository.pendingKycUsers(),
        adminNotificationRepository.pendingInrByType('DEPOSIT'),
        adminNotificationRepository.pendingInrByType('WITHDRAWAL'),
        adminNotificationRepository.cryptoWithdrawalsForReview(),
        adminNotificationRepository.openCases(),
        adminNotificationRepository.highRiskUsers(),
        adminNotificationRepository.walletRiskAlerts(),
        adminNotificationRepository.screeningHits(),
      ]);

    const candidates: NotificationCandidate[] = [];

    for (const u of kyc) {
      candidates.push({
        dedupeKey: `kyc_review:${u.id}`,
        type: 'KYC_REVIEW',
        severity: 'INFO',
        title: 'KYC waiting for review',
        message: `${u.email} is ${u.kycStatus} and awaiting review.`,
        targetType: 'user',
        targetId: u.id,
      });
    }
    for (const t of inrDeposits) {
      candidates.push({
        dedupeKey: `inr_deposit_pending:${t.id}`,
        type: 'INR_DEPOSIT_PENDING',
        severity: 'INFO',
        title: 'INR deposit pending',
        message: `Pending INR deposit of ₹${t.amount.toFixed()} awaiting approval.`,
        targetType: 'inr_transaction',
        targetId: t.id,
      });
    }
    for (const t of inrWithdrawals) {
      candidates.push({
        dedupeKey: `inr_withdrawal_pending:${t.id}`,
        type: 'INR_WITHDRAWAL_PENDING',
        severity: 'WARNING',
        title: 'INR withdrawal pending',
        message: `Pending INR withdrawal of ₹${t.amount.toFixed()} awaiting review.`,
        targetType: 'inr_transaction',
        targetId: t.id,
      });
    }
    for (const w of cryptoWd) {
      candidates.push({
        dedupeKey: `crypto_withdrawal_pending:${w.id}`,
        type: 'CRYPTO_WITHDRAWAL_REVIEW',
        severity: 'WARNING',
        title: 'Crypto withdrawal needs review',
        message: `Crypto withdrawal of ${w.amount.toFixed()} ${w.asset} requires review.`,
        targetType: 'crypto_withdrawal',
        targetId: w.id,
      });
    }
    for (const c of cases) {
      candidates.push({
        dedupeKey: `case_opened:${c.id}`,
        type: 'COMPLIANCE_CASE_OPENED',
        severity: c.priority === 'CRITICAL' || c.priority === 'HIGH' ? 'CRITICAL' : 'WARNING',
        title: 'Compliance case opened',
        message: `${c.priority} case: ${c.title}`,
        targetType: 'compliance_case',
        targetId: c.id,
      });
    }
    for (const u of highRisk) {
      candidates.push({
        dedupeKey: `high_risk_user:${u.id}`,
        type: 'HIGH_RISK_USER',
        severity: 'WARNING',
        title: 'High-risk user flagged',
        message: `${u.email} is marked HIGH risk.`,
        targetType: 'user',
        targetId: u.id,
      });
    }
    for (const w of walletRisk) {
      candidates.push({
        dedupeKey: `wallet_risk:${w.id}`,
        type: 'WALLET_RISK_ALERT',
        severity: w.level === 'CRITICAL' || w.level === 'HIGH' ? 'CRITICAL' : 'WARNING',
        title: 'Wallet-risk alert',
        message: `${w.level} wallet-risk on ${w.chain}.`,
        targetType: 'wallet_risk_check',
        targetId: w.id,
      });
    }
    for (const s of screening) {
      candidates.push({
        dedupeKey: `screening_hit:${s.id}`,
        type: 'SCREENING_HIT',
        severity: 'CRITICAL',
        title: 'Screening hit needs review',
        message: `${s.category} possible match awaiting disposition.`,
        targetType: 'screening_check',
        targetId: s.id,
      });
    }

    return adminNotificationRepository.insertNew(candidates);
  },

  /** Refresh from operational state, then return the paginated list + unread count. */
  async list(
    input: { unreadOnly?: boolean; type?: string; cursor?: string; limit: number },
  ): Promise<{ items: AdminNotificationDto[]; nextCursor: string | null; unread: number }> {
    await this.refresh();
    const rows = await adminNotificationRepository.list(input);
    const hasMore = rows.length > input.limit;
    const slice = hasMore ? rows.slice(0, input.limit) : rows;
    const unread = await adminNotificationRepository.unreadCount();
    return {
      items: slice.map(toDto),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
      unread,
    };
  },

  async markRead(id: string, ctx: AdminNotificationContext): Promise<{ updated: boolean }> {
    const updated = await adminNotificationRepository.markRead(id, ctx.actorId ?? null);
    if (updated > 0) {
      await recordAudit({
        actorType: 'ADMIN',
        actorId: ctx.actorId,
        action: 'admin.notification.read',
        entityType: 'admin_notification',
        entityId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
    }
    return { updated: updated > 0 };
  },

  async markAllRead(ctx: AdminNotificationContext): Promise<{ updated: number }> {
    const updated = await adminNotificationRepository.markAllRead(ctx.actorId ?? null);
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: 'admin.notification.read_all',
      entityType: 'admin_notification',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { updated },
    });
    return { updated };
  },
};

export type AdminNotificationService = typeof adminNotificationService;
