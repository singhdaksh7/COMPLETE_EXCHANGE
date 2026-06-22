import type { SlaStatus } from '@prisma/client';

/**
 * Pure SLA status calculation (Stage 5.7). Review-only timing posture — it never
 * blocks a task or any flow, it only reports ON_TRACK / AT_RISK / BREACHED /
 * COMPLETED.
 */
export function computeSlaStatus(input: {
  startedAt: Date;
  dueAt: Date;
  now?: Date;
  completedAt?: Date | null;
  atRiskFraction?: number;
}): SlaStatus {
  if (input.completedAt) return 'COMPLETED';
  const now = (input.now ?? new Date()).getTime();
  const start = input.startedAt.getTime();
  const due = input.dueAt.getTime();
  if (now >= due) return 'BREACHED';
  const total = Math.max(1, due - start);
  const elapsedFraction = (now - start) / total;
  const atRisk = input.atRiskFraction ?? 0.8;
  return elapsedFraction >= atRisk ? 'AT_RISK' : 'ON_TRACK';
}

/** Minutes remaining until due (negative when breached). */
export function minutesToDue(dueAt: Date, now = new Date()): number {
  return Math.round((dueAt.getTime() - now.getTime()) / 60000);
}
