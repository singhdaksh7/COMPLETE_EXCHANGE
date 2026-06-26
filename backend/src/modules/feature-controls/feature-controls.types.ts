import type { User, UserFeatureControls } from '@prisma/client';
import { config } from '../../config';

/**
 * Per-user operational feature controls (User Control Center).
 *
 * Every flag is a plain boolean. "Positive" flags (can*) gate an action: the
 * action is allowed only when the flag is true. "Block/review" flags add a
 * restriction: the action is blocked when the flag is true.
 *
 * Two layers stack here (Stage 15):
 *   1. GLOBAL flags (config.featureFlags) — platform-wide compliance kill
 *      switches. Crypto is globally OFF until FIU/licensing/travel-rule.
 *   2. PER-USER flags (this model) — what an admin allows for one account.
 * A gated feature is effectively available only when BOTH are on
 * (`global && user`). The crypto positive flags default OFF; INR + trading
 * default ON, so a fresh account is INR-only by default.
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
  'canAccessCryptoWallet',
] as const;

/** Positive flags whose default (no row) is OFF rather than ON. */
const POSITIVE_FLAGS_DEFAULT_OFF = new Set<string>([
  'canDepositCrypto',
  'canWithdrawCrypto',
  'canAccessCryptoWallet',
]);

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

/**
 * Default effective controls when no explicit row exists. INR + trading
 * positive flags are ON; the crypto positive flags are OFF (compliance
 * posture). Restriction flags are OFF. Mirrors the Prisma column defaults.
 */
export function defaultEffectiveControls(): EffectiveControls {
  const out = {} as EffectiveControls;
  for (const f of POSITIVE_FLAGS) out[f] = !POSITIVE_FLAGS_DEFAULT_OFF.has(f);
  for (const f of RESTRICTION_FLAGS) out[f] = false;
  return out;
}

// --------------------------------------------------------------------------
// Global compliance flags (Stage 15). These sit ABOVE the per-user controls.
// --------------------------------------------------------------------------

export interface GlobalFeatureFlags {
  cryptoDepositsGlobalEnabled: boolean;
  cryptoWithdrawalsGlobalEnabled: boolean;
  cryptoWalletGlobalEnabled: boolean;
  inrDepositsGlobalEnabled: boolean;
  inrWithdrawalsGlobalEnabled: boolean;
  tradingGlobalEnabled: boolean;
}

/** Read the current global flags from config. */
export function getGlobalFeatureFlags(): GlobalFeatureFlags {
  return { ...config.featureFlags };
}

/**
 * For each PER-USER positive flag, which GLOBAL flag also gates it. A flag not
 * present here is not globally gated (always allowed at the global layer).
 * canCancelOrders is intentionally NOT gated globally — users must always be
 * able to cancel resting orders even if new trading is globally paused.
 */
const GLOBAL_GATE_FOR: Partial<Record<PositiveFlag, keyof GlobalFeatureFlags>> = {
  canTradeSpot: 'tradingGlobalEnabled',
  canPlaceBuyOrders: 'tradingGlobalEnabled',
  canPlaceSellOrders: 'tradingGlobalEnabled',
  canDepositInr: 'inrDepositsGlobalEnabled',
  canWithdrawInr: 'inrWithdrawalsGlobalEnabled',
  canDepositCrypto: 'cryptoDepositsGlobalEnabled',
  canWithdrawCrypto: 'cryptoWithdrawalsGlobalEnabled',
  canAccessCryptoWallet: 'cryptoWalletGlobalEnabled',
};

/** True when the global layer permits this positive flag. */
export function globalAllows(
  flag: PositiveFlag,
  flags: GlobalFeatureFlags = getGlobalFeatureFlags(),
): boolean {
  const gate = GLOBAL_GATE_FOR[flag];
  return gate ? flags[gate] : true;
}

export function isGloballyGated(flag: ControlFlag): flag is PositiveFlag {
  return (flag as PositiveFlag) in GLOBAL_GATE_FOR;
}

/**
 * Combine the per-user effective controls with the global flags into the
 * EFFECTIVE access actually enforced. A positive flag is true only when the
 * user flag is true AND the global layer allows it. Restriction flags pass
 * through unchanged (they only ever add a restriction).
 */
export function toEffectiveAccess(
  controls: EffectiveControls,
  flags: GlobalFeatureFlags = getGlobalFeatureFlags(),
): EffectiveControls {
  const out = {} as EffectiveControls;
  for (const f of POSITIVE_FLAGS) out[f] = controls[f] && globalAllows(f, flags);
  for (const f of RESTRICTION_FLAGS) out[f] = controls[f];
  return out;
}

/** Compact, user-facing effective feature map returned by /auth/me. */
export interface UserFeatureMap {
  inrDeposit: boolean;
  inrWithdrawal: boolean;
  trading: boolean;
  cryptoWallet: boolean;
  cryptoDeposit: boolean;
  cryptoWithdrawal: boolean;
}

export function toUserFeatureMap(access: EffectiveControls): UserFeatureMap {
  return {
    inrDeposit: access.canDepositInr,
    inrWithdrawal: access.canWithdrawInr,
    trading: access.canTradeSpot,
    cryptoWallet: access.canAccessCryptoWallet,
    cryptoDeposit: access.canDepositCrypto,
    cryptoWithdrawal: access.canWithdrawCrypto,
  };
}

/** Global feature status echoed to clients (read-only; never a secret). */
export interface GlobalFeatureStatus extends GlobalFeatureFlags {
  /** INR_ONLY while all crypto rails are globally disabled. */
  mode: 'INR_ONLY' | 'FULL';
}

export function toGlobalFeatureStatus(
  flags: GlobalFeatureFlags = getGlobalFeatureFlags(),
): GlobalFeatureStatus {
  const anyCrypto =
    flags.cryptoDepositsGlobalEnabled ||
    flags.cryptoWithdrawalsGlobalEnabled ||
    flags.cryptoWalletGlobalEnabled;
  return { ...flags, mode: anyCrypto ? 'FULL' : 'INR_ONLY' };
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
  /**
   * Per-flag GLOBAL status and the resulting EFFECTIVE access, so the admin UI
   * can render "User permission / Global status / Effective access" — e.g. a
   * crypto flag toggled ON for the user still reads Effective=Disabled while the
   * global crypto flag is off.
   */
  globalStatus: GlobalFeatureStatus;
  effective: EffectiveControls;
}

export function toControlsDto(
  userId: string,
  row: UserFeatureControls | null,
): UserFeatureControlsDto {
  const eff = toEffectiveControls(row);
  const flags = getGlobalFeatureFlags();
  return {
    ...eff,
    userId,
    exists: row !== null,
    notes: row?.notes ?? null,
    updatedByAdminId: row?.updatedByAdminId ?? null,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    globalStatus: toGlobalFeatureStatus(flags),
    effective: toEffectiveAccess(eff, flags),
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
