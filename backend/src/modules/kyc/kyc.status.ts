import type { KycStatus } from '@prisma/client';
import { ConflictError } from '../../lib/errors';
import type { KycVerificationStatus } from './providers';

/**
 * KYC status transition machine — the single source of truth for which status
 * changes are legal. Both the provider-driven path (webhook / poll) and the
 * admin manual-review fallback funnel through {@link assertTransition}, so the
 * gating fields (`user.kycStatus` / `user.kycTier`) can never be moved into an
 * inconsistent state.
 *
 *   NOT_STARTED     → PENDING
 *   PENDING         → IN_REVIEW | MANUAL_REVIEW | NEEDS_MORE_INFO | APPROVED | REJECTED
 *   IN_REVIEW       → MANUAL_REVIEW | NEEDS_MORE_INFO | APPROVED | REJECTED
 *   MANUAL_REVIEW   → NEEDS_MORE_INFO | APPROVED | REJECTED
 *   NEEDS_MORE_INFO → PENDING (resubmission) | APPROVED | REJECTED
 *   REJECTED        → PENDING            (resubmission)
 *   APPROVED        → (terminal)
 */
export const KYC_TRANSITIONS: Record<KycStatus, readonly KycStatus[]> = {
  NOT_STARTED: ['PENDING'],
  PENDING: ['IN_REVIEW', 'MANUAL_REVIEW', 'NEEDS_MORE_INFO', 'APPROVED', 'REJECTED'],
  IN_REVIEW: ['MANUAL_REVIEW', 'NEEDS_MORE_INFO', 'APPROVED', 'REJECTED'],
  MANUAL_REVIEW: ['NEEDS_MORE_INFO', 'APPROVED', 'REJECTED'],
  NEEDS_MORE_INFO: ['PENDING', 'APPROVED', 'REJECTED'],
  REJECTED: ['PENDING'],
  APPROVED: [],
};

export function canTransition(from: KycStatus, to: KycStatus): boolean {
  if (from === to) return true; // idempotent no-op (e.g. webhook redelivery)
  return KYC_TRANSITIONS[from].includes(to);
}

/** Throw a 409 when a status change is not permitted by the machine. */
export function assertTransition(from: KycStatus, to: KycStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictError(
      `Illegal KYC status transition: ${from} -> ${to}`,
      'KYC_INVALID_TRANSITION',
    );
  }
}

/** Map a normalized provider verification status onto our KycStatus enum. */
export function mapProviderStatusToKyc(status: KycVerificationStatus): KycStatus {
  // Names are aligned 1:1, but map explicitly so a provider value can never
  // leak through as an unchecked string.
  const map: Record<KycVerificationStatus, KycStatus> = {
    PENDING: 'PENDING',
    IN_REVIEW: 'IN_REVIEW',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    MANUAL_REVIEW: 'MANUAL_REVIEW',
  };
  return map[status];
}

/**
 * Mask a PAN for safe storage/display: keep the first 5 and last 1 chars,
 * e.g. `ABCDE1234F` -> `ABCDE****F`. Returns null for a malformed value.
 */
export function maskPan(pan: string): string | null {
  if (pan.length !== 10) return null;
  return `${pan.slice(0, 5)}****${pan.slice(9)}`;
}
