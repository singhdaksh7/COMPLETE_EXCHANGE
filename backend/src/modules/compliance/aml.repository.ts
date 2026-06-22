import {
  Prisma,
  type AmlPolicyRule,
  type AmlPolicyVersion,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the Stage 5.7 AML policy tables (aml_policy_versions /
 * aml_policy_rules). Never touches money-movement state and never deletes a
 * record (rules are disabled, not deleted).
 */

export type PolicyWithRules = AmlPolicyVersion & { rules: AmlPolicyRule[] };

export const amlRepository = {
  listPolicies(): Promise<(AmlPolicyVersion & { _count: { rules: number } })[]> {
    return prisma.amlPolicyVersion.findMany({
      include: { _count: { select: { rules: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },
  findPolicy(id: string): Promise<PolicyWithRules | null> {
    return prisma.amlPolicyVersion.findUnique({
      where: { id },
      include: { rules: { orderBy: { createdAt: 'asc' } } },
    }) as Promise<PolicyWithRules | null>;
  },
  findActive(): Promise<PolicyWithRules | null> {
    return prisma.amlPolicyVersion.findFirst({
      where: { status: 'ACTIVE' },
      include: { rules: { orderBy: { createdAt: 'asc' } } },
    }) as Promise<PolicyWithRules | null>;
  },
  createPolicy(data: Prisma.AmlPolicyVersionUncheckedCreateInput): Promise<AmlPolicyVersion> {
    return prisma.amlPolicyVersion.create({ data });
  },
  updatePolicy(id: string, data: Prisma.AmlPolicyVersionUncheckedUpdateInput): Promise<AmlPolicyVersion> {
    return prisma.amlPolicyVersion.update({ where: { id }, data });
  },
  /** Demote all currently-ACTIVE policies to DISABLED (one-active invariant). */
  demoteActive(exceptId: string): Promise<Prisma.BatchPayload> {
    return prisma.amlPolicyVersion.updateMany({
      where: { status: 'ACTIVE', id: { not: exceptId } },
      data: { status: 'DISABLED' },
    });
  },

  createRule(data: Prisma.AmlPolicyRuleUncheckedCreateInput): Promise<AmlPolicyRule> {
    return prisma.amlPolicyRule.create({ data });
  },
  findRule(id: string): Promise<AmlPolicyRule | null> {
    return prisma.amlPolicyRule.findUnique({ where: { id } });
  },
  updateRule(id: string, data: Prisma.AmlPolicyRuleUncheckedUpdateInput): Promise<AmlPolicyRule> {
    return prisma.amlPolicyRule.update({ where: { id }, data });
  },
};

export type AmlRepository = typeof amlRepository;
