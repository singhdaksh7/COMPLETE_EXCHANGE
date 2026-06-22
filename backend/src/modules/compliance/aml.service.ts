import type { AmlRuleAction, AmlRuleSeverity, AmlRuleType, Prisma } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { amlRepository } from './aml.repository';
import { evaluatePolicy, type EngineRule } from './aml.policy.engine';
import { stripSecrets } from './evidence.util';
import type { ComplianceContext } from './compliance.types';

/**
 * AML policy service (Stage 5.7). Manages versioned AML policies + rules and runs
 * the REVIEW-ONLY evaluation engine. At most one policy is ACTIVE at a time.
 * Evaluation returns recommended actions only — it never moves money, submits a
 * report, mutates records, or blocks a flow.
 */

export const amlService = {
  listPolicies() {
    return amlRepository.listPolicies();
  },

  async getPolicy(id: string) {
    const p = await amlRepository.findPolicy(id);
    if (!p) throw new NotFoundError('AML policy not found');
    return p;
  },

  async createPolicy(input: { version: string; name: string; description?: string }, ctx: ComplianceContext = {}) {
    const policy = await amlRepository.createPolicy({
      version: input.version,
      name: input.name,
      status: 'DRAFT',
      description: input.description ?? null,
      createdByAdminId: ctx.actorId ?? null,
    });
    await this.audit(ctx, 'compliance.aml_policy.create', policy.id, { version: input.version });
    return policy;
  },

  /** Activate one policy version; demote any other ACTIVE policy to DISABLED. */
  async activate(policyId: string, ctx: ComplianceContext = {}) {
    const policy = await amlRepository.findPolicy(policyId);
    if (!policy) throw new NotFoundError('AML policy not found');
    if (policy.status === 'ARCHIVED') throw new BadRequestError('Archived policies cannot be activated', { code: 'POLICY_ARCHIVED' });
    const updated = await amlRepository.updatePolicy(policyId, {
      status: 'ACTIVE',
      activatedAt: new Date(),
      activatedByAdminId: ctx.actorId ?? null,
    });
    await amlRepository.demoteActive(policyId);
    await this.audit(ctx, 'compliance.aml_policy.activate', policyId, { version: policy.version });
    return updated;
  },

  async addRule(
    policyId: string,
    input: { ruleType: AmlRuleType; name: string; severity?: AmlRuleSeverity; action?: AmlRuleAction; conditionKey?: string; operator?: string; thresholdValue?: string; description?: string },
    ctx: ComplianceContext = {},
  ) {
    const policy = await amlRepository.findPolicy(policyId);
    if (!policy) throw new NotFoundError('AML policy not found');
    const rule = await amlRepository.createRule({
      policyId,
      ruleType: input.ruleType,
      name: input.name,
      severity: input.severity ?? 'MEDIUM',
      action: input.action ?? 'FLAG_ONLY',
      conditionKey: input.conditionKey ?? null,
      operator: input.operator ?? null,
      thresholdValue: input.thresholdValue ?? null,
      description: input.description ?? null,
    });
    await this.audit(ctx, 'compliance.aml_rule.create', rule.id, { policyId, ruleType: input.ruleType });
    return rule;
  },

  async updateRule(
    ruleId: string,
    patch: { name?: string; severity?: AmlRuleSeverity; action?: AmlRuleAction; conditionKey?: string; operator?: string; thresholdValue?: string; enabled?: boolean; description?: string },
    ctx: ComplianceContext = {},
  ) {
    const rule = await amlRepository.findRule(ruleId);
    if (!rule) throw new NotFoundError('AML rule not found');
    const updated = await amlRepository.updateRule(ruleId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.severity !== undefined ? { severity: patch.severity } : {}),
      ...(patch.action !== undefined ? { action: patch.action } : {}),
      ...(patch.conditionKey !== undefined ? { conditionKey: patch.conditionKey } : {}),
      ...(patch.operator !== undefined ? { operator: patch.operator } : {}),
      ...(patch.thresholdValue !== undefined ? { thresholdValue: patch.thresholdValue } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    });
    await this.audit(ctx, 'compliance.aml_rule.update', ruleId, {});
    return updated;
  },

  /**
   * Evaluate a context against a policy (active by default). REVIEW-ONLY:
   * returns recommended actions; performs no side effects on money/records.
   */
  async evaluate(input: { policyId?: string; context: Record<string, unknown> }, ctx: ComplianceContext = {}) {
    const policy = input.policyId ? await amlRepository.findPolicy(input.policyId) : await amlRepository.findActive();
    if (!policy) throw new NotFoundError(input.policyId ? 'AML policy not found' : 'No active AML policy');
    const engineRules: EngineRule[] = policy.rules.map((r) => ({
      id: r.id, ruleType: r.ruleType, name: r.name, severity: r.severity, action: r.action,
      conditionKey: r.conditionKey, operator: r.operator, thresholdValue: r.thresholdValue, enabled: r.enabled,
    }));
    const result = evaluatePolicy(engineRules, input.context);
    await this.audit(ctx, 'compliance.aml_policy.evaluate', policy.id, { matched: result.matchedCount });
    return {
      policyId: policy.id,
      policyVersion: policy.version,
      // Echo a secrets-stripped copy of the context for traceability.
      context: stripSecrets(input.context),
      ...result, // includes reviewOnly: true
    };
  },

  async audit(ctx: ComplianceContext, action: string, entityId: string, metadata: Record<string, unknown>) {
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action,
      entityType: 'aml_policy',
      entityId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: metadata as Prisma.InputJsonValue,
    });
  },
};

export type AmlService = typeof amlService;
