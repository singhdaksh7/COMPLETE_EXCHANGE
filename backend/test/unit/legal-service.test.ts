import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/legal/legal.repository', () => ({
  legalRepository: {
    listCurrent: vi.fn(),
    listVersions: vi.fn(),
    findVersion: vi.fn(),
    findCurrentByType: vi.fn(),
    createVersionAsCurrent: vi.fn(),
    createAcceptance: vi.fn(),
    supersedePrior: vi.fn().mockResolvedValue({ count: 0 }),
    listAcceptancesForUser: vi.fn(),
    listAcceptances: vi.fn(),
  },
}));
vi.mock('../../src/lib/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { legalService } from '../../src/modules/legal/legal.service';
import { legalRepository } from '../../src/modules/legal/legal.repository';

const repo = vi.mocked(legalRepository);

beforeEach(() => vi.clearAllMocks());

describe('legalService.currentDocuments', () => {
  it('seeds v1 of each document type on first (empty) read', async () => {
    repo.listCurrent.mockResolvedValueOnce([] as never).mockResolvedValueOnce([{ id: 'd1' }] as never);
    repo.createVersionAsCurrent.mockResolvedValue({} as never);
    await legalService.currentDocuments({ actorId: 'admin-1' });
    expect(repo.createVersionAsCurrent).toHaveBeenCalledTimes(6); // 6 document types
    // each seeded doc carries a checksum
    const arg = repo.createVersionAsCurrent.mock.calls[0][0] as { checksum?: string };
    expect(arg.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('legalService.createDocument', () => {
  it('checksums the content and publishes it as current', async () => {
    repo.createVersionAsCurrent.mockResolvedValue({ id: 'd2' } as never);
    await legalService.createDocument({ type: 'TERMS_OF_SERVICE', version: 'v2', title: 'ToS', content: 'New terms' }, { actorId: 'admin-1' });
    const arg = repo.createVersionAsCurrent.mock.calls[0][0] as { checksum?: string; isCurrent?: boolean };
    expect(arg.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.isCurrent).toBe(true);
  });
});

describe('legalService.accept', () => {
  it('records an acceptance against the current version with its checksum', async () => {
    repo.findCurrentByType.mockResolvedValue({ id: 'd1', version: 'v1', checksum: 'abc123' } as never);
    repo.createAcceptance.mockResolvedValue({ id: 'a1' } as never);

    await legalService.accept('user-1', { documentType: 'TERMS_OF_SERVICE' }, { ip: '1.2.3.4', userAgent: 'UA' });

    expect(repo.supersedePrior).toHaveBeenCalledWith('user-1', 'TERMS_OF_SERVICE');
    expect(repo.createAcceptance).toHaveBeenCalledWith(expect.objectContaining({ version: 'v1', checksum: 'abc123', status: 'ACCEPTED', ip: '1.2.3.4' }));
  });

  it('rejects accepting a stale version', async () => {
    repo.findCurrentByType.mockResolvedValue({ id: 'd1', version: 'v2', checksum: 'x' } as never);
    await expect(legalService.accept('user-1', { documentType: 'TERMS_OF_SERVICE', version: 'v1' }, {})).rejects.toThrow(/current version/i);
  });

  it('throws when no current version exists', async () => {
    repo.findCurrentByType.mockResolvedValue(null);
    await expect(legalService.accept('user-1', { documentType: 'FEE_POLICY' }, {})).rejects.toThrow();
  });
});
