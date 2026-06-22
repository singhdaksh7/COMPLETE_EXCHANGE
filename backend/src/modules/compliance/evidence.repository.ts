import {
  Prisma,
  type ComplianceEvidencePack,
  type ComplianceEvidencePackItem,
  type ComplianceExportEvent,
  type EvidencePackStatus,
  type EvidencePackType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the Stage 5.4 evidence-pack tables PLUS the READ-ONLY source
 * reads used to assemble a pack. It owns compliance_evidence_packs /
 * compliance_evidence_pack_items / compliance_export_events, and only READS the
 * existing compliance / screening / monitoring / wallet-risk / travel-rule /
 * audit tables. It never touches ledger, scanner, trading, or withdrawal state,
 * and never deletes a record.
 */

export type EvidencePackWithItems = ComplianceEvidencePack & {
  items: ComplianceEvidencePackItem[];
};

/** AuditLog/AdminLog ids are BigInt; flatten to a JSON-safe shape. */
function auditRow(r: {
  id: bigint;
  occurredAt: Date;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
}) {
  return {
    id: String(r.id),
    occurredAt: r.occurredAt,
    actorType: r.actorType,
    actorId: r.actorId,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
  };
}

export const evidenceRepository = {
  /* ---------------- packs ---------------- */
  createPack(data: Prisma.ComplianceEvidencePackUncheckedCreateInput): Promise<ComplianceEvidencePack> {
    return prisma.complianceEvidencePack.create({ data });
  },

  updatePack(id: string, data: Prisma.ComplianceEvidencePackUncheckedUpdateInput): Promise<ComplianceEvidencePack> {
    return prisma.complianceEvidencePack.update({ where: { id }, data });
  },

  findPack(id: string): Promise<EvidencePackWithItems | null> {
    return prisma.complianceEvidencePack.findUnique({
      where: { id },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    }) as Promise<EvidencePackWithItems | null>;
  },

  listPacks(input: {
    packType?: EvidencePackType;
    status?: EvidencePackStatus;
    scopeUserId?: string;
    cursor?: string;
    limit: number;
  }): Promise<ComplianceEvidencePack[]> {
    return prisma.complianceEvidencePack.findMany({
      where: {
        ...(input.packType ? { packType: input.packType } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.scopeUserId ? { scopeUserId: input.scopeUserId } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  createItems(rows: Prisma.ComplianceEvidencePackItemUncheckedCreateInput[]): Promise<Prisma.BatchPayload> {
    if (rows.length === 0) return Promise.resolve({ count: 0 });
    return prisma.complianceEvidencePackItem.createMany({ data: rows });
  },

  /* ---------------- export events ---------------- */
  createExportEvent(data: Prisma.ComplianceExportEventUncheckedCreateInput): Promise<ComplianceExportEvent> {
    return prisma.complianceExportEvent.create({ data });
  },

  listExportEvents(input: { limit: number; cursor?: string }): Promise<ComplianceExportEvent[]> {
    return prisma.complianceExportEvent.findMany({
      where: { ...(input.cursor ? { id: { lt: input.cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },

  /* ---------------- READ-ONLY source reads for assembly ---------------- */

  findUserBasic(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true, kycStatus: true, kycTier: true, createdAt: true },
    });
  },

  alertsForUser(userId: string) {
    return prisma.complianceAlert.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 200 });
  },

  casesForUser(userId: string) {
    return prisma.complianceCase.findMany({
      where: { userId },
      include: {
        alerts: { orderBy: { createdAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' } },
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  caseById(caseId: string) {
    return prisma.complianceCase.findUnique({
      where: { id: caseId },
      include: {
        alerts: { orderBy: { createdAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' } },
        user: { select: { email: true } },
      },
    });
  },

  walletRiskChecksForUser(userId: string) {
    return prisma.walletRiskCheck.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 200 });
  },

  walletRiskProfileById(profileId: string) {
    return prisma.walletRiskProfile.findUnique({
      where: { id: profileId },
      include: { checks: { orderBy: { createdAt: 'desc' }, take: 50 }, events: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
  },

  travelRuleForUser(userId: string) {
    return prisma.travelRuleTransfer.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 200 });
  },

  travelRuleById(id: string) {
    return prisma.travelRuleTransfer.findUnique({ where: { id }, include: { counterparty: { select: { id: true, name: true } } } });
  },

  /** Admin/system action timeline for a user (compliance entity + admin logs). */
  async auditForUser(userId: string) {
    const [audit, adminLogs] = await Promise.all([
      prisma.auditLog.findMany({
        where: { entityId: userId },
        select: { id: true, occurredAt: true, actorType: true, actorId: true, action: true, entityType: true, entityId: true },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
      prisma.adminLog.findMany({
        where: { targetId: userId },
        select: { id: true, occurredAt: true, adminId: true, action: true, targetType: true, targetId: true },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
    ]);
    return {
      audit: audit.map(auditRow),
      adminLogs: adminLogs.map((r) => ({
        id: String(r.id),
        occurredAt: r.occurredAt,
        adminId: r.adminId,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
      })),
    };
  },
};

export type EvidenceRepository = typeof evidenceRepository;
