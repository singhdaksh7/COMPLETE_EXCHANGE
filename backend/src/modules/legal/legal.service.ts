import type { LegalDocumentType, Prisma } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { legalRepository } from './legal.repository';
import { checksumOf } from '../compliance/evidence.util';
import type { ComplianceContext } from '../compliance/compliance.types';

/**
 * Legal document + acceptance foundation (Stage 5.5). Versioned legal documents
 * with content checksums and immutable user-acceptance records. Additive and
 * non-destructive — acceptances are never deleted (superseded instead). This is
 * NOT a legal compliance certification.
 */

const DEFAULT_DOCS: Array<{ type: LegalDocumentType; title: string; content: string }> = [
  { type: 'TERMS_OF_SERVICE', title: 'Terms of Service', content: 'EXORA staging Terms of Service (placeholder). Use of this staging service is for demo/testing only.' },
  { type: 'PRIVACY_POLICY', title: 'Privacy Policy', content: 'EXORA staging Privacy Policy (placeholder). Describes how data is processed in this demo environment.' },
  { type: 'RISK_DISCLOSURE', title: 'Risk Disclosure', content: 'Trading virtual digital assets carries risk. This is a staging/demo disclosure (placeholder).' },
  { type: 'AML_POLICY_NOTICE', title: 'AML / KYC Consent Notice', content: 'EXORA performs KYC and AML/CFT screening. By proceeding you consent to compliance processing (placeholder).' },
  { type: 'FEE_POLICY', title: 'Fee Policy', content: 'Trading, deposit and withdrawal fees apply per the published schedule (placeholder).' },
  { type: 'TAX_DISCLOSURE', title: 'Tax Disclosure', content: 'TDS on virtual digital assets may apply (illustrative). This is calculation-only in staging and not tax advice (placeholder).' },
];

export const legalService = {
  /** Current (live) documents, seeding v1 of each type on first access. */
  async currentDocuments(ctx: ComplianceContext = {}) {
    let docs = await legalRepository.listCurrent();
    if (docs.length === 0) {
      for (const d of DEFAULT_DOCS) {
        await legalRepository.createVersionAsCurrent({
          type: d.type,
          version: 'v1',
          title: d.title,
          content: d.content,
          checksum: checksumOf(d.content),
          isCurrent: true,
          createdByAdminId: ctx.actorId ?? null,
        });
      }
      docs = await legalRepository.listCurrent();
    }
    // The list endpoint returns metadata + content (content is not secret).
    return docs;
  },

  listVersions(type?: LegalDocumentType) {
    return legalRepository.listVersions(type);
  },

  async createDocument(
    input: { type: LegalDocumentType; version: string; title: string; content: string },
    ctx: ComplianceContext = {},
  ) {
    const checksum = checksumOf(input.content);
    const doc = await legalRepository.createVersionAsCurrent({
      type: input.type,
      version: input.version,
      title: input.title,
      content: input.content,
      checksum,
      isCurrent: true,
      createdByAdminId: ctx.actorId ?? null,
    });
    await recordAudit({
      actorType: ctx.actorId ? 'ADMIN' : 'SYSTEM',
      actorId: ctx.actorId ?? null,
      action: 'legal.document.create',
      entityType: 'legal_document_version',
      entityId: doc.id,
      metadata: { type: input.type, version: input.version, checksum } as Prisma.InputJsonValue,
    });
    return doc;
  },

  /** Record a user's acceptance of a document type's current (or named) version. */
  async accept(
    userId: string,
    input: { documentType: LegalDocumentType; version?: string },
    ctx: ComplianceContext = {},
  ) {
    // Resolve the version: current by default.
    const current = await legalRepository.findCurrentByType(input.documentType);
    if (!current) throw new NotFoundError('No current version for this document type');
    if (input.version && input.version !== current.version) {
      throw new BadRequestError('Only the current version can be accepted', { code: 'STALE_DOCUMENT_VERSION' });
    }

    await legalRepository.supersedePrior(userId, input.documentType);
    const acceptance = await legalRepository.createAcceptance({
      userId,
      documentType: input.documentType,
      documentVersionId: current.id,
      version: current.version,
      checksum: current.checksum,
      status: 'ACCEPTED',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    await recordAudit({
      actorType: 'USER',
      actorId: userId,
      action: 'legal.accept',
      entityType: 'user_legal_acceptance',
      entityId: acceptance.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { documentType: input.documentType, version: current.version } as Prisma.InputJsonValue,
    });
    return acceptance;
  },

  acceptancesForUser(userId: string) {
    return legalRepository.listAcceptancesForUser(userId);
  },

  async listAcceptances(input: { userId?: string; documentType?: LegalDocumentType; limit: number; cursor?: string }) {
    const rows = await legalRepository.listAcceptances(input);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  },
};

export type LegalService = typeof legalService;
