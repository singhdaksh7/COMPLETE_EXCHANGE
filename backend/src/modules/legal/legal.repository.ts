import {
  Prisma,
  type LegalAcceptanceStatus,
  type LegalDocumentType,
  type LegalDocumentVersion,
  type UserLegalAcceptance,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository for the Stage 5.5 legal tables. Owns legal_document_versions /
 * user_legal_acceptances. Append-only in spirit (acceptances are immutable);
 * it never deletes a record and never touches money-movement state.
 */

export const legalRepository = {
  // ---- document versions ----
  listCurrent(): Promise<LegalDocumentVersion[]> {
    return prisma.legalDocumentVersion.findMany({ where: { isCurrent: true }, orderBy: { type: 'asc' } });
  },
  listVersions(type?: LegalDocumentType): Promise<LegalDocumentVersion[]> {
    return prisma.legalDocumentVersion.findMany({
      where: { ...(type ? { type } : {}) },
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  },
  findVersion(id: string): Promise<LegalDocumentVersion | null> {
    return prisma.legalDocumentVersion.findUnique({ where: { id } });
  },
  findCurrentByType(type: LegalDocumentType): Promise<LegalDocumentVersion | null> {
    return prisma.legalDocumentVersion.findFirst({ where: { type, isCurrent: true } });
  },
  async createVersionAsCurrent(data: Prisma.LegalDocumentVersionUncheckedCreateInput): Promise<LegalDocumentVersion> {
    // Demote previous current versions of this type, then create the new current.
    await prisma.legalDocumentVersion.updateMany({ where: { type: data.type, isCurrent: true }, data: { isCurrent: false } });
    return prisma.legalDocumentVersion.create({ data: { ...data, isCurrent: true } });
  },

  // ---- acceptances ----
  createAcceptance(data: Prisma.UserLegalAcceptanceUncheckedCreateInput): Promise<UserLegalAcceptance> {
    return prisma.userLegalAcceptance.create({ data });
  },
  /** Mark prior ACCEPTED rows of a type for a user as SUPERSEDED (no deletion). */
  supersedePrior(userId: string, documentType: LegalDocumentType): Promise<Prisma.BatchPayload> {
    return prisma.userLegalAcceptance.updateMany({
      where: { userId, documentType, status: 'ACCEPTED' },
      data: { status: 'SUPERSEDED' },
    });
  },
  listAcceptancesForUser(userId: string): Promise<UserLegalAcceptance[]> {
    return prisma.userLegalAcceptance.findMany({ where: { userId }, orderBy: { acceptedAt: 'desc' }, take: 200 });
  },
  listAcceptances(input: { userId?: string; documentType?: LegalDocumentType; status?: LegalAcceptanceStatus; limit: number; cursor?: string }): Promise<UserLegalAcceptance[]> {
    return prisma.userLegalAcceptance.findMany({
      where: {
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.documentType ? { documentType: input.documentType } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
  },
};

export type LegalRepository = typeof legalRepository;
