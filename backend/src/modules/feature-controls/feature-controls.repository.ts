import { Prisma, type AdminLog, type UserFeatureControls } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const CONTROLS_TARGET_TYPE = 'user_feature_controls';

export const featureControlsRepository = {
  findByUserId(userId: string): Promise<UserFeatureControls | null> {
    return prisma.userFeatureControls.findUnique({ where: { userId } });
  },

  /** Minimal user state used to seed a new control row's defaults. */
  findUserState(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        status: true,
        riskLevel: true,
        withdrawalsBlocked: true,
      },
    });
  },

  create(
    userId: string,
    data: Partial<Omit<Prisma.UserFeatureControlsUncheckedCreateInput, 'userId'>> = {},
  ): Promise<UserFeatureControls> {
    return prisma.userFeatureControls.create({
      data: { ...data, userId },
    });
  },

  update(
    userId: string,
    data: Prisma.UserFeatureControlsUpdateInput,
  ): Promise<UserFeatureControls> {
    return prisma.userFeatureControls.update({ where: { userId }, data });
  },

  /** Control-change audit entries for a user, newest first. */
  controlChangeLogs(userId: string): Promise<AdminLog[]> {
    return prisma.adminLog.findMany({
      where: { targetType: CONTROLS_TARGET_TYPE, targetId: userId },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    });
  },

  writeAdminLog(data: {
    adminId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    reason?: string;
    beforeState?: Prisma.InputJsonValue;
    afterState?: Prisma.InputJsonValue;
    ip?: string;
    requestId?: string;
  }) {
    return prisma.adminLog.create({
      data: {
        adminId: data.adminId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
        beforeState: data.beforeState,
        afterState: data.afterState,
        ip: data.ip,
        requestId: data.requestId,
      },
    });
  },
};

export type FeatureControlsRepository = typeof featureControlsRepository;
