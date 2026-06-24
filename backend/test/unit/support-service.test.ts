import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/support/support.repository', () => ({
  supportRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    addNote: vi.fn(),
    userExists: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    supportTicket: { findUnique: vi.fn(async () => ({ id: 't1' })) },
    adminLog: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { recordAudit } from '../../src/lib/audit';
import { prisma } from '../../src/lib/prisma';
import { supportRepository } from '../../src/modules/support/support.repository';
import { supportService } from '../../src/modules/support/support.service';

const repo = vi.mocked(supportRepository);
const audit = vi.mocked(recordAudit);
const adminLog = vi.mocked(prisma.adminLog.create);

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    userId: null,
    subject: 'Cannot withdraw',
    category: 'WITHDRAWAL',
    priority: 'HIGH',
    status: 'OPEN',
    assignedAdminId: null,
    createdByAdminId: 'admin-1',
    closedByAdminId: null,
    closedAt: null,
    createdAt: new Date('2026-06-24T00:00:00Z'),
    updatedAt: new Date('2026-06-24T00:00:00Z'),
    user: null,
    notes: [],
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findById.mockResolvedValue(ticket());
});

describe('supportService', () => {
  it('creates a ticket, writes an opening note, and audits', async () => {
    repo.create.mockResolvedValue(ticket());
    repo.addNote.mockResolvedValue({} as never);

    const res = await supportService.create(
      { subject: 'Cannot withdraw', category: 'WITHDRAWAL', priority: 'HIGH', body: 'user reports failure' },
      { actorId: 'admin-1' },
    );

    expect(res.id).toBe('t1');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Cannot withdraw', status: 'OPEN', createdByAdminId: 'admin-1' }));
    expect(repo.addNote).toHaveBeenCalledWith(expect.objectContaining({ body: 'user reports failure' }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.support.ticket_create' }));
    expect(adminLog).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'admin.support.ticket_create' }) }));
  });

  it('rejects create with an unknown linked user', async () => {
    repo.userExists.mockResolvedValue(null);
    await expect(
      supportService.create({ userId: '11111111-1111-4111-8111-111111111111', subject: 'hi', category: 'GENERAL', priority: 'LOW' }, { actorId: 'admin-1' }),
    ).rejects.toThrow(/user not found/i);
  });

  it('closing a ticket stamps closedAt/closedBy and audits as ticket_close', async () => {
    repo.findById.mockResolvedValue(ticket({ status: 'OPEN' }));
    repo.update.mockResolvedValue(ticket({ status: 'RESOLVED' }));

    await supportService.update('t1', { status: 'RESOLVED', reason: 'fixed' }, { actorId: 'admin-1' });

    const data = repo.update.mock.calls[0][1] as Record<string, unknown>;
    expect(data.status).toBe('RESOLVED');
    expect(data.closedAt).toBeInstanceOf(Date);
    expect(data.closedByAdminId).toBe('admin-1');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.support.ticket_close' }));
  });

  it('reassigning audits as ticket_assign', async () => {
    repo.findById.mockResolvedValue(ticket({ assignedAdminId: null }));
    repo.update.mockResolvedValue(ticket({ assignedAdminId: 'admin-2' }));

    await supportService.update('t1', { assignedAdminId: '22222222-2222-4222-8222-222222222222' }, { actorId: 'admin-1' });

    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.support.ticket_assign' }));
  });

  it('adds a note and audits', async () => {
    repo.addNote.mockResolvedValue({ id: 'n1' } as never);
    await supportService.addNote('t1', '  please check  ', { actorId: 'admin-1' });
    expect(repo.addNote).toHaveBeenCalledWith(expect.objectContaining({ ticketId: 't1', body: 'please check' }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.support.ticket_note' }));
  });
});
