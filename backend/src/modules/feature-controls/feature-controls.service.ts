import { Prisma, type UserFeatureControls } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import {
  CONTROLS_TARGET_TYPE,
  featureControlsRepository,
} from './feature-controls.repository';
import {
  ALL_CONTROL_FLAGS,
  FEATURE_DISABLED_CODE,
  FEATURE_DISABLED_MESSAGE,
  POSITIVE_FLAGS,
  RESTRICTION_FLAGS,
  defaultEffectiveControls,
  deriveDefaultsFromUser,
  toControlsDto,
  toEffectiveAccess,
  toEffectiveControls,
  toGlobalFeatureStatus,
  toUserFeatureMap,
  type ControlFlag,
  type EffectiveControls,
  type GlobalFeatureStatus,
  type PositiveFlag,
  type RestrictionFlag,
  type UserFeatureControlsDto,
  type UserFeatureMap,
} from './feature-controls.types';

export interface ControlsContext {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

const POSITIVE_SET = new Set<string>(POSITIVE_FLAGS);
const RESTRICTION_SET = new Set<string>(RESTRICTION_FLAGS);

export const featureControlsService = {
  /**
   * Effective controls for enforcement. Read-only and side-effect free: when no
   * row exists it returns the all-enabled defaults WITHOUT creating a row, so
   * the hot user-facing request paths never write on read.
   */
  async getEffective(userId: string): Promise<EffectiveControls> {
    const row = await featureControlsRepository.findByUserId(userId);
    return toEffectiveControls(row);
  },

  /**
   * Effective ACCESS for enforcement = per-user controls AND the global
   * compliance flags. This is the value the gates actually check, so a feature
   * that is on for the user but off globally (e.g. crypto in INR-only mode) is
   * correctly denied. Read-only / side-effect free.
   */
  async getEffectiveAccessControls(userId: string): Promise<EffectiveControls> {
    const eff = await this.getEffective(userId);
    return toEffectiveAccess(eff);
  },

  /**
   * Compact effective feature map + global status for /auth/me. The frontend
   * uses `features` (already AND-ed with the global flags), never the raw
   * per-user settings, so hidden modules and the INR-only mode stay consistent.
   */
  async getMeFeatures(
    userId: string,
  ): Promise<{ features: UserFeatureMap; globalFeatureStatus: GlobalFeatureStatus }> {
    const access = await this.getEffectiveAccessControls(userId);
    return {
      features: toUserFeatureMap(access),
      globalFeatureStatus: toGlobalFeatureStatus(),
    };
  },

  /**
   * Throw FEATURE_DISABLED_FOR_USER if any requested flag denies the action.
   * Positive flags must be true in EFFECTIVE access (per-user AND global);
   * restriction flags must be false. This is the single enforcement gate behind
   * requireUserFeature — the global compliance flags are honoured here, so a
   * direct API call can never bypass an INR-only / globally-disabled feature.
   */
  async assertEnabled(userId: string, flags: ControlFlag[]): Promise<void> {
    if (flags.length === 0) return;
    const access = await this.getEffectiveAccessControls(userId);
    for (const flag of flags) {
      if (POSITIVE_SET.has(flag) && access[flag as PositiveFlag] !== true) {
        throw new ForbiddenError(FEATURE_DISABLED_MESSAGE, FEATURE_DISABLED_CODE);
      }
      if (RESTRICTION_SET.has(flag) && access[flag as RestrictionFlag] === true) {
        throw new ForbiddenError(FEATURE_DISABLED_MESSAGE, FEATURE_DISABLED_CODE);
      }
    }
  },

  /**
   * Admin read: returns the user's controls, materializing a default row when
   * none exists yet (seeded from the user's account/risk state). Returns the
   * DTO consumed by the admin UI.
   */
  async getForAdmin(userId: string): Promise<UserFeatureControlsDto> {
    let row = await featureControlsRepository.findByUserId(userId);
    if (!row) {
      const user = await featureControlsRepository.findUserState(userId);
      if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      row = await featureControlsRepository.create(
        userId,
        deriveDefaultsFromUser(user),
      );
    }
    return toControlsDto(userId, row);
  },

  /**
   * Admin update. Requires a reason (validated upstream). Only the flags that
   * actually change are recorded; every change is written to the admin log
   * (adminId, userId, field, old, new, reason, timestamp) and the append-only
   * audit log. Returns the refreshed DTO.
   */
  async updateForAdmin(
    userId: string,
    input: Partial<Record<ControlFlag, boolean>> & { reason: string },
    ctx: ControlsContext,
  ): Promise<UserFeatureControlsDto> {
    const user = await featureControlsRepository.findUserState(userId);
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    const existing = await featureControlsRepository.findByUserId(userId);
    const before: UserFeatureControls =
      existing ??
      ({
        // Synthesize the pre-change view from derived defaults so the diff is
        // accurate even on first edit (the row is created below).
        ...defaultRow(userId),
        ...deriveDefaultsFromUser(user),
      } as unknown as UserFeatureControls);

    const changes: Array<{ field: ControlFlag; from: boolean; to: boolean }> = [];
    const data: Prisma.UserFeatureControlsUpdateInput = {};
    for (const flag of ALL_CONTROL_FLAGS) {
      const next = input[flag];
      if (next === undefined) continue;
      const prev = Boolean(before[flag]);
      if (next !== prev) {
        changes.push({ field: flag, from: prev, to: next });
        (data as Record<string, unknown>)[flag] = next;
      }
    }

    const reason = input.reason.trim();
    data.notes = reason;
    data.updatedByAdminId = ctx.actorId ?? null;

    let row: UserFeatureControls;
    if (existing) {
      row = await featureControlsRepository.update(userId, data);
    } else {
      // First-ever edit: create the row from derived defaults + the changes.
      const createData: Record<string, unknown> = {
        ...deriveDefaultsFromUser(user),
        notes: reason,
        updatedByAdminId: ctx.actorId ?? null,
      };
      for (const c of changes) createData[c.field] = c.to;
      row = await featureControlsRepository.create(userId, createData);
    }

    if (ctx.actorId) {
      await featureControlsRepository.writeAdminLog({
        adminId: ctx.actorId,
        action: 'admin.user.controls_update',
        targetType: CONTROLS_TARGET_TYPE,
        targetId: userId,
        reason,
        beforeState: { changes: changes.map((c) => ({ field: c.field, value: c.from })) },
        afterState: { changes: changes.map((c) => ({ field: c.field, value: c.to })) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
    }
    await recordAudit({
      actorType: 'ADMIN',
      actorId: ctx.actorId,
      action: 'admin.user.controls_update',
      entityType: CONTROLS_TARGET_TYPE,
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { reason, changes },
    });

    return toControlsDto(userId, row);
  },

  /** Control-change history for the admin UI. */
  async changeHistory(userId: string) {
    const logs = await featureControlsRepository.controlChangeLogs(userId);
    return logs.map((l) => ({
      id: l.id.toString(),
      adminId: l.adminId,
      action: l.action,
      reason: l.reason,
      beforeState: l.beforeState,
      afterState: l.afterState,
      occurredAt: l.occurredAt,
    }));
  },
};

/**
 * Default row skeleton used only to compute first-edit diffs. It MUST mirror
 * the real column/effective defaults (crypto positive flags OFF, INR + trading
 * ON, restrictions OFF) — otherwise enabling a crypto flag on a user with no
 * row yet would not register as a change.
 */
function defaultRow(userId: string): Record<string, unknown> {
  return { userId, ...defaultEffectiveControls() };
}

export type FeatureControlsService = typeof featureControlsService;
