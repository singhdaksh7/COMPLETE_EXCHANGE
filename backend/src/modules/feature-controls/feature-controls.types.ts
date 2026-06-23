import type { User, UserFeatureControls } from '@prisma/client';

/**
 * Per-user operational feature controls (User Control Center).
 *
 * Every flag is a plain boolean. "Positive" flags (can*) gate an action: the
 * action is allowed only when the flag is true. "Block/review" flags add a
 * restriction: the action is blocked when the flag is true. When a user has no
 * control row at all, the effective controls are the defaults below — fully
 * enabled — so the feature layer never relaxes an existing check, it only adds.
 */

export const POSITIVE_FLAGS = [
  'canTradeSpot',
  'canPlaceBuyOrders',
  'canPlaceSellOrders',
  'canCancelOrders',
  'canDepositInr',
  'canWithdrawInr',
  'canDepositCrypto',
  'canWithdrawCrypto',
] as const;

export const RESTRICTION_FLAGS = [
  'forceKycReview',
  'requireEnhancedKyc',
  'underComplianceReview',
  'blockHighRiskActivity',
  'manualReviewBeforeWithdrawal',
] as const;

export type PositiveFlag = (typeof POSITIVE_FLAGS)[number];
export type RestrictionFlag = (typeof RESTRICTION_FLAGS)[number];
export type ControlFlag = PositiveFlag | RestrictionFlag;

export const ALL_CONTROL_FLAGS: ControlFlag[] = [
  ...POSITIVE_FLAGS,
  ...RESTRICTION_FLAGS,
];

/** The effective control values for a user (a real row or computed defaults). */
export type EffectiveControls = Record<ControlFlag, boolean>;

export const FEATURE_DISABLED_CODE = 'FEATURE_DISABLED_FOR_USER';
export const FEATURE_DISABLED_MESSAGE =
  'This action is disabled for your account. Please contact support.';

/** Default effective controls when no explicit row exists: everything allowed. */
export function defaultEffectiveControls(): EffectiveControls {
  const out = {} as EffectiveControls;
  for (const f of POSITIVE_FLAGS) out[f] = true;
  for (const f of RESTRICTION_FLAGS) out[f] = false;
  return out;
}

/** Project a stored row (or null) to the effective control values. */
export function toEffectiveControls(
  row: UserFeatureControls | null,
): EffectiveControls {
  if (!row) return defaultEffectiveControls();
  const out = {} as EffectiveControls;
  for (const f of ALL_CONTROL_FLAGS) out[f] = row[f];
  return out;
}

export interface UserFeatureControlsDto extends EffectiveControls {
  userId: string;
  /** true when a real row exists; false when these are computed defaults. */
  exists: boolean;
  notes: string | null;
  updatedByAdminId: string | null;
  updatedAt: string | null;
}

export function toControlsDto(
  userId: string,
  row: UserFeatureControls | null,
): UserFeatureControlsDto {
  const eff = toEffectiveControls(row);
  return {
    ...eff,
    userId,
    exists: row !== null,
    notes: row?.notes ?? null,
    updatedByAdminId: row?.updatedByAdminId ?? null,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

/**
 * Derive sensible defaults for a brand-new control row from the user's existing
 * account / risk state, so "create default controls automatically with all
 * allowed unless account/risk state says otherwise" holds. This only ever makes
 * the new row MORE restrictive than the all-on default; it never enables
 * anything the account state would otherwise deny.
 */
export function deriveDefaultsFromUser(
  user: Pick<User, 'status' | 'riskLevel' | 'withdrawalsBlocked'>,
): Partial<Record<ControlFlag, boolean>> {
  const d: Partial<Record<ControlFlag, boolean>> = {};
  if (user.status !== 'ACTIVE') {
    d.canTradeSpot = false;
    d.canPlaceBuyOrders = false;
    d.canPlaceSellOrders = false;
    d.canDepositInr = false;
    d.canWithdrawInr = false;
    d.canDepositCrypto = false;
    d.canWithdrawCrypto = false;
  }
  if (user.withdrawalsBlocked) {
    d.canWithdrawInr = false;
    d.canWithdrawCrypto = false;
  }
  if (user.riskLevel === 'HIGH') {
    d.blockHighRiskActivity = true;
    d.manualReviewBeforeWithdrawal = true;
  }
  return d;
}
