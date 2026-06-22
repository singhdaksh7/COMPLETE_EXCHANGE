import type {
  ComplianceAlertType,
  ComplianceCasePriority,
  ComplianceRiskLevel,
  ScreeningStatus,
} from '@prisma/client';

/**
 * Suspicious-transaction rule engine (Stage 5.2).
 *
 * A pure, deterministic set of heuristics: given a normalized snapshot of a
 * user's activity it returns the alert CANDIDATES that fired. No IO, no Prisma,
 * no secrets — fully unit-testable. This is a rule-based/mock baseline, NOT real
 * AML transaction monitoring, and it is DETECTION-ONLY: nothing here blocks
 * trading or withdrawals.
 *
 * Idempotency is achieved through deterministic `dedupeKey`s:
 *   - per-entity rules key on the offending entity id (stable forever)
 *   - windowed rules key on userId + UTC-day bucket (one alert per user per day)
 * The service upserts on `dedupeKey`, so re-running monitoring never duplicates.
 */

/* ------------------------------------------------------------------ */
/* Normalized inputs (amounts are already human units, not base).      */
/* ------------------------------------------------------------------ */

export type ActivityOutcome = 'SUCCESS' | 'FAILED' | 'PENDING';
export type ActivityKind = 'CRYPTO' | 'INR';

export interface TransferActivity {
  id: string;
  kind: ActivityKind;
  asset: string;
  amount: number;
  /** Normalized outcome (FAILED groups crypto FAILED/REJECTED + INR FAILED/REVERSED). */
  outcome: ActivityOutcome;
  /** Raw provider/DB status, surfaced in alert details only. */
  status: string;
  at: Date;
}

export interface TradeActivity {
  quoteAmount: number;
  at: Date;
}

export interface MonitoringSnapshot {
  userId: string;
  withdrawals: TransferActivity[];
  deposits: TransferActivity[];
  trades: TradeActivity[];
  riskLevel: ComplianceRiskLevel | null;
  sanctionsStatus: ScreeningStatus | null;
  pepStatus: ScreeningStatus | null;
  adverseMediaStatus: ScreeningStatus | null;
  /** Evaluation instant — drives the UTC-day bucket for windowed rules. */
  now: Date;
}

export interface MonitoringConfig {
  lookbackDays: number;
  highValueWithdrawal: number;
  failedWithdrawalCount: number;
  rapidWindowMinutes: number;
  structuringBand: number;
  structuringCount: number;
  abnormalTradingVolume: number;
}

export interface AlertCandidate {
  type: ComplianceAlertType;
  dedupeKey: string;
  score: number; // 0..100 heuristic severity
  priority: ComplianceCasePriority;
  title: string;
  description: string;
  details: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** UTC YYYY-MM-DD bucket — makes windowed alerts idempotent per user per day. */
export function dayBucket(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Map a 0..100 score onto the shared case/alert priority ladder. */
export function priorityFromScore(score: number): ComplianceCasePriority {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

function withinLookback(items: TransferActivity[], now: Date, days: number): TransferActivity[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return items.filter((i) => i.at.getTime() >= cutoff);
}

function candidate(
  type: ComplianceAlertType,
  dedupeKey: string,
  score: number,
  title: string,
  description: string,
  details: Record<string, unknown>,
): AlertCandidate {
  const s = clamp(score);
  return { type, dedupeKey, score: s, priority: priorityFromScore(s), title, description, details };
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/** R1 — a single withdrawal at/above the high-value threshold. Per-entity key. */
export function ruleHighValueWithdrawal(
  snap: MonitoringSnapshot,
  cfg: MonitoringConfig,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const w of withinLookback(snap.withdrawals, snap.now, cfg.lookbackDays)) {
    if (w.outcome === 'FAILED') continue; // failed transfers handled by R2
    if (w.amount < cfg.highValueWithdrawal) continue;
    const ratio = cfg.highValueWithdrawal > 0 ? w.amount / cfg.highValueWithdrawal : 1;
    let score = 60;
    if (ratio >= 2) score += 20;
    if (ratio >= 5) score += 20;
    out.push(
      candidate(
        'HIGH_VALUE_WITHDRAWAL',
        `HVW:${w.id}`,
        score,
        'High-value withdrawal',
        `Withdrawal of ${w.amount} ${w.asset} is at/above the high-value threshold of ${cfg.highValueWithdrawal}.`,
        { withdrawalId: w.id, kind: w.kind, asset: w.asset, amount: w.amount, status: w.status, threshold: cfg.highValueWithdrawal },
      ),
    );
  }
  return out;
}

/** R2 — repeated FAILED/REJECTED withdrawals in the window. Per user/day key. */
export function ruleRepeatedFailedWithdrawals(
  snap: MonitoringSnapshot,
  cfg: MonitoringConfig,
): AlertCandidate[] {
  const failed = withinLookback(snap.withdrawals, snap.now, cfg.lookbackDays).filter(
    (w) => w.outcome === 'FAILED',
  );
  if (failed.length < cfg.failedWithdrawalCount) return [];
  const score = 40 + (failed.length - cfg.failedWithdrawalCount) * 10;
  return [
    candidate(
      'REPEATED_FAILED_WITHDRAWALS',
      `RFW:${snap.userId}:${dayBucket(snap.now)}`,
      score,
      'Repeated failed withdrawals',
      `${failed.length} failed/rejected withdrawals in the last ${cfg.lookbackDays} day(s) (threshold ${cfg.failedWithdrawalCount}).`,
      {
        count: failed.length,
        threshold: cfg.failedWithdrawalCount,
        windowDays: cfg.lookbackDays,
        withdrawalIds: failed.map((w) => w.id),
      },
    ),
  ];
}

/**
 * R3 — a successful deposit quickly followed by a withdrawal (layering/in-out).
 * Keyed on the deposit+withdrawal pair so each correlation is reported once.
 */
export function ruleRapidDepositWithdrawal(
  snap: MonitoringSnapshot,
  cfg: MonitoringConfig,
): AlertCandidate[] {
  const windowMs = cfg.rapidWindowMinutes * 60 * 1000;
  const deposits = withinLookback(snap.deposits, snap.now, cfg.lookbackDays).filter(
    (d) => d.outcome === 'SUCCESS',
  );
  const withdrawals = withinLookback(snap.withdrawals, snap.now, cfg.lookbackDays).filter(
    (w) => w.outcome !== 'FAILED',
  );
  const out: AlertCandidate[] = [];
  for (const d of deposits) {
    // earliest withdrawal that starts after the deposit, within the window
    const match = withdrawals
      .filter((w) => w.at.getTime() >= d.at.getTime() && w.at.getTime() - d.at.getTime() <= windowMs)
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    if (!match) continue;
    const gapMin = Math.round((match.at.getTime() - d.at.getTime()) / 60000);
    let score = 55;
    if (d.amount > 0 && match.amount >= d.amount * 0.8) score += 15; // most of the deposit moved out
    out.push(
      candidate(
        'RAPID_DEPOSIT_WITHDRAWAL',
        `RDW:${d.id}:${match.id}`,
        score,
        'Rapid deposit then withdrawal',
        `Withdrawal of ${match.amount} ${match.asset} occurred ${gapMin} min after a deposit of ${d.amount} ${d.asset}.`,
        {
          depositId: d.id,
          withdrawalId: match.id,
          gapMinutes: gapMin,
          windowMinutes: cfg.rapidWindowMinutes,
          depositAmount: d.amount,
          withdrawalAmount: match.amount,
        },
      ),
    );
  }
  return out;
}

/**
 * R4 — structuring: many transfers each just BELOW a reporting band within the
 * window (classic splitting to stay under a threshold). Per user/day key.
 */
export function ruleStructuringPattern(
  snap: MonitoringSnapshot,
  cfg: MonitoringConfig,
): AlertCandidate[] {
  const band = cfg.structuringBand;
  const lower = band * 0.5; // only count meaningful amounts in the [50%,100%) band
  const all = [
    ...withinLookback(snap.withdrawals, snap.now, cfg.lookbackDays),
    ...withinLookback(snap.deposits, snap.now, cfg.lookbackDays),
  ].filter((t) => t.outcome !== 'FAILED');
  const justUnder = all.filter((t) => t.amount >= lower && t.amount < band);
  if (justUnder.length < cfg.structuringCount) return [];
  const score = 65 + (justUnder.length - cfg.structuringCount) * 5;
  return [
    candidate(
      'STRUCTURING_PATTERN',
      `STR:${snap.userId}:${dayBucket(snap.now)}`,
      score,
      'Possible structuring / splitting',
      `${justUnder.length} transfers between ${lower} and ${band} in the last ${cfg.lookbackDays} day(s) (threshold ${cfg.structuringCount}).`,
      {
        count: justUnder.length,
        threshold: cfg.structuringCount,
        band,
        windowDays: cfg.lookbackDays,
        entityIds: justUnder.map((t) => t.id),
      },
    ),
  ];
}

/** R5 — abnormal aggregate trading volume in the window. Per user/day key. */
export function ruleAbnormalTradingVolume(
  snap: MonitoringSnapshot,
  cfg: MonitoringConfig,
): AlertCandidate[] {
  const cutoff = snap.now.getTime() - cfg.lookbackDays * 24 * 60 * 60 * 1000;
  const trades = snap.trades.filter((t) => t.at.getTime() >= cutoff);
  const volume = trades.reduce((sum, t) => sum + t.quoteAmount, 0);
  if (volume < cfg.abnormalTradingVolume) return [];
  const ratio = cfg.abnormalTradingVolume > 0 ? volume / cfg.abnormalTradingVolume : 1;
  const score = 50 + Math.min(40, (ratio - 1) * 25);
  return [
    candidate(
      'ABNORMAL_TRADING_VOLUME',
      `ATV:${snap.userId}:${dayBucket(snap.now)}`,
      score,
      'Abnormal trading volume',
      `Traded quote volume of ${Math.round(volume)} in the last ${cfg.lookbackDays} day(s) is at/above the ${cfg.abnormalTradingVolume} threshold.`,
      { volume, threshold: cfg.abnormalTradingVolume, tradeCount: trades.length, windowDays: cfg.lookbackDays },
    ),
  ];
}

/** Whether the user shows ANY movement/trading in the window (gates R6/R7). */
function hasRecentActivity(snap: MonitoringSnapshot, cfg: MonitoringConfig): boolean {
  return (
    withinLookback(snap.withdrawals, snap.now, cfg.lookbackDays).length > 0 ||
    withinLookback(snap.deposits, snap.now, cfg.lookbackDays).length > 0 ||
    snap.trades.some((t) => t.at.getTime() >= snap.now.getTime() - cfg.lookbackDays * 86400000)
  );
}

/** R6 — a HIGH/PROHIBITED-risk user who is actively transacting. Per user/day. */
export function ruleHighRiskUserActivity(
  snap: MonitoringSnapshot,
  cfg: MonitoringConfig,
): AlertCandidate[] {
  if (!hasRecentActivity(snap, cfg)) return [];
  if (snap.riskLevel !== 'HIGH' && snap.riskLevel !== 'PROHIBITED') return [];
  const score = snap.riskLevel === 'PROHIBITED' ? 85 : 55;
  return [
    candidate(
      'HIGH_RISK_USER_ACTIVITY',
      `HRU:${snap.userId}:${dayBucket(snap.now)}`,
      score,
      'High-risk user activity',
      `User graded ${snap.riskLevel} has transaction/trading activity in the last ${cfg.lookbackDays} day(s).`,
      { riskLevel: snap.riskLevel, windowDays: cfg.lookbackDays },
    ),
  ];
}

/** R7 — activity from a user with an UNRESOLVED screening match. Per user/day. */
export function ruleScreeningRiskActivity(
  snap: MonitoringSnapshot,
  cfg: MonitoringConfig,
): AlertCandidate[] {
  if (!hasRecentActivity(snap, cfg)) return [];
  const postures: Array<[string, ScreeningStatus | null]> = [
    ['sanctions', snap.sanctionsStatus],
    ['pep', snap.pepStatus],
    ['adverseMedia', snap.adverseMediaStatus],
  ];
  const hits = postures.filter(([, s]) => s === 'HIT');
  const reviews = postures.filter(([, s]) => s === 'REVIEW_REQUIRED');
  if (hits.length === 0 && reviews.length === 0) return [];
  const score = hits.length > 0 ? 85 : 55;
  return [
    candidate(
      'SCREENING_RISK_ACTIVITY',
      `SRA:${snap.userId}:${dayBucket(snap.now)}`,
      score,
      'Activity with unresolved screening match',
      `User has ${hits.length} confirmed and ${reviews.length} unresolved screening match(es) while transacting.`,
      {
        hits: hits.map(([k]) => k),
        review: reviews.map(([k]) => k),
        sanctionsStatus: snap.sanctionsStatus,
        pepStatus: snap.pepStatus,
        adverseMediaStatus: snap.adverseMediaStatus,
      },
    ),
  ];
}

const ALL_RULES = [
  ruleHighValueWithdrawal,
  ruleRepeatedFailedWithdrawals,
  ruleRapidDepositWithdrawal,
  ruleStructuringPattern,
  ruleAbnormalTradingVolume,
  ruleHighRiskUserActivity,
  ruleScreeningRiskActivity,
];

/** Evaluate every rule against a snapshot and return all alert candidates. */
export function evaluateRules(
  snap: MonitoringSnapshot,
  cfg: MonitoringConfig,
): AlertCandidate[] {
  return ALL_RULES.flatMap((rule) => rule(snap, cfg));
}
