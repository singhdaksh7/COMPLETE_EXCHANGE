import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/modules/support/support.repository', () => ({
  supportRepository: {
    ticketNumberExists: vi.fn().mockResolvedValue(null),
    createUserTicket: vi.fn(),
    addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    listForUser: vi.fn(),
    findUserTicket: vi.fn(),
    findBasicById: vi.fn(),
    listMessages: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: { adminLog: { create: vi.fn().mockResolvedValue({}) } },
}));

vi.mock('../../src/lib/audit', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn().mockResolvedValue(undefined) };
});

import { supportRepository } from '../../src/modules/support/support.repository';
import { supportUserService } from '../../src/modules/support/support.user.service';
import { recordAudit } from '../../src/lib/audit';

const repo = vi.mocked(supportRepository);
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function ticket(over: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'tkt-1',
    ticketNumber: 'TKT-ABCD1234',
    userId: USER,
    subject: 'Help',
    category: 'ACCOUNT',
    priority: 'MEDIUM',
    status: 'WAITING_FOR_ADMIN',
    assignedAdminId: null,
    createdByAdminId: null,
    closedByAdminId: null,
    referenceType: null,
    referenceId: null,
    lastMessageAt: now,
    resolvedAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('supportUserService (user)', () => {
  it('creates a ticket with a generated number + opening USER message', async () => {
    repo.createUserTicket.mockResolvedValue(ticket());
    repo.findUserTicket.mockResolvedValue(ticket());
    repo.listMessages.mockResolvedValue([
      { id: 'm1', senderType: 'USER', body: 'Help', isInternalNote: false, createdAt: new Date() },
    ] as never);

    const out = await supportUserService.createTicket(
      USER,
      { category: 'ACCOUNT', subject: 'Help', message: 'Help me' },
      {},
    );

    expect(repo.createUserTicket).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, category: 'ACCOUNT', status: 'WAITING_FOR_ADMIN' }),
    );
    expect(repo.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ senderType: 'USER', userId: USER, isInternalNote: false }),
    );
    expect(out.ticketNumber).toBe('TKT-ABCD1234');
    expect(recordAudit).toHaveBeenCalled();
  });

  it('lists only the caller-owned tickets (repo is user-scoped)', async () => {
    repo.listForUser.mockResolvedValue([ticket(), ticket({ id: 'tkt-2' })] as never);
    const out = await supportUserService.listMyTickets(USER, { limit: 20 });
    expect(repo.listForUser).toHaveBeenCalledWith({ userId: USER, limit: 20 });
    expect(out.items).toHaveLength(2);
  });

  it("rejects access to another user's ticket (scoped lookup returns null)", async () => {
    repo.findUserTicket.mockResolvedValue(null);
    await expect(supportUserService.getMyTicket(OTHER, 'tkt-1')).rejects.toMatchObject({
      errorCode: 'TICKET_NOT_FOUND',
    });
    expect(repo.findUserTicket).toHaveBeenCalledWith('tkt-1', OTHER);
  });

  it('never returns internal admin notes to the user', async () => {
    repo.findUserTicket.mockResolvedValue(ticket());
    await supportUserService.getMyTicket(USER, 'tkt-1');
    // includeInternal=false — internal notes excluded at the query.
    expect(repo.listMessages).toHaveBeenCalledWith('tkt-1', false);
  });

  it('blocks replies to a closed ticket', async () => {
    repo.findUserTicket.mockResolvedValue(ticket({ status: 'CLOSED' }));
    await expect(
      supportUserService.addUserMessage(USER, 'tkt-1', 'hi again', {}),
    ).rejects.toMatchObject({ errorCode: 'TICKET_CLOSED' });
  });

  it('user reply flips status to WAITING_FOR_ADMIN', async () => {
    repo.findUserTicket.mockResolvedValue(ticket({ status: 'WAITING_FOR_USER' }));
    await supportUserService.addUserMessage(USER, 'tkt-1', 'thanks', {});
    expect(repo.update).toHaveBeenCalledWith(
      'tkt-1',
      expect.objectContaining({ status: 'WAITING_FOR_ADMIN' }),
    );
  });
});

describe('supportUserService (admin)', () => {
  it('public reply flips status to WAITING_FOR_USER + records an ADMIN message', async () => {
    repo.findBasicById.mockResolvedValue(ticket({ status: 'WAITING_FOR_ADMIN' }));
    await supportUserService.adminReply(
      'tkt-1',
      { body: 'We are on it', isInternalNote: false },
      { actorId: 'admin-1' },
    );
    expect(repo.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ senderType: 'ADMIN', isInternalNote: false }),
    );
    expect(repo.update).toHaveBeenCalledWith(
      'tkt-1',
      expect.objectContaining({ status: 'WAITING_FOR_USER' }),
    );
  });

  it('internal note does NOT change user-visible status', async () => {
    repo.findBasicById.mockResolvedValue(ticket({ status: 'WAITING_FOR_ADMIN' }));
    await supportUserService.adminReply(
      'tkt-1',
      { body: 'internal only', isInternalNote: true },
      { actorId: 'admin-1' },
    );
    expect(repo.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ isInternalNote: true }),
    );
    // No status flip for an internal note.
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('resolve sets RESOLVED + resolvedAt and audit-logs', async () => {
    repo.findBasicById.mockResolvedValue(ticket({ status: 'WAITING_FOR_USER' }));
    await supportUserService.adminResolve('tkt-1', 'fixed', { actorId: 'admin-1' });
    expect(repo.update).toHaveBeenCalledWith(
      'tkt-1',
      expect.objectContaining({ status: 'RESOLVED' }),
    );
    expect(recordAudit).toHaveBeenCalled();
  });
});
