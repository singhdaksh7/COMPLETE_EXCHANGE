import {
  type AdminLog,
  type AuditLog,
  type ComplianceCase,
  type ComplianceNote,
  type CryptoDeposit,
  type CryptoWithdrawal,
  type InrTransaction,
  type Order,
  type Trade,
} from '@prisma/client';
import { NotFoundError } from '../../lib/errors';
import {
  userTimelineRepository,
  type TimelineHeader,
} from './user-timeline.repository';

/**
 * Stage 8D unified user timeline.
 *
 * Merges real events from many sources (signup, email verification, auth/
 * session activity, KYC reviews, feature-control changes, deposits,
 * withdrawals, orders, trades, compliance cases, compliance notes, admin
 * actions) into one time-ordered, paginated feed. Read-only. Sensitive values
 * are never included — only ids, statuses, amounts and safe labels.
 */

export type TimelineCategory =
  | 'ACCOUNT'
  | 'AUTH'
  | 'KYC'
  | 'CONTROLS'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TRADING'
  | 'COMPLIANCE'
  | 'ADMIN_ACTION';

export interface TimelineEvent {
  id: string;
  category: TimelineCategory;
  type: string;
  title: string;
  detail: string | null;
  refType: string | null;
  refId: string | null;
  /** ISO timestamp; the feed is sorted by this descending. */
  occurredAt: string;
}

export interface TimelinePage {
  items: TimelineEvent[];
  nextCursor: string | null;
  complianceVisible: boolean;
}

/** Auth/security audit actions that belong on the user timeline as AUTH. */
const AUTH_ACTIONS = new Set([
  'auth.register',
  'auth.login',
  'auth.login_failed',
  'auth.login_locked',
  'auth.logout',
  'auth.email_verified',
  'auth.password_changed',
  'auth.password_reset',
  'auth.session_revoked',
  'auth.sessions_revoked_all',
  'auth.otp_verified',
  'auth.otp_failed',
  'auth.otp_locked',
  'auth.login_new_device',
]);

function categorizeAdminAction(action: string, targetType: string | null): TimelineCategory {
  if (targetType === 'user_feature_controls' || action.includes('controls')) return 'CONTROLS';
  if (action.includes('compliance') || action.includes('risk') || action.includes('kyc')) return 'KYC';
  return 'ADMIN_ACTION';
}

export const userTimelineService = {
  async getTimeline(
    userId: string,
    opts: { cursor?: string; limit: number; complianceVisible: boolean },
  ): Promise<TimelinePage> {
    const header = await userTimelineRepository.header(userId);
    if (!header) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    const cursor = opts.cursor ? new Date(opts.cursor) : undefined;
    const limit = opts.limit;

    const [adminLogs, auditLogs, inr, cDep, cWd, orders, trades] = await Promise.all([
      userTimelineRepository.adminLogs(userId, cursor, limit),
      userTimelineRepository.auditLogs(userId, cursor, limit),
      userTimelineRepository.inrTransactions(userId, cursor, limit),
      userTimelineRepository.cryptoDeposits(userId, cursor, limit),
      userTimelineRepository.cryptoWithdrawals(userId, cursor, limit),
      userTimelineRepository.orders(userId, cursor, limit),
      userTimelineRepository.trades(userId, cursor, limit),
    ]);

    const events: TimelineEvent[] = [];

    // Account lifecycle (from the user row) — only when within the cursor window.
    pushHeaderEvents(events, header, cursor);

    for (const l of adminLogs) events.push(fromAdminLog(l));
    for (const l of auditLogs) events.push(fromAuditLog(l));
    for (const t of inr) events.push(fromInr(t));
    for (const d of cDep) events.push(fromCryptoDeposit(d));
    for (const w of cWd) events.push(fromCryptoWithdrawal(w));
    for (const o of orders) events.push(fromOrder(o));
    for (const t of trades) events.push(fromTrade(userId, t));

    if (opts.complianceVisible) {
      const [cases, notes] = await Promise.all([
        userTimelineRepository.complianceCases(userId, cursor, limit),
        userTimelineRepository.complianceNotes(userId, cursor, limit),
      ]);
      for (const c of cases) events.push(fromCase(c));
      for (const n of notes) events.push(fromNote(n));
    }

    // Merge: sort by time desc, tiebreak by id for stability, take the page.
    events.sort((a, b) => {
      const d = b.occurredAt.localeCompare(a.occurredAt);
      return d !== 0 ? d : b.id.localeCompare(a.id);
    });

    const hasMore = events.length > limit;
    const slice = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? slice[slice.length - 1].occurredAt : null;

    return { items: slice, nextCursor, complianceVisible: opts.complianceVisible };
  },
};

function pushHeaderEvents(
  events: TimelineEvent[],
  header: TimelineHeader,
  cursor: Date | undefined,
): void {
  const within = (d: Date) => !cursor || d.getTime() < cursor.getTime();
  if (within(header.createdAt)) {
    events.push({
      id: `signup:${header.id}`,
      category: 'ACCOUNT',
      type: 'SIGNUP',
      title: 'Account created',
      detail: null,
      refType: 'user',
      refId: header.id,
      occurredAt: header.createdAt.toISOString(),
    });
  }
  if (header.emailVerifiedAt && within(header.emailVerifiedAt)) {
    events.push({
      id: `email_verified:${header.id}`,
      category: 'ACCOUNT',
      type: 'EMAIL_VERIFIED',
      title: 'Email verified',
      detail: null,
      refType: 'user',
      refId: header.id,
      occurredAt: header.emailVerifiedAt.toISOString(),
    });
  }
}

function fromAdminLog(l: AdminLog): TimelineEvent {
  return {
    id: `adminlog:${l.id.toString()}`,
    category: categorizeAdminAction(l.action, l.targetType),
    type: l.action,
    title: l.action,
    detail: l.reason,
    refType: l.targetType,
    refId: l.targetId,
    occurredAt: l.occurredAt.toISOString(),
  };
}

function fromAuditLog(l: AuditLog): TimelineEvent {
  const isAuth = AUTH_ACTIONS.has(l.action);
  return {
    id: `auditlog:${l.id.toString()}`,
    category: isAuth ? 'AUTH' : 'ACCOUNT',
    type: l.action,
    title: l.action,
    detail: l.ip ? `ip ${l.ip}` : null,
    refType: l.entityType,
    refId: l.entityId,
    occurredAt: l.occurredAt.toISOString(),
  };
}

function fromInr(t: InrTransaction): TimelineEvent {
  return {
    id: `inr:${t.id}`,
    category: t.type === 'DEPOSIT' ? 'DEPOSIT' : 'WITHDRAWAL',
    type: `INR_${t.type}`,
    title: `INR ${t.type.toLowerCase()} ₹${t.amount.toFixed()}`,
    detail: t.status,
    refType: 'inr_transaction',
    refId: t.id,
    occurredAt: t.createdAt.toISOString(),
  };
}

function fromCryptoDeposit(d: CryptoDeposit): TimelineEvent {
  return {
    id: `cdep:${d.id}`,
    category: 'DEPOSIT',
    type: 'CRYPTO_DEPOSIT',
    title: `Crypto deposit ${d.amount.toFixed()} ${d.asset}`,
    detail: d.status,
    refType: 'crypto_deposit',
    refId: d.id,
    occurredAt: d.detectedAt.toISOString(),
  };
}

function fromCryptoWithdrawal(w: CryptoWithdrawal): TimelineEvent {
  return {
    id: `cwd:${w.id}`,
    category: 'WITHDRAWAL',
    type: 'CRYPTO_WITHDRAWAL',
    title: `Crypto withdrawal ${w.amount.toFixed()} ${w.asset}`,
    detail: w.status,
    refType: 'crypto_withdrawal',
    refId: w.id,
    occurredAt: w.requestedAt.toISOString(),
  };
}

function fromOrder(o: Order & { market: { symbol: string } }): TimelineEvent {
  return {
    id: `order:${o.id}`,
    category: 'TRADING',
    type: 'ORDER',
    title: `${o.side} ${o.type} ${o.market.symbol}`,
    detail: o.status,
    refType: 'order',
    refId: o.id,
    occurredAt: o.createdAt.toISOString(),
  };
}

function fromTrade(userId: string, t: Trade & { market: { symbol: string } }): TimelineEvent {
  const isMaker = t.makerUserId === userId;
  const side = isMaker ? t.makerSide : t.makerSide === 'BUY' ? 'SELL' : 'BUY';
  return {
    id: `trade:${t.id}`,
    category: 'TRADING',
    type: 'TRADE',
    title: `${side} ${t.market.symbol} @ ${t.price.toFixed()}`,
    detail: `qty ${t.quantity.toFixed()}`,
    refType: 'trade',
    refId: t.id,
    occurredAt: t.executedAt.toISOString(),
  };
}

function fromCase(c: ComplianceCase): TimelineEvent {
  return {
    id: `case:${c.id}`,
    category: 'COMPLIANCE',
    type: 'COMPLIANCE_CASE',
    title: `Compliance case: ${c.title}`,
    detail: `${c.priority} · ${c.status}`,
    refType: 'compliance_case',
    refId: c.id,
    occurredAt: c.createdAt.toISOString(),
  };
}

function fromNote(n: ComplianceNote): TimelineEvent {
  return {
    id: `note:${n.id}`,
    category: 'COMPLIANCE',
    type: 'COMPLIANCE_NOTE',
    title: 'Compliance note added',
    detail: n.body.length > 80 ? `${n.body.slice(0, 80)}…` : n.body,
    refType: 'compliance_note',
    refId: n.id,
    occurredAt: n.createdAt.toISOString(),
  };
}

export type UserTimelineService = typeof userTimelineService;
